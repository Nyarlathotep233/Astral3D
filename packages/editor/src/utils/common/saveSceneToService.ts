import {nextTick} from "vue";
import {App, Package} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {fetchUpload} from "@/http/api/sys";
import {filterSize} from "@/utils/common/file";
import {fetchUpdateScene} from "@/http/api/scenes";
import {DefaultScreenshot} from "@/utils/common/constant";

// 保存可能由保存按钮或 bridge 同时触发，复用同一个 Promise 以避免重复递增 sceneVersion / 重复上传。
let savingPromise: Promise<any> | null = null;

export function saveSceneToService() {
  if (savingPromise) return savingPromise;

  savingPromise = runSaveSceneToService().finally(() => {
    savingPromise = null;
  });

  return savingPromise;
}

async function runSaveSceneToService() {
  const globalConfigStore = useGlobalConfigStore();
  const sceneInfo = App.project.getKey("sceneInfo");

  if (!sceneInfo.id) {
    throw new Error(window.$t("scene['The project does not exist!']"));
  }

  const p = new Package(window.viewer);
  const oldVersion = sceneInfo.sceneVersion;

  try {
    globalConfigStore.loadingText = window.$t("scene['Generate scene data, please wait']");
    globalConfigStore.loading = true;

    // 版本自动 +1
    App.project.setKey("sceneInfo.sceneVersion", sceneInfo.sceneVersion + 1);

    const biz = `${sceneInfo.id}-V${sceneInfo.sceneVersion}`;

    // 如果没有封面，则先自动生成封面
    if (!sceneInfo.coverPicture || sceneInfo.coverPicture === DefaultScreenshot) {
      const image = await window.viewer.getViewportImage() as HTMLImageElement;
      sceneInfo.coverPicture = image.src;
      App.project.setKey("sceneInfo.coverPicture", image.src);
    }

    const f = await fetch(sceneInfo.coverPicture.startsWith("blob") ? sceneInfo.coverPicture : `file/static/${sceneInfo.coverPicture}`);
    const blob = await f.blob();
    const coverUploadRes = await fetchUpload({
      file: new File([blob], `${sceneInfo.sceneName}-${Date.now()}.png`, { type: blob.type }),
      biz: `upload/3DEditor/screenshot/${biz}`,
    });
    if (coverUploadRes.error !== null || !coverUploadRes.data) {
      throw new Error(window.$t("prompt['Failed to save the cover image']"));
    }
    App.project.setKey("sceneInfo.coverPicture", coverUploadRes.data);

    await nextTick();

    globalConfigStore.loadingText = window.$t("scene['Scene is being compressed...']");

    const packResult = await p.pack({
      name: `${sceneInfo.sceneName}`,
      layer: 2,
      zipUploadFun: async (zipFile: File) => {
        const uploadRes = await fetchUpload({
          file: zipFile,
          biz: `upload/3DEditor/scene/${biz}`,
        });
        if (uploadRes.error !== null || !uploadRes.data) {
          throw new Error(window.$t("scene['Failed to save project!']"));
        }
        return uploadRes.data;
      },
      onProgress: (progress: number) => {
        globalConfigStore.loadingText = progress + "%";
      },
    });

    if (!packResult?.firstUploadResult) {
      throw new Error(window.$t("scene['Failed to save project!']"));
    }

    const params = Object.assign(sceneInfo, {
      zip: packResult.firstUploadResult,
      zipSize: filterSize(packResult.totalSize),
    });

    const updateRes = await fetchUpdateScene(sceneInfo.id, params);
    if (updateRes.error !== null) {
      throw new Error(updateRes.error.message || window.$t("scene['Failed to save project!']"));
    }

    globalConfigStore.loadingText = window.$t("prompt.Saved successfully!");

    if (updateRes.data) {
      App.project.setKey("sceneInfo", updateRes.data);
    }

    return App.project.getKey("sceneInfo");
  } catch (error) {
    App.project.setKey("sceneInfo.sceneVersion", oldVersion);
    throw error;
  } finally {
    setTimeout(() => {
      globalConfigStore.loading = false;
      p.dispose();
    }, 300);
  }
}
