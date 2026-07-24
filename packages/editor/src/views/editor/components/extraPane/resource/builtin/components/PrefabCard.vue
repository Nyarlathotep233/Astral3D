<template>
  <n-card size="small" hoverable draggable="true" @contextmenu.prevent="handlePreview" @dblclick="addToScene" @dragend="dragEnd">
    <template #cover>
      <img :src="resource.image" :alt="resource.name" draggable="false" class="w-full h-full object-cover" />
    </template>
    <n-tooltip placement="bottom" trigger="hover">
      <template #trigger>{{ resource.name }}</template>
      <span>{{ resource.name }}</span>
    </n-tooltip>
  </n-card>
</template>

<script setup lang="ts">
import {inject, nextTick} from "vue";
import {useDragStore} from "@/store/modules/drag";
import {
  getViewportCenterPlacement,
  isGisProject,
  screenToScenePlacement,
} from "@/utils/common/scenes";
import {instantiatePrefab, loadPrefabObject} from "@/utils/common/prefab";
import {Utils, type GeoPosition} from "@astral3d/engine";

const props = withDefaults(defineProps<{
  resource: {
    key: string,
    image: string,
    name: string,
    path: string,
  };
}>(), {
  resource: () => ({
    key: "",
    image: "",
    name: "",
    path: "",
  })
});

const dragStore = useDragStore();
const previewInfo = inject('previewInfo') as any;
const previewRef = inject('previewRef') as any;

async function handlePreview() {
  try {
    previewInfo.name = props.resource.name;
    previewInfo.type = "Prefab";
    previewInfo.fileOrUrl = "";
    previewInfo.visible = true;

    await nextTick();

    const previewer = await previewRef.value?.getPreviewer();
    if (!previewer) return;

    previewer.clear();

    const object = await loadPrefabObject(props.resource.path);
    previewer.scene.add(object);
    Utils.focusObject(object, previewer.modules.controls);
    previewer.render();
  } catch (error) {
    console.error(error);
    window.$message?.error("Prefab 预览失败");
  }
}

async function addToScene() {
  try {
    if (isGisProject()) {
      const position = getViewportCenterPlacement() as GeoPosition | null;
      if (!position) {
        window.$message?.error("当前视角未命中地球");
        return;
      }
      await instantiatePrefab(props.resource.path, { geoPosition: position });
    } else {
      await instantiatePrefab(props.resource.path);
    }
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : "Prefab 加载失败");
  }
}

async function dragEnd() {
  if (dragStore.getActionTarget !== "addToScene" || dragStore.endArea !== "Scene") return;

  try {
    const position = screenToScenePlacement(dragStore.endPosition.x, dragStore.endPosition.y);
    if (!position) {
      window.$message?.error("当前视角未命中地球");
      return;
    }
    await instantiatePrefab(
      props.resource.path,
      "isVector3" in position ? position : { geoPosition: position },
    );
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : "Prefab 加载失败");
  } finally {
    dragStore.setActionTarget("");
  }
}
</script>

<style lang="less" scoped>
.n-card {
  cursor: pointer;

  :deep(&-cover) {
    height: 100%;
  }

  :deep(.n-card__content) {
    padding: 0.15rem 0;
    font-size: 0.65rem;
    text-align: center;
  }
}
</style>
