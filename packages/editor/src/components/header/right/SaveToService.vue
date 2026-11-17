<script lang="ts" setup>
import {h, ref} from "vue";
import {NSpin} from "naive-ui";
import {Save} from "@vicons/carbon";
import {t} from "@/language";
import {App} from "@astral3d/engine";
import {useGlobalConfigStore} from "@/store/modules/globalConfig";
import {saveSceneToService} from "@/utils/common/saveSceneToService";

const globalConfigStore = useGlobalConfigStore();
const dialogOpen = ref(false);
const saving = ref(false);

function save(){
  if (dialogOpen.value || globalConfigStore.loading) return;

  const sceneInfo = App.project.getKey("sceneInfo");

  // 检查对应sceneId的工程是否存在
  if (!sceneInfo.id) {
    window.$message?.error(window.$t("scene['The project does not exist!']"));
    return;
  }

  dialogOpen.value = true;
  const dialog = window.$dialog.warning({
    title: () => saving.value ? t("layout.header.Save") : window.$t('other.warning'),
    // 场景内的 loading 位于弹窗下方；保存进度必须显示在当前模态层内。
    content: () => saving.value
      ? h('div', {role: 'status', 'aria-live': 'polite', style: {padding: '16px 0', textAlign: 'center'}}, [
          h(NSpin, {size: 'large', description: globalConfigStore.loadingText})
        ])
      : window.$t("prompt['Are you sure to update the scene?']"),
    positiveText: window.$t('other.Ok'),
    negativeText: window.$t('other.Cancel'),
    onNegativeClick: () => !saving.value,
    onClose: () => !saving.value,
    onAfterLeave: () => { dialogOpen.value = false; },
    onPositiveClick: async () => {
      // 同步拦截 Vue 更新按钮状态前的重复确认。
      if (saving.value) return false;

      saving.value = true;
      dialog.loading = true;
      dialog.negativeButtonProps = {disabled: true};
      dialog.closable = false;
      dialog.closeOnEsc = false;
      dialog.maskClosable = false;
      try {
        await saveSceneToService();
      } catch (error) {
        window.$message?.error(error instanceof Error ? error.message : window.$t("scene['Failed to save project!']"));
        return false;
      } finally {
        saving.value = false;
        dialog.loading = false;
        dialog.negativeButtonProps = {disabled: false};
        dialog.closable = true;
        dialog.closeOnEsc = true;
        dialog.maskClosable = true;
      }
    }
  });
}
</script>

<template>
  <n-button type="primary" :disabled="dialogOpen || globalConfigStore.loading" @click="save">
    <template #icon>
      <n-icon>
        <Save />
      </n-icon>
    </template>
    {{ t("layout.header.Save") }}
  </n-button>
</template>
