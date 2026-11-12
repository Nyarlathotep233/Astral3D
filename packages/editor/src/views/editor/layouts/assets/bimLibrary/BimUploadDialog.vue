<template>
  <n-modal :show="show" @update:show="(b) => emits('update:show',b)" display-directive="show" class="!w-500px" preset="card" :title="t('bim.BIM lightweight')">
    <n-form label-placement="left" :model="BIMModel" :rules="BIMRules"
            label-width="100px" label-align="right" ref="formRef"
            require-mark-placement="right-hanging">
<!--      <n-form-item :label="t('bim[\'File name\']')" path="fileName">-->
<!--        <n-input v-model:value="BIMModel.fileName"-->
<!--                 :placeholder="t('bim[\'Please enter the BIM file name\']')"/>-->
<!--      </n-form-item>-->
      <n-form-item :label="t('bim.Thumbnail')">
        <n-upload ref="uploadThumbnailRef" :default-upload="false" list-type="image-card" :max="1"
                  @change="thumbnailChange"/>
      </n-form-item>
      <n-form-item :label="t('bim[\'BIM file\']')" path="bimFile">
        <n-upload ref="uploadBIMRef" :default-upload="false" directory-dnd :max="1"
                  :accept="'.' + NEED_CONVERT_BIM_MODEL.join(',.')" @change="bimChange">
          <n-upload-dragger>
            <div>
              <n-icon size="48" :depth="3">
                <ArchiveOutline/>
              </n-icon>
            </div>
            <n-text style="font-size: 14px">
              {{
                t("bim['Click or drag the file to this area.Supported formats are:']") + ` ${NEED_CONVERT_BIM_MODEL.join("、")}`
              }}
            </n-text>
          </n-upload-dragger>
        </n-upload>
      </n-form-item>
      <n-collapse>
        <template #arrow>
          <n-icon>
            <CaretForwardOutline />
          </n-icon>
        </template>

        <n-collapse-item :title="t('bim[\'Conversion configuration\']')">
          <!--  导出属性 -->
          <n-form-item :label="t('bim[\'Export Property\']')">
            <n-switch v-model:value="BIMModel.options.ExportProperty" />
          </n-form-item>
          <!--  转换视图 -->
          <n-form-item :label="t('bim[\'Conversion view\']')">
            <n-radio-group v-model:value="BIMModel.options.View" name="View">
              <n-radio-button value="Default">标准三维视图</n-radio-button>
              <n-radio-button value="Name">按名称</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <!--  视图名称 -->
          <n-form-item :label="t('bim[\'View name\']')" v-if="BIMModel.options.View === 'Name'">
            <n-input v-model:value="BIMModel.options.ViewName" :placeholder="t('bim[\'Please enter the conversion view name\']')"/>
          </n-form-item>
          <!--  视觉样式 -->
          <n-form-item :label="t('bim[\'Display style\']')">
            <n-radio-group v-model:value="BIMModel.options.DisplayStyle" name="DisplayStyle">
              <n-radio-button value="Colour">{{t("bim.Colour")}}</n-radio-button>
              <n-radio-button value="Realistic">{{t("bim.Textures")}}</n-radio-button>
            </n-radio-group>
          </n-form-item>
        </n-collapse-item>
      </n-collapse>
    </n-form>

    <div class="flex justify-end">
      <n-button round type="primary" @click="submit">{{ t("bim['Upload and lightweight']") }}</n-button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import {reactive, ref} from "vue";
import {NotificationReactive} from "naive-ui";
import {t} from "@/language";
import {ArchiveOutline, CaretForwardOutline} from "@vicons/ionicons5";
import {fetchUpload} from "@/http/api/sys";
import {fetchAddBim2Gltf, fetchUploadRvt} from "@/http/api/bim";
import {NEED_CONVERT_BIM_MODEL} from "@/utils/common/constant";

withDefaults(defineProps<{
  show:boolean
}>(),{
  show:false
})

const emits = defineEmits(["update:show"]);

const formRef = ref();
const uploadBIMRef = ref();
const uploadThumbnailRef = ref();

/* bim文件上传转换 */
const BIMModel = reactive<{
  fileName: string,
  thumbnail: File | null,
  bimFile: File | null,
  options:{
    // 保留原接口字段；Everse 路径不额外合并或实例化网格。
    Optimize:boolean,
    // 是否导出属性
    ExportProperty:boolean,
    // Default：临时标准三维视图 | Name：按名称精确查找
    View:string,
    // 转换视图名称 - View = "Name"时输入有效
    ViewName:string,
    // Colour：Everse 着色 | Realistic：Everse 贴图
    DisplayStyle:string,
    // Origin：内部坐标，不独立居中。
    CoordinateReference:string
  }
}>({
  fileName: "",
  thumbnail: null,
  bimFile: null,
  options:{
    Optimize:false,
    ExportProperty:true,
    View:"Default",
    ViewName:"",
    DisplayStyle:"Colour",
    CoordinateReference:"Origin"
  }
})
const BIMRules = {
  bimFile: {
    required: true,
    trigger: 'change',
    validator: (_, value) => {
      return new Promise<void>((resolve, reject) => {
        // 判断value是否是File类型
        if (value === '' || !(value instanceof File)) {
          reject(Error(t("bim['Please upload the BIM file']")))
        } else {
          resolve()
        }
      })
    }
  }
}

