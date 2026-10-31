<script setup lang="ts">
import type {Mesh} from "three";
import {reactive, onMounted} from "vue";
import {t} from "@/language";
import {SetGeometryCommand,App,Hooks,TeapotGeometry} from '@astral3d/engine';
import EsInputNumber from "@/components/es/EsInputNumber.vue";

let objectData = reactive({
  size: 2.00,
  segments: 10,
  bottom:true,
  lid:true,
  body:true,
  fitLid:false,
  blinn:true,
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

  const geometry = App.selected.geometry;
  geometry.dispose();

  App.execute(new SetGeometryCommand(App.selected as Mesh, new TeapotGeometry(
      objectData.size,
      objectData.segments,
      objectData.bottom,
      objectData.lid,
      objectData.body,
      objectData.fitLid,
      objectData.blinn
  )))

  geometry?.computeBoundingSphere();

  Hooks.useDispatchSignal("geometryChanged",App.selected)
}
</script>

<template>
  <div>
    <n-divider/>

    <!--  size  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene.Size") }}</span>

      <EsInputNumber v-model:value="objectData.size" class="!w-90px" size="small" :decimal="2"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  segments  -->
    <div class="sider-scene-geometry-item">
      <span>{{ t("layout.sider.scene.Segments") }}</span>

      <EsInputNumber v-model:value="objectData.segments" class="!w-90px" size="small" :decimal="0" :min="1"
                     :show-button="false" @change="update()"/>
    </div>

    <!--  bottom  -->
    <div class="sider-scene-geometry-item">
      <span>Bottom</span>

      <n-checkbox size="small" v-model:checked="objectData.bottom" @update:checked="update" />
    </div>

    <!--  lid  -->
    <div class="sider-scene-geometry-item">
      <span>Lid</span>

      <n-checkbox size="small" v-model:checked="objectData.lid" @update:checked="update" />
    </div>

    <!--  body  -->
    <div class="sider-scene-geometry-item">
      <span>Body</span>

      <n-checkbox size="small" v-model:checked="objectData.body" @update:checked="update" />
    </div>

    <!--  fitted lid  -->
    <div class="sider-scene-geometry-item">
      <span>Fitted Lid</span>

      <n-checkbox size="small" v-model:checked="objectData.fitLid" @update:checked="update" />
    </div>

    <!--  blinn-sized  -->
    <div class="sider-scene-geometry-item">
      <span>Blinn-scaled</span>

      <n-checkbox size="small" v-model:checked="objectData.blinn" @update:checked="update" />
    </div>
  </div>
</template>