<script setup lang="ts">
import type {Mesh} from "three";
import {reactive, onMounted} from "vue";
import {MathUtils,CircleGeometry} from "three";
import {SetGeometryCommand,App} from '@astral3d/engine';
import {t} from "@/language";
import EsInputNumber from "@/components/es/EsInputNumber.vue";

let objectData = reactive({
  radius: 1.00,
  segments: 32,
  thetaStart: 0.00,
  thetaLength: 360.00,
})

onMounted(() => {
  const geometry = App.selected?.geometry;
  const parameters = geometry.parameters;

  objectData.radius = parameters.radius;
  objectData.segments = parameters.segments;
  objectData.thetaStart = parameters.thetaStart * MathUtils.RAD2DEG;
  objectData.thetaLength = parameters.thetaLength * MathUtils.RAD2DEG;
})

function update() {
  if(!App.selected) return;

  App.execute(new SetGeometryCommand(App.selected as Mesh, new CircleGeometry(
      objectData.radius,
      objectData.segments,
      objectData.thetaStart * MathUtils.DEG2RAD,
      objectData.thetaLength * MathUtils.DEG2RAD
  )))
}
</script>

<template>
  <div>
    <n-divider/>

    <!--  radius  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene.Radius") }}</span>

      <EsInputNumber v-model:value="objectData.radius" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  segments  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene.Segments") }}</span>

      <EsInputNumber v-model:value="objectData.segments" class="!w-90px" size="small" :decimal="0"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  theta start  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Theta start']") }}</span>

      <EsInputNumber v-model:value="objectData.thetaStart" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  theta length  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Theta length']") }}</span>

      <EsInputNumber v-model:value="objectData.thetaLength" class="!w-90px" size="small" :decimal="0"
                     :show-button="false" @change="update()"/>
    </div>
  </div>
</template>