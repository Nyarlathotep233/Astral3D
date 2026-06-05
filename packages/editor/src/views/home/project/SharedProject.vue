<script setup lang="ts">
import {onMounted, reactive, ref} from "vue";
import {t} from "@/language";
import {fetchGetAllScenes} from "@/http/api/scenes";
import CardAction from "@/views/home/project/components/CardAction.vue";
import CreateProject from "@/views/home/project/components/CreateProject.vue";
import {getServiceStaticFile} from "@/utils/common/file";

const props = withDefaults(defineProps<{
  sceneSource?: "INTERNAL" | "EXTERNAL";
  showCreate?: boolean;
}>(), {
  sceneSource: "INTERNAL",
  showCreate: true
});
const emits = defineEmits(["totalChange"]);

const data = ref<ISceneFetchData[]>([]);
const paginationReactive = reactive({
  page: 1,
  pageSize: 20,
  pageCount: 1,
  total: 0
});
const pageSizeOptions = [8, 10, 20, 40];
const loading = ref(false);
const showCreateModal =  ref(false);
const loadingProjectId = ref(-1);

async function fetchProjectList() {
  loading.value = true;
  const res = await fetchGetAllScenes({
    offset: (paginationReactive.page - 1) * paginationReactive.pageSize,
    limit: paginationReactive.pageSize,
    sortby:"updateTime",
    order:"desc",
    query:`sceneSource:${props.sceneSource}`
  });
  if(res.data !== null){
    data.value = res.data.items || [];
    paginationReactive.pageCount = Math.max(res.data.pages || 1, 1);
    paginationReactive.total = res.data.total || 0;
    emits("totalChange", {
      sceneSource: props.sceneSource,
      total: paginationReactive.total
    });

    if (paginationReactive.page > paginationReactive.pageCount) {
      paginationReactive.page = paginationReactive.pageCount;
      loading.value = false;
      await fetchProjectList();
      return;
    }
  }

  loading.value = false;
}

function refresh(options: { resetPage?: boolean } = {}) {
  if (options.resetPage) {
    paginationReactive.page = 1;
  }

  fetchProjectList();
}

function handlePageChange(page: number){
  if (paginationReactive.page === page) return;

  paginationReactive.page = page;
  fetchProjectList();
}

function handlePageSizeChange(pageSize: number){
  if (paginationReactive.pageSize === pageSize) return;

  paginationReactive.pageSize = pageSize;
  paginationReactive.page = 1;
  fetchProjectList();
}

function setLoadingProjectId(id:number){
  loadingProjectId.value = id;
}

function openCreateModal() {
  if (!props.showCreate) return;

  showCreateModal.value = true;
}

// 编辑场景
function editScene(id:string){
  window.open(window.location.origin + "/#/editor/" + id, "_blank");
}

defineExpose({
  openCreateModal,
  refresh
});

onMounted(() => {
  fetchProjectList();
});
</script>

<template>
  <div class="project-page">
    <div class="project-cards-scroll">
      <n-spin class="project-list-spin" :show="loading">
        <div class="project-cards-list">
          <button v-if="props.showCreate" type="button" class="project-create-card" @click="openCreateModal">
            <span class="create-card-glow"></span>
            <div class="create-card-plus">+</div>
            <div>
              <h3>{{ t('home.New project') }}</h3>
              <p>{{ t("home.Create from template") }}</p>
            </div>
          </button>

          <n-card hoverable v-for="project in data" :key="project.id" :bordered="false" content-class="!p-0" class="project-card">
            <template #cover>
              <n-skeleton v-if="loadingProjectId === Number(project.id)" height="220px" width="100%" />
              <template v-else>
                <div class="project-cover">
                  <div class="project-tags">
                    <n-tag v-if="project.sceneSource === 'EXTERNAL'" type="warning" :bordered="false" size="small">
                      EXTERNAL
                    </n-tag>
                    <n-tag type="success" :bordered="false" size="small">
                      {{ project.projectType === 0 ? "Web3D" : "WebGIS" }}
                    </n-tag>
                    <n-tag type="success" :bordered="false" size="small">
                      {{ project.sceneType }}
                    </n-tag>
                  </div>

                  <n-image preview-disabled object-fit="cover"
                      :src="getServiceStaticFile(project.coverPicture) || '/static/images/carousel/H3DEditor.svg'"
                      class="project-cover-image" @click="editScene(project.id)"
                  />
                </div>
              </template>
            </template>

            <template #action>
              <n-skeleton v-if="loadingProjectId === Number(project.id)" text :repeat="1" />
              <CardAction v-show="loadingProjectId !== Number(project.id)" :data="project" @refresh="refresh" @setLoadingProjectId="setLoadingProjectId" />
            </template>
          </n-card>

          <div v-if="!loading && data.length === 0" class="project-empty">
            <n-empty />
          </div>
        </div>
      </n-spin>
    </div>

    <div class="project-pagination">
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

  <CreateProject v-model:visible="showCreateModal" @refresh="refresh({ resetPage: true })" />
