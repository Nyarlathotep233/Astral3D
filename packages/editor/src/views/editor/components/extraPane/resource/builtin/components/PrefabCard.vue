<template>
  <n-card size="small" hoverable draggable="true" @dblclick="addToScene" @dragend="dragEnd">
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
import {useDragStore} from "@/store/modules/drag";
import {screenToWorld} from "@/utils/common/scenes";
import {instantiatePrefab} from "@/utils/common/prefab";

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

async function addToScene() {
  try {
    await instantiatePrefab(props.resource.path);
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : "Prefab 加载失败");
  }
}

async function dragEnd() {
  if (dragStore.getActionTarget !== "addToScene" || dragStore.endArea !== "Scene") return;

  try {
    const position = screenToWorld(dragStore.endPosition.x, dragStore.endPosition.y);
    await instantiatePrefab(props.resource.path, position);
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
