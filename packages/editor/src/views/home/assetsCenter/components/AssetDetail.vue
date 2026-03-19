<script setup lang="ts">
import {t} from "@/language";
import {filterSize, getServiceStaticFile} from "@/utils/common/file";

withDefaults(defineProps<{
  visible: boolean,
  detail?: IAssets.Item
}>(), {
  visible: false,
  detail: () => ({
    name:"",
    type:'Model',
    category:"",
    thumbnail: "",
    size:0,
    file: '',
    createTime:"",
    updateTime:""
  })
})
const emits = defineEmits(['update:visible']);
</script>

<template>
  <n-modal :show="visible" @update:show="(v) => emits('update:visible',v)">
    <n-descriptions label-placement="left" bordered :column="1">
      <n-descriptions-item :label="t('scene.Cover Picture')">
        <n-image width="200" :src="getServiceStaticFile(detail.thumbnail) || '/static/images/carousel/H3DEditor.svg'" />
      </n-descriptions-item>
      <n-descriptions-item label="ID">
        {{ detail.id }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('home.assets.Name')">
        {{ detail.name }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('home.assets.Type')">
        {{ t(`home.assets.${detail.type}`) }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('home.assets.Category')">
        {{ detail.categoryName || detail.category }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('home.assets.Size')">
        {{ filterSize(detail.size) }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('scene.Create time')">
        {{ detail.createTime?.replace("T"," ").replace("+08:00","") }}
      </n-descriptions-item>
      <n-descriptions-item :label="t('scene.Update time')">
        {{ detail.updateTime?.replace("T"," ").replace("+08:00","") }}
      </n-descriptions-item>
    </n-descriptions>
  </n-modal>
</template>

<style scoped lang="less">

</style>