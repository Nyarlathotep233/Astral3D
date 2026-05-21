<template>
    <div id="extra-resource-models" class="flex flex-col">
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
                <Card v-for="resource in filteredList" :key="resource.key" :resource="resource" />
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, inject, computed, watch } from "vue";
import type { Ref } from "vue";
import { cpt } from "@/language";
import Card from "./components/ModelCard.vue";
import {
  editorLayoutPresetKey,
  filterByIncludeList,
  filterItemsByKey,
  listHasRestrictions,
  type ModelSubCategoryKey,
} from "@/views/editor/layoutPresets";

const searchText = inject('searchText') as Ref<string>;
const layoutPreset = inject(editorLayoutPresetKey)!;
const modelsPreset = computed(() => layoutPreset.resource?.builtin?.models);

const allSubCategories = [
    { key: 'shape' as ModelSubCategoryKey, name: cpt('extra.resource.model.Shape') },
    { key: 'building' as ModelSubCategoryKey, name: cpt('extra.resource.model.Building') },
    { key: 'person' as ModelSubCategoryKey, name: cpt('extra.resource.model.Person') },
    { key: 'plant' as ModelSubCategoryKey, name: cpt('extra.resource.model.Plant') },
    { key: 'animal' as ModelSubCategoryKey, name: cpt('extra.resource.model.Animal') },
    { key: 'vehicle' as ModelSubCategoryKey, name: cpt('extra.resource.model.Vehicle') },
    { key: 'mehicle' as ModelSubCategoryKey, name: cpt('extra.resource.model.Machine') },
    { key: 'furniture' as ModelSubCategoryKey, name: cpt('extra.resource.model.Furniture') },
    { key: 'outdoor' as ModelSubCategoryKey, name: cpt('extra.resource.model.Outdoor') },
    { key: 'other' as ModelSubCategoryKey, name: cpt('extra.resource.model.Other') },
];

const subCategories = computed(() => {
  const allowed = filterByIncludeList(
    allSubCategories.map((s) => s.key),
    modelsPreset.value?.subCategories
  );
  return allSubCategories.filter((s) => allowed.includes(s.key));
});

const defaultSubCategory = modelsPreset.value?.defaultSubCategory ?? 'shape';
const activeSubCategory = ref<ModelSubCategoryKey>('shape');

function ensureValidSubCategory() {
  const keys = subCategories.value.map((s) => s.key);
  if (keys.length === 0) return;
  if (keys.includes(activeSubCategory.value)) return;
  const preferred = keys.includes(defaultSubCategory)
    ? defaultSubCategory
    : keys[0];
  activeSubCategory.value = preferred;
}

watch(subCategories, ensureValidSubCategory, { immediate: true });