</template>

<style scoped lang="less">
.project-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.project-cards-scroll {
  flex: 1;
  min-height: 0;
}

.project-list-spin {
  height: 100%;
  display: block;

  :deep(.n-spin-content) {
    height: 100%;
  }
}

.project-cards-list {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px 8px 10px 2px;
  display: grid;
  grid-gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  grid-auto-flow: row;
  align-content: start;

  .project-empty {
    grid-column: 1 / -1;
    padding: 48px 0;
  }

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(var(--home-primary-rgb), 0.24);
  }
}

.project-create-card {
  position: relative;
  min-height: 260px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px dashed rgba(var(--home-primary-rgb), 0.36);
  border-radius: 24px;
  overflow: hidden;
  color: #ffffff;
  text-align: left;
  background:
    linear-gradient(145deg, rgba(var(--home-primary-rgb), 0.18), rgba(55, 93, 255, 0.10)),
    rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(var(--home-primary-rgb), 0.72);
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.28), 0 0 38px rgba(var(--home-primary-rgb), 0.20);
  }

  h3 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.58);
  }
}

.create-card-glow {
  position: absolute;
  width: 160px;
  height: 160px;
  top: -70px;
  right: -50px;
  border-radius: 999px;
  background: rgba(var(--home-primary-rgb), 0.24);
  filter: blur(4px);
}

.create-card-plus {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 22px;
  color: var(--home-on-primary);
  background: linear-gradient(135deg, var(--home-primary), var(--home-primary-hover));
  font-size: 36px;
  font-weight: 300;
  box-shadow: 0 16px 32px rgba(var(--home-primary-rgb), 0.24);
}

.project-card {
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

  :deep(.n-card-cover) {
    height: auto !important;
    flex: none;
    overflow: hidden;
  }

  :deep(.n-card__action) {
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
  }

  :deep(h4) {
    color: #ffffff;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
  }

  :deep(.n-button) {
    color: rgba(255, 255, 255, 0.76);

    &:hover {
      color: var(--home-primary-hover);
    }
  }
}

.project-cover {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}

.project-tags {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  :deep(.n-tag--success-type) {
    color: var(--home-on-primary);
    background-color: var(--home-primary);
  }
}

.project-cover-image {
  width: 100%;
  height: 100%;
  display: block;
  cursor: pointer;
  transition: transform 0.35s ease, filter 0.35s ease;

  :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover {
    transform: scale(1.06);
    filter: saturate(1.12) contrast(1.04);
  }
}

.project-pagination {
  margin-top: 12px;
  padding: 12px 0 0;
  display: flex;
  justify-content: center;

  :deep(.n-pagination-item),
  :deep(.n-pagination-quick-jumper input) {
    color: rgba(255, 255, 255, 0.76);
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }

  :deep(.n-pagination-item--active) {
    color: var(--home-on-primary);
    background: var(--home-primary);
  }
}

:deep(.project-empty .n-empty__description) {
  color: rgba(255, 255, 255, 0.56);
}
</style>
