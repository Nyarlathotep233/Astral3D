<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, provide, ref, computed, watch } from "vue";
import { useRoute } from 'vue-router';
import { t } from "@/language";
import { fetchGetOneScene } from "@/http/api/scenes";
import { App, Viewer, Hooks, Package, defaultProjectInfo } from "@astral3d/engine";
import { usePreviewOperationStore } from "@/store/modules/previewOperation";
import EsCubeLoading from "@/components/es/EsCubeLoading.vue";
import PreviewSceneTree from "@/views/preview/components/PreviewSceneTree.vue";
import PreviewOperations from "@/views/preview/components/Operations.vue";
import Drawing from "@/components/drawing/Drawing.vue";
import { useGlobalConfigStore } from "@/store/modules/globalConfig";
import { MenuOperation } from "@/utils/preview/menuOperation";
import {
  isPlayLoadMessage,
  PLAY_MESSAGE_TYPE,
  type PlayStatusMessage,
} from "@/utils/playMode";

const route = useRoute();

/**
 * 是否隐藏预览辅助 UI
 *
 * 使用方式：
 * https://vothing.haolink.cn:8070/#/preview/场景ID?hideToolbar=true&hideSceneTree=true&hideViewCube=true
 */
const hideToolbar = computed(() => route.query.hideToolbar === "true");
const hideSceneTree = computed(() => route.query.hideSceneTree === "true");
const hideViewCube = computed(() => route.query.hideViewCube === "true");
const isEditorPlay = computed(() => route.query.editorPlay === "true");
const playSessionId = computed(() => typeof route.query.sessionId === "string" ? route.query.sessionId : "");

const globalStore = useGlobalConfigStore();
const operationStore = usePreviewOperationStore();

const defaultInfo = defaultProjectInfo();
const sceneInfo = ref(defaultInfo.sceneInfo);
const drawingInfo = ref(defaultInfo.drawing);

provide("sceneInfo", sceneInfo);
provide("drawingInfo", drawingInfo);

const viewportRef = ref();
const initLoading = ref(true);

let playPackage: Package | null = null;
let savedScenePackage: Package | null = null;
let playPackageUrl = "";
let previousPackageFetch: typeof Package._fetch | null = null;
let previousRequestBaseUrl = "";
let playLoadStarted = false;
let heartbeatTimer: number | undefined;
let rejectPlayLoad: ((error: unknown) => void) | undefined;
let previewDisposed = false;
let previewViewer: Viewer | undefined;
let playerPollTimer: number | undefined;

function setViewCubeVisible() {
  const viewHelper = window.viewer?.modules?.viewHelper;
  if (viewHelper) {
    viewHelper.hidden = !hideViewCube.value;
  }

  const dom = document.querySelector<HTMLElement>("#astral-viewer-helper");
  if (dom) {
    dom.style.display = hideViewCube.value ? "none" : "block";
  }
}

function syncViewCubeVisible() {
  setViewCubeVisible();
  window.setTimeout(setViewCubeVisible, 0);
  window.setTimeout(setViewCubeVisible, 100);
}

function handleRendererUpdated() {
  syncViewCubeVisible();
  if (isEditorPlay.value) installShaderDiagnostics();
}

onMounted(async () => {
  App.setConfig({
    theme: globalStore.theme.replace("Theme", ""),
    mainColor: globalStore.mainColor.hexHover
  });

  window.viewer = previewViewer = new Viewer({
    container: viewportRef.value,
    enableScript: true,
    edit: {
      enabled: false,
    },
    grid: {
      enabled: false,
    },
    request: {
      baseUrl: "/file/static/"
    }
  });

  Hooks.useAddSignal("rendererUpdated", handleRendererUpdated);

  await nextTick();
  syncViewCubeVisible();

  if (isEditorPlay.value) {
    window.addEventListener("message", handlePlayMessage);
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener('h3d-script-error', handleScriptError);
    heartbeatTimer = window.setInterval(() => postPlayStatus(PLAY_MESSAGE_TYPE.heartbeat), 2_000);
    installShaderDiagnostics();
    postPlayStatus(PLAY_MESSAGE_TYPE.ready);
    return;
  }

  await init();
});

onBeforeUnmount(() => {
  previewDisposed = true;
  Hooks.useRemoveSignal("rendererUpdated", handleRendererUpdated);
  window.removeEventListener("message", handlePlayMessage);
  window.removeEventListener("error", handleRuntimeError);
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  window.removeEventListener('h3d-script-error', handleScriptError);
  if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
  if (playerPollTimer !== undefined) window.clearTimeout(playerPollTimer);
  rejectPlayLoad?.(new Error('Preview closed before loading completed'));
  cleanupPlayPackage();
  savedScenePackage?.dispose();
  savedScenePackage = null;
  previewViewer?.dispose();
});

