<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Cube, Template } from "@vicons/carbon";
import { t } from "@/language";
import MyProject from "@/views/home/project/MyProject.vue";
import SharedProject from "@/views/home/project/SharedProject.vue";
import TemplateManagement from "@/views/home/project/TemplateManagement.vue";
import { ADMIN_KEY_STORAGE_KEY } from "@/http/api/sceneExample";

const hasAdminKey = computed(() => Boolean(window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY)));
const showExternalProject = hasAdminKey;
const showTemplateManagement = hasAdminKey;
const activeProjectTab = ref("shared-project");
const projectTotals = reactive<Record<"INTERNAL" | "EXTERNAL", number>>({
  INTERNAL: 0,
  EXTERNAL: 0
});

const currentProjectTotal = computed(() => {
  return activeProjectTab.value === "external-project" ? projectTotals.EXTERNAL : projectTotals.INTERNAL;
});

function handleProjectTotalChange(payload: { sceneSource: "INTERNAL" | "EXTERNAL"; total: number }) {
  projectTotals[payload.sceneSource] = payload.total;
}
</script>

<template>
  <div class="project-workspace">
    <section class="project-hero">
      <div class="project-hero-copy">
        <h1>{{ t("home.Project Console") }}</h1>
        <p>{{ t("home.Project Console Description") }}</p>
      </div>

      <div class="project-total-chip">
        <n-icon size="20">
          <Cube />
        </n-icon>
        <div>
          <strong>{{ currentProjectTotal }}</strong>
          <span>{{ t("home.Active projects") }}</span>
        </div>
      </div>
    </section>

    <section class="project-board">
      <n-tabs v-model:value="activeProjectTab" type="segment" animated class="project-tabs" pane-class="project-tab-pane">
        <n-tab-pane name="my-project" :tab="t('home.My Project')" disabled>
          <MyProject />
        </n-tab-pane>
        <n-tab-pane name="shared-project" :tab="t('home.Shared Project')">
          <SharedProject scene-source="INTERNAL" @total-change="handleProjectTotalChange" />
        </n-tab-pane>
        <n-tab-pane v-if="showExternalProject" name="external-project" :tab="t('home.External Project')">
          <SharedProject scene-source="EXTERNAL" :show-create="false" @total-change="handleProjectTotalChange" />
        </n-tab-pane>
        <n-tab-pane v-if="showTemplateManagement" name="template-management">
          <template #tab>
            <span class="template-tab">
              <n-icon size="16"><Template /></n-icon>
              模板管理
            </span>
          </template>
          <TemplateManagement />
        </n-tab-pane>
      </n-tabs>
    </section>
  </div>
</template>

<style scoped lang="less">
.project-workspace {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.project-hero {
  flex-shrink: 0;
  min-height: 128px;
  padding: 24px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 30px;
  overflow: hidden;
  background:
    linear-gradient(120deg, rgba(var(--home-primary-rgb), 0.18), rgba(80, 106, 255, 0.08) 44%, rgba(255, 255, 255, 0.04)),
    rgba(255, 255, 255, 0.06);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(20px);
  position: relative;

  &::after {
    content: "";
    position: absolute;
    right: -70px;
    top: -90px;
    width: 260px;
    height: 260px;
    border-radius: 999px;
    background: rgba(var(--home-primary-rgb), 0.18);
    filter: blur(10px);
  }
}

.project-hero-copy {
  position: relative;
  z-index: 1;
  max-width: 780px;

  h1 {
    margin: 0 0 10px;
    color: #ffffff;
    font-size: clamp(30px, 3.2vw, 42px);
    line-height: 1;
    letter-spacing: -1.4px;
  }

  p {
    max-width: 720px;
    margin: 0;
    color: rgba(255, 255, 255, 0.62);
    font-size: 15px;
    line-height: 1.8;
  }
}

.project-total-chip {
  position: relative;
  z-index: 1;
  min-width: 168px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.78);
  background: linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.14), rgba(6, 12, 25, 0.46));

  .n-icon {
    color: var(--home-primary);
  }

  strong {
    display: block;
    color: #ffffff;
    font-size: 22px;
    line-height: 1;
  }

  span {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.52);
  }
}

.project-board {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 28px;
  background: rgba(7, 14, 29, 0.58);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 80px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);
}

.project-tabs {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-tabs-nav) {
    width: min(780px, 100%);
    padding: 0 2px 12px;
  }

  :deep(.n-tabs-rail) {
    background: rgba(255, 255, 255, 0.06);
  }

  :deep(.n-tabs-capsule) {
    background: linear-gradient(135deg, var(--home-primary), var(--home-primary-hover)) !important;
    box-shadow: 0 12px 30px rgba(var(--home-primary-rgb), 0.24);
  }

  :deep(.n-tabs-tab) {
    color: rgba(255, 255, 255, 0.62);
    font-weight: 700;
  }

  :deep(.n-tabs-tab--active) {
    color: var(--home-on-primary);
  }

  :deep(.n-tabs-content) {
    flex: 1;
    min-height: 0;
  }

  :deep(.n-tabs-pane-wrapper) {
    height: 100%;
    min-height: 0;
  }

  :deep(.project-tab-pane) {
    height: 100%;
    padding-top: 0 !important;
  }
}

.template-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@media (max-width: 1100px) {
  .project-hero {
    flex-direction: column;
  }

  .project-total-chip {
    width: 100%;
  }
}

@media (max-height: 820px) {
  .project-hero {
    min-height: 112px;
    padding: 20px 24px;
  }

  .project-hero-copy {
    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 3vw, 38px);
    }

    p {
      line-height: 1.55;
    }
  }

  .project-total-chip {
    min-height: 62px;
    padding: 12px;
  }
}
</style>
