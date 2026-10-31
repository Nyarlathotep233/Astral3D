<script setup lang="ts">
import {ref,reactive,onBeforeUnmount, onMounted} from "vue";
import {UploadFileInfo} from "naive-ui";
import {CaretForwardOutline,ArchiveOutline as ArchiveIcon} from "@vicons/ionicons5";
import {t} from "@/language";
import {App,Loader,Hooks,Utils,HtmlPanelConverter} from "@astral3d/engine";
import HtmlPanelCode from "@/components/code/HtmlPanelCode.vue";

const data = reactive<{
  type: 'panel' |'sprite',
  codes: { name: string, content: string | ArrayBuffer }[]
}>({
  type: 'panel',
  codes: []
})
const codeEditorShow = ref(false);
const editorCode = reactive({
  name: '',
  code: ''
});
const editorCodeMode = ref('html');

onMounted(() => {
  Hooks.useAddSignal("objectSelected", updateUI);

  updateUI();
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("objectSelected", updateUI);
})

function updateUI() {
  const object = App.selected;
  if(!object) return;

  if (!Utils.isHtmlPanelObject(object)) {
    data.codes = [];
    return;
  }

  data.type = object.isHtmlPanel? 'panel' :'sprite';
  data.codes = object.options.codes;
}

function update(method: string){
  const object = App.selected;
  if(!object) return;

  if (!Utils.isHtmlPanelObject(object)) return;

  const call = {
    type: () => {
      if(data.type === 'panel' && object.isHtmlPanel) return;
      if(data.type === 'sprite' && object.isHtmlSprite) return;

      const _json = (object as import("@astral3d/engine").HtmlPanel | import("@astral3d/engine").HtmlSprite).toJSON();
      _json.object.type = data.type === 'panel' ? 'HtmlSprite' : 'HtmlPanel';
      _json.object.options.isSprite = !_json.object.options.isSprite;

      Loader.objectLoader.parseAsync(_json).then(newObject3D => {
        object.parent?.add(newObject3D);

        object.parent?.remove(object);

        App.selected = newObject3D;

        Hooks.useDispatchSignal("objectSelected",newObject3D);
      })
    },
    code: () => {
      const _code = data.codes.find(c => c.name === editorCode.name);
      if(!_code) return;

      _code.content = editorCode.code;

      const htmlPanelOption = {
        isSprite: object.options.isSprite,
        isSingleHtml:object.options.isSingleHtml,
        codes: data.codes
      }

      const newObject3D = HtmlPanelConverter.getInstance().parseToCSS3D(htmlPanelOption);

      // 把object.element中的子节点替换为newObject3D.element中的子节点
      while (object.element.firstChild) {
        object.element.removeChild(object.element.firstChild);
      }

      while (newObject3D.element.firstChild) {
        object.element.appendChild(newObject3D.element.firstChild);
      }
    }
  }

  call[method]();
}

async function beforeUpload() {
  if (data.codes.length > 0) {
    return new Promise((resolve, reject) => {
      window.$dialog.warning({
        title: window.$t('other.warning'),
        content: window.$t("prompt['Uploading a new file will completely overwrite the original content, do you want to continue?']"),
        positiveText: window.$t('other.Ok'),
        negativeText: window.$t('other.Cancel'),
        onPositiveClick: () => {
          resolve(true);
        },
        onNegativeClick: () => {
          reject()
        }
      });
    })
  }

  return true
}

function updateFileList(fList: UploadFileInfo[]) {
  if (fList.length === 0) return;

  const object = App.selected;
  if(!object) return;

  if (!Utils.isHtmlPanelObject(object)) return;

  //永远取最新值
  const file = fList[fList.length - 1];

  // File对象转临时URL
  const tempURL = URL.createObjectURL(file.file!);

  HtmlPanelConverter.getInstance().loadAsync({
    url: tempURL,
    isSprite: data.type ==='sprite',
    fileName: file.name
  }).then(htmlPlaneObj => {
    data.codes = htmlPlaneObj.options.codes;

    const _json = (object as import("@astral3d/engine").HtmlPanel | import("@astral3d/engine").HtmlSprite).toJSON();
    Loader.objectLoader.copyAttrByData(htmlPlaneObj, _json.object)

    object.parent?.add(htmlPlaneObj);

    object.parent?.remove(object);

    App.selected = htmlPlaneObj;

    Hooks.useDispatchSignal("objectSelected", htmlPlaneObj);
  }).catch((e:Error) => window.$message?.error(e.message));
}

function getCanEdit(name: string) {
  return HtmlPanelConverter.getInstance()._isEditable(name);
}

function handleEdit(code: { name:string,content:string | ArrayBuffer }){
  if(code.content instanceof ArrayBuffer) return;

  editorCode.name = code.name;
  editorCode.code = code.content;

  editorCodeMode.value = code.name.split('.').pop()?.toLowerCase() || 'html';

  codeEditorShow.value = true;
}
</script>

<template>
  <!-- 类型 -->
  <n-form label-placement="left" :label-width="90" label-align="left" size="small" class="px-2">
    <n-form-item :label="t('layout.sider.particle.Type')">
      <n-select v-model:value="data.type" size="small" :options="[
        {label: 'CSS3DObject', value: 'panel'},
        {label: 'CSS3DSprite', value: 'sprite'},
        ]" @update:value="update('type')"/>
    </n-form-item>
  </n-form>

  <n-divider class="!my-3" />

  <n-collapse display-directive="show" :default-expanded-names="['panel']">
    <template #arrow>
      <n-icon>
        <CaretForwardOutline/>
      </n-icon>
    </template>

    <!--  内容  -->
    <n-collapse-item :title="t('layout.sider.htmlPanel.Content')" name="panel">
      <!-- 上传代码 -->
      <n-upload :max="1" accept=".zip,.html" :show-remove-button="false"
                @before-upload="beforeUpload" @update:file-list="updateFileList">
        <n-upload-dragger>
          <n-icon size="36" :depth="3">
            <archive-icon/>
          </n-icon>
          <div class="flex flex-col">
            <n-text>
              {{ t("prompt.Click to select or drag the file to this area") }}
            </n-text>
            <n-text :depth="3" class="!text-0.6rem">
              {{ t("other.Support") }} .zip,.html
            </n-text>
          </div>
        </n-upload-dragger>
      </n-upload>

      <n-list hoverable clickable>
        <n-list-item v-for="(code, index) in data.codes" :key="index">
          <div>{{code.name}}</div>

          <template #suffix>
            <n-button size="small" @click="handleEdit(code)" :disabled="!getCanEdit(code.name)">
              {{ t('layout.sider.script.Edit') }}
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-collapse-item>
  </n-collapse>

  <HtmlPanelCode v-model:show="codeEditorShow" v-model:value="editorCode.code"
                 :title="editorCode.name" :mode="editorCodeMode" @update:value="update('code')" />
</template>

<style scoped lang="less">
.n-list-item {
  :deep(.n-list-item__main){
    flex: unset !important;
    width: 70% !important;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }

  :deep(.n-list-item__suffix){
    margin-left: 10px !important;
  }
}
</style>