<template>
  <div id="extra-resource-prefabs" class="flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <n-empty
        v-if="filteredList.length === 0"
        class="mt-8"
        description="暂无 Prefab 资源"
      />
      <div class="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
        <PrefabCard v-for="resource in filteredList" :key="resource.key" :resource="resource" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, inject} from "vue";
import type {Ref} from "vue";
import PrefabCard from "./components/PrefabCard.vue";
import {
  filterItemsByKey,
  useInjectedEditorLayoutPreset,
} from "@/views/editor/layoutPresets";
import {BUILTIN_PREFAB_RESOURCES} from "./prefabRegistry";

const searchText = inject('searchText') as Ref<string>;
const layoutPreset = useInjectedEditorLayoutPreset();
const prefabItemsFilter = computed(
  () => layoutPreset.value.resource?.builtin?.prefabs?.items
);

const filteredList = computed(() => {
  const keyword = searchText.value.toLowerCase();
  const byPreset = filterItemsByKey(BUILTIN_PREFAB_RESOURCES, prefabItemsFilter.value);
  return byPreset.filter((item) => item.name.toLowerCase().includes(keyword));
});
</script>

<style scoped lang="less">
#extra-resource-prefabs {
  overflow-x: hidden;
}
</style>
