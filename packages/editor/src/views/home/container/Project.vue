<script setup lang="ts">
import {computed} from "vue";
import {t} from "@/language";
import HeaderCarousel from "@/views/home/components/HeaderCarousel.vue";
import MyProject from "@/views/home/project/MyProject.vue";
import SharedProject from "@/views/home/project/SharedProject.vue";
import TemplateManagement from "@/views/home/project/TemplateManagement.vue";
import {ADMIN_KEY_STORAGE_KEY} from "@/http/api/sceneExample";

const hasAdminKey = computed(() => Boolean(window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY)));
const showExternalProject = hasAdminKey;
const showTemplateManagement = hasAdminKey;
</script>

<template>
  <!-- <n-layout-header>
    <HeaderCarousel/>
  </n-layout-header> -->

  <n-layout-content content-style="padding: 24px;">
    <n-tabs type="line" animated default-value="shared-project" class="h-full">
      <n-tab-pane name="my-project" :tab="t('home.My Project')" disabled>
        <MyProject />
      </n-tab-pane>
      <n-tab-pane name="shared-project" :tab="t('home.Shared Project')">
        <SharedProject scene-source="INTERNAL" />
      </n-tab-pane>
      <n-tab-pane v-if="showExternalProject" name="external-project" :tab="t('home.External Project')">
        <SharedProject scene-source="EXTERNAL" :show-create="false" />
      </n-tab-pane>
      <n-tab-pane v-if="showTemplateManagement" name="template-management" tab="模板管理">
        <TemplateManagement />
      </n-tab-pane>
    </n-tabs>
  </n-layout-content>
</template>

<style scoped lang="less">
.n-layout-content{
  height: calc(100vh - var(--header-height));
  display: flex;
  flex-direction: column;

  :deep(.n-tabs){
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :deep(.n-tabs-content){
    flex: 1;
    min-height: 0;
  }

  :deep(.n-tabs-pane-wrapper){
    height: 100%;
    min-height: 0;

    .n-tab-pane{
      padding-top: 0 !important;
    }
  }

  .n-tab-pane{
    height: 100%;
  }
}
</style>
