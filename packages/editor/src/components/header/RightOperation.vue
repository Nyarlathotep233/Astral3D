<script lang="ts" setup>
import {ref,onMounted} from 'vue';
import XR from '@/components/header/right/XR.vue';
import {App,Hooks} from "@astral3d/engine";
import Setting from "@/components/setting/Setting.vue";
import SaveToService from "@/components/header/right/SaveToService.vue";
import LayoutModeToggle from "@/components/header/LayoutModeToggle.vue";
import {t} from "@/language";
import {Airplay} from "@vicons/carbon";

const supportXr = ref(false);

onMounted(() => {
  // 判断是否支持XR
  if (navigator.xr) {
    if ('offerSession' in navigator.xr) {
      Hooks.useDispatchSignal("offerXR",'immersive-ar');
    }else{
      supportXr.value = true;
    }
  }else{
    supportXr.value = false;
  }
});

function handlePreview(){
  // 新窗口打开
  window.open(window.location.origin + "/#/preview/" + App.project.getKey("sceneInfo.id"), "_blank");
}
</script>

<template>
  <div id="rightOperation">
    <LayoutModeToggle />

    <!--  保存至服务器  -->
    <SaveToService class="mr-2" />

    <!-- 预览 -->
    <n-button @click="handlePreview">
      <template #icon>
        <n-icon>
          <Airplay />
        </n-icon>
      </template>
      {{ t("home.Preview") }}
    </n-button>

    <!-- XR -->
    <XR v-if="supportXr" />

    <!--  通用配置项  -->
    <Setting show-setting />
  </div>
</template>

<style lang="less" scoped>
#rightOperation {
  display: flex;
  align-items: center;
}
</style>