<script setup lang="ts">
import {h, onBeforeUnmount, onMounted, ref, markRaw, nextTick, computed, watch} from "vue";
import type {Component, DefineComponent} from "vue";
import { NIcon, NTooltip } from "naive-ui";
import type { TabsInst } from 'naive-ui'
import {
  EarthFilled,
  Cube,
  GroupObjects,
  Image,
  ResultOld,
  Script,
  Draw,
  MagicWandFilled,
  CloudSnow,
  HeatMap,
  Opacity,
  ImageReference,
  LocationHeart,
  LocationCompany,
  ChoroplethMap
} from "@vicons/carbon";

import { t } from "@/language";
import {App, Utils, Hooks} from "@astral3d/engine";
import {
  useInjectedEditorLayoutPreset,
  isIncludedInList,
  listHasRestrictions,
  type SidebarTabKey,
} from "@/views/editor/layoutPresets";
import SidebarScene from "./sidebar/SidebarScene.vue";
import SidebarRenderer from "./sidebar/SidebarRenderer.vue";
import SidebarEffect from "./sidebar/SidebarEffect.vue";
import SidebarWeather from "./sidebar/SidebarWeather.vue";
import SidebarHistory from "./sidebar/SidebarHistory.vue";
import SidebarObject from "./sidebar/SidebarObject.vue";
import SidebarGeometry from "./sidebar/SidebarGeometry.vue";
import SidebarMaterial from "./sidebar/SidebarMaterial.vue";
import SidebarAnimations from "./sidebar/SidebarAnimations.vue";
import SidebarScript from "./sidebar/SidebarScript.vue";
import SidebarDrawing from "./sidebar/SidebarDrawing.vue";
import SidebarParticle from "./sidebar/SidebarParticle.vue";
import SidebarBillboard from "./sidebar/SidebarBillboard.vue";
import SidebarHtmlPanel from "./sidebar/SidebarHtmlPanel.vue";
import Sidebar3DTiles from "./sidebar/Sidebar3DTiles.vue";

const layoutPreset = useInjectedEditorLayoutPreset();
const layoutTabsRestricted = computed(() =>
  listHasRestrictions(layoutPreset.value.right?.tabs)
);
const layoutDefaultTab = computed(
  () => layoutPreset.value.right?.defaultTab ?? "scene"
);

type SidebarTabGroup = "scene" | "object";

interface SidebarTabItem {
  name: string;
  group: SidebarTabGroup;
  icon: { text: string; color: string; component: DefineComponent };
  component: Component;
}

const tabsInstRef = ref<TabsInst | null>(null);
const tabs = ref<SidebarTabItem[]>([]);
const current = ref<string>(
  layoutTabsRestricted.value ? layoutDefaultTab.value : "scene"
);

/** 对象组第一个可见 tab（如 object），用于在其前显示分割线 */
const dividerTabName = computed(
  () => tabs.value.find((tab) => tab.group === "object")?.name
);

function isSidebarTabAllowed(name: string): boolean {
  return isIncludedInList(
    layoutPreset.value.right?.tabs,
    name as SidebarTabKey
  );
}

function filterSidebarTabs(tabList: SidebarTabItem[]) {
  if (!layoutTabsRestricted.value) return tabList;
  return tabList.filter((tab) => isSidebarTabAllowed(tab.name));
}

function ensureCurrentTabVisible() {
  const names = tabs.value.map((tab) => tab.name);
  if (names.length === 0) return;
  if (names.includes(current.value)) return;
  current.value = names.includes(layoutDefaultTab.value)
    ? layoutDefaultTab.value
    : names[0];
}

function iconTabName(icon: { text: string,color:string,component: DefineComponent }) {
    return h(NTooltip, {
        placement: "left",
        trigger: "hover"
    }, {
        default: () => t(`layout.sider["${icon.text}"]`),
        trigger: () => h(NIcon, { size: 14,color:icon.color }, () => h(icon.component)),
    })
}

