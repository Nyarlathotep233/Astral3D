<template>
  <div class="relative w-full h-full">
    <Toolbar/>

    <div id="viewport" ref="viewportRef" class="absolute top-0 left-0 w-full h-full" @pointerdown="handleViewportPointerdown">
      <ViewportInfo/>
    </div>

    <EditorPlayMode/>

    <!--  RVT BIM 构件信息悬浮框  -->
    <BIMProperties/>

    <!-- IFC BIM 构件信息悬浮框   -->
    <IFCProperties/>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref, nextTick, onBeforeUnmount} from 'vue';
import {App,Viewer,Hooks} from "@astral3d/engine";
import Toolbar from "./Toolbar.vue";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {usePluginStore} from "@/store/modules/plugin";
import {installBuiltinPlugin} from "@/plugin";
import { clearBuffer } from "@/utils/wasm/optimize";
import ViewportInfo from "./ViewportInfo.vue";
import EditorPlayMode from "./EditorPlayMode.vue";
import BIMProperties from "./BIMProperties.vue";
import IFCProperties from "./IFCProperties.vue";

const globalStore = useGlobalConfigStore();
const pluginStore = usePluginStore();

const viewportRef = ref();

onMounted(async () => {
  App.setConfig({
    theme: globalStore.theme.replace("Theme", ""),
    mainColor: globalStore.mainColor.hexHover
  });

  window.viewer = new Viewer({
    container: viewportRef.value,
    enableScript: false,
    edit: {
      enabled: true
    },
    request: {
      baseUrl:"/file/static/"
    }
  });

  await nextTick();

  // 添加astral engine内置插件并监听插件注册
  pluginStore.setPlugins(Array.from(window.viewer.modules.plugin.plugins.values()));
  Hooks.useAddSignal("pluginInstall",pluginStore.addPlugin);
  Hooks.useAddSignal("pluginUninstall",pluginStore.removePlugin);
  
  // 注册astral editor内置插件
  installBuiltinPlugin(window.viewer);

  // 清理wasm缓存
  clearBuffer();
})

onBeforeUnmount(() => {
  Hooks.useRemoveSignal("pluginInstall",pluginStore.addPlugin);
  Hooks.useRemoveSignal("pluginUninstall",pluginStore.removePlugin);
})

function handleViewportPointerdown(){
  const focusedElement = document.activeElement;
  // @ts-ignore
  if(focusedElement && focusedElement.blur) {
    // @ts-ignore
    focusedElement.blur();
  }
}
</script>
