<template>
  <EsDocument url="http://editor-doc.astraljs.com/guide/component/h4v1bkyh/"/>

  <div v-if="isSelectObject3D">
    <n-list hoverable clickable>
      <n-list-item v-for="(item, index) in scripts" :key="index">
        <EsInput size="small" defaultNoBorder v-model:value="item.name"
                 @change="(n) => handleNameChange(item, n)"/>
        <n-button size="small" class="ml-5px" @click="handleEdit(item.script)">
          {{ t('layout.sider.script.Edit') }}
        </n-button>
        <n-button size="small" class="ml-5px" @click="handleRemove(item.script)">
          {{ t('layout.sider.script.Remove') }}
        </n-button>
      </n-list-item>
    </n-list>

    <div class="w-full text-center mt-2">
      <n-button size="small" type="primary" @click="handleNew">{{ t('layout.sider.script.New') }}</n-button>
    </div>
  </div>

  <n-result v-else status="418" title="Empty" :description="t('prompt[\'No object selected.\']')"/>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, toRaw, h} from "vue";
import {NInput} from "naive-ui";
import {t} from "@/language";
import {App, Hooks, SetScriptValueCommand, RemoveScriptCommand, AddScriptCommand,Script as AstralScript} from "@astral3d/engine";
import EsInput from "@/components/es/EsInput.vue";
import EsDocument from "@/components/es/EsDocument.vue";

const isSelectObject3D = ref(false);
interface ScriptListItem {
  script: IScript.IStruct;
  name: string;
}

const scripts = ref<ScriptListItem[]>([]);

onMounted(() => {
  Hooks.useAddSignal("objectSelected", objectSelected);
  Hooks.useAddSignal("scriptAdded", updateUI);
  Hooks.useAddSignal("scriptRemoved", updateUI);
  Hooks.useAddSignal("scriptChanged", updateUI);
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("objectSelected", objectSelected);
  Hooks.useRemoveSignal("scriptAdded", updateUI);
  Hooks.useRemoveSignal("scriptRemoved", updateUI);
  Hooks.useRemoveSignal("scriptChanged", updateUI);
})

function objectSelected(object) {
  if (object !== null && App.camera !== object) {
    isSelectObject3D.value = true;
    updateUI();
  } else {
    isSelectObject3D.value = false;
  }
}

function updateUI() {
  const object = App.selected;

  if (object === null) return;

  // 直接使用scripts.value = App.scripts[object.uuid]会导致数据更新不及时，所以这里重新获取数据
  scripts.value = [];
  App.scripts[object.uuid]?.forEach((sc: IScript.IStruct) => {
    scripts.value.push({
      script: sc,
      name: sc.name,
    });
  });
}

function handleNew() {
  const v = ref("");
  const status = ref("");

  window.$dialog.warning({
    title: t("layout.sider.script['Please enter the script name']"),
    content: () => h(NInput, {
      modelValue: v.value,
      placeholder: "",
      clearable: true,
      size: "small",
      status: status.value,
      onUpdateValue: (n: string) => {
        v.value = n;
        status.value = !v.value ? "error" : "";
      },
      onBlur: () => {
        status.value = !v.value ? "error" : "";
      }
    }),
    positiveText: t('other.Ok'),
    negativeText: t('other.Cancel'),
    onPositiveClick: () => {
      if (!v.value || !App.selected) return false;

      // 检查名称是否重复
      if (App.scripts[App.selected.uuid]?.find((s) => s.name === v.value)) {
        window.$message?.error(t("layout.sider.script['The script name already exists']"));

        return false;
      }

      const script = {name: v.value, source: AstralScript.Source};
      App.execute(new AddScriptCommand(App.selected, script));
    },
  })
}

function handleNameChange(item: ScriptListItem, name: string) {
  if(!App.selected) return;

  if (!name) {
    item.name = item.script.name;
    return;
  }

  if (name === item.script.name) return;

  if (App.scripts[App.selected.uuid]?.some((s) => s !== item.script && s.name === name)) {
    window.$message?.error(t("layout.sider.script['The script name already exists']"));
    item.name = item.script.name;
    return;
  }

  App.execute(new SetScriptValueCommand(App.selected, item.script, 'name', name));
}

function handleEdit(script: IScript.IStruct) {
  Hooks.useDispatchSignal("editScript", App.selected, toRaw(script));
}

function handleRemove(script: IScript.IStruct) {
  window.$dialog.warning({
    title: t("other.warning"),
    content: t("core['Any unsaved data will be lost. Are you sure?']"),
    positiveText: t('other.Ok'),
    negativeText: t('other.Cancel'),
    onPositiveClick: () => {
      if(!App.selected) return;

      App.execute(new RemoveScriptCommand(App.selected, toRaw(script)));
    },
  });
}
</script>

<style scoped lang="less">
.n-list {
  &-item {
    padding: 0 !important;

    :deep(&__main) {
      display: flex;
      align-items: center;
      padding: 5px 0;
    }
  }
}
</style>