watch(hideViewCube, syncViewCubeVisible);

function postPlayStatus(type: PlayStatusMessage["type"], message?: string, diagnostic?: PlayStatusMessage['diagnostic']) {
  if (!isEditorPlay.value || !playSessionId.value || window.parent === window) return;

  const payload: PlayStatusMessage = {
    type,
    sessionId: playSessionId.value,
    ...(message ? {message} : {}),
    ...(diagnostic ? {diagnostic} : {}),
  };
  window.parent.postMessage(payload, window.location.origin);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function handleRuntimeError(event: ErrorEvent) {
  postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, event.message || t("playMode.Runtime error"), { kind: 'runtime',
    phase: 'uncaught', stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}` });
  rejectPlayLoad?.(event.error || new Error(event.message || t('playMode.Runtime error')));
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, errorMessage(event.reason), { kind: 'runtime', phase: 'promise', stack: event.reason?.stack });
  rejectPlayLoad?.(event.reason);
}

function handleScriptError(event: Event) {
  const detail = (event as CustomEvent).detail;
  postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, detail.message, { kind: 'script', objectUuid: detail.objectUuid,
    scriptName: detail.scriptName, phase: detail.phase, stack: detail.stack });
  rejectPlayLoad?.(new Error(detail.message));
}

function installShaderDiagnostics() {
  const renderer = window.viewer.renderer;
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    let materialUuid: string | undefined;
    let objectUuid: string | undefined;
    for (const material of Object.values(App.materials)) {
      const programs: Map<string, any> | undefined = (renderer.properties.get(material) as any).programs;
      if (programs && [...programs.values()].some(item => item.program === program)) { materialUuid = material.uuid; break; }
    }
    if (materialUuid) App.scene.traverse(object => {
      const materials = (object as any).material;
      if (!objectUuid && (Array.isArray(materials) ? materials : [materials]).some(material => material?.uuid === materialUuid)) objectUuid = object.uuid;
    });
    const message = [gl.getProgramInfoLog(program), `vertex: ${gl.getShaderInfoLog(vertexShader)}`, `fragment: ${gl.getShaderInfoLog(fragmentShader)}`].filter(Boolean).join('\n');
    postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, message, { kind: 'shader', materialUuid, objectUuid, phase: 'runtime-compile' });
  };
}

function cleanupPlayPackage() {
  if (playPackage) {
    playPackage.dispose();
    playPackage = null;
  }
  if (playPackageUrl) {
    URL.revokeObjectURL(playPackageUrl);
    playPackageUrl = "";
  }
  if (previousPackageFetch) {
    Package._fetch = previousPackageFetch;
    previousPackageFetch = null;
  }
  if (window.viewer?.options.request) {
    window.viewer.options.request.baseUrl = previousRequestBaseUrl;
  }
}

function handlePlayMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  if (!isPlayLoadMessage(event.data) || event.data.sessionId !== playSessionId.value) return;
  if (playLoadStarted) return;

  playLoadStarted = true;
  void loadPlaySnapshot(event.data).catch((error) => {
    initLoading.value = false;
    postPlayStatus(PLAY_MESSAGE_TYPE.error, errorMessage(error));
  });
}

async function loadPlaySnapshot(message: import("@/utils/playMode").PlayLoadMessage) {
  const packageBlobMap = new Map(
    message.packages.map((file) => [file.name, new Blob([file.buffer], {type: file.mimeType})]),
  );
  const firstPackage = packageBlobMap.get(message.firstPackageName);
  if (!firstPackage) throw new Error(t("playMode.First package missing"));

  playPackageUrl = URL.createObjectURL(firstPackage);
  previousPackageFetch = Package._fetch;
  previousRequestBaseUrl = String(window.viewer.options.request?.baseUrl || "");

  Package._fetch = (url: string, options: {onSuccess?: (res: {blob: () => Blob}) => void, onError?: (error: unknown) => void} = {}) => {
    const filename = decodeURIComponent(url.split("/").pop() || "");
    const blob = packageBlobMap.get(filename);
    if (!blob) {
      const error = new Error(`Missing play package: ${filename}`);
      options.onError?.(error);
      rejectPlayLoad?.(error);
      return;
    }
    options.onSuccess?.({blob: () => blob});
  };

  if (!window.viewer.options.request) window.viewer.options.request = {baseUrl: ""};
  window.viewer.options.request.baseUrl = "";

  playPackage = new Package(window.viewer);
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        window.clearTimeout(timeout);
        rejectPlayLoad = undefined;
        reject(error);
      };
      const timeout = window.setTimeout(() => fail(new Error(t("playMode.Load timeout"))), 180_000);
      rejectPlayLoad = fail;

      try { playPackage!.unpack({
        url: playPackageUrl,
        onSceneLoad: (sceneJson: ISceneJson) => {
          const playSceneInfo = (sceneJson as ISceneJson & {sceneInfo?: ISceneInfo}).sceneInfo;
          if (playSceneInfo) {
            App.project.setKey("sceneInfo", playSceneInfo);
            sceneInfo.value = playSceneInfo;
          }
          drawingInfo.value = App.project.getKey("drawing");

          if (sceneJson.controls?.state) {
            MenuOperation.InitControlsState = sceneJson.controls.state;
          }
          Hooks.useDispatchSignal("sceneResize");
        },
        onComplete: () => {
          window.clearTimeout(timeout);
          rejectPlayLoad = undefined;
          resolve();
        },
        onError: fail,
      }); } catch (error) { fail(error); }
    });

    finishSceneLoad();
    initLoading.value = false;
    postPlayStatus(PLAY_MESSAGE_TYPE.started);
  } finally {
    rejectPlayLoad = undefined;
    cleanupPlayPackage();
  }
}

async function init() {
  // 获取路由参数
  const id = route.params.id as string;

  if (!id) {
    window.$message?.error(t("prompt['Parameter error!']"));
    return;
  }

  const res = await fetchGetOneScene(id);
  if (previewDisposed) return;

  if (res.error !== null) {
    window.$message?.error(t("scene.Failed to get scene data"));
    return;
  }

  if (res.data.cesiumConfig) {
    if (typeof res.data.cesiumConfig === 'string') {
      res.data.cesiumConfig = JSON.parse(res.data.cesiumConfig);
    }
  } else {
    res.data.cesiumConfig = undefined;
  }

  App.project.setKey('sceneInfo', res.data);
  sceneInfo.value = res.data;

  initLoading.value = false;

  getScene(res.data);
}

// 拉取场景
function getScene(sceneInfo) {
  // 如果创建的是空场景则无场景包
  if (!sceneInfo.zip) {
    window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
    window.viewer.loadEnv(true);
    return;
  }

  window.viewer.options.hdr = "";

  let notice = window.$notification.info({
    title: window.$t("scene['Get the scene data']") + "...",
    content: window.$t("other.Loading") + "...",
    closable: false,
  });

  savedScenePackage?.dispose();
  const p = savedScenePackage = new Package(window.viewer);

  p.unpack({
    url: sceneInfo.zip,

    onSceneLoad: (sceneJson: ISceneJson) => {
      if (sceneJson.controls?.state) {
        MenuOperation.InitControlsState = sceneJson.controls.state;
      }

      Hooks.useDispatchSignal("sceneResize");
    },

    onComplete: () => {
      finishSceneLoad();

      notice.destroy();

      p.dispose();
      if (savedScenePackage === p) savedScenePackage = null;
    },

    onError: (error) => {
      notice.destroy();
      p.dispose();
      if (savedScenePackage === p) savedScenePackage = null;
      window.$message?.error(errorMessage(error));
    },
  });

  return;
}

function finishSceneLoad() {
  // 加载完成后，生成 Collider 环境
  MenuOperation.Roaming.generateColliderEnvironment()
    .then(() => {
      if (previewDisposed) return;
      // 检查人物模型是否已加载
      const checkPlayer = () => {
        if (previewDisposed) return;
        if (MenuOperation.Roaming.person !== undefined) {
          operationStore.menuList.roaming.loading = false;
        } else {
          playerPollTimer = window.setTimeout(() => {
            checkPlayer();
          }, 200);
        }
      };

      checkPlayer();
    })
    .catch(error => {
      if (previewDisposed) return;
      window.$message?.error(`[Roaming]: ${error}`);
    });

  window.$message?.success(t("scene['Loading completed!']"));
  Hooks.useDispatchSignal("sceneLoadComplete");
}
</script>

<template>
  <EsCubeLoading v-model:visible="initLoading" />

  <div id="preview" class="w-full h-full">
    <n-split
      direction="horizontal"
      :max="0.85"
      :min="0.15"
      :pane1-style="{ display: drawingInfo.isUploaded ? 'flex' : 'none' }"
      :resize-trigger-size="drawingInfo.isUploaded ? 3 : 0"
    >
      <template #1 v-if="drawingInfo.isUploaded">
        <Drawing />
      </template>

      <template #2>
        <div ref="viewportRef" class="relative w-full h-full"></div>

        <PreviewSceneTree v-if="!hideSceneTree" />

        <!-- 
          hideToolbar=true 时隐藏操作工具栏
          示例：#/preview/场景ID?hideToolbar=true
        -->
        <PreviewOperations v-if="!hideToolbar" />
      </template>
    </n-split>
  </div>
</template>

<style scoped lang="less">
.n-split {
  &-pane-1,
  &-pane-2 {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
  }
}
</style>
