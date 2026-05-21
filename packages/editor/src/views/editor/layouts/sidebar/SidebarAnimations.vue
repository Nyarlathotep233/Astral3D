<template>
  <div v-if="animationStore.list.length">
    <n-card title="动画列表" hoverable size="small">
      <div v-for="(animation, index) in animationStore.list" :key="index"
           class="flex items-center justify-between w-full py-6px">
        <n-tooltip placement="bottom" trigger="hover">
          <template #trigger>
            <div class="w-160px !overflow-hidden text-ellipsis whitespace-nowrap">{{ animation.name }}</div>
          </template>
          <span> {{ animation.name }} </span>
        </n-tooltip>

        <n-button size="tiny" type="primary" v-if="!animation.isRunning"
                  @click="play(animation)">{{ t("layout.sider.animation.Play") }}
        </n-button>
        <template v-else>
          <n-button size="tiny" type="info" @click="pause(animation)">
            {{ animation.isPaused ? t("layout.sider.animation.Continue") : t("layout.sider.animation.Pause") }}
          </n-button>
          <n-button size="tiny" type="info" class="ml-1" @click="stop(animation)">{{
              t("layout.sider.animation.Stop")
            }}
          </n-button>
        </template>

      </div>
    </n-card>

    <div class="flex items-center justify-start w-full py-6px">
      <span>{{ t("layout.sider.animation['Time scale']") }}</span>
      <EsInputNumber v-model:value="animationStore.mixerTimeScale" class="!w-80px ml-2" size="small" :min="-10"
                     :max="10" :decimal="2" :show-button="false" @change="handleTimeScaleChange()"/>
    </div>
  </div>
  <n-result v-else class="mt-6" status="418" title="Empty" :description="t('prompt[\'No animation data for the time being\']')"/>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted} from "vue";
import {AnimationMixer} from 'three';
import {App, Hooks} from "@astral3d/engine";
import {t} from "@/language";
import {useAnimationStore, IAnimationItem} from "@/store/modules/animation";
import EsInputNumber from "@/components/es/EsInputNumber.vue";

const animationStore = useAnimationStore();

onMounted(() => {
  Hooks.useAddSignal("objectSelected", objectSelected);
  Hooks.useAddSignal("objectRemoved", objectRemoved);
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("objectSelected", objectSelected);
  Hooks.useRemoveSignal("objectRemoved", objectRemoved);
})

let lastObjectUuid: string | null = null;

function objectSelected(object, lockedObject) {
  if (lockedObject) {
    object = lockedObject;
  }

  if (!object) return;

  if (lastObjectUuid === object.uuid) return;
  lastObjectUuid = object.uuid;

  if (object && object.animations.length > 0) {
    const animationsList: Array<IAnimationItem> = [];

    for (let i = object.animations.length; i > 0; i--) {
      const animation = object.animations[i - 1];
      if (!animation) {
        object.animations.splice(i - 1, 1);
        continue;
      }

      const clip = animation.getClip();
      animationsList.unshift({
        name: clip.name,
        uuid: clip.uuid,
        isRunning: animation.isRunning(),
        isPaused: animation.paused
      });
    }

    animationStore.setList(animationsList);
  } else {
    animationStore.setList([]);
  }
}

function objectRemoved(object) {
  if (object !== null && object.animations.length > 0) {
    const mixer = App.animationManager.mixerMap.get(object.uuid) as AnimationMixer;
    if (!mixer) return;

    mixer.uncacheRoot(object);
    App.animationManager.mixerMap.delete(object.uuid);
  }

  // TODO：是否需要判断场景锁定模型下是否有此模型的动画轨道？然后移除
}

function play(animation: IAnimationItem) {
  // 如果属于是动画编辑器正在编辑的动画，都必须从animationStore调用对应方法
  if (animation.uuid === animationStore.current?.uuid) {
    animationStore.play();
    return;
  }

  const action = App.animationManager.actionMap.get(animation.uuid);
  if (!action) return;

  action.play();
  action.paused = false;
  animation.isPaused = false;
  animation.isRunning = true;
}

function pause(animation: IAnimationItem) {
  if (animation.uuid === animationStore.current?.uuid) {
    animationStore.pause();
    return;
  }

  const action = App.animationManager.actionMap.get(animation.uuid);
  if (!action) return;

  if (animation.isPaused) {
    action.paused = false;
    animation.isPaused = false;
  } else {
    action.paused = true;
    animation.isPaused = true;
  }
}

function stop(animation: IAnimationItem) {
  if (animation.uuid === animationStore.current?.uuid) {
    animationStore.stop();
    return;
  }

  const action = App.animationManager.actionMap.get(animation.uuid);
  if (!action) return;

  action.stop();
  action.paused = false;
  animation.isPaused = false;
  animation.isRunning = false;
}

function handleTimeScaleChange() {
  if (!App.selected) return;

  const mixer = App.animationManager.mixerMap.get(App.selected.uuid) as AnimationMixer;
  if (!mixer) return;
  mixer.timeScale = animationStore.mixerTimeScale;
}
</script>

<style scoped lang="less">
.n-card {
  max-height: 80vh;
  overflow-y: auto;

  :deep(&__content) {
    padding: 10px !important;
  }

  :deep(&-header) {
    padding-bottom: 0 !important;
  }
}
</style>