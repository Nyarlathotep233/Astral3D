<template>
  <div class="w-calc-1.5rem h-calc-1.5rem p-3 flex space-x-4">
    <!-- 左侧分类 -->
    <n-card embedded class="resource-category-card w-36 h-full overflow-y-auto rounded-lg shadow-sm">
      <div class="grid grid-cols-2 gap-2">
        <n-button class="py-2 rounded-lg h-max" :quaternary="category.key !== currentCategory" v-for="category in categories"
                  :key="category.key" :type="category.key === currentCategory ? 'primary' : 'default'"
                  @click="handleSelectCategory(category.key)">
          <n-icon :size="30" class="text-xl mb-2">
            <component :is="category.icon"></component>
          </n-icon>
          <div class="text-0.7rem">{{ category.name }}</div>
        </n-button>
      </div>
    </n-card>

    <!-- 右侧内容 -->
    <div class="w-calc-10rem">
      <component :is="currentComponent" class="w-full h-full" />

      <!-- TODO: 添加分页/瀑布流加载 -->
    </div>
  </div>

  <CommonPreview ref="previewRef" v-model:visible="previewInfo.visible" :name="previewInfo.name" :file-or-url="previewInfo.fileOrUrl"
                 :type="previewInfo.type" is-builtin />
</template>

<script setup lang="ts">
import {computed, markRaw, reactive, ref, provide, useTemplateRef} from "vue";
import {cpt} from "@/language";
import {Buoy, CameraAction, HeatMap, LocationCompany, LocationHeart,ChoroplethMap, ModelAlt, Opacity} from "@vicons/carbon";
import CommonPreview from "@/components/preview/CommonPreview.vue";
import Prefabs from "@/views/editor/components/extraPane/resource/builtin/Prefabs.vue";
import Models from "@/views/editor/components/extraPane/resource/builtin/Models.vue";
import Materials from "@/views/editor/components/extraPane/resource/builtin/Materials.vue";
import Particles from "@/views/editor/components/extraPane/resource/builtin/Particles.vue";
import Billboard from "@/views/editor/components/extraPane/resource/builtin/Billboard.vue";
import HtmlPanel from "@/views/editor/components/extraPane/resource/builtin/HtmlPanel.vue";
import Tiles from "@/views/editor/components/extraPane/resource/builtin/Tiles.vue";
import Lights from "@/views/editor/components/extraPane/resource/builtin/Lights.vue";
import Cameras from "@/views/editor/components/extraPane/resource/builtin/Cameras.vue";

const currentCategory = ref("models");
const categories = ref([
  { key: 'prefabs', name: 'Prefab', icon: markRaw(ModelAlt), component: markRaw(Prefabs) },
  { key: 'models', name: cpt("home.assets.Model"), icon: markRaw(ModelAlt), component: markRaw(Models) },
  { key: 'materials', name: cpt("home.assets.Material"), icon: markRaw(Opacity), component: markRaw(Materials) },
  { key: 'particles', name: cpt("layout.sider.Particle"), icon: markRaw(HeatMap), component: markRaw(Particles) },
  { key: 'billboard', name: cpt("home.assets.Billboard"), icon: markRaw(LocationHeart), component: markRaw(Billboard) },
  { key: 'htmlPanel', name: cpt("extra.resource.Html panel"), icon: markRaw(LocationCompany), component: markRaw(HtmlPanel) },
  { key: 'tiles', name: "3D Tiles", icon: markRaw(ChoroplethMap), component: markRaw(Tiles) },
  { key: 'lights', name: cpt("extra.resource.Light"), icon: markRaw(Buoy), component: markRaw(Lights) },
  { key: 'cameras', name: cpt("extra.resource.Camera"), icon: markRaw(CameraAction), component: markRaw(Cameras) },
]);
const currentComponent = computed(() => categories.value.find(category => category.key === currentCategory.value)?.component)

function handleSelectCategory(key: string) {
  currentCategory.value = key;
}

const previewRef = useTemplateRef("previewRef");
const previewInfo = reactive({
  visible: false,
  name:"",
  fileOrUrl: "",
  type: "Model"
})
provide('previewInfo', previewInfo);
provide('previewRef', previewRef);
</script>

<style scoped lang="less">
.resource-category-card {
  :deep(.n-card__content) {
    padding: 0.6rem 0.7rem !important;
  }

  .n-button {
    :deep(&__content) {
      flex-direction: column;
    }
  }
}
</style>
