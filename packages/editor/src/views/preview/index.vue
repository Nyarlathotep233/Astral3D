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

const globalStore = useGlobalConfigStore();
const operationStore = usePreviewOperationStore();

const defaultInfo = defaultProjectInfo();
const sceneInfo = ref(defaultInfo.sceneInfo);
const drawingInfo = ref(defaultInfo.drawing);

provide("sceneInfo", sceneInfo);
provide("drawingInfo", drawingInfo);

const viewportRef = ref();
const initLoading = ref(true);

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

  await init();
});

onBeforeUnmount(() => {
  Hooks.useRemoveSignal("rendererUpdated", syncViewCubeVisible);
});

watch(hideViewCube, syncViewCubeVisible);

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

      notice.destroy();

      p.dispose();
    }
  });

  return;
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
