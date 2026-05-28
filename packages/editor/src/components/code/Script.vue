<template>
  <n-modal v-model:show="show" class="script-modal !w-95vw" preset="dialog" :showIcon="false">
    <template #header>
      <div class="script-modal-header">
        <span class="script-modal-title">{{ title }}</span>
        <n-button
          v-if="mode === 'javascript'"
          tag="a"
          size="tiny"
          quaternary
          :href="scriptDocDownloadUrl"
          download="Astral3D-脚本.md"
          @click.stop
        >
          下载文档
        </n-button>
      </div>
    </template>

    <div class="script-modal-main" :class="{ 'with-ai-pane': mode === 'javascript' }">
      <div class="script-editor-pane">
        <div v-if="isAiDiffMode" class="script-diff-banner">
          AI 预览模式：请在右侧确认、应用或放弃候选修改
        </div>

        <CodeEditor
          ref="scriptCodeRef"
          v-model:source="script.source"
          :mode="mode"
          :diff="isAiDiffMode"
          :original-source="aiBaseSource"
          :modified-source="aiGeneratedSource"
          class="script-code-editor"
        />

        <n-alert
          title="Error"
          type="error"
          v-if="errors.length"
          closable
          @close="errors = []"
          class="script-error-alert"
        >
          <n-text depth="1" v-for="(error, index) in errors" :key="index" class="block">{{ error }}</n-text>
        </n-alert>
      </div>

      <ScriptAiAgentPanel
        v-if="mode === 'javascript'"
        :source="script.source"
        :scene-id="aiScriptContext.sceneId"
        :object-id="aiScriptContext.objectId"
        :object-name="aiScriptContext.objectName"
        :object-type="aiScriptContext.objectType"
        :script-name="script.name"
        :mode="mode"
        :diff-pending="isAiDiffMode"
        @preview="setAiPreview"
        @apply="applyAiPreview"
        @discard="discardAiPreview"
        @undo="undoAiApply"
      />
    </div>

    <div class="script-footer">
      <n-button size="small" @click="show = false">{{ t('other.Cancel') }}</n-button>
      <n-button class="ml-5px" type="primary" size="small" @click="submit">{{ t('other.Ok') }}</n-button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import * as THREE from "three";
import { App, Hooks, SetScriptValueCommand, SetMaterialValueCommand } from "@astral3d/engine";
import { t } from "@/language";
import CodeEditor from "@/components/code/CodeEditor.vue";
import ScriptAiAgentPanel from "@/components/code/ScriptAiAgentPanel.vue";

const scriptCodeRef = ref();
const title = ref("");
const show = ref(false);
const script = reactive({
  name: "",
  source: "",
});
const errors = ref<string[]>([]);
const mode = ref("javascript");

const SCRIPT_DOC_FILENAME = "editor-script.md";
const scriptDocDownloadUrl = computed(() => `${normalizeBaseUrl(import.meta.env.BASE_URL)}docs/${SCRIPT_DOC_FILENAME}`);

const aiBaseSource = ref("");
const aiGeneratedSource = ref("");
const aiDiffPending = ref(false);
const aiScriptContext = reactive({
  sceneId: "",
  objectId: "",
  objectName: "",
  objectType: "",
});

const isAiDiffMode = computed(() => {
  return mode.value === "javascript" && aiDiffPending.value && !!aiGeneratedSource.value;
});

let currentScript: IScript.IStruct | string | null = null;
let currentObject: THREE.Mesh | null = null;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

onMounted(() => {
  Hooks.useAddSignal("sceneCleared", sceneCleared);
  Hooks.useAddSignal("scriptRemoved", scriptRemoved);
  Hooks.useAddSignal("editScript", editScript);
});

onBeforeUnmount(() => {
  Hooks.useRemoveSignal("sceneCleared", sceneCleared);
  Hooks.useRemoveSignal("scriptRemoved", scriptRemoved);
  Hooks.useRemoveSignal("editScript", editScript);
});

function sceneCleared() {
  show.value = false;
  script.name = "";
  script.source = "";
  errors.value = [];
  resetAiState();
}

function scriptRemoved(_: THREE.Object3D, sc: IScript.IStruct) {
  if (script.name === sc.name) {
    sceneCleared();
  }
}

function editScript(object: THREE.Object3D, sc: IScript.IStruct | string) {
  resetAiState();

  if (typeof sc === "object") {
    mode.value = "javascript";
    script.name = sc.name;
    script.source = sc.source;
    title.value = object.name + " / " + script.name;
    setAiScriptContext(object);
  } else {
    switch (sc) {
      case "vertexShader":
        mode.value = "glsl";
        script.name = "Vertex Shader";
        // @ts-ignore
        script.source = object.material.vertexShader || "";
        break;

      case "fragmentShader":
        mode.value = "glsl";
        script.name = "Fragment Shader";
        // @ts-ignore
        script.source = object.material.fragmentShader || "";
        break;

      case "programInfo":
        mode.value = "json";
        script.name = "Program Properties";
        // @ts-ignore
        script.source = JSON.stringify({
          // @ts-ignore
          defines: object.material.defines,
          // @ts-ignore
          uniforms: object.material.uniforms,
          // @ts-ignore
          attributes: object.material.attributes,
        }, null, "\t");
        break;
    }

    // @ts-ignore
    title.value = object.material.name + " / " + script.name;
  }

  currentScript = sc;
  currentObject = object as THREE.Mesh;
  show.value = true;
}

