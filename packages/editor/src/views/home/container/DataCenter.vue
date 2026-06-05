<template>
  <div class="data-center-container home-module-panel">
    <n-tabs type="segment" animated class="data-center-tabs h-full">
      <n-tab-pane name="dataSources" :tab="t('home.Data sources')">
        <DataSource />
      </n-tab-pane>

      <n-tab-pane name="dataSets" :tab="t('home.Data sets')">
        <DataSet />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script lang="ts" setup>
import { t } from "@/language";
import DataSource from '../dataCenter/DataSource.vue';
import DataSet from '../dataCenter/DataSet.vue';
</script>

<style scoped lang="less">
.data-center-container {
  height: 100%;
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.10), transparent 34%),
    rgba(7, 11, 23, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 80px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);
}

.data-center-tabs {
  display: flex;
  flex-direction: column;

  :deep(.n-tabs-nav) {
    width: min(460px, 100%);
    padding-bottom: 18px;
  }

  :deep(.n-tabs-rail) {
    background: rgba(255, 255, 255, 0.07);
  }

  :deep(.n-tabs-capsule) {
    background: linear-gradient(135deg, var(--home-primary), var(--home-primary-hover)) !important;
    box-shadow: 0 12px 30px rgba(var(--home-primary-rgb), 0.24);
  }

  :deep(.n-tabs-tab) {
    color: rgba(255, 255, 255, 0.64);
    font-weight: 700;
  }

  :deep(.n-tabs-tab--active) {
    color: var(--home-on-primary);
  }

  :deep(.n-tabs-content),
  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-height: 0;
  }
}

:deep(.n-tab-pane) {
  height: 100%;
  padding-top: 0 !important;
}

:deep(.n-input) {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

:deep(.n-button--primary-type) {
  color: var(--home-on-primary);
  box-shadow: 0 12px 28px rgba(var(--home-primary-rgb), 0.22);
}

:deep(.n-divider) {
  background-color: rgba(255, 255, 255, 0.08);
}

:deep(.n-tree) {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

:deep(.n-tree-node-content) {
  color: rgba(255, 255, 255, 0.72);
}

:deep(.n-tree-node-content:hover) {
  background: rgba(var(--home-primary-rgb), 0.10);
}

:deep(.n-data-table) {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(6, 10, 21, 0.42);
}

:deep(.n-data-table-th) {
  color: rgba(255, 255, 255, 0.88);
  background: linear-gradient(180deg, rgba(var(--home-primary-rgb), 0.14), rgba(255, 255, 255, 0.06)) !important;
}

:deep(.n-data-table-td) {
  color: rgba(255, 255, 255, 0.72);
  background-color: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.06);
}

:deep(.n-data-table-tr:hover .n-data-table-td) {
  background-color: rgba(var(--home-primary-rgb), 0.09);
}

:deep(.n-empty__description) {
  color: rgba(255, 255, 255, 0.56);
}
</style>
