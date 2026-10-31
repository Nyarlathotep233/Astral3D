<template>
  <div class="w-full h-full flex">
    <div class="h-full w-20%">
      <div class="w-calc-1rem h-2rem px-2 flex items-center">
        <AnimationList/>

        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button text class="ml-1" @click="handleAddAnimation">
              <template #icon>
                <n-icon size="1.5rem">
                  <Add />
                </n-icon>
              </template>
            </n-button>
          </template>
          {{ t("extra.New animation") }}
        </n-tooltip>

        <!-- 锁定/取消锁定父模型  -->
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button text class="ml-1" @click="handleLock">
              <template #icon>
                <n-icon size="1rem">
                  <Locked v-if="isLock" />
                  <Unlocked v-else />
                </n-icon>
              </template>
            </n-button>
          </template>
          {{ isLock ? t("extra.Locked") : t("extra.Unlocked") }}
        </n-tooltip>
      </div>
      <div class="h-calc-2rem overflow-y-auto" id="outline-scroll-container" @wheel="outlineMouseWheel">
        <div ref="outlineRef">
          <n-tree block-line :data="animationStore.trackTree" default-expand-all expand-on-click show-lin
                  @update:expanded-keys="handleChangeExpanded"/>
        </div>
      </div>
    </div>

    <div ref="trackRef" class="animation-track h-full w-80%"></div>

<!--    <EsContextmenu ref="treeContextMenuRef" :options="options" @select="handleTreeContextMenuSelect" placement="right-end" />-->

    <EsContextmenu ref="contextMenuRef" :options="options" @select="handleTrackSelect" placement="right-end" />
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount, watch, nextTick,h} from 'vue';
import {useThemeVars,NInput} from 'naive-ui';
import {Add,Locked,Unlocked} from '@vicons/carbon';
import {t} from "@/language";
import {App,TimelineTrack} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {useAnimationStore} from "@/store/modules/animation";
import {remToPxNumber} from "@/utils/common/utils";
import AnimationList from './AnimationList.vue';
import EsContextmenu from "@/components/es/EsContextmenu.vue";

const themeVars = useThemeVars();
const globalStore = useGlobalConfigStore();
const animationStore = useAnimationStore();

const props = withDefaults(defineProps<{
  isSelectObject3D: boolean
}>(), {
  isSelectObject3D: false
})

// 是否锁定了父模型
const isLock = ref(false);
/* 主体 */
let timeline:TimelineTrack;
const trackRef = ref();
const outlineRef = ref();

/* 右键菜单 */

const contextMenuRef = ref();
const options = [
  {
    label: t("extra.Delete selected keyframes"),
    key: 'del'
  }
];

// 实例化动画轨道
function initTimeline() {
  nextTick(() => {
    timeline = new TimelineTrack(trackRef.value, outlineRef.value, getTimelineTrackOption());

    animationStore.setTimelineInstance(timeline);

    timeline.addEventListener("contextmenu", (event) => {
      const e = event.args.args as MouseEvent;
      if(!e) return;
      contextMenuRef.value.show(e.clientX, e.clientY);
    })
  })
}

// 动画轨道配置
function getTimelineTrackOption() {
  return {
    headerHeight: remToPxNumber(2),
    headerFillColor: themeVars.value.baseColor,
    fillColor: themeVars.value.tagColor,
    labelsColor: themeVars.value.textColor2,
    tickColor: themeVars.value.textColor3,
    selectionColor: themeVars.value.primaryColor,
    rowsStyle: {
      height: remToPxNumber(1.5),
      fillColor: themeVars.value.cardColor,
      marginBottom: 2,
      keyframesStyle: {
        fillColor: themeVars.value.primaryColorHover,
      },
      groupsStyle: {
        text: {
          fillColor: themeVars.value.textColorDisabled,
        }
      }
    },
    timelineStyle: {
      fillColor: themeVars.value.primaryColor,
      strokeColor: themeVars.value.primaryColor,
      capStyle: {
        fillColor: themeVars.value.primaryColorPressed,
        width: remToPxNumber(0.4),
        height: remToPxNumber(0.6),
      }
    }
  }
}

