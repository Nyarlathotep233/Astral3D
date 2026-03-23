<script lang="ts" setup>
import {nextTick} from "vue";
import {Save} from "@vicons/carbon";
import {t} from "@/language";
import {App,Package} from "@astral3d/engine";
import { useGlobalConfigStore } from '@/store/modules/globalConfig';
import {fetchUpload} from "@/http/api/sys";
import {filterSize} from "@/utils/common/file";
import {fetchUpdateScene} from "@/http/api/scenes";
import {DefaultScreenshot} from "@/utils/common/constant";

const globalConfigStore = useGlobalConfigStore();

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
      const p = new Package(window.viewer);
      const oldVersion = sceneInfo.sceneVersion;

      try {
        globalConfigStore.loadingText = window.$t("scene['Generate scene data, please wait']");
        globalConfigStore.loading = true;

        // 版本自动 +1
        App.project.setKey("sceneInfo.sceneVersion", sceneInfo.sceneVersion + 1);

        const biz = `${sceneInfo.id}-V${sceneInfo.sceneVersion}`;

        // 如果没有封面，则先自动生成封面
        if(!sceneInfo.coverPicture || sceneInfo.coverPicture === DefaultScreenshot){
          const image = await window.viewer.getViewportImage() as HTMLImageElement;
          sceneInfo.coverPicture = image.src;
          App.project.setKey(`sceneInfo.coverPicture`,image.src);
        }

        // 上传封面
        const f = await fetch(sceneInfo.coverPicture.startsWith("blob") ? sceneInfo.coverPicture : `file/static/${sceneInfo.coverPicture}`);
        const blob = await f.blob();
        const coverUploadRes = await fetchUpload({
          file: new File([blob],`${sceneInfo.sceneName}-${Date.now()}.png`, { type: blob.type }),
          biz: `upload/3DEditor/screenshot/${biz}`,
        });
        if (coverUploadRes.error !== null || !coverUploadRes.data) {
          throw new Error(window.$t("prompt['Failed to save the cover image']"));
        }
        App.project.setKey("sceneInfo.coverPicture", coverUploadRes.data);

        await nextTick();

        globalConfigStore.loadingText = window.$t("scene['Scene is being compressed...']");

        const packResult = await p.pack({
          // 首包名称
          name:`${sceneInfo.sceneName}`,
          // 拆分的最深层级 0:拆分至最深层
          layer: 2,
          // 压缩包上传接口函数，多压缩包
          zipUploadFun:async (zipFile: File) => {
            const uploadRes = await fetchUpload({
              file: zipFile,
              biz: `upload/3DEditor/scene/${biz}`,
            });
            if (uploadRes.error !== null || !uploadRes.data) {
              throw new Error(window.$t("scene['Failed to save project!']"));
            }
            return uploadRes.data;
          },
          // 打包进度回调
          onProgress: (progress: number) => {
            globalConfigStore.loadingText = progress + '%';
          },
        });

        if (!packResult?.firstUploadResult) {
          throw new Error(window.$t("scene['Failed to save project!']"));
        }

        const params = Object.assign(sceneInfo, {
          zip: packResult.firstUploadResult,
          zipSize: filterSize(packResult.totalSize)
        });

        const updateRes = await fetchUpdateScene(sceneInfo.id, params);
        if (updateRes.error !== null) {
          throw new Error(updateRes.error.message || window.$t("scene['Failed to save project!']"));
        }

        globalConfigStore.loadingText = window.$t("prompt.Saved successfully!");

        if (updateRes.data) {
          App.project.setKey("sceneInfo", updateRes.data);
        }
      } catch (error) {
        App.project.setKey("sceneInfo.sceneVersion", oldVersion);
        window.$message?.error(error instanceof Error ? error.message : window.$t("scene['Failed to save project!']"));
      } finally {
        setTimeout(() => {
          globalConfigStore.loading = false;
          p.dispose();
        }, 300);
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

<style lang="less" scoped>
</style>
