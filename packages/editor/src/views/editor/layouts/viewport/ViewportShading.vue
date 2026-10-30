<template>
  <n-popover :show-arrow="false" placement="bottom-start" trigger="click" :style="{ padding: 0 }">
    <template #trigger>
      <n-button round size="small" class="ml-10px">
        <template #icon>
          <n-icon>
            <component :is="current.icon"/>
          </n-icon>
        </template>
        {{ current.label }}
      </n-button>
    </template>
    <n-radio-group v-model:value="current.key" size="small">
      <template v-for="song in options" :key="song.key">
        <n-radio :value="song.key" @click="handlerChange(song)">
          <div class="flex items-center">
            <n-icon class="ml-10px mr-5px">
              <component :is="song.icon"/>
            </n-icon>
            <span>{{ song.label }}</span>
          </div>

          <span>{{ song.shortcuts }}</span>
        </n-radio>
      </template>
    </n-radio-group>
  </n-popover>
</template>

<script lang="ts" setup>
import type {ComputedRef} from "vue";
import {ref, markRaw, onMounted, onBeforeUnmount} from "vue";
import {
  UvIndexAlt, Wikis, Contrast
} from '@vicons/carbon';
import {App, Hooks} from '@astral3d/engine';
import {cpt} from "@/language";

interface IOption {
  label: ComputedRef<string> | string,
  key: string,
  icon?: any,
  shortcuts?: string
}

const options = ref<IOption[]>([
  {
    key: "solid",
    label: cpt("layout.scene.toolbar.Solid"),
    icon: markRaw(Contrast),
    shortcuts: "ALT+2"
  },
  {
    key: "normals",
    label: cpt("layout.scene.toolbar.Normals"),
    icon: markRaw(UvIndexAlt),
    shortcuts: "ALT+3"
  },
  {
    key: "wireframe",
    label: cpt("layout.scene.toolbar.Wireframe"),
    icon: markRaw(Wikis),
    shortcuts: "ALT+4"
  }
])

const current = ref<IOption>(options.value[0]);

function handlerChange(value: IOption) {
  // @ts-ignore
  current.value = value;
  App.setViewportShading(current.value.key);
}

function sceneCleared() {
  current.value = options.value[0];
  App.setViewportShading(current.value.key);
}

onMounted(() => {
  Hooks.useAddSignal("sceneCleared", sceneCleared);
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("sceneCleared", sceneCleared);
})
</script>

<style lang="less" scoped>
.n-radio-group {
  padding: 5px 0;

  .n-radio {
    display: flex;
    align-items: center;
    padding: 5px 10px;

    &:hover {
      background-color: var(--n-divider-color);
    }

    :deep(.n-radio__label) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 180px;

      & > span {
        font-size: 12px;
        color: var(--n-text-color-disabled);
      }
    }
  }
}
</style>