const allList = {
    // 形状
    "shape": [
        { key: "Group", image: "/static/images/resource/model/shape/group.jpg", name: cpt("extra.resource.model.Group") },
        { key: "Sprite", image: "/static/images/resource/model/shape/sprite.jpg", name: cpt("extra.resource.model.Sprite") },
        { key: "Box", image: "/static/images/resource/model/shape/box.jpg", name: cpt("extra.resource.model.Box") },
        { key: "Circle", image: "/static/images/resource/model/shape/circle.jpg", name: cpt("extra.resource.model.Circle") },
        { key: "Cylinder", image: "/static/images/resource/model/shape/cylinder.jpg", name: cpt("extra.resource.model.Cylinder") },
        { key: "Sphere", image: "/static/images/resource/model/shape/sphere.jpg", name: cpt("extra.resource.model.Sphere") },
        { key: "Torus", image: "/static/images/resource/model/shape/torus.jpg", name: cpt("extra.resource.model.Torus") },
        { key: "Plane", image: "/static/images/resource/model/shape/plane.jpg", name: cpt("extra.resource.model.Plane") },
        { key: "Ring", image: "/static/images/resource/model/shape/ring.jpg", name: cpt("extra.resource.model.Ring") },
        { key: "Tetrahedron", image: "/static/images/resource/model/shape/tetrahedron.jpg", name: cpt("extra.resource.model.Tetrahedron") },
        { key: "Octahedron", image: "/static/images/resource/model/shape/octahedron.jpg", name: cpt("extra.resource.model.Octahedron") },
        { key: "Dodecahedron", image: "/static/images/resource/model/shape/dodecahedron.jpg", name: cpt("extra.resource.model.Dodecahedron") },
        { key: "Icosahedron", image: "/static/images/resource/model/shape/icosahedron.jpg", name: cpt("extra.resource.model.Icosahedron") },
        { key: "Capsule", image: "/static/images/resource/model/shape/capsule.jpg", name: cpt("extra.resource.model.Capsule") },
        { key: "DoubleCone", image: "/static/images/resource/model/shape/doubleCone.jpg", name: cpt("extra.resource.model['Double cone']") },
        { key: "TorusKnot", image: "/static/images/resource/model/shape/torusKnot.jpg", name: cpt("extra.resource.model.TorusKnot") },
        { key: "Tube", image: "/static/images/resource/model/shape/tube.jpg", name: cpt("extra.resource.model.Tube") },
        { key: "Teapot", image: "/static/images/resource/model/shape/teapot.jpg", name: cpt("extra.resource.model.Teapot") },
    ],
    // 建筑
    "building":[
        { key: "Stall", name: cpt("extra.resource.model.Stall"), image: "/static/images/resource/model/building/stall.jpg", path: "/static/model/building/Stall_astral3d.optimize.glb" },
    ],
    // 人物
    "person":[
        { key: "Jackie", name: "Jackie", image: "/static/images/resource/model/person/jackie.jpg", path: "/static/model/person/Jackie.glb" },
    ],
    // 植物
    "plant":[
        { key: "Grass", name: cpt("extra.resource.model.Grass"), image: "/static/images/resource/model/plant/grass.jpg", path:"/static/model/plant/Grass_astral3d.optimize.glb" },
        { key: "MapleTree", name: cpt("extra.resource.model.Maple tree"), image: "/static/images/resource/model/plant/mapleTree.jpg", path: "/static/model/plant/MapleTree_astral3d.optimize.glb" },
        { key: "DragonSpruce", name: cpt("extra.resource.model.Dragon spruce"), image: "/static/images/resource/model/plant/dragonSpruce.jpg", path: "/static/model/plant/DragonSpruce_astral3d.optimize.glb" },
        { key: "SmallTree", name: cpt("extra.resource.model.Small tree"), image: "/static/images/resource/model/plant/smallTree.jpg", path: "/static/model/plant/SmallTree_astral3d.optimize.glb" },
        { key: "SmallFlower", name: cpt("extra.resource.model.Small flower"), image: "/static/images/resource/model/plant/smallFlower.jpg", path: "/static/model/plant/SmallFlower_astral3d.optimize.glb" },
        { key: "Lemon", name: cpt("extra.resource.model.Lemon"), image: "/static/images/resource/model/plant/lemon.jpg", path: "/static/model/plant/Lemon_astral3d.optimize.glb" },
    ],
    // 动物
    "animal":[
        { key: "Rat", name: cpt("extra.resource.model.Rat"), image: "/static/images/resource/model/animal/rat.jpg", path: "/static/model/animal/Rat_astral3d.optimize.glb" },
    ],
    // 交通工具
    "vehicle":[
        { key: "CoveredCar", name: cpt("extra.resource.model.Covered car"), image: "/static/images/resource/model/vehicle/coveredCar.jpg", path: "/static/model/vehicle/CoveredCar_astral3d.optimize.glb" },
    ],
    // 机械设备
    "mehicle": [
        { key: "Drill", name: cpt("extra.resource.model.Drill"), image: "/static/images/resource/model/mehicle/drill.jpg", path: "/static/model/mehicle/Drill_astral3d.optimize.glb" },
    ],
    // 室内用品
    "furniture":[
        { key: "Sofa", name: cpt("extra.resource.model.Sofa"), image: "/static/images/resource/model/furniture/sofa.jpg", path: "/static/model/furniture/Sofa_astral3d.optimize.glb" },
        { key: "WoodenStool", name: cpt("extra.resource.model.Wooden stool"), image: "/static/images/resource/model/furniture/woodenStool.jpg", path: "/static/model/furniture/WoodenStool_astral3d.optimize.glb" },
    ],
    // 室外用品
    "outdoor":[
        { key: "WoodenDiningTable", name: cpt("extra.resource.model.Wooden dining table"), image: "/static/images/resource/model/outdoor/woodenDiningTable.jpg", path: "/static/model/outdoor/WoodenDiningTable_astral3d.optimize.glb" },
    ],
    // 其他
    "other":[
        { key: "Baseball", name: cpt("extra.resource.model.Baseball"), image: "/static/images/resource/model/other/baseball.jpg", path: "/static/model/other/Baseball_astral3d.optimize.glb" },
    ],
}

function getItemsForSubCategory(subKey: ModelSubCategoryKey) {
  const items = allList[subKey] ?? [];
  const itemFilter = modelsPreset.value?.items?.[subKey];
  if (!listHasRestrictions(itemFilter)) return items;
  return filterItemsByKey(items, itemFilter);
}

const filteredList = computed(() => {
    return getItemsForSubCategory(activeSubCategory.value).filter((item) =>
      (item.name.value || item.name).toLowerCase().includes(searchText.value.toLowerCase())
    );
});

function selectSubCategory(key: ModelSubCategoryKey) {
    activeSubCategory.value = key;
}
</script>

<style scoped lang="less">
#extra-resource-models {
    overflow-x: hidden;
}
</style>
