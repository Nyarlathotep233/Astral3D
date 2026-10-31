<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import {useThemeVars} from 'naive-ui'
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {App} from "@astral3d/engine";
import Logo from "@/components/header/Logo.vue";
import EsPluginDialog from "@/components/es/plugin/EsPluginDialog.vue";

const globalConfigStore = useGlobalConfigStore();
const primaryColor = computed(() => (globalConfigStore.mainColor as IConfig.Color).hex);

const themeVars = useThemeVars();
const baseColor = computed(() => themeVars.value.baseColor);

const toolsDialogVisible = ref(false);
const x = ref(315);
const y = ref(document.body.clientHeight - 80);
const cursor = ref("pointer");

// 是否正在拖动的标志
const isDragging = ref(false);

function startDrag(downEvent: MouseEvent) {
  const clientHeight = (document.documentElement.clientHeight || document.body.clientHeight) - 25;
  const clientWidth = (document.documentElement.clientWidth || document.body.clientWidth) - 25;

  const lastClientX = downEvent.clientX;
  const lastClientY = downEvent.clientY;
  const dragging = (moveEvent: MouseEvent) => {
    if (Math.abs(lastClientX - moveEvent.clientX) > 1 || Math.abs(lastClientY - moveEvent.clientY) > 1) {
      isDragging.value = true;
      cursor.value = "grab";

      let boxLeft = moveEvent.clientX;
      let boxTop = moveEvent.clientY;

      if (boxLeft < 25) {
        boxLeft = 25;
      } else if (boxLeft > clientWidth) {
        boxLeft = clientWidth;
      }

      if (boxTop < 25) {
        boxTop = 25;
      } else if (boxTop > clientHeight) {
        boxTop = clientHeight;
      }

      x.value = boxLeft - 25;
      y.value = boxTop - 25;
    }
  }

  const stopDrag = () => {
    if (!isDragging.value) {
      handleClick()
    }

    App.storage.setOtherItem("es-plugins-position", {
      x: x.value,
      y: y.value
    })

    isDragging.value = false;
    cursor.value = "pointer";

    document.removeEventListener('pointermove', dragging);
    document.removeEventListener('pointerup', stopDrag);
  }

  // 添加鼠标移动和释放时的事件监听器
  document.addEventListener('pointermove', dragging);
  document.addEventListener('pointerup', stopDrag);
}

function handleClick() {
  toolsDialogVisible.value = !toolsDialogVisible.value;
}

onMounted(async () => {
  const xy = await App.storage.getOtherItem("es-plugins-position") as {x:number,y:number};
  if (xy) {
    x.value = xy.x > document.body.clientWidth ? 315 : xy.x;
    y.value = xy.y > document.body.clientHeight ? document.body.clientHeight - 120 : xy.y;
  }
})
</script>

<template>
  <div class="es-tools w-40px h-40px fixed z-9000 flex justify-center items-center"
       :style="{ left: `${x}px`, top: `${y}px`,cursor:`${cursor}` }"
       @pointerdown="startDrag">
    <Logo class="w-26px h-26px"/>
  </div>

  <EsPluginDialog v-model:visible="toolsDialogVisible"/>
</template>

<style scoped lang="less">
.es-tools {
  border: 4px solid transparent;
  border-radius: 50%;
  background-clip: padding-box, border-box;
  background-origin: padding-box, border-box;
  background-image: linear-gradient(to right, v-bind(baseColor), v-bind(baseColor)), linear-gradient(120deg, v-bind(primaryColor), #578AEF);
  transition: background-image .5s;

  & > svg {
    transition: transform .5s;
  }

  &:hover {
    transform: rotate(45deg);

    & > svg {
      transform: rotate(45deg) scale(1.1);
    }
  }
}
</style>