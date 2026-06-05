<script setup lang="ts">
import {onMounted, ref, reactive, watch} from "vue";
import {Search} from "@vicons/carbon";
import {Utils} from "@astral3d/engine";
import {getServiceStaticFile} from "@/utils/common/file";
import CardAction from "./components/CardAction.vue";
import {t} from "@/language";
import {fetchGetAssetCategoryTags, fetchGetAssetsList} from "@/http/api/assetsInfo";
import UploadAsset from "@/views/home/assetsCenter/UploadAsset.vue";
import AssetDetail from "@/views/home/assetsCenter/components/AssetDetail.vue";
import AssetPreview from "@/components/preview/AssetPreview.vue";

const props = withDefaults(defineProps<{
  type: IAssets.SupportType,
  category: string
}>(), {
  type: "Model",
  category: ""
});

// 搜索和筛选状态
const tags = ref([]);
const filterTags = ref([]);
const searchQuery = ref("");
// 资源数据
const assetsData = ref<Array<IAssets.Item>>([]);

/* 操作相关 */
const previewVisible = ref(false);
const detailVisible = ref(false);
const editVisible = ref(false);
const operationAsset = ref<IAssets.Item>();

function handlePreview(asset: IAssets.Item) {
  operationAsset.value = asset;
  previewVisible.value = true;
}

function handleDetail(asset: IAssets.Item) {
  operationAsset.value = asset;
  detailVisible.value = true;
}

function handleEdit(asset: IAssets.Item) {
  operationAsset.value = asset;
  editVisible.value = true;
}

/* 资源列表 */
let paginationReactive = reactive({
  page: 0,
  pageSize: 10,
  pageCount: 1
})
const loadMore = ref(false);
const noMore = ref(false);

async function handleLoad() {
  if (noMore.value) return;

  loadMore.value = true;
  const res = await fetchGetAssetsList({
    offset: paginationReactive.page * paginationReactive.pageSize,
    limit: paginationReactive.pageSize,
    sortby: "updateTime",
    order: "desc",
    query: `type:${props.type}${props.category ? `,category:${props.category}` : ""}`,
    search: `${filterTags.value.length > 0 ? ("tags:" + filterTags.value.join(",") + ';') : ''}${searchQuery.value ? "name:" + searchQuery.value : ""}`,
  });
  if (res.data === null) return;

  assetsData.value.push(...(res.data.items || []));
  paginationReactive.pageCount = res.data.pages;
  paginationReactive.page++;
  loadMore.value = false;

  if (paginationReactive.page >= paginationReactive.pageCount) noMore.value = true;
}

function reload() {
  paginationReactive.page = 0;
  paginationReactive.pageCount = 1;

  assetsData.value = [];
  noMore.value = false;

  handleLoad();
}

// 新增/编辑后刷新
function refresh(asset: IAssets.Item, operation: 'add' | 'remove' | 'update' = 'add') {
  switch (operation) {
    case 'add':
      assetsData.value.unshift(asset);
      break;
    case 'remove':
      const index = assetsData.value.findIndex(a => a.id === asset.id);
      assetsData.value.splice(index, 1);
      break;
    case 'update':
      // 是编辑提交则查找更新对应项目
      const item = assetsData.value.find(a => a.id === asset.id);
      if (!item) return;

      Object.assign(item, asset);
      break;
  }
}

onMounted(() => {
  handleLoad();

  // 获取标签
  fetchGetAssetCategoryTags(props.type,props.category).then(res => {
    tags.value = res.data;
  })
})
watch([() => props.type, () => props.category], () => {
  filterTags.value = [];

  reload();

  // 获取标签
  fetchGetAssetCategoryTags(props.type,props.category).then(res => {
    tags.value = res.data;
  })
})
watch(searchQuery,Utils.debounce(() => {
  reload();
},500))

defineExpose({
  refresh
})
</script>

