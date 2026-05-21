<script setup lang="ts">
import { computed, inject } from "vue";
import { NTooltip } from "naive-ui";
import { t } from "@/language";
import { editorLayoutModeKey } from "@/views/editor/layoutPresets";

const layoutMode = inject(editorLayoutModeKey);

const canToggle = computed(() => layoutMode?.canToggle.value ?? false);
const isFullLayout = computed(() => layoutMode?.isFullLayout.value ?? false);

/** 当前是否为精简布局（由 isFullLayout 反推，仅用于按钮展示） */
const isSimpleLayout = computed(() => canToggle.value && !isFullLayout.value);

/** 按钮文案为点击后将进入的目标状态 */
const layoutButtonText = computed(() =>
  isFullLayout.value
    ? t("layout.header['Simple layout']")
    : t("layout.header['Full layout']")
);

const layoutButtonTooltip = computed(() =>
  isFullLayout.value
    ? t("layout.header['Hide auxiliary panels']")
    : t("layout.header['Restore all function panels']")
);

function handleToggle() {
  layoutMode?.toggle();
}
</script>

<template>
  <n-tooltip v-if="canToggle" trigger="hover" placement="bottom">
    <template #trigger>
      <button
        type="button"
        class="layout-toggle-btn"
        :class="{ 'is-simple': isSimpleLayout }"
        @click="handleToggle"
      >
        {{ layoutButtonText }}
      </button>
    </template>
    {{ layoutButtonTooltip }}
  </n-tooltip>
</template>

<style scoped lang="less">
.layout-toggle-btn {
  height: 28px;
  padding: 0 10px;
  margin-right: 8px;
  border-radius: 6px;
  border: 1px solid var(--n-border-color, #dcdfe6);
  background: var(--n-color, #fff);
  color: var(--n-text-color-2, #606266);
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    border-color: var(--main-color, #0670fe);
    color: var(--main-color, #0670fe);
  }

  &.is-simple {
    color: var(--main-color, #0670fe);
    border-color: rgba(6, 112, 254, 0.35);
    background: rgba(6, 112, 254, 0.06);
  }
}
</style>
