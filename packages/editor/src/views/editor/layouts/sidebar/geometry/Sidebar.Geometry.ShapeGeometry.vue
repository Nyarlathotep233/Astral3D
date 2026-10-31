<script setup lang="ts">
import type {Mesh} from "three";
import {reactive, onMounted} from "vue";
import { ShapeGeometry,ExtrudeGeometry } from "three";
import {SetGeometryCommand,App} from '@astral3d/engine';
import {t} from "@/language";
import EsInputNumber from "@/components/es/EsInputNumber.vue";

let objectData = reactive({
  curveSegments: 12,
})
let parameters:any;

onMounted(() => {
  const geometry = App.selected?.geometry;
  parameters = geometry.parameters;
  objectData.curveSegments = parameters.curveSegments || 12;
})

function update() {
  if(!App.selected) return;

  App.execute(new SetGeometryCommand(App.selected as Mesh, new ShapeGeometry(
      parameters.shapes,
      objectData.curveSegments
  )))
}

function toExtrude() {
  if(!App.selected) return;

  App.execute( new SetGeometryCommand(App.selected as Mesh, new ExtrudeGeometry(
      parameters.shapes, {
        curveSegments: objectData.curveSegments
      }
  )));
}
</script>

<template>
  <div>
    <n-divider/>

    <!--  curveSegments  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Curve Segments']") }}</span>

      <EsInputNumber v-model:value="objectData.curveSegments" class="!w-90px" size="small" :decimal="0" :min="1"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  to extrude  -->
    <div class="sider-scene-geometry-item text-center">
      <n-button @click="toExtrude">{{ t("layout.sider.scene.Extrude") }}</n-button>
    </div>
  </div>
</template>