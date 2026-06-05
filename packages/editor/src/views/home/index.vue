<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import type { MenuOption } from 'naive-ui';
import { Cube, Sprout, Settings, DataCenter } from '@vicons/carbon';
import { t } from "@/language";
import { useGlobalConfigStore } from "@/store/modules/globalConfig";
import Setting from "@/components/setting/Setting.vue";
import Project from "./container/Project.vue";
import DataCenterComponents from "./container/DataCenter.vue";
import AssetsCenter from "./container/AssetsCenter.vue";
import SettingCenter from "./container/SettingCenter.vue";

type HomeMenuOption = MenuOption & {
  key: string;
  iconComponent: Component;
  component: Component;
}

const menuActiveKey = ref<string>("project");
const menuOptions: HomeMenuOption[] = [
  {
    label: () =>  t("home.Project"),
    key: 'project',
    iconComponent: Cube,
    component: Project
  },
  {
    label:() => t("home.Data Center"),
    key: 'data-center',
    iconComponent: DataCenter,
    component: DataCenterComponents
  },
  {
    label:() => t("home.Resource Center"),
    key: 'assets-center',
    iconComponent: Sprout,
    component: AssetsCenter
  },
  {
    label: () => t("home.Setting Center"),
    key: 'setting-center',
    iconComponent: Settings,
    component: SettingCenter
  }
]
const containerComponent = ref<Component>(Project);
const activeMenu = computed(() => menuOptions.find(item => item.key === menuActiveKey.value) || menuOptions[0]);
const globalConfigStore = useGlobalConfigStore();
const homeThemeVars = computed(() => {
  const mainColor = globalConfigStore.mainColor as IConfig.Color;
  const rgb = mainColor.hex ? hexToRgb(mainColor.hex) : (Array.isArray(mainColor.RGB) ? mainColor.RGB : [23, 114, 180]);
  const luminance = getLuminance(rgb);

  return {
    "--home-primary": mainColor.hex,
    "--home-primary-hover": mainColor.hexHover || mainColor.hex,
    "--home-primary-pressed": mainColor.hexPressed || mainColor.hex,
    "--home-primary-suppl": mainColor.hexSuppl || mainColor.hex,
    "--home-primary-rgb": rgb.join(","),
    "--home-on-primary": luminance > 0.58 ? "#07111f" : "#ffffff"
  };
});

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const fullHex = normalized.length === 3
    ? normalized.split("").map(item => item + item).join("")
    : normalized.padEnd(6, "0").slice(0, 6);

  return [
    Number.parseInt(fullHex.slice(0, 2), 16) || 23,
    Number.parseInt(fullHex.slice(2, 4), 16) || 114,
    Number.parseInt(fullHex.slice(4, 6), 16) || 180
  ];
}

function getLuminance(rgb: number[]) {
  const [r, g, b] = rgb.map(value => {
    const channel = value / 255;

    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getMenuLabel(item: HomeMenuOption) {
  return typeof item.label === "function" ? item.label() : item.label;
}

function handleSelectMenu(key: string, item: HomeMenuOption){
  if(item.isLink) return;

  menuActiveKey.value = key;
  containerComponent.value = item.component;
}
</script>

<template>
  <div class="home-shell" :style="homeThemeVars">
    <div class="home-ambient home-ambient-a"></div>
    <div class="home-ambient home-ambient-b"></div>
    <div class="home-grid"></div>

    <header class="home-topbar">
      <div class="home-brand">
        <div class="home-logo">
          <Logo />
        </div>
        <div>
          <n-gradient-text :size="24" type="success" class="home-brand-title">
            H3D Editor
          </n-gradient-text>
          <div class="home-brand-subtitle">Haolink 3D Command Center</div>
        </div>
      </div>

      <nav class="home-nav">
        <button
          v-for="item in menuOptions"
          :key="item.key"
          type="button"
          class="home-nav-item"
          :class="{ 'is-active': menuActiveKey === item.key }"
          @click="handleSelectMenu(item.key, item)"
        >
          <n-icon size="18">
            <component :is="item.iconComponent" />
          </n-icon>
          <span>{{ getMenuLabel(item) }}</span>
        </button>
      </nav>

      <div class="home-actions">
        <div class="home-active-chip">
          <span class="home-active-dot"></span>
          {{ getMenuLabel(activeMenu) }}
        </div>
        <Setting :show-setting="false" />
      </div>
    </header>

    <main class="home-main">
      <component :is="containerComponent" />
    </main>
  </div>
</template>

<style scoped lang="less">
.home-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.92);
  background:
    radial-gradient(circle at 12% 14%, rgba(var(--home-primary-rgb), 0.18), transparent 28%),
    radial-gradient(circle at 84% 4%, rgba(87, 111, 255, 0.18), transparent 30%),
    linear-gradient(135deg, #07111f 0%, #10172c 45%, #060913 100%);
}

.home-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.38;
  background-image:
    linear-gradient(rgba(var(--home-primary-rgb), 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--home-primary-rgb), 0.08) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 84%);
}

.home-ambient {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(14px);
}

.home-ambient-a {
  width: 380px;
  height: 380px;
  top: -180px;
  right: 16%;
  background: rgba(var(--home-primary-rgb), 0.18);
}

.home-ambient-b {
  width: 520px;
  height: 520px;
  bottom: -260px;
  left: -120px;
  background: rgba(var(--home-primary-rgb), 0.14);
}

.home-topbar {
  position: relative;
  z-index: 2;
  height: 76px;
  margin: 18px 22px 0;
  padding: 0 18px 0 20px;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr);
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  background: rgba(6, 13, 27, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
}

.home-brand {
  display: flex;
  align-items: center;
  min-width: 0;
}

.home-logo {
  width: 44px;
  height: 44px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.22), rgba(64, 98, 255, 0.12));
  box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.08), 0 0 26px rgba(var(--home-primary-rgb), 0.22);
}

.home-brand-title {
  font-weight: 800;
  letter-spacing: 0.4px;
}

.home-brand-subtitle {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.home-nav {
  display: flex;
  gap: 8px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.home-nav-item {
  height: 42px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.62);
  background: transparent;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

  &:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
  }

  &.is-active {
    color: var(--home-on-primary);
    background: linear-gradient(135deg, var(--home-primary), var(--home-primary-hover));
    box-shadow: 0 12px 30px rgba(var(--home-primary-rgb), 0.28);
    transform: translateY(-1px);
  }
}

.home-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;

  :deep(.n-button) {
    color: rgba(255, 255, 255, 0.76);
  }
}

.home-active-chip {
  height: 34px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(var(--home-primary-rgb), 0.28);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(var(--home-primary-rgb), 0.10);
  font-size: 12px;
}

.home-active-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--home-primary);
  box-shadow: 0 0 14px rgba(var(--home-primary-rgb), 0.9);
}

.home-main {
  position: relative;
  z-index: 1;
  height: calc(100vh - 112px);
  margin: 18px 22px 22px;
  overflow: hidden;
}

@media (max-width: 1200px) {
  .home-topbar {
    grid-template-columns: 1fr;
    height: auto;
    gap: 14px;
    padding: 16px;
  }

  .home-nav,
  .home-actions {
    justify-self: stretch;
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .home-topbar,
  .home-main {
    margin-left: 12px;
    margin-right: 12px;
  }

  .home-nav {
    overflow-x: auto;
    justify-content: flex-start;
  }

  .home-nav-item {
    flex: 0 0 auto;
  }
}
</style>
