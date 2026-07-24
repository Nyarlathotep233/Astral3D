<script lang="ts" setup>
import {ref, computed, onMounted, onBeforeUnmount, nextTick, provide} from 'vue';
import {Hooks,App,Package,defaultProjectInfo} from "@astral3d/engine";
import * as Layout from './layouts';
import {connectWebSocket} from "@/hooks/useWebSocket";
import {applyPersistedSceneVisibility} from "@/hooks/useSceneVisibility";
import {useRoute} from "vue-router";
import {
  editorLayoutModeKey,
  editorLayoutPresetKey,
} from "@/views/editor/layoutPresets";
import { useEditorLayoutMode } from "@/hooks/useEditorLayoutMode";
import {fetchGetOneScene} from "@/http/api/scenes";
import {t} from "@/language";
import {initializeConfig} from "@/utils/storage/config";
import {
  installEditorObjectsBridge,
  setEditorObjectsBridgeReady,
  uninstallEditorObjectsBridge,
} from "@/utils/integration/editorObjectsBridge";
import EsCubeLoading from "@/components/es/EsCubeLoading.vue";
import EsPlugin from "@/components/es/EsPlugin.vue";
import ObjectScript from "@/components/code/Script.vue";

initializeConfig(App.storage);

const initLoading = ref(true);
const LEFT_SIDER_STORAGE_KEY = "editor:left-sider-width";
const RIGHT_SIDER_STORAGE_KEY = "editor:right-sider-width";
const LEFT_SIDER_MIN_WIDTH = 220;
const RIGHT_SIDER_MIN_WIDTH = 220;
const LEFT_SIDER_MAX_RATIO = 0.8;
const DEFAULT_LEFT_SIDER_WIDTH = 300;
const DEFAULT_RIGHT_SIDER_WIDTH = 300;

const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const leftSiderWidth = ref(readLeftSiderWidth());
const rightSiderWidth = ref(readRightSiderWidth());
const resizingLeftSider = ref(false);
const resizingRightSider = ref(false);
const route = useRoute();
const layoutMode = useEditorLayoutMode();
provide(editorLayoutModeKey, layoutMode);
provide(editorLayoutPresetKey, layoutMode.effectivePreset);

const showPluginFab = computed(
  () => layoutMode.effectivePreset.value.pluginFab !== false
);

const defaultInfo = defaultProjectInfo();
const sceneInfo = ref(defaultInfo.sceneInfo);
const drawingInfo = ref(defaultInfo.drawing);
provide("sceneInfo",sceneInfo);
provide("drawingInfo",drawingInfo);

let resizeStartX = 0;
let resizeStartWidth = 0;
let rightResizeStartX = 0;
let rightResizeStartWidth = 0;

onMounted(() => {
  installEditorObjectsBridge();
  setEditorObjectsBridgeReady(false);

  // 启动websocket连接
  connectWebSocket(import.meta.env.VITE_GLOB_SOCKET_URL);
  window.addEventListener("resize", handleWindowResize);
  Hooks.useAddSignal("sceneCleared", applyPersistedSceneVisibility);
  Hooks.useAddSignal("sceneLoadComplete", applyPersistedSceneVisibility);

  applyPersistedSceneVisibility();

  init();
})

onBeforeUnmount(() => {
  stopLeftResize();
  stopRightResize();
  window.removeEventListener("resize", handleWindowResize);
  Hooks.useRemoveSignal("sceneCleared", applyPersistedSceneVisibility);
  Hooks.useRemoveSignal("sceneLoadComplete", applyPersistedSceneVisibility);
  uninstallEditorObjectsBridge();
});

function getSiderMaxWidth(minWidth:number) {
  return Math.max(minWidth, Math.floor(window.innerWidth * LEFT_SIDER_MAX_RATIO));
}

function getLeftSiderMaxWidth() {
  return getSiderMaxWidth(LEFT_SIDER_MIN_WIDTH);
}

function getRightSiderMaxWidth() {
  return getSiderMaxWidth(RIGHT_SIDER_MIN_WIDTH);
}

function clampLeftSiderWidth(width:number) {
  return Math.min(getLeftSiderMaxWidth(), Math.max(LEFT_SIDER_MIN_WIDTH, width));
}

