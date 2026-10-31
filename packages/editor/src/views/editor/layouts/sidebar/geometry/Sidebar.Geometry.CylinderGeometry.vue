<script setup lang="ts">
import type {Mesh} from "three";
import {reactive, onMounted} from "vue";
import {CylinderGeometry} from "three";
import {SetGeometryCommand,App} from '@astral3d/engine';
import {t} from "@/language";
import EsInputNumber from "@/components/es/EsInputNumber.vue";

let objectData = reactive({
  radiusTop: 1.00,
  radiusBottom:1.00,
  height:1.00,
  radialSegments:32,
  heightSegments:1,
  openEnded:false
})

onMounted(() => {
  const geometry = App.selected?.geometry;
  const parameters = geometry.parameters;
  Object.keys(parameters).forEach(key => {
    objectData[key] = parameters[key]
  })
})

function update() {
  if(!App.selected) return;

  App.execute(new SetGeometryCommand(App.selected as Mesh, new CylinderGeometry(
      objectData.radiusTop,
      objectData.radiusBottom,
      objectData.height,
      objectData.radialSegments,
      objectData.heightSegments,
      objectData.openEnded
  )))
}
</script>

<template>
  <div>
    <n-divider/>

    <!--  radiusTop  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Radius top']") }}</span>

      <EsInputNumber v-model:value="objectData.radiusTop" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  radiusBottom  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Radius bottom']") }}</span>

      <EsInputNumber v-model:value="objectData.radiusBottom" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  height  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene.Height") }}</span>

      <EsInputNumber v-model:value="objectData.height" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  radialSegments  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Radial segments']") }}</span>

      <EsInputNumber v-model:value="objectData.radialSegments" class="!w-90px" size="small" :decimal="0" :min="1"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  heightSegments  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Height segments']") }}</span>

      <EsInputNumber v-model:value="objectData.heightSegments" class="!w-90px" size="small" :decimal="0" :min="1"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  openEnded  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Open ended']") }}</span>

      <n-checkbox size="small" v-model:checked="objectData.openEnded" @update:checked="update" />
    </div>
  </div>
</template>