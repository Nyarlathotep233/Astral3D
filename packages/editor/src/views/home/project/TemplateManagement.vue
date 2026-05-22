<script setup lang="ts">
import {computed, onMounted, reactive, ref} from "vue";
import {fetchGetAllScenes} from "@/http/api/scenes";
import {
  fetchCreateSceneExampleFromScene,
  fetchDeleteSceneExample,
  fetchSceneExampleList,
  fetchUpdateSceneExample
} from "@/http/api/sceneExample";
import {getServiceStaticFile} from "@/utils/common/file";

const TEMPLATE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TEMPLATE_KEY_FORMAT_MESSAGE = "模板Key仅支持字母、数字、下划线、中划线，且必须以字母或数字开头，最长64位";

const templates = ref<ISceneFetchData[]>([]);
const sourceScenes = ref<ISceneFetchData[]>([]);
const loading = ref(false);
const sourceLoading = ref(false);
const creating = ref(false);
const updatingKey = ref(false);
const showCreateModal = ref(false);
const showKeyModal = ref(false);
const createFormRef = ref();
const keyFormRef = ref();
const editingTemplate = ref<ISceneFetchData | null>(null);

const paginationReactive = reactive({
  page: 1,
  pageSize: 20,
  pageCount: 1,
  total: 0
});
const pageSizeOptions = [8, 10, 20, 40];

const createForm = reactive({
  sceneId: null as string | null,
  sceneName: "",
  sceneType: "",
  sceneIntroduction: "",
  templateKey: ""
});

const keyForm = reactive({
  templateKey: ""
});

function validateOptionalTemplateKey(_: unknown, value: string | null) {
  const key = String(value || "").trim();
  if (!key) return true;
  return TEMPLATE_KEY_PATTERN.test(key) ? true : new Error(TEMPLATE_KEY_FORMAT_MESSAGE);
}

function validateRequiredTemplateKey(_: unknown, value: string | null) {
  const key = String(value || "").trim();
  if (!key) return new Error("请输入模板Key");
  return TEMPLATE_KEY_PATTERN.test(key) ? true : new Error(TEMPLATE_KEY_FORMAT_MESSAGE);
}

const createRules = {
  sceneId: {
    required: true,
    message: "请选择源场景",
    trigger: ["blur", "change"]
  },
  templateKey: {
    validator: validateOptionalTemplateKey,
    trigger: ["blur", "input"]
  }
};

const keyRules = {
  templateKey: {
    validator: validateRequiredTemplateKey,
    trigger: ["blur", "input"]
  }
};

const sourceSceneOptions = computed(() => sourceScenes.value.map(scene => ({
  label: `${scene.sceneName || "未命名场景"}（${scene.id}）`,
  value: scene.id
})));

async function fetchTemplateList() {
  loading.value = true;
  const res = await fetchSceneExampleList({
    offset: (paginationReactive.page - 1) * paginationReactive.pageSize,
    limit: paginationReactive.pageSize,
    sortby: "updateTime",
    order: "desc"
  });

  if (res.data !== null) {
    templates.value = res.data.items || [];
    paginationReactive.pageCount = Math.max(res.data.pages || 1, 1);
    paginationReactive.total = res.data.total || 0;

    if (paginationReactive.page > paginationReactive.pageCount) {
      paginationReactive.page = paginationReactive.pageCount;
      loading.value = false;
      await fetchTemplateList();
      return;
    }
  }

  loading.value = false;
}

async function fetchSourceScenes() {
  sourceLoading.value = true;
  const res = await fetchGetAllScenes({
    offset: 0,
    limit: 1000,
    sortby: "updateTime",
    order: "desc"
  });

  if (res.data !== null) {
    sourceScenes.value = (res.data.items || []).filter(scene => Boolean(scene.zip && scene.coverPicture));
  }

  sourceLoading.value = false;
}

function openCreateModal() {
  showCreateModal.value = true;
  fetchSourceScenes();
}

function resetCreateForm() {
  createForm.sceneId = null;
  createForm.sceneName = "";
  createForm.sceneType = "";
  createForm.sceneIntroduction = "";
  createForm.templateKey = "";
}