function setTabs(object){
  const sceneTabs: SidebarTabItem[] = [
      { name: "scene", group: "scene", icon: { text: 'Scene config',color:"#A9A9A9", component: markRaw(EarthFilled) }, component: markRaw(SidebarScene) },
      { name: "renderer", group: "scene", icon: { text: 'Renderer config',color:"#A9A9A9", component: markRaw(ImageReference) }, component: markRaw(SidebarRenderer) },
      { name: "effect", group: "scene", icon: { text: 'Post processing',color:"#A9A9A9", component: markRaw(MagicWandFilled) }, component: markRaw(SidebarEffect) },
      { name: "weather", group: "scene", icon: { text: 'Weather',color:"#A9A9A9", component: markRaw(CloudSnow) }, component: markRaw(SidebarWeather) },
      { name: "history", group: "scene", icon: { text: 'History',color:"#A9A9A9", component: markRaw(ResultOld) }, component: markRaw(SidebarHistory) },
      { name: "drawing", group: "scene", icon: { text: 'Scene drawing',color:"#A9A9A9", component: markRaw(Image) }, component: markRaw(SidebarDrawing) },
  ];
  const object3DTabs: SidebarTabItem[] = [
      { name: "object", group: "object", icon: { text: 'Object', color:"#B97D4C", component: markRaw(Cube) }, component: markRaw(SidebarObject) },
      { name: "geometry", group: "object", icon: { text: 'Geometry',color:"#6287D1", component: markRaw(GroupObjects) }, component: markRaw(SidebarGeometry) },
      { name: "material", group: "object", icon: { text: 'Material',color:"#6287D1", component: markRaw(Opacity) }, component: markRaw(SidebarMaterial) },
      { name: "animations", group: "object", icon: { text: 'Animations',color:"#06AF88", component: markRaw(Draw) }, component: markRaw(SidebarAnimations) },
      { name: "script", group: "object", icon: { text: 'Script',color:"#06AF88", component: markRaw(Script) }, component: markRaw(SidebarScript) },
  ]

  if(object){
    switch (object.type) {
      case "Particle":
        if (isSidebarTabAllowed("particle")) {
          object3DTabs.push({ name: 'particle', group: 'object', icon: { text: 'Particle',color:"#A9575F", component: markRaw(HeatMap) }, component: markRaw(SidebarParticle) })
          current.value = 'particle';
        }
        break;
      case "Billboard":
        if (isSidebarTabAllowed("billboard")) {
          object3DTabs.push({ name: 'billboard', group: 'object', icon: { text: 'Billboard',color:"#A9575F", component: markRaw(LocationHeart) }, component: markRaw(SidebarBillboard) })
          current.value = 'billboard';
        }
        break;
      case "HtmlPanel":
      case "HtmlSprite":
        if (isSidebarTabAllowed("htmlPanel")) {
          object3DTabs.push({ name: 'htmlPanel', group: 'object', icon: { text: 'Html panel',color:"#A9575F", component: markRaw(LocationCompany) }, component: markRaw(SidebarHtmlPanel) })
          current.value = 'htmlPanel';
        }
        break;
      case "TilesGroup":
        if (isSidebarTabAllowed("3DTiles")) {
          object3DTabs.push({ name: '3DTiles', group: 'object', icon: { text: '3D Tiles',color:"#A9575F", component: markRaw(ChoroplethMap) }, component: markRaw(Sidebar3DTiles) })
          current.value = '3DTiles';
        }
        break;
    }
  }

  tabs.value = filterSidebarTabs([...sceneTabs,...object3DTabs]);
  ensureCurrentTabVisible();

  nextTick(() => tabsInstRef.value?.syncBarPosition());

  // 如果当前选中的对象不是粒子，但是侧边栏是粒子，则切换到对象侧边栏
  if (current.value === 'particle') {
    if (!Utils.isParticleObject(object)){
      current.value = 'object';
    }
  }

  // 如果当前选中的对象不是广告牌，但是侧边栏是广告牌，则切换到对象侧边栏
  if (current.value === 'billboard') {
    if (!Utils.isBillboardObject(object)){
      current.value = 'object';
    }
  }

  // 如果当前选中的对象不是HtmlPanel，但是侧边栏是HtmlPanel，则切换到对象侧边栏
  if (current.value === 'htmlPanel') {
    if (!Utils.isHtmlPanelObject(object)){
      current.value = 'object';
    }
  }

  // 如果当前选中的对象不是3DTiles，但是侧边栏是3DTiles，则切换到对象侧边栏
  if (current.value === '3DTiles') {
    if (!Utils.is3DTilesObject(object)){
      current.value = 'object';
    }
  }
}

watch(
  () => layoutPreset.value.key,
  () => setTabs(App.selected ?? undefined)
);

onMounted(()=>{
  Hooks.useAddSignal("objectSelected",setTabs);

  setTabs(undefined);
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("objectSelected",setTabs);
})
</script>

<template>
    <n-tabs ref="tabsInstRef" v-model:value="current" type="line" size="small" pane-class="!p-10px overflow-y-auto overflow-x-auto" id="sidebar-attributes"
        placement="left">
        <n-tab-pane v-for="t in tabs" :key="t.name" :name="t.name" :tab="iconTabName(t.icon)"
            :tab-props="t.name === dividerTabName ? { class: 'sidebar-tab-group-divider' } : undefined"
            display-directive="show" :disabled="t.name === 'disabled'">
            <component :is="t.component" />
        </n-tab-pane>
    </n-tabs>
</template>

<style lang="less" scoped>
.n-tabs {
    // height: calc(100vh - var(--header-height) - var(--footer-height));
    height: calc(100vh - var(--header-height));

    // 场景配置 / 对象相关 分组分割（首个 object 组 tab 前）
    :deep(.n-tabs-tab-wrapper:has(.sidebar-tab-group-divider)) {
        margin-top: 10px;
        border-top: 1px solid var(--n-tab-border-color);
    }
}
</style>
