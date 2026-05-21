<template>
    <div id="layout-assets">
        <div
            v-if="showSceneTree"
            class="layout-assets-scene-tree"
            :style="sceneTreeStyle"
        >
            <SceneTree />
        </div>

        <n-tabs
            v-if="assetLibraryTabs.length > 0"
            :default-value="assetLibraryTabs[0]"
            animated
            type="line"
            justify-content="space-around"
            class="!h-60%"
            pane-wrapper-class="layout-assets-tab-pane-wrapper"
        >
            <n-tab-pane
                v-for="tab in assetLibraryTabs"
                :key="tab"
                :name="tab"
                :tab="tab.toUpperCase()"
                display-directive="show"
            >
                <CadLibrary v-if="tab === 'cad'" />
                <BIMLibrary v-else />
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import BIMLibrary from "./assets/BIMLibrary.vue";
import SceneTree from "@/components/tree/SceneTree.vue";
import CadLibrary from "./assets/CadLibrary.vue";
import {
  filterByIncludeList,
  listHasRestrictions,
  useInjectedEditorLayoutPreset,
  type AssetLibraryKey,
} from "@/views/editor/layoutPresets";

const layoutPreset = useInjectedEditorLayoutPreset();

const showSceneTree = computed(
  () => layoutPreset.value.left?.sceneTree !== false
);

const assetLibraryTabs = computed(() => {
  const all: AssetLibraryKey[] = ["cad", "bim"];
  const list = layoutPreset.value.left?.assetLibraries;
  if (!listHasRestrictions(list)) return all;
  return filterByIncludeList(all, list);
});

const sceneTreeStyle = computed(() => {
  if (assetLibraryTabs.value.length === 0) {
    return { height: "100%" };
  }
  return { height: "calc(40% - 25px)" };
});
</script>

<style scoped lang="less">
#layout-assets {
    // height: calc(100vh - var(--header-height) - var(--footer-height));
    height: calc(100vh - var(--header-height));
    border-right: 1px solid var(--n-border-color);

    .layout-assets-scene-tree {
        padding: 10px;

        &:not(:last-child) {
            border-bottom: 5px solid var(--n-border-color);
        }
    }

    :deep(.layout-assets-tab-pane-wrapper) {
        height: calc(100% - var(--n-pane-padding-top) - 42px);
        overflow-y: auto;

        .n-tab-pane {
            height: calc(100% - 10px);
            padding-top: 10px !important;
            overflow-y: auto;

            &:first-child {
                overflow: unset;
            }
        }
    }
}
</style>
