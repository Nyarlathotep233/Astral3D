<script setup lang="ts">
import {ref} from 'vue';
import type {MenuOption} from 'naive-ui'
import {Cube, Sprout, Settings, DataCenter} from '@vicons/carbon';
import {t} from "@/language";
import {renderIcon} from "@/utils/common/render";
import Setting from "@/components/setting/Setting.vue";
import SidebarTopInfo from "./components/SidebarTopInfo.vue";
import Project from "./container/Project.vue";
import DataCenterComponents from "./container/DataCenter.vue";
import AssetsCenter from "./container/AssetsCenter.vue";
import SettingCenter from "./container/SettingCenter.vue";

const collapsed = ref(false);
const menuActiveKey = ref<string>("project");
const menuOptions: MenuOption[] = [
  {
    label: () =>  t("home.Project"),
    key: 'project',
    icon: renderIcon(Cube),
    component:Project
  },
  {
    label:() => t("home.Data Center"),
    key: 'data-center',
    icon: renderIcon(DataCenter),
    component:DataCenterComponents
  },
  {
    label:() => t("home.Resource Center"),
    key: 'assets-center',
    icon: renderIcon(Sprout),
    component:AssetsCenter
  },
  {
    label: () => t("home.Setting Center"),
    key: 'setting-center',
    icon: renderIcon(Settings),
    component:SettingCenter
  }
]
const containerComponent = ref(Project);

function handleSelectMenu(key: string, item: MenuOption){
  if(item.isLink) return;

  menuActiveKey.value = key;

  // @ts-ignore
  containerComponent.value = item.component;
}
</script>

<template>
    <n-layout has-sider class="w-full h-full">
        <n-layout-sider bordered collapse-mode="width" :collapsed-width="64" :width="260" :collapsed="collapsed"
            show-trigger @collapse="collapsed = true" @expand="collapsed = false">
            <SidebarTopInfo :collapsed="collapsed" />

            <n-divider class="!my-20px mx-25px" style="width: calc(100% - 50px)" />

            <n-menu :value="menuActiveKey" :options="menuOptions" :collapsed="collapsed" :collapsed-width="64"
                :collapsed-icon-size="22" @update:value="handleSelectMenu" />

        </n-layout-sider>

        <n-layout class="h-full">
            <n-layout-header>
                <Setting :show-setting="false" />
            </n-layout-header>

            <component :is="containerComponent" />
        </n-layout>
    </n-layout>
</template>

<style scoped lang="less">
.n-layout {
  &-header {
    height: var(--header-height);
    line-height: var(--header-height);
    padding: 0 0.5rem;
    display: flex;
    justify-content: end;
    align-items: center;
    box-shadow: 0 6px 16px -9px rgba(0, 0, 0, .08), 0 9px 28px 0 rgba(0, 0, 0, .05), 0 12px 48px 16px rgba(0, 0, 0, .03);
  }
}
</style>
