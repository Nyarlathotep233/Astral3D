<script lang="ts" setup>
import {Save} from "@vicons/carbon";
import {t} from "@/language";
import {App} from "@astral3d/engine";
import {saveSceneToService} from "@/utils/common/saveSceneToService";

function save(){
  const sceneInfo = App.project.getKey("sceneInfo");

  // 检查对应sceneId的工程是否存在
  if (!sceneInfo.id) {
    window.$message?.error(window.$t("scene['The project does not exist!']"));
    return;
  }

  window.$dialog.warning({
    title: window.$t('other.warning'),
    content: window.$t("prompt['Are you sure to update the scene?']"),
    positiveText: window.$t('other.Ok'),
    negativeText: window.$t('other.Cancel'),
    onPositiveClick: async () => {
      try {
        await saveSceneToService();
      } catch (error) {
        window.$message?.error(error instanceof Error ? error.message : window.$t("scene['Failed to save project!']"));
      }
    }
  });
}
</script>

<template>
  <n-button type="primary" @click="save">
    <template #icon>
      <n-icon>
        <Save />
      </n-icon>
    </template>
    {{ t("layout.header.Save") }}
  </n-button>
</template>
