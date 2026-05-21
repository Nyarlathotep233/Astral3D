<template>
    <div class="w-full h-full relative">
        <div class="extra-pane-header w-full px-2 flex items-center justify-between">
            <n-popselect v-model:value="selected" :options="options" :render-label="renderLabel" trigger="click"
                scrollable>
                <n-button strong secondary size="small" icon-placement="right" class="w-130px z-1000">
                    <n-icon :size="14" class="mr-0.1rem">
                        <component :is="options[selectedIndex].icon" />
                    </n-icon>
                    {{ options[selectedIndex].label }}

                    <template #icon>
                        <n-icon :size="16">
                            <CaretDown />
                        </n-icon>
                    </template>
                </n-button>
            </n-popselect>
        </div>

        <div class="extra-pane-content">
            <component :is="options[selectedIndex].component" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, h, inject } from 'vue';
import { NIcon, useThemeVars } from 'naive-ui';
import { CaretDown, VolumeFileStorage, AlignBoxTopLeft, SankeyDiagram } from '@vicons/carbon';
import Resource from './resource/index.vue';
import Log from './log/index.vue';
import Animation from './animation/index.vue';
import {
  editorLayoutPresetKey,
  filterByIncludeList,
  type BottomPaneKey,
} from '@/views/editor/layoutPresets';

const layoutPreset = inject(editorLayoutPresetKey)!;

const themeVars = useThemeVars();
const cardColor = computed(() => themeVars.value.cardColor);
const dividerColor = computed(() => themeVars.value.dividerColor);

const allPaneOptions = [
    {
        label: '资源中心',
        value: 'resource' as BottomPaneKey,
        icon: VolumeFileStorage,
        component: Resource
    },
    {
        label: '动画编辑器',
        value: 'animation' as BottomPaneKey,
        icon: SankeyDiagram,
        component: Animation
    },
    {
        label: '日志',
        value: 'logs' as BottomPaneKey,
        icon: AlignBoxTopLeft,
        component: Log
    }
];

const options = computed(() => {
  const allowed = filterByIncludeList(
    allPaneOptions.map((o) => o.value),
    layoutPreset.bottom?.panes
  );
  return allPaneOptions.filter((o) => allowed.includes(o.value));
});

const defaultPane = layoutPreset.bottom?.defaultPane ?? 'resource';
const initialPane = computed(() => {
  const allowed = options.value.map((o) => o.value);
  if (allowed.includes(defaultPane)) return defaultPane;
  return allowed[0] ?? 'resource';
});

const selected = ref(initialPane.value);
const selectedIndex = computed(() => {
  const index = options.value.findIndex((item) => item.value === selected.value);
  return index >= 0 ? index : 0;
});

function renderLabel(option: any) {
    return [
        h(
            NIcon,
            {
                style: {
                    verticalAlign: '-0.15em',
                    marginRight: '4px'
                }
            },
            {
                default: () => h(option.icon)
            }
        ),
        option.label as string
    ]
}
</script>

<style scoped lang="less">
.extra-pane-header {
    height: var(--scene-extend-header-height);
    background-color: v-bind(cardColor);
    border-bottom: 1px solid v-bind(dividerColor);
}

.extra-pane-content {
    height: calc(100% - var(--scene-extend-header-height));

    :deep(.extra-pane-item) {
        height: 100%;
        width: 100%;
        position: absolute;
        left: 0;
        top: 0;

        &-header {
            height: var(--scene-extend-header-height);
            width: calc(100% - 1rem - 130px);
            padding-left: calc(0.5rem + 135px);
            display: flex;
            align-items: center;
            justify-content: start;
        }

        &-content {
            height: calc(100% - var(--scene-extend-header-height) - 1px);
            margin-top: 1px;
            width: 100%;
            overflow-y: auto;
        }
    }
}
</style>