function resetAiState() {
  aiBaseSource.value = "";
  aiGeneratedSource.value = "";
  aiDiffPending.value = false;
  aiScriptContext.sceneId = "";
  aiScriptContext.objectId = "";
  aiScriptContext.objectName = "";
  aiScriptContext.objectType = "";
}

function setAiScriptContext(object: THREE.Object3D) {
  const sceneInfo = App.project.getKey("sceneInfo") || {};
  aiScriptContext.sceneId = String(sceneInfo.id || "");
  aiScriptContext.objectId = object.uuid || "";
  aiScriptContext.objectName = object.name || "";
  aiScriptContext.objectType = object.type || "";
}

function setAiPreview(payload: { baseSource: string; source: string }) {
  aiBaseSource.value = payload.baseSource || script.source;
  aiGeneratedSource.value = payload.source || "";
  aiDiffPending.value = !!aiGeneratedSource.value;
}

function clearAiPreview() {
  aiDiffPending.value = false;
  aiBaseSource.value = "";
  aiGeneratedSource.value = "";
}

function applyAiPreview(payload: { source: string }) {
  script.source = payload.source;
  clearAiPreview();
}

function discardAiPreview() {
  clearAiPreview();
}

function undoAiApply(payload: { beforeSource: string; afterSource: string }) {
  if (script.source !== payload.afterSource) {
    window.$message?.warning("当前代码已被手动修改，不能安全撤回上次 AI 应用。");
    return;
  }
  script.source = payload.beforeSource;
  clearAiPreview();
}

function submit(e: Event) {
  e.stopPropagation();

  if (isAiDiffMode.value) {
    window.$message?.warning("当前处于 AI 预览模式，请先应用或放弃预览。取舍后仍需点击确定保存脚本。");
    return;
  }

  errors.value = scriptCodeRef.value.getErrors();
  if (errors.value.length > 0) return;
  if (!currentObject) return;

  const value = script.source;

  if (typeof currentScript === "object") {
    if (value !== currentScript?.source) {
      App.execute(new SetScriptValueCommand(currentObject as THREE.Object3D, currentScript as IScript.IStruct, "source", value));
    }
    show.value = false;
    return;
  }

  if (mode.value === "glsl" && currentObject.material) {
    // @ts-ignore
    currentObject.material[currentScript] = value;
    (currentObject.material as THREE.Material).needsUpdate = true;
    Hooks.useDispatchSignal("materialChanged", currentObject, 0);
    show.value = false;
    return;
  }

  if (currentScript !== "programInfo") {
    show.value = false;
    return;
  }

  if (!currentObject.material) return;

  const json = JSON.parse(value);

  if (JSON.stringify((currentObject.material as THREE.Material).defines) !== JSON.stringify(json.defines)) {
    const cmd = new SetMaterialValueCommand(currentObject, "defines", json.defines);
    cmd.updatable = false;
    App.execute(cmd);
  }

  // @ts-ignore
  if (JSON.stringify(currentObject.material.uniforms) !== JSON.stringify(json.uniforms)) {
    const cmd = new SetMaterialValueCommand(currentObject, "uniforms", json.uniforms);
    cmd.updatable = false;
    App.execute(cmd);
  }

  // @ts-ignore
  if (JSON.stringify(currentObject.material.attributes) !== JSON.stringify(json.attributes)) {
    const cmd = new SetMaterialValueCommand(currentObject, "attributes", json.attributes);
    cmd.updatable = false;
    App.execute(cmd);
  }

  show.value = false;
}
</script>

<style scoped lang="less">
.script-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.script-modal-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-modal-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  height: calc(78vh - 44px);
  min-height: 420px;
  overflow: hidden;
}

.script-modal-main.with-ai-pane {
  grid-template-columns: minmax(0, 1fr) 460px;
}

.script-editor-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--n-color);
  display: flex;
  flex-direction: column;
}

.script-code-editor {
  flex: 1;
  min-height: 0;
}

.script-diff-banner {
  border-bottom: 1px solid rgba(255, 179, 71, 0.35);
  padding: 6px 10px;
  font-size: 12px;
  background: rgba(255, 179, 71, 0.2);
  color: #ffb347;
  flex: 0 0 auto;
}

.script-error-alert {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 30;
}

.script-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--n-border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1400px) {
  .script-modal-main.with-ai-pane {
    grid-template-columns: minmax(0, 1fr) 400px;
  }
}
</style>
