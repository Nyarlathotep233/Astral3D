<script setup lang="ts">
import {computed, ref,watchEffect,nextTick} from "vue";
import { useThemeVars } from 'naive-ui';
import {Upload, Delete, Link} from '@vicons/carbon';
import {Loader} from "@astral3d/engine";
import {t} from "@/language";
import GLTFHandlerForm from "./glTFHandler/GLTFHandlerForm.vue";

const props = defineProps({
  onOptimize: {
    type: Function,
    required: true
  },
  onFinish: {
    type: Function,
    required: true
  }
});
// 优化结果文件
let outputFiles:File[] = [];

const themeVars = useThemeVars();
const borderColor = computed(() => themeVars.value.borderColor);
const primaryColor = computed(() => themeVars.value.primaryColor);
const hoverColor = computed(() => themeVars.value.hoverColor);
const textColor3 = computed(() => themeVars.value.textColor3);

const formRef = ref();
const loading = ref(false);
const loadingText = ref<string>(t("plugin.gltfHandler['The model is being optimized...']"));
const uploadInputRef = ref();
const fileList = ref<File[]>([]);
const optimizeDone = ref(false);

const logInstRef = ref();
const log = ref("");

watchEffect(() => {
  if (log.value) {
    nextTick(() => {
      logInstRef.value?.scrollTo({ position: 'bottom', silent: true })
    })
  }
})

function setLoading(boolean:boolean){
  loading.value = boolean;
}

function addLog(_log:string){
  log.value += `${_log}\n`;

  loadingText.value = _log;
}

// 拖拽文件进入
function handleFilesDrop(event:DragEvent){
  if (fileList.value.length > 10) {
    window.$message?.warning(t("plugin.gltfHandler['You can upload a maximum of 10 files']"));
    return;
  }

  const originFiles = event.dataTransfer?.files;

  if(!originFiles || !originFiles.length) return;

  const files:File[] = [];
  for (let i = 0; i < originFiles.length; i++) {
    const s = originFiles[i].name.split(".");
    if(["glb","gltf"].includes(s[s.length - 1].toLowerCase())){
      files.push(originFiles[i]);
    }
  }

  // 处理拖拽进来的文件
  for (let i = 0; i < files.length; i++) {
    if (!fileList.value.find(item => item.lastModified === files[i].lastModified && item.name === files[i].name)) {
      if (fileList.value.length >= 10) {
        fileList.value.length = 10;
        break;
      }

      fileList.value.push(files[i]);
    }
  }
}

function handleUploadChange(event){
  const files = event.target.files;

  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (!fileList.value.find(item => item.lastModified === files[i].lastModified && item.name === files[i].name)) {
        if (fileList.value.length >= 10) {
          fileList.value.length = 10;
          break;
        }

        fileList.value.push(files[i]);
      }
    }
  }

  // TODO:暂时只支持单文件处理
  // const file = event.target.files[0];
  // if(file){
  //   fileList.value = [file];
  // }
}

function handleSelectFile() {
  if(optimizeDone.value){
    window.$dialog.warning({
      title: window.$t('other.warning'),
      content: window.$t("plugin.gltfHandler['Re-selecting the file will clear the previous optimization result. Do you want to continue?']"),
      positiveText: window.$t('other.Ok'),
      negativeText: window.$t('other.Cancel'),
      onPositiveClick: async () => {
        outputFiles = [];
        optimizeDone.value = false;
        log.value = "";

        uploadInputRef.value.click();
      },
    });
  }else{
    if (fileList.value.length > 10) {
      window.$message?.warning(t("plugin.gltfHandler['You can upload a maximum of 10 files']"));
      return;
    }

    uploadInputRef.value.click();
  }
}

function handleDeleteFile(file:File) {
  if(optimizeDone.value){
    window.$dialog.warning({
      title: window.$t('other.warning'),
      content: window.$t("plugin.gltfHandler['This operation will clear the relevant optimization results. Do you want to continue?']"),
      positiveText: window.$t('other.Ok'),
      negativeText: window.$t('other.Cancel'),
      onPositiveClick: async () => {
        fileList.value = fileList.value.filter(item => !(item.lastModified === file.lastModified && item.name === file.name));
        outputFiles = outputFiles.filter(item => !(item.name.replace("_astral3d.optimize","") === file.name));

        if(!fileList.value.length){
          optimizeDone.value = false;
          log.value = "";
        }
      },
    });
  }else{
    fileList.value = fileList.value.filter(item => !(item.lastModified === file.lastModified && item.name === file.name));
  }
}

