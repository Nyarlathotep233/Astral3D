<template>
  <div id="extra-resource-3d-tiles" class="flex flex-col">
    <!-- 子分类标签 -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <n-button v-for="subCategory in subCategories" :key="subCategory.key" strong secondary round
                :type="activeSubCategory === subCategory.key ? 'primary' : 'default'"
                @click="selectSubCategory(subCategory.key)">
        {{ subCategory.name }}
      </n-button>
    </div>

    <!-- 资源网格 -->
    <div class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
        <n-card size="small" hoverable v-for="item in filteredList" :key="item.key"
                @dblclick="addToScene(item)" draggable="true" @dragstart="dragStart(item)" @dragend="dragEnd"
                @contextmenu.prevent="handlePreview(item)">
          <template #cover>
            <img :src="item.image" :alt="item.key" draggable="false" class="w-full h-full object-cover"/>
          </template>
          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger> {{ item.name.value || item.name }}</template>
            <span> {{ item.name.value || item.name }} </span>
          </n-tooltip>
        </n-card>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {ref, inject, computed} from "vue";
import type {Ref} from "vue";
import {Vector3} from "three";
import {Tiles} from "@astral3d/engine";
import {cpt} from "@/language";
import {useDragStore} from "@/store/modules/drag";
import {screenToWorld} from "@/utils/common/scenes";

const searchText = inject('searchText') as Ref<string>;
const previewInfo = inject('previewInfo') as any;


const activeSubCategory = ref('building');
const subCategories = ref([
  {key: 'building', name: cpt('extra.resource.model.Building')},
  {key: 'other', name: cpt('extra.resource.model.Other')}
]);

const allList = {
  "building": [
    {key: "APetrochemicalPlant", image: "/static/images/resource/tiles/building/APetrochemicalPlant.jpg", name: cpt('extra.resource.tiles.A petrochemical plant'), tileset: "/static/resource/tiles/building/APetrochemicalPlant/tileset.json"},
    {key: "BuildingGroup1", image: "/static/images/resource/tiles/building/buildingGroup1.jpg", name: cpt('extra.resource.tiles.Building group 1'), tileset: "https://tiles.arcgis.com/tiles/V6ZHFr6zdgNZuVG0/arcgis/rest/services/Utrecht_3D_Tiles_Integrated_Mesh/3DTilesServer/tileset.json"},
  ],
  "other": [
    {key: "Dragon", image: "/static/images/resource/tiles/other/dragon.jpg", name: cpt('extra.resource.tiles.Dragon'), tileset: "/static/resource/tiles/other/dragon/tileset.json"},
  ]
}

const filteredList = computed(() => {
  return allList[activeSubCategory.value].filter((item) => (item.name.value || item.name).toLowerCase().includes(searchText.value.toLowerCase()));
});

// 切换子分类
function selectSubCategory(key: string) {
  activeSubCategory.value = key;
}

// 预览
async function handlePreview(item){
  let url = item.tileset;
  if(!url.startsWith('http')){
    url = import.meta.env.VITE_GLOB_ORIGIN + item.tileset;
  }

  previewInfo.name = (item.name as Ref<string>).value || item.name;
  previewInfo.type = "Tiles";
  previewInfo.fileOrUrl = url;
  previewInfo.visible = true;

  // TODO： [20250927] 直接赋值previewInfo.fileOrUrl就会在预览组件中自动加载模型，运行2个月没问题后删除下面注释
  // await nextTick();
  //
  // previewRef.value?.getPreviewer().then((previewer:Preview) => {
  //   if(!previewer) return;
  //
  //   const tiles = new Tiles({
  //     url:import.meta.env.VITE_GLOB_ORIGIN + item.tileset,
  //     name:previewInfo.name,
  //     reset2origin:true,
  //   })
  //
  //   previewer.addTiles(tiles).then(() => {
  //     previewer.modules.controls.fitToBox(tiles.group,true);
  //   })
  // })
}

//双击添加至场景..
function addToScene(item, position?: Vector3) {
  let url = item.tileset;
  if(!url.startsWith('http')){
    url = import.meta.env.VITE_GLOB_ORIGIN + item.tileset;
  }

  const tiles = new Tiles({
    // 内置的3dTiles打包时需要存入完整地址方可通过sdk加载回来
    url: url,
    name:item.name.value || item.name,
    reset2origin:true,
  })

  if (position && tiles.options.reset2origin) {
    tiles.position.copy(position);
  }

  window.viewer.addTiles(tiles);
}

// 开始拖拽事件
const dragStore = useDragStore();

function dragStart(item) {
  dragStore.setData(item)
}

function dragEnd() {
  if (dragStore.getActionTarget !== "addToScene" || dragStore.endArea !== "Scene") return;

  const position = screenToWorld(dragStore.endPosition.x, dragStore.endPosition.y);

  addToScene(dragStore.getData, position);

  dragStore.setActionTarget("");
}
</script>

<style scoped lang="less">
#extra-resource-3d-tiles {
  overflow-x: hidden;

  .n-card {
    cursor: pointer;

    :deep(.n-card__content) {
      padding: 0.3rem 0;
      font-size: 0.65rem;
      text-align: center;

      .n-button {
        font-size: 0.65rem !important;
      }
    }
  }
}
</style>
