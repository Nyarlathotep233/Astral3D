<script setup lang="ts">
import {computed, onMounted, reactive, toRaw} from "vue";
import {t} from "@/language";
import {App,Utils} from "@astral3d/engine";

const props = withDefaults(defineProps<{
  effectEnabled:boolean
}>(),{
  effectEnabled:false
})

const halftone = reactive(JSON.parse(JSON.stringify(App.project.getKey("effect.Halftone"))));
const disabled = computed(() => !props.effectEnabled || !halftone.enabled);

onMounted(() => {
  const viewerLoaded = () => {
    Utils.deepAssign(halftone, App.project.getKey("effect.Halftone"));

    window.viewer.removeEventListener('loaded', viewerLoaded);
  }
  window.viewer.addEventListener('loaded', viewerLoaded);
})

// Saved shader parameters are radians (including existing project defaults).
// The UI's 0–90 slider is degrees; convert only at this boundary, not on reload.
function setRotation(key: 'rotateR' | 'rotateG' | 'rotateB', degrees: number) {
  halftone[key] = degrees * Math.PI / 180;
  handleHalftoneConfigChange();
}

function handleHalftoneConfigChange(){
  App.project.setKey(`effect.Halftone`, toRaw(halftone));
}
</script>

<template>
  <div class="sidebar-config-item">
    <span>{{ t(`other.Enable`) }}</span>
    <div>
      <n-checkbox size="small" v-model:checked="halftone.enabled" :disabled="!effectEnabled" @update:checked="handleHalftoneConfigChange"/>
    </div>
  </div>

  <!-- 形状：点，椭圆，线，正方形 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.Shape`) }}</span>
    <div>
      <n-select v-model:value="halftone.shape" :options="[
          {label:t(`layout.sider.postProcessing.Dot`),value: 1},
          {label:t(`layout.sider.postProcessing.Ellipse`),value: 2},
          {label:t(`layout.sider.postProcessing.Line`),value: 3},
          {label:t(`layout.sider.postProcessing.Square`),value: 4},
      ]"  :disabled="disabled" @update:value="handleHalftoneConfigChange" />
    </div>
  </div>

  <!-- 半径 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.Radius`) }}</span>
    <div>
      <n-slider v-model:value="halftone.radius" :step="0.01" :min="1" :max="25" :disabled="disabled" @update:value="handleHalftoneConfigChange" />
    </div>
  </div>

  <!-- R色旋转 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.RotateR`) }}</span>
    <div>
      <n-slider :value="halftone.rotateR * 180 / Math.PI" :step="0.01" :min="0" :max="90" :disabled="disabled" @update:value="value => setRotation('rotateR', value)" />
    </div>
  </div>

  <!-- G色旋转 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.RotateG`) }}</span>
    <div>
      <n-slider :value="halftone.rotateG * 180 / Math.PI" :step="0.01" :min="0" :max="90" :disabled="disabled" @update:value="value => setRotation('rotateG', value)" />
    </div>
  </div>

  <!-- B色旋转 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.RotateB`) }}</span>
    <div>
      <n-slider :value="halftone.rotateB * 180 / Math.PI" :step="0.01" :min="0" :max="90" :disabled="disabled" @update:value="value => setRotation('rotateB', value)" />
    </div>
  </div>

  <!-- 散射 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.Scatter`) }}</span>
    <div>
      <n-slider v-model:value="halftone.scatter" :step="0.01" :min="0" :max="1" :disabled="disabled" @update:value="handleHalftoneConfigChange" />
    </div>
  </div>

  <!-- 混合度 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.Blending`) }}</span>
    <div>
      <n-slider v-model:value="halftone.blending" :step="0.01" :min="0" :max="1" :disabled="disabled" @update:value="handleHalftoneConfigChange" />
    </div>
  </div>

  <!-- 混合模式：线性，相乘，相加，明亮，昏暗 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.BlendingMode`) }}</span>
    <div>
      <n-select v-model:value="halftone.blendingMode" :options="[
          {label:t(`layout.sider.postProcessing.Linear`),value: 1},
          {label:t(`layout.sider.postProcessing.Multiply`),value: 2},
          {label:t(`layout.sider.postProcessing.Add`),value: 3},
          {label:t(`layout.sider.postProcessing.Lighter`),value: 4},
          {label:t(`layout.sider.postProcessing.Darker`),value: 5},
      ]"  :disabled="disabled" @update:value="handleHalftoneConfigChange" />
    </div>
  </div>

  <!-- 灰度 -->
  <div class="sidebar-config-item">
    <span>{{ t(`layout.sider.postProcessing.Greyscale`) }}</span>
    <div>
      <n-checkbox size="small" v-model:checked="halftone.greyscale" :disabled="disabled" @update:checked="handleHalftoneConfigChange"/>
    </div>
  </div>
</template>

<style scoped lang="less">

</style>