// 提交优化
function handleSubmit(){
  if(fileList.value.length === 0) return;

  setLoading(true);

  handleOptimize(formRef.value.model)
}

// 处理优化
async function handleOptimize(model:IPlugin.GLTFHandlerOptimizeModel) {
  for(let file of fileList.value){
    outputFiles.push(await props.onOptimize(model, file))
  }

  optimizeDone.value = true;
  setLoading(false);
}

// 下载优化结果
function handleDownload(){
  if(outputFiles.length === 0) return;

  outputFiles.forEach(outputFile => {
    const url = URL.createObjectURL(outputFile);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = outputFile.name;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  })
}

// 优化结果导入场景
function handleImportScene(){
  if(outputFiles.length === 0) return;

  Loader.loadFiles(outputFiles, undefined).then(() => {
    window.$message?.success(t("plugin.gltfHandler['Import success!']"));
    // outputFiles = [];
    // optimizeDone.value = false;
  }).catch(error => {
    window.$message?.error(error instanceof Error ? error.message : t("prompt['Load fail,Please try again later!']"));
  });

  // 关闭插件弹窗
  // props.onFinish();
  // log.value = "";
}

defineExpose({
  setLoading,
  addLog
})
</script>

<template>
  <n-spin :show="loading" >
    <template #description>
      {{ loadingText }}
    </template>

    <div class="optimize-upload h-150px grid gap-2"
         :style="{gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))'}">
      <div class="optimize-upload-card" v-if="fileList.length === 0" @click="handleSelectFile" @dragover.stop.prevent @drop.stop.prevent="handleFilesDrop">
        <input v-show="false" type="file" ref="uploadInputRef" multiple accept=".glb,.gltf" @change="handleUploadChange"  />

        <n-icon size="48" :depth="3" class="mb-12px">
          <Upload/>
        </n-icon>
        <n-text class="mb-6px text-16px"> {{ t("plugin.gltfHandler['Select the.glb/.gltf file']") }} </n-text>
        <n-text depth="3"> {{ t("plugin.gltfHandler['Batch processing is supported (up to 10)']") }} </n-text>
      </div>

      <template v-else>
        <div class="optimize-upload-list">
          <div v-for="(file,index) in fileList" :key="index" class="optimize-upload-list-item">
            <n-icon size="16">
              <Link/>
            </n-icon>
            <span class="optimize-upload-list-item-name" :title="file.name">{{ file.name }}</span>
            <n-icon size="16" class="optimize-upload-list-item-del" @click.stop="handleDeleteFile(file)">
              <Delete/>
            </n-icon>
          </div>
        </div>

        <n-log ref="logInstRef" :log="log" trim class="!h-150px" />
      </template>
    </div>

    <GLTFHandlerForm ref="formRef" />

    <div class="w-full flex justify-center mt-10px">
      <n-button v-if="!optimizeDone" type="primary" @click="handleSubmit">
        {{ t("plugin.gltfHandler.Optimize") }}
      </n-button>

      <template v-else>
        <n-button type="primary" @click="handleDownload">
          {{ t("plugin.gltfHandler.Download") }}
        </n-button>
        <n-button type="primary" @click="handleImportScene" class="ml-4">
          {{ t("plugin.gltfHandler.Import scene") }}
        </n-button>
      </template>
    </div>
  </n-spin>
</template>

<style scoped lang="less">
.optimize-upload {
  &-card {
    position: relative;
    text-align: center;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed v-bind(borderColor);
    border-radius: 8px;
    cursor: pointer;
    outline: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transition: border-color 0.3s, width 0.3s;

    &:hover {
      border-color: v-bind(primaryColor);
    }
  }

  &-list {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    transition: opacity 0.3s, height 0.3s;

    &::before {
      display: table;
      width: 0;
      height: 0;
      content: "";
    }

    &-item {
      color: v-bind(primaryColor);
      position: relative;
      height: 22px;
      margin-top: 8px;
      font-size: 14px;
      display: flex;
      align-items: center;
      transition: background-color .3s;
      cursor: pointer;
      padding: 0 8px;

      &:hover {
        background-color: v-bind(hoverColor);

        .optimize-upload-list-item-del{
          opacity: 1;
        }
      }

      &-name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding: 0 6px;
        line-height: 1.57;
        flex: auto;
        max-width: 85%;
        transition: all .3s;
      }

      &-del {
        position: absolute;
        right: 8px;
        color: v-bind(textColor3);
        cursor: pointer;
        opacity: 0;
        transition: all .3s;

        &:hover {
          transform: scale(1.2);
        }

        &:active {
          transform: scale(0.9);
        }
      }
    }
  }
}
</style>