// 当鼠标在轮廓上滚动时，设置滚动回时间轴
function outlineMouseWheel(event) {
  if (timeline) {
    timeline.timeline._handleWheelEvent(event);
  }
}

// @ts-ignore 树节点展开/收缩项变化
function handleChangeExpanded(keys, meta, action) {
  const ids: string[] = [];
  const recursion = (node) => {
    node.children.forEach(c => {
      if (c.isLeaf) {
        ids.push(c.key);
      } else {
        recursion(c);
      }
    })
  }
  recursion(action.node);
  timeline.setRowIsVisible(ids, action.action === "expand");
}

// 新增动画
function handleAddAnimation() {
  const v = ref("");
  const status = ref<"error" | undefined>();

  window.$dialog.info({
    title: t("extra.New animation"),
    content: () => h(
        NInput,
        {
          placeholder: t("prompt.Please enter the animation name"),
          modelValue: v.value,
          clearable: true,
          // size: "small",
          status: status.value,
          onUpdateValue: (n: string) => {
            v.value = n;
            status.value = !v.value ? "error" : undefined;
          },
          onBlur: () => {
            status.value = !v.value ? "error" : undefined;
          }
        }
    ),
    positiveText: t("other.Ok"),
    negativeText: t("other.Cancel"),
    onPositiveClick: () => {
      if (!v.value) return false;

      // 检查名称是否重复
      if (animationStore.list.find((s) => s.name === v.value)) {
        window.$message?.error(t("prompt.The name already exists"));

        return false;
      }

      // 创建临时空动画
      const clipAction = App.animationManager.createEmptyAnimation(v.value);
      if(!clipAction){
        window.$message?.error(t("prompt.Failed to create animation"));
        return false;
      }

      const newAnimation = {
        name: v.value,
        uuid: clipAction.getClip().uuid,
        isRunning: clipAction.isRunning(),
        isPaused: clipAction.paused,
      }

      animationStore.setList([...animationStore.list, newAnimation],newAnimation);
    },
  })
}

// 锁定模型
function handleLock() {
  isLock.value = !isLock.value;
  isLock.value ? App.lock() : App.unlock();
}

// 节点点击
// function handleNodeProps({ option }: { option: TreeOption }) {
//   return {
//     onContextmenu(e: MouseEvent): void {
//       treeContextMenuRef.value.show(e.clientX, e.clientY)
//       console.log(option)
//
//       e.preventDefault()
//     }
//   }
// }

// 树右键菜单触发
// function handleTreeContextMenuSelect(key: string | number) {
//   switch (key) {
//     case 'del':
//       timeline && timeline.deleteRow();
//       break;
//   }
// }

// 轨道右键菜单触发
function handleTrackSelect(key: string | number){
  switch(key){
    case 'del':
      timeline && timeline.deleteSelectedKeyframes();
      break;
  }
}

onMounted(() => {
  // Timeline的实例化必须在对应dom元素第一次显示后，否则会由于dom宽高为0而缺失刻度
  props.isSelectObject3D && initTimeline();
})
onBeforeUnmount(() => {
  timeline && timeline.dispose();
});

watch(() => props.isSelectObject3D, () => {
  timeline || initTimeline();
})

// 主题跟随改变
watch(() => globalStore.theme, () => {
  timeline && timeline.setOptions(getTimelineTrackOption());
})
watch(() => globalStore.mainColor, () => {
  timeline && timeline.setOptions(getTimelineTrackOption());
})
</script>

<style lang="less" scoped>
:deep(.n-tree-node-wrapper) {
  height: 1.5rem;
  margin-bottom: 2px;

  .n-tree-node {
    height: 100%;

    .n-tree-node-switcher {
      height: 100%;
    }
  }
}

.animation-track {
  .scroll-container {
    background: transparent !important;

    &::-webkit-scrollbar-track {
      background-color: rgba(16, 16, 17, 0.6);
    }
  }
}
</style>