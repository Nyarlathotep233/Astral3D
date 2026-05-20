<script setup lang="ts">
import {computed} from "vue";
import {useRoute} from "vue-router";
import {t} from "@/language";
import HeaderCarousel from "@/views/home/components/HeaderCarousel.vue";
import MyProject from "@/views/home/project/MyProject.vue";
import SharedProject from "@/views/home/project/SharedProject.vue";

const route = useRoute();
const EXTERNAL_PROJECT_FLAG_KEY = "showExternalProject";
const truthyValues = new Set(["1", "true", "yes", "on"]);

function parseBooleanFlag(value: unknown) {
  if (Array.isArray(value)) {
    return value.some(item => parseBooleanFlag(item));
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return truthyValues.has(value.trim().toLowerCase());
  }

  return false;
}

const showExternalProject = computed(() => parseBooleanFlag(route.query[EXTERNAL_PROJECT_FLAG_KEY]));
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
