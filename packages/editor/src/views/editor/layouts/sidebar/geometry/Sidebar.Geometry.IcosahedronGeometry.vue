<script setup lang="ts">
import type {Mesh} from "three";
import {reactive, onMounted} from "vue";
import {IcosahedronGeometry} from 'three';
import {SetGeometryCommand,App,Hooks} from '@astral3d/engine';
import {t} from "@/language";
import EsInputNumber from "@/components/es/EsInputNumber.vue";

let objectData = reactive({
  radius: 1.00,
  detail: 1,
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

  App.execute(new SetGeometryCommand(App.selected as Mesh, new IcosahedronGeometry(
      objectData.radius,
      objectData.detail
  )))

  Hooks.useDispatchSignal("objectChanged",App.selected);
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

    <!--  detail  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene['Facet segments']") }}</span>

      <EsInputNumber v-model:value="objectData.detail" class="!w-90px" size="small" :decimal="0" :min="0"
                     :show-button="false" @change="update()"/>
    </div>
  </div>
</template>