function buildCreatePayload() {
  const payload: {sceneName?: string; sceneType?: string; sceneIntroduction?: string; templateKey?: string} = {};
  if (createForm.sceneName.trim()) payload.sceneName = createForm.sceneName.trim();
  if (createForm.sceneType.trim()) payload.sceneType = createForm.sceneType.trim();
  if (createForm.sceneIntroduction.trim()) payload.sceneIntroduction = createForm.sceneIntroduction.trim();
  if (createForm.templateKey.trim()) payload.templateKey = createForm.templateKey.trim();
  return payload;
}

async function handleCreateFromScene() {
  await createFormRef.value?.validate();
  if (!createForm.sceneId) return;

  creating.value = true;
  const res = await fetchCreateSceneExampleFromScene(createForm.sceneId, buildCreatePayload());
  creating.value = false;

  if (res.error !== null) {
    window.$message?.error(res.error.message || "生成模板失败");
    return;
  }

  window.$message?.success("模板生成成功");
  showCreateModal.value = false;
  resetCreateForm();
  paginationReactive.page = 1;
  fetchTemplateList();
}

function openEditKeyModal(template: ISceneFetchData) {
  editingTemplate.value = template;
  keyForm.templateKey = template.templateKey || "";
  showKeyModal.value = true;
}

function resetKeyForm() {
  editingTemplate.value = null;
  keyForm.templateKey = "";
}

async function handleUpdateTemplateKey() {
  await keyFormRef.value?.validate();
  if (!editingTemplate.value) return;

  updatingKey.value = true;
  const res = await fetchUpdateSceneExample(editingTemplate.value.id, {
    templateKey: keyForm.templateKey.trim()
  });
  updatingKey.value = false;

  if (res.error !== null) {
    window.$message?.error(res.error.message || "保存模板Key失败");
    return;
  }

  window.$message?.success("模板Key已保存");
  showKeyModal.value = false;
  fetchTemplateList();
}

function handleDelete(template: ISceneFetchData) {
  window.$dialog.warning({
    title: "删除模板",
    content: `确定删除模板「${template.sceneName}」吗？已创建项目不会被删除。`,
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: async () => {
      const res = await fetchDeleteSceneExample(template.id);
      if (res.error !== null) {
        window.$message?.error(res.error.message || "删除模板失败");
        return;
      }

      window.$message?.success("模板已删除");
      fetchTemplateList();
    }
  });
}

function handlePageChange(page: number) {
  if (paginationReactive.page === page) return;
  paginationReactive.page = page;
  fetchTemplateList();
}

function handlePageSizeChange(pageSize: number) {
  if (paginationReactive.pageSize === pageSize) return;
  paginationReactive.pageSize = pageSize;
  paginationReactive.page = 1;
  fetchTemplateList();
}

onMounted(() => {
  fetchTemplateList();
});
</script>

