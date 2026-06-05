<script setup lang="ts">
import {ref, computed, onMounted, useTemplateRef} from "vue";
import type { TreeOption } from 'naive-ui'
import {t} from "@/language";
import AssetsList from "../assetsCenter/AssetsList.vue";
import EsPopTreeSelect from "@/components/es/EsPopTreeSelect.vue";
import UploadAsset from "@/views/home/assetsCenter/UploadAsset.vue";
import {useAssetsStore} from "@/store/modules/assets";

const assetsStore = useAssetsStore();

const assetsListRef = useTemplateRef<typeof AssetsList>("assetsListRef");
function refreshList(asset: IAssets.Item) {
  assetsListRef.value?.refresh(asset,'add');
}

/* 资产分类 */
// 主分类选择
const currentCategory = ref<IAssets.SupportType>(assetsStore.categories[0].key);
// 子分类
const subCategories = computed(() => assetsStore.getCategoryChildren(currentCategory.value));
// 子分类选中项
const activeSubCategory = ref('');
// 子分类UI选中按钮Key
const activeButtonKey = ref('');

// 处理主分类变更
function handleSelectCategory(key: IAssets.SupportType) {
  currentCategory.value = key;

  activeSubCategory.value = '';
  activeButtonKey.value = '';
}

// 处理子分类变更
function handleSelectSubCategory(key: string,buttonKey: string) {
  if(activeSubCategory.value === key){
    activeSubCategory.value = '';
    activeButtonKey.value = '';
  }else{
    activeSubCategory.value = key;
    activeButtonKey.value = buttonKey;
  }
}

/* 资产上传 */
const uploadVisible = ref(false);

function handleUploadAssetVisible(){
  uploadVisible.value = true;
}

onMounted(() => {
  assetsStore.fetchCategory();
})
</script>

<template>
  <n-layout-content class="assets-center-container home-module-panel" content-class="assets-center-content">
    <!-- 左侧分类 -->
    <n-card embedded :bordered="false" class="assets-category-card">
      <div class="assets-category-grid">
        <n-button class="assets-category-button"  :quaternary="category.key !== currentCategory" v-for="category in assetsStore.categories"
                  :key="category.key" :type="category.key === currentCategory ? 'primary' : 'default'"
                  @click="handleSelectCategory(category.key)">
          <div class="flex flex-col items-center">
            <n-icon :size="30" class="text-xl mb-2">
              <component :is="category.icon"></component>
            </n-icon>
            <div class="text-0.7rem">{{ category.label }}</div>
          </div>
        </n-button>
      </div>

      <n-button type="primary" class="assets-upload-button" @click="handleUploadAssetVisible">{{ t('home.assets.Upload asset') }}</n-button>
    </n-card>

    <!-- 右侧内容 -->
    <div class="assets-main-panel">
      <!-- 子分类标签 -->
      <div class="assets-subcategory-bar">
        <template v-for="subCategory in subCategories" :key="subCategory.key">
          <n-button v-if="!subCategory.children?.length" strong secondary round
                     :type="activeButtonKey === subCategory.key ? 'primary' : 'default'"
                     @click="handleSelectSubCategory(subCategory.key,subCategory.key)">
            {{ subCategory.label }}
          </n-button>

          <EsPopTreeSelect v-else :options="[subCategory] as unknown as TreeOption[]" :value="subCategory.key"
                           strong secondary round :type="activeButtonKey === subCategory.key ? 'primary' : 'default'"
                           @click="(option) => handleSelectSubCategory(option.key,subCategory.key)" />
        </template>
      </div>

      <AssetsList ref="assetsListRef" :type="currentCategory" :category="activeSubCategory" />
    </div>
  </n-layout-content>

  <UploadAsset v-model:visible="uploadVisible" @refresh="refreshList" />
</template>

<style scoped lang="less">
.assets-center-container {
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(var(--home-primary-rgb), 0.11), transparent 32%),
    rgba(7, 11, 23, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 80px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);

  :deep(.assets-center-content) {
    height: 100%;
    min-height: 0;
    padding: 20px;
    display: flex;
    gap: 20px;
  }

  :deep(.n-input) {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 12px;
  }

  :deep(.n-checkbox .n-checkbox-box) {
    background: rgba(255, 255, 255, 0.05);
  }

  .assets-category-card {
    width: 270px;
    height: 100%;
    flex-shrink: 0;
    overflow-y: auto;
    border-radius: 24px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)),
      rgba(8, 13, 25, 0.76);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);

    :deep(.n-card__content) {
      height: 100%;
      padding: 16px !important;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
  }
}

.assets-category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.assets-category-button {
  height: 92px;
  padding: 12px 8px;
  border-radius: 18px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  :deep(.n-button__content) {
    width: 100%;
  }
}

:deep(.assets-category-button.n-button--primary-type) {
  color: var(--home-on-primary);
  box-shadow: 0 14px 30px rgba(var(--home-primary-rgb), 0.24);
}

.assets-upload-button {
  width: 100%;
  margin-top: 18px;
  box-shadow: 0 14px 34px rgba(var(--home-primary-rgb), 0.24);
}

:deep(.assets-upload-button.n-button--primary-type) {
  color: var(--home-on-primary);
}

.assets-main-panel {
  min-width: 0;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.assets-subcategory-bar {
  min-height: 42px;
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  :deep(.n-button) {
    backdrop-filter: blur(12px);
  }
}

@media (max-width: 1100px) {
  .assets-center-container {
    :deep(.assets-center-content) {
      flex-direction: column;
    }

    .assets-category-card {
      width: 100%;
      height: auto;
      max-height: 220px;
    }
  }
}
</style>
