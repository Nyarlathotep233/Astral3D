import {nextTick} from "vue";
import {App, Package} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {fetchUpload} from "@/http/api/sys";
import {filterSize} from "@/utils/common/file";
import {fetchGetOneScene, fetchSaveScene, fetchSceneSaveOperation, type SceneSaveReceipt} from "@/http/api/scenes";
import {DefaultScreenshot} from "@/utils/common/constant";
import {agentState, announceAgentState} from "@/utils/integration/agentState";

export interface SaveSceneOptions {
  operationId?: string;
  expectedVersion?: number;
  sceneName?: string;
}

let activeSave: {sceneId: string; epoch: string; operationId: string; expectedVersion: number; promise: Promise<ISceneFetchData>} | null = null;
let lastReceipt: SceneSaveReceipt | null = null;
export function getLastSceneSaveReceipt() { return lastReceipt; }

/** GUI and Agent share one save path. Different operations never silently share a result. */
export function saveSceneToService(options: SaveSceneOptions = {}): Promise<ISceneFetchData> {
  const info = App.project.getKey("sceneInfo");
  const sceneId = String(info.id || "");
  const epoch = agentState.documentEpoch;
  const expectedVersion = options.expectedVersion ?? Number(info.sceneVersion ?? 0);
  const operationId = options.operationId ?? (activeSave?.sceneId === sceneId ? activeSave.operationId : crypto.randomUUID());
  if (!sceneId) return Promise.reject(new Error(window.$t("scene['The project does not exist!']")));
  if (agentState.sceneState !== "ready" || agentState.sceneId !== sceneId || agentState.recoveryRequired) {
    return Promise.reject(new Error("场景尚未完整加载或需要恢复，请重新加载后保存"));
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) {
    return Promise.reject(new Error("expectedVersion must be a non-negative integer below 2147483647"));
  }
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(operationId)) {
    return Promise.reject(new Error("operationId must contain 1–128 letters, digits, or ._:-"));
  }
  if (activeSave) {
    if (activeSave.sceneId === sceneId && activeSave.epoch === epoch && activeSave.operationId === operationId && activeSave.expectedVersion === expectedVersion) return activeSave.promise;
    return Promise.reject(new Error("Another save operation is in progress; wait for it to finish"));
  }
  const promise = runSaveSceneToService(sceneId, expectedVersion, operationId, epoch, options.sceneName).finally(() => {
    if (activeSave?.promise === promise) activeSave = null;
  });
  activeSave = {sceneId, epoch, operationId, expectedVersion, promise};
  return promise;
}

function requestError(error: any, fallback: string) {
  return Object.assign(new Error(error?.message || error?.msg || fallback), {code: error?.code});
}

