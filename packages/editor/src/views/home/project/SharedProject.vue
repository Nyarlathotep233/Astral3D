<script setup lang="ts">
import {onMounted, reactive, ref} from "vue";
import {t} from "@/language";
import {fetchGetAllScenes} from "@/http/api/scenes";
import CardAction from "@/views/home/project/components/CardAction.vue";
import CreateProject from "@/views/home/project/components/CreateProject.vue";
import {getServiceStaticFile} from "@/utils/common/file";

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
    query:``
  });
  if(res.data !== null){
    data.value = res.data.items || [];
    paginationReactive.pageCount = Math.max(res.data.pages || 1, 1);
    paginationReactive.total = res.data.total || 0;

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

// 编辑场景
function editScene(id:string){
  window.open(window.location.origin + "/#/editor/" + id, "_blank");
}

onMounted(() => {
  fetchProjectList();
});
</script>

<template>
  <div class="project-page">
    <div class="project-cards-scroll">
      <n-spin class="project-list-spin" :show="loading">
        <div class="project-cards-list">
          <n-card embedded hoverable :bordered="false" content-class="!p-2" class="cursor-pointer" @click="showCreateModal = true">
            <div class="new-container h-full min-h-200px flex flex-col justify-center items-center b-1 b-dashed b-rd-1">
              <span class="text-16 color-#fff">🫵</span>
              <p>{{ t('home.New project') }}</p>
            </div>
          </n-card>

          <n-card hoverable v-for="project in data" :key="project.id" >
            <template #cover>
              <n-skeleton v-if="loadingProjectId === Number(project.id)" height="100%" width="100%" />
              <template v-else>
                <div class="absolute top-10px right-10px z-10">
                  <n-tag type="success" :bordered="false" >
                    {{ project.projectType === 0 ? "Web3D" : "WebGIS" }}
                  </n-tag>
                  <n-tag type="success" :bordered="false" class="ml-5px">
                    {{ project.sceneType }}
                  </n-tag>
                </div>

                <n-image preview-disabled object-fit="cover"
                    :src="getServiceStaticFile(project.coverPicture) || '/static/images/carousel/Astral3DEditor.jpg'"
                    class="w-full h-220px cursor-pointer hover:transform-scale-140 transition-all-200" @click="editScene(project.id)"
                />
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

<style lang="less">
.project-page {
  height: calc(100% - var(--n-pane-padding-top));
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

  .n-spin-content {
    height: 100%;
  }
}

.project-cards-list {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 8px 16px 8px 0;
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  grid-auto-flow: row dense;
  align-content: start;

  .project-empty {
    grid-column: 1 / -1;
    padding: 48px 0;
  }

  .new-container {
    border-color: var(--n-border-color);
    color:var(--n-close-icon-color)
  }

  .n-card-cover{
    height: 220px;
  }
}

.project-pagination {
  border-top: 1px solid var(--n-border-color);
  padding-top: 12px;
  display: flex;
  justify-content: center;
}
</style>
