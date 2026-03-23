<template>
  <n-modal v-model:show="show" class="script-modal !w-95vw" preset="dialog" :title="title" :showIcon="false">
    <div class="script-modal-main" :class="{ 'with-ai-pane': mode === 'javascript' }">
      <div class="script-editor-pane">
        <div v-if="isAiDiffMode" class="script-diff-banner">
          AI 预览模式（Diff）：请确认后“应用当前修改”
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

      <div v-if="mode === 'javascript'" class="script-ai-pane">
        <div class="script-ai-title">AI 助手</div>
        <div class="script-ai-meta">{{ aiStatusText }}</div>

        <n-scrollbar class="script-ai-history">
          <div class="script-ai-history-inner">
            <div v-if="!aiMessages.length" class="script-ai-empty">
              输入需求后点击“AI 生成（Mock）”，将进入代码 Diff 预览。
            </div>

            <div
              v-for="(msg, idx) in aiMessages"
              :key="idx"
              class="script-ai-message"
              :class="`is-${msg.role}`"
            >
              <div class="script-ai-role">{{ getRoleLabel(msg.role) }}</div>
              <div class="script-ai-content">{{ msg.content }}</div>
            </div>
          </div>
        </n-scrollbar>

        <div class="script-ai-bottom">
          <n-input
            v-model:value="aiRequirement"
            type="textarea"
            placeholder="描述你希望脚本做什么（例如：让对象绕 Y 轴旋转并支持空格暂停）"
            :autosize="{ minRows: 3, maxRows: 6 }"
            class="script-ai-input"
          />

          <div class="script-ai-actions">
            <n-button size="small" :loading="aiLoading" type="primary" class="action-generate" @click="generateWithAi">
              {{ aiGenerateButtonText }}
            </n-button>
            <n-button size="small" :disabled="!isAiDiffMode" @click="applyAiResult">
              应用当前修改
            </n-button>
            <n-button size="small" :disabled="!isAiDiffMode" @click="discardAiPreview">
              放弃预览
            </n-button>
          </div>

          <div class="script-ai-status">
            <n-alert v-if="aiError" title="AI Error" type="error">
              {{ aiError }}
            </n-alert>

            <n-alert v-if="aiApplyMessage" title="Apply Result" type="success">
              {{ aiApplyMessage }}
            </n-alert>
          </div>
        </div>
      </div>
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
import { fetchAiScriptStatus, fetchGenerateMockScript, fetchGenerateScript } from "@/http/api/ai";

type AiMessageRole = "user" | "assistant" | "system";
type AiMessage = {
  role: AiMessageRole;
  content: string;
};

const scriptCodeRef = ref();
const title = ref("");
const show = ref(false);
const script = reactive({
  name: "",
  source: "",
});
const errors = ref<string[]>([]);
const mode = ref("javascript");

const aiRequirement = ref("");
const aiLoading = ref(false);
const aiError = ref("");
const aiApplyMessage = ref("");
const aiMessages = ref<AiMessage[]>([]);
const aiBaseSource = ref("");
const aiGeneratedSource = ref("");
const aiDiffPending = ref(false);
const aiProvider = ref("mock");
const aiModel = ref("");
const aiStatusMessage = ref("正在获取 AI 状态...");

const isAiDiffMode = computed(() => {
  return mode.value === "javascript" && aiDiffPending.value && !!aiGeneratedSource.value;
});

const aiGenerateButtonText = computed(() => {
  return aiProvider.value === "live" ? "AI 生成" : "AI 生成（Mock）";
});

const aiStatusText = computed(() => {
  const modelSuffix = aiModel.value ? ` / ${aiModel.value}` : "";
  return `模式：${aiProvider.value === "live" ? "真实模型" : "Mock"}${modelSuffix}。${aiStatusMessage.value}`;
});

let currentScript: IScript.IStruct | string | null = null;
let currentObject: THREE.Mesh | null = null;

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

  if (mode.value === "javascript") {
    void loadAiStatus();
  }
}

function resetAiState() {
  aiRequirement.value = "";
  aiLoading.value = false;
  aiError.value = "";
  aiApplyMessage.value = "";
  aiMessages.value = [];
  aiBaseSource.value = "";
  aiGeneratedSource.value = "";
  aiDiffPending.value = false;
  aiProvider.value = "mock";
  aiModel.value = "";
  aiStatusMessage.value = "正在获取 AI 状态...";
}

function pushAiMessage(role: AiMessageRole, content: string) {
  const text = content?.trim();
  if (!text) return;

  aiMessages.value.push({ role, content: text });
  if (aiMessages.value.length > 40) {
    aiMessages.value.splice(0, aiMessages.value.length - 40);
  }
}

function getRoleLabel(role: AiMessageRole) {
  if (role === "user") return "你";
  if (role === "assistant") return "AI";
  return "系统";
}