<template>
  <!-- 搜索和筛选区域 -->
  <div class="asset-list-toolbar">
    <n-checkbox-group v-model:value="filterTags" @update:value="reload">
      <n-space item-style="display: flex;" align="center">
        <n-checkbox v-for="tag in tags" :key="tag" :value="tag" :label="tag" />
      </n-space>
    </n-checkbox-group>

    <n-input v-model:value="searchQuery" :placeholder="t('home.assets.Search for assets') + '...'" clearable
             class="max-w-500px">
      <template #prefix>
        <n-icon :component="Search"/>
      </template>
    </n-input>
  </div>

  <!-- 资源网格展示 -->
  <n-infinite-scroll id="home-asset-cards-list" :distance="10" @load="handleLoad">
    <n-card hoverable v-for="asset in assetsData" :key="asset.id" :bordered="false" content-class="!p-0" class="asset-card">
      <template #cover>
        <div class="asset-cover">
          <div class="asset-tags">
            <n-tag type="success" :bordered="false"
                   v-for="tag in (asset.tags ? asset.tags.split(',') : [])" :key="tag">
              {{ tag }}
            </n-tag>
          </div>

          <n-image preview-disabled object-fit="cover"
                   :src="getServiceStaticFile(asset.thumbnail) || '/static/images/carousel/H3DEditor.svg'"
                   class="asset-cover-image"
                   @click="handlePreview(asset)"/>
        </div>
      </template>

      <template #action>
        <CardAction :asset="asset" @refresh="refresh" @preview="handlePreview" @detail="handleDetail" @edit="handleEdit"/>
      </template>
    </n-card>

    <div v-if="loadMore" class="text-center" style="grid-column: 1 / -1;">
      {{ t('home.Loading') }}...
    </div>
    <div v-else-if="!noMore" class="text-center" style="grid-column: 1 / -1;">
      {{ t('home.Scroll to load more') }} 😽😽😽
    </div>
    <div v-else class="text-center" style="grid-column: 1 / -1;">
      {{ t('home.No more') }} 🤪
    </div>
  </n-infinite-scroll>

  <!-- 预览 -->
  <AssetPreview v-model:visible="previewVisible" :asset="operationAsset as IAssets.Item" />

  <!-- 详情 -->
  <AssetDetail v-model:visible="detailVisible" :detail="operationAsset"/>

  <!-- 编辑 -->
  <UploadAsset v-model:visible="editVisible" :asset="operationAsset" @refresh="refresh"/>
</template>

<style lang="less">
.asset-list-toolbar {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  .n-input {
    max-width: 500px;
  }

  .n-checkbox {
    color: rgba(255, 255, 255, 0.70);
  }
}

#home-asset-cards-list {
  height: calc(100% - 54px);
  width: 100%;

  .n-scrollbar-content {
    display: grid;
    grid-gap: 18px;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    grid-auto-flow: row dense;

    .asset-card {
      display: block !important;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.06);
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(18px);
      transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;

      &:hover {
        transform: translateY(-5px);
        background: rgba(255, 255, 255, 0.10);
        box-shadow: 0 26px 64px rgba(0, 0, 0, 0.34);
      }
    }

    .n-card-cover {
      height: auto;
      flex: none;
    }

    .n-card__action {
      margin: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      color: rgba(255, 255, 255, 0.84);
      background:
        linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.12), rgba(255, 255, 255, 0.04) 52%, transparent),
        rgba(10, 16, 30, 0.54);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10), 0 12px 30px rgba(0, 0, 0, 0.20);
      backdrop-filter: blur(16px);

      h4 {
        color: #ffffff;
      }

      .n-button {
        color: rgba(255, 255, 255, 0.76);

        &:hover {
          color: var(--home-primary-hover);
        }
      }
    }
  }

  .n-scrollbar-rail{
    right: -10px;
  }
}

.asset-cover {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}

.asset-tags {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  .n-tag--success-type {
    color: var(--home-on-primary);
    background-color: var(--home-primary);
  }
}

.asset-cover-image {
  width: 100%;
  height: 100%;
  display: block;
  cursor: pointer;
  transition: transform 0.35s ease, filter 0.35s ease;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover {
    transform: scale(1.06);
    filter: saturate(1.12) contrast(1.04);
  }
}

</style>
