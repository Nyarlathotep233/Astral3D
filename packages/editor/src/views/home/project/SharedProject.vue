<script setup lang="ts">
import {onMounted, onUnmounted, ref} from "vue";
import {useIntersectionObserver} from "@vueuse/core";
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
const batchSize = 20;
const hasMore = ref(false);
const loadMoreTrigger = ref<HTMLElement | null>(null);
const failedRequest = ref<{ offset: number; limit: number } | null>(null);
let nextOffset = 0;
let requestId = 0;
const loading = ref(false);
const showCreateModal =  ref(false);
const loadingProjectId = ref(-1);

async function fetchProjectList(offset: number, limit = batchSize) {
  const id = ++requestId;
  loading.value = true;
  failedRequest.value = null;
  const res = await fetchGetAllScenes({
    offset,
    limit,
    sortby: "updateTime,id",
    order: "desc",
    query: `sceneSource:${props.sceneSource}`
  });
  if (id !== requestId) return;
  loading.value = false;
  if (!res.data) {
    failedRequest.value = {offset, limit};
    return;
  }

  const items = res.data.items ?? [];
  const total = res.data.total ?? 0;
  if (offset === 0) {
    data.value = items;
  } else {
    const knownIds = new Set(data.value.map(project => project.id));
    data.value.push(...items.filter(project => !knownIds.has(project.id)));
  }
  nextOffset = offset + limit;
  hasMore.value = items.length > 0 && nextOffset < total;
  emits("totalChange", {sceneSource: props.sceneSource, total});
}

function refresh() {
  return fetchProjectList(0, Math.max(nextOffset, batchSize));
}

function loadMore() {
  if (hasMore.value && !loading.value && !failedRequest.value) {
    return fetchProjectList(nextOffset);
  }
}

useIntersectionObserver(loadMoreTrigger, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});

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

onMounted(refresh);
onUnmounted(() => { requestId++; });
</script>

<template>
  <div class="project-page">
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

              <n-image lazy preview-disabled object-fit="cover"
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

      <div v-if="!loading && !failedRequest && data.length === 0" class="project-empty">
        <n-empty />
      </div>
    </div>
    <div v-if="loading || failedRequest || hasMore" class="project-list-footer">
      <span v-if="loading" role="status"><n-spin :size="16" /> {{ t('home.Loading') }}</span>
      <n-button v-else-if="failedRequest" @click="fetchProjectList(failedRequest.offset, failedRequest.limit)">
        {{ t('home.Retry loading projects') }}
      </n-button>
      <div v-else ref="loadMoreTrigger">
        <n-button @click="loadMore">{{ t('home.Load more projects') }}</n-button>
      </div>
    </div>
  </div>

  <CreateProject v-model:visible="showCreateModal" @refresh="fetchProjectList(0)" />
</template>

<style scoped lang="less">
.project-cards-list {
  box-sizing: border-box;
  padding: 6px 2px 10px;
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));

  .project-empty {
    grid-column: 1 / -1;
    padding: 48px 0;
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

.project-list-footer {
  padding: 10px;
  display: flex;
  justify-content: center;
  color: rgba(255, 255, 255, 0.76);

  [role="status"] {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
}

:deep(.project-empty .n-empty__description) {
  color: rgba(255, 255, 255, 0.56);
}
</style>