function clampRightSiderWidth(width:number) {
  return Math.min(getRightSiderMaxWidth(), Math.max(RIGHT_SIDER_MIN_WIDTH, width));
}

function readLeftSiderWidth() {
  const raw = window.localStorage.getItem(LEFT_SIDER_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LEFT_SIDER_WIDTH;
  return clampLeftSiderWidth(parsed);
}

function saveLeftSiderWidth(width:number) {
  window.localStorage.setItem(LEFT_SIDER_STORAGE_KEY, String(clampLeftSiderWidth(width)));
}

function readRightSiderWidth() {
  const raw = window.localStorage.getItem(RIGHT_SIDER_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_RIGHT_SIDER_WIDTH;
  return clampRightSiderWidth(parsed);
}

function saveRightSiderWidth(width:number) {
  window.localStorage.setItem(RIGHT_SIDER_STORAGE_KEY, String(clampRightSiderWidth(width)));
}

function startLeftResize(event: MouseEvent) {
  if (leftCollapsed.value) return;

  event.preventDefault();
  resizingLeftSider.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = leftSiderWidth.value;

  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";

  window.addEventListener("mousemove", handleLeftResizeMove);
  window.addEventListener("mouseup", stopLeftResize);
}

function handleLeftResizeMove(event: MouseEvent) {
  if (!resizingLeftSider.value) return;

  const delta = event.clientX - resizeStartX;
  leftSiderWidth.value = clampLeftSiderWidth(resizeStartWidth + delta);
}

function handleWindowResize() {
  leftSiderWidth.value = clampLeftSiderWidth(leftSiderWidth.value);
  rightSiderWidth.value = clampRightSiderWidth(rightSiderWidth.value);
}

function stopLeftResize() {
  if (!resizingLeftSider.value) return;

  resizingLeftSider.value = false;
  saveLeftSiderWidth(leftSiderWidth.value);

  document.body.style.userSelect = "";
  document.body.style.cursor = "";

  window.removeEventListener("mousemove", handleLeftResizeMove);
  window.removeEventListener("mouseup", stopLeftResize);
}

function startRightResize(event: MouseEvent) {
  if (rightCollapsed.value) return;

  event.preventDefault();
  resizingRightSider.value = true;
  rightResizeStartX = event.clientX;
  rightResizeStartWidth = rightSiderWidth.value;

  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";

  window.addEventListener("mousemove", handleRightResizeMove);
  window.addEventListener("mouseup", stopRightResize);
}

function handleRightResizeMove(event: MouseEvent) {
  if (!resizingRightSider.value) return;

  // 右侧面板向左拖动时变宽，向右拖动时变窄
  const delta = rightResizeStartX - event.clientX;
  rightSiderWidth.value = clampRightSiderWidth(rightResizeStartWidth + delta);
}

function stopRightResize() {
  if (!resizingRightSider.value) return;

  resizingRightSider.value = false;
  saveRightSiderWidth(rightSiderWidth.value);

  document.body.style.userSelect = "";
  document.body.style.cursor = "";

  window.removeEventListener("mousemove", handleRightResizeMove);
  window.removeEventListener("mouseup", stopRightResize);
}

async function init() {
  // 获取路由参数
  const id = route.params.id as string;
  if (id) {
    const res = await fetchGetOneScene(id);

    if (res.error !== null) {
      window.$message?.error(t("scene.Failed to get scene data"))
      return;
    }

    App.project.setKey('sceneInfo',res.data);
    sceneInfo.value = res.data;

    initLoading.value = false;

    await nextTick();

    getScene(res.data);
  }else{
    window.$message?.error(t("prompt['Parameter error!']"));
  }
}

//拉取场景
function getScene(sceneInfo) {
  // 如果创建的是空场景则无场景包
  if (!sceneInfo.zip) {
    window.viewer.options.hdr = "/static/resource/hdr/cloudy.hdr";
    window.viewer.loadEnv(true);
    setEditorObjectsBridgeReady(true);

    return;
  }

  window.viewer.options.hdr = "";

  let notice = window.$notification.info({
    title: t("scene['Get the scene data']") + "...",
    content: t("other.Loading") + "...",
    closable: false,
  })

  const p = new Package(window.viewer);
  p.unpack({
    url: sceneInfo.zip,
    onSceneLoad: () => {
      if (sceneInfo.projectType === 1 && sceneInfo.gisConfig) {
        window.viewer.modules.gisLayer.enable(sceneInfo.gisConfig, {applyInitialView: false});
        window.viewer.modules.gisLayer.rehydrateAnchors(App.scene);
      }
      drawingInfo.value = App.project.getKey("drawing");
    },
    onComplete: () => {
      window.$message?.success(t("scene['Loading completed!']"));

      Hooks.useDispatchSignal("sceneLoadComplete");
      setEditorObjectsBridgeReady(true);

      notice.destroy();

      p.dispose();
    }
  })
  return;
}
</script>

<template>
  <EsCubeLoading v-model:visible="initLoading"/>

  <div id="layout" v-if="!initLoading">
    <n-layout position="absolute">
      <n-layout-header bordered>
        <Layout.Header/>
      </n-layout-header>

      <n-layout class="n-layout-center-layout" has-sider sider-placement="right" position="absolute">
        <n-layout-sider v-model:collapsed="leftCollapsed" collapse-mode="width" :collapsed-width="0" :width="leftSiderWidth" :native-scrollbar="false"
                        show-trigger="bar" trigger-style="right:0;left:auto;transform: translateX(28px);"
                        collapsed-trigger-style="left:0;right:auto;transform: rotate(0deg);">
          <Layout.Assets/>
        </n-layout-sider>
        <div
          v-show="!leftCollapsed"
          class="layout-left-resize-handle"
          :class="{ 'is-resizing': resizingLeftSider }"
          @mousedown="startLeftResize"
        />

        <n-layout-content>
          <Layout.Scene/>
        </n-layout-content>
        <div
          v-show="!rightCollapsed"
          class="layout-right-resize-handle"
          :class="{ 'is-resizing': resizingRightSider }"
          @mousedown="startRightResize"
        />

        <n-layout-sider v-model:collapsed="rightCollapsed" collapse-mode="transform" :collapsed-width="0" :width="rightSiderWidth"
                        :native-scrollbar="false" show-trigger="bar" bordered>
          <Layout.Sidebar/>
        </n-layout-sider>
      </n-layout>

      <!-- <n-layout-footer bordered position="absolute">
  <Layout.Footer/>
</n-layout-footer> -->
    </n-layout>

    <EsPlugin v-if="showPluginFab"/>

    <ObjectScript />
  </div>
</template>

<style lang="less" scoped>
#layout {
  width: 100%;
  height: 100%;
  position: relative;

  .n-layout {
    &-header {
      height: var(--header-height);
      line-height: var(--header-height);
      padding: 0 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    &-sider {
      z-index: 15;
      height: 100%;
    }

    &-center-layout {
      top: var(--header-height);
      bottom: var(--footer-height);
      width: 100%;
      // height: calc(100vh - var(--header-height) - var(--footer-height));
      height: calc(100vh - var(--header-height));
      overflow: hidden;
    }

    &-footer {
      height: var(--footer-height);
      padding: 0 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }

  .layout-left-resize-handle {
    width: 6px;
    cursor: col-resize;
    position: relative;
    z-index: 20;
    background-color: transparent;

    &::before {
      content: "";
      position: absolute;
      left: 2px;
      top: 0;
      bottom: 0;
      width: 1px;
      background-color: rgba(255, 255, 255, 0.08);
    }

    &:hover::before,
    &.is-resizing::before {
      background-color: var(--main-color, #18a058);
    }
  }

  .layout-right-resize-handle {
    width: 6px;
    cursor: col-resize;
    position: relative;
    z-index: 20;
    background-color: transparent;

    &::before {
      content: "";
      position: absolute;
      right: 2px;
      top: 0;
      bottom: 0;
      width: 1px;
      background-color: rgba(255, 255, 255, 0.08);
    }

    &:hover::before,
    &.is-resizing::before {
      background-color: var(--main-color, #18a058);
    }
  }
}
</style>