<template>
  <div class="template-management-page">
    <div class="template-management-toolbar">
      <n-space>
        <n-button type="primary" @click="openCreateModal">从场景生成模板</n-button>
        <n-button :loading="loading" @click="fetchTemplateList">刷新</n-button>
      </n-space>
      <!-- <n-text depth="3">管理员 Key 从 localStorage 的 H3D_ADMIN_KEY 读取</n-text> -->
    </div>

    <div class="template-cards-scroll">
      <n-spin class="template-list-spin" :show="loading">
        <div class="template-cards-list">
          <n-card hoverable v-for="template in templates" :key="template.id">
            <template #cover>
              <div class="absolute top-10px right-10px z-10">
                <n-tag type="success" :bordered="false">
                  {{ template.projectType === 0 ? "Web3D" : "WebGIS" }}
                </n-tag>
                <n-tag type="success" :bordered="false" class="ml-5px">
                  {{ template.sceneType }}
                </n-tag>
              </div>
              <n-image
                  preview-disabled
                  object-fit="cover"
                  :src="getServiceStaticFile(template.coverPicture) || '/static/images/carousel/H3DEditor.svg'"
                  class="w-full h-220px transition-all-200"
              />
            </template>

            <template #header>
              <n-ellipsis>{{ template.sceneName }}</n-ellipsis>
            </template>

            <div class="template-meta">
              <n-text depth="3">ID：{{ template.id }}</n-text>
              <n-text depth="3">Key：{{ template.templateKey || "未设置" }}</n-text>
              <n-text depth="3">大小：{{ template.zipSize || "0KB" }}</n-text>
              <n-text depth="3">更新：{{ template.updateTime || "-" }}</n-text>
            </div>

            <template #action>
              <n-space justify="space-between" align="center">
                <n-text depth="3" class="template-intro">
                  {{ template.sceneIntroduction || "暂无说明" }}
                </n-text>
                <n-space>
                  <n-button size="small" secondary @click="openEditKeyModal(template)">
                    设置Key
                  </n-button>
                  <n-button type="error" size="small" secondary @click="handleDelete(template)">
                    删除
                  </n-button>
                </n-space>
              </n-space>
            </template>
          </n-card>

          <div v-if="!loading && templates.length === 0" class="template-empty">
            <n-empty description="暂无模板" />
          </div>
        </div>
      </n-spin>
    </div>

    <div class="template-pagination">
      <n-pagination
          :page="paginationReactive.page"
          :page-size="paginationReactive.pageSize"
          :item-count="paginationReactive.total"
          :page-sizes="pageSizeOptions"
          :disabled="loading"
          show-size-picker
          show-quick-jumper
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
      />
    </div>
  </div>

  <n-modal v-model:show="showCreateModal" @after-leave="resetCreateForm">
    <n-card title="从场景生成模板" :bordered="false" size="small" class="template-create-card">
      <n-form ref="createFormRef" :model="createForm" :rules="createRules" label-placement="left" label-width="90">
        <n-form-item label="源场景" path="sceneId">
          <n-select
              v-model:value="createForm.sceneId"
              :options="sourceSceneOptions"
              :loading="sourceLoading"
              filterable
              clearable
              placeholder="选择已保存过的场景"
          />
        </n-form-item>
        <n-form-item label="模板名称">
          <n-input v-model:value="createForm.sceneName" placeholder="不填则使用源场景名称" />
        </n-form-item>
        <n-form-item label="场景类型">
          <n-input v-model:value="createForm.sceneType" placeholder="不填则使用源场景类型" />
        </n-form-item>
        <n-form-item label="模板Key" path="templateKey">
          <n-input v-model:value="createForm.templateKey" placeholder="例如：tower-crane，不填则不设置" />
        </n-form-item>
        <n-form-item label="模板说明">
          <n-input v-model:value="createForm.sceneIntroduction" type="textarea" placeholder="不填则使用源场景说明" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="handleCreateFromScene">生成模板</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>

  <n-modal v-model:show="showKeyModal" @after-leave="resetKeyForm">
    <n-card title="设置模板Key" :bordered="false" size="small" class="template-key-card">
      <n-form ref="keyFormRef" :model="keyForm" :rules="keyRules" label-placement="left" label-width="90">
        <n-form-item label="模板">
          <n-text>{{ editingTemplate?.sceneName || "-" }}</n-text>
        </n-form-item>
        <n-form-item label="模板Key" path="templateKey">
          <n-input v-model:value="keyForm.templateKey" placeholder="例如：tower-crane" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showKeyModal = false">取消</n-button>
          <n-button type="primary" :loading="updatingKey" @click="handleUpdateTemplateKey">保存</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped lang="less">
.template-management-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.template-management-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0 16px 12px 0;
}

.template-cards-scroll {
  flex: 1;
  min-height: 0;
}

.template-list-spin {
  height: 100%;
  display: block;

  :deep(.n-spin-content) {
    height: 100%;
  }
}

.template-cards-list {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 8px 16px 8px 0;
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  grid-auto-flow: row dense;
  align-content: start;

  :deep(.n-card-cover) {
    height: 220px;
  }
}

.template-meta {
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.template-intro {
  max-width: 210px;
}

.template-empty {
  grid-column: 1 / -1;
  padding: 48px 0;
}

.template-pagination {
  border-top: 1px solid var(--n-border-color);
  padding-top: 12px;
  display: flex;
  justify-content: center;
}

.template-create-card {
  width: 640px;
  max-width: calc(100vw - 32px);
}

.template-key-card {
  width: 520px;
  max-width: calc(100vw - 32px);
}
</style>