// 预览图变化
function thumbnailChange({file}) {
  if (file.status === "removed") {
    BIMModel.thumbnail = null;
    return;
  }
  BIMModel.thumbnail = file.file as File;
}

// bim文件选择变化
function bimChange({file}) {
  if (file.status === "removed") {
    BIMModel.bimFile = null;
    formRef.value?.validate();
    return;
  }

  if (!NEED_CONVERT_BIM_MODEL.includes(file.name.split(".").at(-1).toLowerCase())) {
    window.$message?.error(t("prompt['This format is not supported, please upload again! Supported formats are:']") + ` ${NEED_CONVERT_BIM_MODEL.join("、")}`);
    uploadBIMRef.value.clear();
    return false
  }

  BIMModel.bimFile = file.file as File;
  BIMModel.fileName = BIMModel.bimFile.name;
  formRef.value?.validate();
}

type Submission = {
  snapshot: typeof BIMModel,
  fileId?: string
};
const submissions = new Set<Submission>();
const notices = new Map<string, NotificationReactive>();
const earlyResults = new Map<string, Bim2GltfWsData>();
let latestSubmission: Submission | undefined;

function getNotice(fileId: number) {
  const id = String(fileId);
  if (!notices.has(id)) {
    notices.set(id, window.$notification.info({
      title: t("bim['BIM lightweight']"), content: "", closable: false,
    }));
  }
  return notices.get(id);
}

function clearEarlyResults() {
  if ([...submissions].some(item => item.fileId === undefined)) return;
  for (const id of earlyResults.keys()) notices.delete(id);
  earlyResults.clear();
}

function handleTaskResult(result: Bim2GltfWsData) {
  if (result.conversionStatus === 'progress') return;
  const id = String(result.item.id);
  const submission = [...submissions].find(item => item.fileId === id);
  if (!submission) {
    // WebSocket completion may arrive before the HTTP response supplies the task ID.
    if ([...submissions].some(item => item.fileId === undefined)) earlyResults.set(id, result);
    else notices.delete(id);
    return;
  }
  const snapshot = submission.snapshot;
  if (result.conversionStatus === 'completed' && submission === latestSubmission
      && BIMModel.fileName === snapshot.fileName && BIMModel.bimFile === snapshot.bimFile
      && BIMModel.thumbnail === snapshot.thumbnail
      && JSON.stringify(BIMModel.options) === JSON.stringify(snapshot.options)) {
    BIMModel.fileName = "";
    BIMModel.thumbnail = null;
    BIMModel.bimFile = null;
    BIMModel.options = {
      Optimize:false, ExportProperty:true, View:"Default", ViewName:"",
      DisplayStyle:"Colour", CoordinateReference:"Origin"
    };
    uploadBIMRef.value?.clear();
    uploadThumbnailRef.value?.clear();
  }
  submissions.delete(submission);
  notices.delete(id);
  earlyResults.delete(id);
  clearEarlyResults();
}

// 提交
function submit(e) {
  e.preventDefault();
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      const snapshot = {...BIMModel, options: {...BIMModel.options}};
      emits("update:show",false);

      const notice = window.$notification.info({
        title: t("bim['BIM lightweight']"),
        content: t("prompt.Uploading") + "...",
        closable: false,
      })
      const submission: Submission = {snapshot};
      submissions.add(submission);
      latestSubmission = submission;

      try {
        // 1. 上传缩略图
        let thumbnail = "";
        if (snapshot.thumbnail) {
          const res = await fetchUpload({
            file: snapshot.thumbnail,
            biz: "upload/bim/thumbnail"
          })

          if (res.error || !res.data) throw new Error(res.error?.msg || t("bim['Failed to upload thumbnail']"));
          thumbnail = res.data as string;
        }

        // 2. 上传bim文件
        const bimRes = await fetchUploadRvt({
          file: snapshot.bimFile,
        });
        if (bimRes.error || !bimRes.data) throw new Error(bimRes.error?.msg || t("bim['Failed to upload BIM file']"));

        //3 启动Revit轻量化服务
        notice.content = t("bim['BIM lightweight is in progress']") + "...";
        const result = await fetchAddBim2Gltf({
          bimFilePath: bimRes.data,
          bimFileSize: (snapshot.bimFile as File).size,
          fileName: snapshot.fileName,
          fileSourceIp: "",
          thumbnail,
          conversionStatus: 0,
          // 转换配置
          options:snapshot.options
        })
        if (result.error || result.data?.id == null) throw new Error(result.error?.msg || t("bim['BIM lightweight failed']"));
        const id = submission.fileId = String(result.data.id);
        const existingNotice = notices.get(id);
        if (existingNotice) {
          notice.destroy();
        } else {
          notices.set(id, notice);
        }
        const earlyResult = earlyResults.get(id);
        if (earlyResult) handleTaskResult(earlyResult);
        clearEarlyResults();
      } catch (error) {
        notice.content = error instanceof Error ? error.message : t("bim['BIM lightweight failed']");
        notice.closable = true;
        submissions.delete(submission);
        clearEarlyResults();
      }
    }
  })
}

defineExpose({getNotice, handleTaskResult})
</script>

<style scoped lang="less">
.n-form-item{
  margin-bottom: 10px;
}
</style>