async function runSaveSceneToService(sceneId: string, expectedVersion: number, operationId: string, epoch: string, sceneName?: string): Promise<ISceneFetchData> {
  const globalConfigStore = useGlobalConfigStore();
  const originalInfo = App.project.getKey("sceneInfo");
  const snapshot: ISceneFetchData = JSON.parse(JSON.stringify(originalInfo));
  if (sceneName !== undefined) snapshot.sceneName = sceneName;
  const revision = agentState.revision;
  let attemptedZip: string | undefined;
  let pack: Package | undefined;
  let commitAttempted = false;
  const isCurrentDocument = () => agentState.sceneId === sceneId && agentState.documentEpoch === epoch &&
    agentState.sceneState === "ready" && !agentState.recoveryRequired;
  const ensureCurrent = () => {
    const current = App.project.getKey("sceneInfo");
    if (!isCurrentDocument() || String(current.id) !== sceneId || Number(current.sceneVersion ?? 0) !== expectedVersion) {
      throw new Error("The active scene or its version changed during save; reload before retrying");
    }
    if (agentState.revision !== revision) {
      throw Object.assign(new Error("场景在打包期间发生修改，请重新保存"), {code: 409});
    }
  };
  const accept = (receipt: SceneSaveReceipt) => {
    if (receipt.expectedVersion !== expectedVersion) throw new Error("operationId was already used with a different expectedVersion");
    lastReceipt = receipt;
    const current = App.project.getKey("sceneInfo");
    // A receipt for an older operation must not rewind a newly loaded scene.
    if (attemptedZip && receipt.scene.zip === attemptedZip && isCurrentDocument() && String(current.id) === sceneId && Number(current.sceneVersion ?? 0) === expectedVersion) {
      if (agentState.revision === revision) {
        App.project.setKey("sceneInfo", receipt.scene);
        agentState.title = receipt.scene.sceneName;
        agentState.dirty = false;
      } else {
        App.project.setKey("sceneInfo", {...current, sceneVersion: receipt.scene.sceneVersion, zip:receipt.scene.zip,
          zipSize:receipt.scene.zipSize, coverPicture:receipt.scene.coverPicture});
      }
      announceAgentState();
    }
    if (receipt.warnings?.length) window.$message?.warning(receipt.warnings.join("; "));
    globalConfigStore.loadingText = window.$t("prompt.Saved successfully!");
    return receipt.scene;
  };

  globalConfigStore.loading = true;
  globalConfigStore.loadingText = window.$t("scene['Generate scene data, please wait']");
  try {
    // Check the persistent receipt before uploading. This also handles a retry
    // after a browser/server restart or after the original HTTP response was lost.
    const existing = await fetchSceneSaveOperation(sceneId, operationId);
    if (existing.error) throw requestError(existing.error, "Unable to check the save operation");
    if (existing.data) return accept(existing.data);
    ensureCurrent();
    const latest = await fetchGetOneScene(sceneId);
    if (latest.error || !latest.data) throw requestError(latest.error, "Unable to read the scene version");
    if (Number(latest.data.sceneVersion ?? 0) !== expectedVersion) {
      throw Object.assign(new Error(`Scene version conflict: expected ${expectedVersion}, current ${latest.data.sceneVersion}; reload before saving`), {code: 409});
    }
    ensureCurrent();
    const attemptId = crypto.randomUUID();
    // The extra attempt token also isolates concurrent retries of the SAME operation.
    const biz = `${sceneId}-V${expectedVersion + 1}-${operationId.replace(/[^A-Za-z0-9_-]/g, "_")}-${attemptId}`;
    let cover = snapshot.coverPicture;
    if (!cover || cover === DefaultScreenshot) {
      await nextTick();
      ensureCurrent();
      cover = (await window.viewer.getViewportImage() as HTMLImageElement).src;
    }
    const coverUrl = /^(blob:|data:|https?:\/\/)/i.test(cover)
      ? cover
      : cover.startsWith("/file/static/") ? cover : `/file/static/${cover.replace(/^\/+/, "")}`;
    const coverResponse = await fetch(coverUrl);
    if (!coverResponse.ok) throw new Error(`Unable to read the cover image (${coverResponse.status})`);
    const blob = await coverResponse.blob();
    ensureCurrent();
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    const coverUpload = await fetchUpload({
      file: new File([blob], `cover-${attemptId}.${extension}`, {type: blob.type}),
      biz: `upload/3DEditor/screenshot/${biz}`,
    });
    if (coverUpload.error || !coverUpload.data) throw requestError(coverUpload.error, "Failed to save the cover image");
    ensureCurrent();
    const savedMetadata = {...snapshot, sceneVersion: expectedVersion + 1, coverPicture: coverUpload.data};
    pack = new Package(window.viewer);
    globalConfigStore.loadingText = window.$t("scene['Scene is being compressed...']");
    let packResult: Awaited<ReturnType<Package["pack"]>>;
    const previousPackingFields = {zip: originalInfo.zip, hasDrawing: originalInfo.hasDrawing};
    try {
      packResult = await pack.pack({
        // Display names may contain Windows-reserved characters or path separators.
        // The stable scene ID is also shorter; keep the human name in metadata.
        name: sceneId,
        layer: 2,
        sceneInfo: savedMetadata,
        zipUploadFun: async (file: File) => {
          ensureCurrent();
          const uploaded = await fetchUpload({file, biz: `upload/3DEditor/scene/${biz}`});
          if (uploaded.error || !uploaded.data) throw requestError(uploaded.error, "Failed to upload the scene package");
          return uploaded.data;
        },
        onProgress: (progress: number) => { globalConfigStore.loadingText = `${Number.isFinite(progress) ? progress : 0}%`; },
      });
    } finally {
      // Older Package builds mutated zip/hasDrawing. Keep the authoring metadata
      // unchanged on every packaging path, including upload failures.
      if (App.project.getKey("sceneInfo") === originalInfo) Object.assign(originalInfo, previousPackingFields);
    }
    if (!packResult?.firstUploadResult) throw new Error("The uploaded scene package is missing");
    ensureCurrent();
    const params = {...savedMetadata, hasDrawing: App.project.getKey("drawing").isUploaded ? 1 : 0,
      zip: packResult.firstUploadResult, zipSize: filterSize(packResult.totalSize)};
    commitAttempted = true;
    attemptedZip = params.zip;
    const saved = await fetchSaveScene(sceneId, params, expectedVersion, operationId);
    if (saved.error || !saved.data) throw requestError(saved.error, "Failed to save the scene");
    return accept(saved.data);
  } catch (error) {
    if (commitAttempted) {
      try {
        const recovered = await fetchSceneSaveOperation(sceneId, operationId);
        if (!recovered.error && recovered.data) return accept(recovered.data);
      } catch { /* Preserve the original failure and operationId for a later retry. */ }
    }
    const failure = error instanceof Error ? error : new Error(String(error));
    Object.assign(failure, {operationId, expectedVersion, sceneId});
    throw failure;
  } finally {
    globalConfigStore.loading = false;
    pack?.dispose();
  }
}