async function loadAiStatus() {
  try {
    const res = await fetchAiScriptStatus();
    if (res.error !== null || !res.data) {
      aiProvider.value = "mock";
      aiStatusMessage.value = res.error?.msg || "状态获取失败，默认使用 Mock。";
      return;
    }

    aiProvider.value = res.data.liveReady ? "live" : "mock";
    aiModel.value = res.data.model || "";
    aiStatusMessage.value = res.data.message || "状态已更新。";
  } catch (error) {
    aiProvider.value = "mock";
    aiStatusMessage.value = error instanceof Error ? error.message : "状态获取异常，默认使用 Mock。";
  }
}

async function generateWithAi() {
  if (mode.value !== "javascript") return;
  if (!currentObject) return;

  const requirement = aiRequirement.value.trim();
  if (!requirement) {
    aiError.value = "请输入需求后再生成";
    return;
  }

  aiLoading.value = true;
  aiError.value = "";
  aiApplyMessage.value = "";
  pushAiMessage("user", requirement);

  try {
    const sceneInfo = App.project.getKey("sceneInfo") || {};
    const requestPayload = {
      sceneId: sceneInfo.id,
      objectId: currentObject.uuid,
      objectName: currentObject.name,
      objectType: currentObject.type,
      scriptName: script.name,
      currentSource: script.source,
      requirement,
      mode: mode.value,
    };

    let res = await fetchGenerateScript(requestPayload);
    if (res.error !== null || !res.data?.source) {
      const fallbackRes = await fetchGenerateMockScript(requestPayload);
      if (fallbackRes.error === null && fallbackRes.data?.source) {
        res = fallbackRes;
        pushAiMessage("system", "统一生成接口不可用，已自动回退到 /script/mock。");
      }
    }

    if (res.error !== null || !res.data?.source) {
      aiError.value = res.error?.msg || "AI 返回为空";
      pushAiMessage("system", aiError.value);
      return;
    }

    aiBaseSource.value = script.source;
    aiGeneratedSource.value = res.data.source;
    aiDiffPending.value = true;
    aiProvider.value = res.data.provider === "live" ? "live" : "mock";
    aiModel.value = res.data.model || aiModel.value;

    pushAiMessage("assistant", res.data.explanation || "已生成代码预览，请确认后应用。");
    (res.data.warnings || []).forEach((warning) => pushAiMessage("system", warning));
    aiStatusMessage.value = aiProvider.value === "live" ? "真实模型生成成功。" : "当前为 Mock 结果。";
    window.$message?.success("已生成代码差异预览，请确认后应用。");
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : "AI 生成失败";
    pushAiMessage("system", aiError.value);
  } finally {
    aiLoading.value = false;
  }
}

function applyAiResult() {
  if (!isAiDiffMode.value) return;

  const nextSource = aiGeneratedSource.value;
  script.source = nextSource;

  aiDiffPending.value = false;
  aiBaseSource.value = "";
  aiGeneratedSource.value = "";

  aiApplyMessage.value = "已将 AI 修改写入编辑器。请手动点击“确定”并保存场景。";
  pushAiMessage("system", "已应用当前修改，请手动点击“确定”并保存场景。");
  window.$message?.success("AI 结果已应用到编辑器，请手动点击确定并保存场景。");
}

function discardAiPreview() {
  if (!isAiDiffMode.value) return;

  aiDiffPending.value = false;
  aiBaseSource.value = "";
  aiGeneratedSource.value = "";
  aiApplyMessage.value = "已放弃本次 AI 预览，编辑器保持原代码。";
  pushAiMessage("system", "已放弃当前 AI 预览。");
}

function submit(e: Event) {
  e.stopPropagation();

  if (isAiDiffMode.value) {
    window.$message?.warning("当前处于 AI Diff 预览，请先应用或放弃预览。");
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
.script-modal-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  height: calc(78vh - 44px);
  min-height: 420px;
  overflow: hidden;
}

.script-modal-main.with-ai-pane {
  grid-template-columns: minmax(0, 1fr) 360px;
}

.script-editor-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: #1b1b1b;
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

.script-ai-pane {
  min-width: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 10px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  overflow: hidden;
}

.script-ai-title {
  font-size: 14px;
  font-weight: 600;
}

.script-ai-meta {
  font-size: 12px;
  opacity: 0.72;
  line-height: 1.4;
}

.script-ai-history {
  min-height: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.script-ai-history-inner {
  padding: 8px;
}

.script-ai-empty {
  font-size: 12px;
  opacity: 0.65;
}

.script-ai-message {
  margin-bottom: 8px;
  border-radius: 4px;
  padding: 6px 8px;
}

.script-ai-message.is-user {
  background: rgba(45, 140, 240, 0.12);
}

.script-ai-message.is-assistant {
  background: rgba(24, 160, 88, 0.12);
}

.script-ai-message.is-system {
  background: rgba(250, 173, 20, 0.12);
}

.script-ai-role {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 2px;
}

.script-ai-content {
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.script-ai-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.script-ai-actions .action-generate {
  grid-column: 1 / -1;
}

.script-ai-bottom {
  border-top: 1px solid var(--n-border-color);
  padding-top: 10px;
  display: grid;
  gap: 8px;
}

.script-ai-status {
  display: grid;
  gap: 8px;
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
    grid-template-columns: minmax(0, 1fr) 320px;
  }

  .script-ai-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .script-ai-actions .action-generate {
    grid-column: auto;
  }
}
</style>
