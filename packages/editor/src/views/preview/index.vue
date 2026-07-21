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
let playPackageUrl = "";
let previousPackageFetch: typeof Package._fetch | null = null;
let previousRequestBaseUrl = "";
let playLoadStarted = false;

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

onMounted(async () => {
  App.setConfig({
    theme: globalStore.theme.replace("Theme", ""),
    mainColor: globalStore.mainColor.hexHover
  });

  window.viewer = new Viewer({
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

  Hooks.useAddSignal("rendererUpdated", syncViewCubeVisible);

  await nextTick();
  syncViewCubeVisible();

  if (isEditorPlay.value) {
    window.addEventListener("message", handlePlayMessage);
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    postPlayStatus(PLAY_MESSAGE_TYPE.ready);
    return;
  }

  await init();
});

onBeforeUnmount(() => {
  Hooks.useRemoveSignal("rendererUpdated", syncViewCubeVisible);
  window.removeEventListener("message", handlePlayMessage);
  window.removeEventListener("error", handleRuntimeError);
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  cleanupPlayPackage();
  window.viewer?.dispose();
});

watch(hideViewCube, syncViewCubeVisible);

function postPlayStatus(type: PlayStatusMessage["type"], message?: string) {
  if (!isEditorPlay.value || !playSessionId.value || window.parent === window) return;

  const payload: PlayStatusMessage = {
    type,
    sessionId: playSessionId.value,
    ...(message ? {message} : {}),
  };
  window.parent.postMessage(payload, window.location.origin);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function handleRuntimeError(event: ErrorEvent) {
  postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, event.message || t("playMode.Runtime error"));
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  postPlayStatus(PLAY_MESSAGE_TYPE.runtimeError, errorMessage(event.reason));
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
      options.onError?.(new Error(`missing play package: ${filename}`));
      return;
    }
    options.onSuccess?.({blob: () => blob});
  };

  if (!window.viewer.options.request) window.viewer.options.request = {baseUrl: ""};
  window.viewer.options.request.baseUrl = "";

  playPackage = new Package(window.viewer);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(t("playMode.Load timeout"))), 180_000);

      playPackage!.unpack({
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
          resolve();
        },
      });
    });

    finishSceneLoad();
    initLoading.value = false;
    postPlayStatus(PLAY_MESSAGE_TYPE.started);
  } finally {
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

  const p = new Package(window.viewer);

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
    }
  });

  return;
}

function finishSceneLoad() {
  // 加载完成后，生成 Collider 环境
  MenuOperation.Roaming.generateColliderEnvironment()
    .then(() => {
      // 检查人物模型是否已加载
      const checkPlayer = () => {
        if (MenuOperation.Roaming.person !== undefined) {
          operationStore.menuList.roaming.loading = false;
        } else {
          setTimeout(() => {
            checkPlayer();
          }, 200);
        }
      };

      checkPlayer();
    })
    .catch(error => {
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
