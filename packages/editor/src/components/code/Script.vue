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
        <details class="script-ai-config">
          <summary>流式模型配置</summary>
          <div class="script-ai-config-body">
            <n-select
              :value="selectedProfileId"
              :options="profileOptions"
              size="small"
              placeholder="选择 AI 预设"
              @update:value="onProfileChange"
            />
            <div class="script-ai-config-row">
              <n-input
                v-model:value="customProfileName"
                size="small"
                placeholder="本地配置名称"
              />
              <n-button size="small" @click="saveCurrentAsCustomProfile">保存本地</n-button>
              <n-button size="small" type="warning" :disabled="!isSelectedProfileCustom" @click="deleteSelectedCustomProfile">删除</n-button>
            </div>
            <n-input v-model:value="aiConfig.model" size="small" placeholder="model: 留空使用服务端默认" />
            <div class="script-ai-config-row">
              <n-select v-model:value="aiConfig.thinkingType" :options="thinkingTypeOptions" size="small" />
              <n-select
                v-model:value="aiConfig.reasoningEffort"
                :options="reasoningEffortOptions"
                size="small"
                :disabled="aiConfig.thinkingType === 'disabled'"
              />
            </div>
            <div class="script-ai-config-tip">使用 astral-llm-service 已有 `/chat/stream` 接口；API Key、baseURL 与模型白名单由服务端控制。</div>
          </div>
        </details>
        <details v-if="aiThinking" class="script-ai-thinking">
          <summary>深度思考（可折叠）</summary>
          <pre class="script-ai-thinking-content">{{ aiThinking }}</pre>
        </details>

        <n-scrollbar class="script-ai-history">
          <div class="script-ai-history-inner">
            <div v-if="!aiMessages.length" class="script-ai-empty">
              输入需求后点击“AI 生成”，将进入代码 Diff 预览。
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
import { fetchAiChatStream } from "@/http/api/ai";

type AiMessageRole = "user" | "assistant" | "system";
type AiMessage = {
  role: AiMessageRole;
  content: string;
};

type AiProfile = {
  id: string;
  name: string;
  custom?: boolean;
  config: {
    model: string;
    thinkingType: "enabled" | "disabled";
    reasoningEffort: "high" | "max";
  };
};

const AI_PROFILE_STORAGE_KEY = "editor.ai.script.profiles.v1";
const AI_PROFILE_SELECTED_KEY = "editor.ai.script.profile.selected.v1";

const BUILTIN_AI_PROFILES: AiProfile[] = [
  {
    id: "server-default",
    name: "服务端默认",
    config: {
      model: "",
      thinkingType: "enabled",
      reasoningEffort: "high",
    },
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    config: {
      model: "deepseek-v4-pro",
      thinkingType: "enabled",
      reasoningEffort: "high",
    },
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    config: {
      model: "deepseek-v4-flash",
      thinkingType: "disabled",
      reasoningEffort: "high",
    },
  },
];

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
const aiProvider = ref("stream");
const aiModel = ref("");
const aiStatusMessage = ref("使用 astral-llm-service /chat/stream 流式生成。");
const aiThinking = ref("");
const customProfiles = ref<AiProfile[]>([]);
const selectedProfileId = ref("server-default");
const customProfileName = ref("");
const aiConfig = reactive({
  model: "",
  thinkingType: "enabled" as "enabled" | "disabled",
  reasoningEffort: "high" as "high" | "max",
});

const thinkingTypeOptions = [
  { label: "开启深度思考", value: "enabled" },
  { label: "关闭深度思考", value: "disabled" },
];

const reasoningEffortOptions = [
  { label: "high", value: "high" },
  { label: "max", value: "max" },
];

const isAiDiffMode = computed(() => {
  return mode.value === "javascript" && aiDiffPending.value && !!aiGeneratedSource.value;
});

const isUsingLocalOverride = computed(() => selectedProfileId.value !== "server-default");

const aiGenerateButtonText = computed(() => {
  if (isUsingLocalOverride.value) return "AI 生成（流式/本地预设）";
  return "AI 生成（流式）";
});

const aiStatusText = computed(() => {
  const modelSuffix = aiModel.value ? ` / ${aiModel.value}` : "";
  const profile = selectedProfile.value ? `配置：${selectedProfile.value.name}。` : "";
  const overrideSuffix = isUsingLocalOverride.value ? "已启用请求级模型参数。 " : "";
  return `${profile}${overrideSuffix}模式：${resolveProviderLabel(aiProvider.value)}${modelSuffix}。${aiStatusMessage.value}`;
});

const allProfiles = computed(() => {
  return [...BUILTIN_AI_PROFILES, ...customProfiles.value];
});

const profileOptions = computed(() => {
  return allProfiles.value.map((profile) => ({
    label: profile.name,
    value: profile.id,
  }));
});

const selectedProfile = computed(() => {
  return allProfiles.value.find((profile) => profile.id === selectedProfileId.value) || BUILTIN_AI_PROFILES[0];
});

const isSelectedProfileCustom = computed(() => {
  return !!selectedProfile.value?.custom;
});

let currentScript: IScript.IStruct | string | null = null;
let currentObject: THREE.Mesh | null = null;

onMounted(() => {
  loadCustomProfilesFromStorage();
  let initialProfileId = "server-default";
  try {
    const stored = localStorage.getItem(AI_PROFILE_SELECTED_KEY);
    if (stored) {
      initialProfileId = stored;
    }
  } catch {
    // ignore
  }
  if (!allProfiles.value.find((profile) => profile.id === initialProfileId)) {
    initialProfileId = "server-default";
  }
  onProfileChange(initialProfileId);

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
  aiProvider.value = "stream";
  aiModel.value = "";
  aiStatusMessage.value = "使用 astral-llm-service /chat/stream 流式生成。";
  aiThinking.value = "";
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

function loadCustomProfilesFromStorage() {
  try {
    const raw = localStorage.getItem(AI_PROFILE_STORAGE_KEY);
    if (!raw) {
      customProfiles.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      customProfiles.value = [];
      return;
    }
    customProfiles.value = parsed
      .filter((item) => item && typeof item === "object" && item.id && item.name && item.config)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        custom: true,
        config: {
          model: String(item.config.model || ""),
          thinkingType: item.config.thinkingType === "disabled" ? "disabled" : "enabled",
          reasoningEffort: item.config.reasoningEffort === "max" ? "max" : "high",
        },
      }));
  } catch {
    customProfiles.value = [];
  }
}

function estimateProviderFromLocalConfig() {
  return "stream";
}

function resolveProviderLabel(provider: string) {
  if (provider === "stream") return "LLM 流式接口";
  if (provider === "live") return "真实模型";
  if (provider === "openai" || provider === "openai-compatible") return provider;
  if (!provider || provider === "unknown") return "未就绪";
  return provider;
}

function saveCustomProfilesToStorage() {
  try {
    localStorage.setItem(AI_PROFILE_STORAGE_KEY, JSON.stringify(customProfiles.value));
  } catch {
    window.$message?.warning("本地存储失败，无法保存自定义 AI 配置。");
  }
}

function applyProfileToConfig(profile?: AiProfile) {
  const target = profile || BUILTIN_AI_PROFILES[0];
  aiConfig.model = target.config.model || "";
  aiConfig.thinkingType = target.config.thinkingType || "enabled";
  aiConfig.reasoningEffort = target.config.reasoningEffort || "high";
}

function onProfileChange(profileId: string) {
  selectedProfileId.value = profileId;
  try {
    localStorage.setItem(AI_PROFILE_SELECTED_KEY, profileId);
  } catch {
    // ignore
  }
  const profile = allProfiles.value.find((item) => item.id === profileId);
  applyProfileToConfig(profile);
  customProfileName.value = profile?.custom ? profile.name : "";
  if (profileId === "server-default") {
    aiProvider.value = "stream";
    aiModel.value = "";
    aiStatusMessage.value = "使用服务端默认流式模型配置。";
  } else {
    aiProvider.value = estimateProviderFromLocalConfig();
    aiModel.value = aiConfig.model || aiModel.value;
    aiStatusMessage.value = "已切换到本地模型参数。";
  }
}

function saveCurrentAsCustomProfile() {
  const name = customProfileName.value.trim();
  if (!name) {
    window.$message?.warning("请输入本地配置名称");
    return;
  }

  const existing = customProfiles.value.find((profile) => profile.name === name || profile.id === selectedProfileId.value);
  if (existing) {
    existing.name = name;
    existing.custom = true;
    existing.config = {
      model: aiConfig.model.trim(),
      thinkingType: aiConfig.thinkingType,
      reasoningEffort: aiConfig.reasoningEffort,
    };
    selectedProfileId.value = existing.id;
  } else {
    const id = `custom-${Date.now()}`;
    customProfiles.value.push({
      id,
      name,
      custom: true,
      config: {
        model: aiConfig.model.trim(),
        thinkingType: aiConfig.thinkingType,
        reasoningEffort: aiConfig.reasoningEffort,
      },
    });
    selectedProfileId.value = id;
  }

  saveCustomProfilesToStorage();
  window.$message?.success("已保存到本地 AI 模型参数");
}

function deleteSelectedCustomProfile() {
  if (!isSelectedProfileCustom.value) return;
  customProfiles.value = customProfiles.value.filter((profile) => profile.id !== selectedProfileId.value);
  saveCustomProfilesToStorage();
  selectedProfileId.value = "server-default";
  applyProfileToConfig(BUILTIN_AI_PROFILES[0]);
  customProfileName.value = "";
  window.$message?.success("已删除本地 AI 模型参数");
}

function normalizeThinking(text?: string) {
  const normalized = text?.trim() || "";
  if (!normalized) return "";
  const maxLength = 12000;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n\n...（思考内容过长，已截断）`;
}

function stripCodeFenceText(text: string) {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;

  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0) {
    return trimmed.replace(/```/g, "").trim();
  }
  const lastFence = trimmed.lastIndexOf("```");
  if (lastFence <= firstLineEnd) {
    return trimmed.slice(firstLineEnd + 1).trim();
  }
  return trimmed.slice(firstLineEnd + 1, lastFence).trim();
}

function tryParseObject(text: string): Record<string, any> | null {
  const normalized = stripCodeFenceText(text);
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return null;
  } catch {
    return null;
  }
}

function recoverSourceEnvelope(rawSource: string) {
  let source = rawSource || "";
  let thinking = "";
  let explanation = "";
  let warnings: string[] = [];

  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  source = source.replace(thinkRegex, (_, block: string) => {
    const text = (block || "").trim();
    if (text) {
      thinking = thinking ? `${thinking}\n\n${text}` : text;
    }
    return "";
  }).trim();

  const directObj = tryParseObject(source);
  if (directObj && typeof directObj.source === "string") {
    source = directObj.source;
    explanation = typeof directObj.explanation === "string" ? directObj.explanation : "";
    warnings = Array.isArray(directObj.warnings) ? directObj.warnings.filter((v) => typeof v === "string") : [];
    if (typeof directObj.thinking === "string" && directObj.thinking.trim()) {
      thinking = thinking ? `${thinking}\n\n${directObj.thinking.trim()}` : directObj.thinking.trim();
    }
    return { source, thinking, explanation, warnings };
  }

  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === "string") {
      const nestedObj = tryParseObject(parsed);
      if (nestedObj && typeof nestedObj.source === "string") {
        source = nestedObj.source;
        explanation = typeof nestedObj.explanation === "string" ? nestedObj.explanation : "";
        warnings = Array.isArray(nestedObj.warnings) ? nestedObj.warnings.filter((v) => typeof v === "string") : [];
        if (typeof nestedObj.thinking === "string" && nestedObj.thinking.trim()) {
          thinking = thinking ? `${thinking}\n\n${nestedObj.thinking.trim()}` : nestedObj.thinking.trim();
        }
        return { source, thinking, explanation, warnings };
      }
    }
  } catch {
    // ignore
  }

  const sourceAnchor = source.indexOf("\"source\"");
  if (sourceAnchor >= 0) {
    const start = source.lastIndexOf("{", sourceAnchor);
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const anchored = source.slice(start, end + 1);
      const anchoredObj = tryParseObject(anchored);
      if (anchoredObj && typeof anchoredObj.source === "string") {
        source = anchoredObj.source;
        explanation = typeof anchoredObj.explanation === "string" ? anchoredObj.explanation : "";
        warnings = Array.isArray(anchoredObj.warnings) ? anchoredObj.warnings.filter((v) => typeof v === "string") : [];
        if (typeof anchoredObj.thinking === "string" && anchoredObj.thinking.trim()) {
          thinking = thinking ? `${thinking}\n\n${anchoredObj.thinking.trim()}` : anchoredObj.thinking.trim();
        }
      }
    }
  }

  return { source, thinking, explanation, warnings };
}

function buildStreamModelOptions() {
  if (!isUsingLocalOverride.value) return {};

  const model = aiConfig.model.trim();
  return {
    ...(model ? { model } : {}),
    thinkingType: aiConfig.thinkingType,
    reasoningEffort: aiConfig.reasoningEffort,
  };
}

function loadAiStatus() {
  aiProvider.value = "stream";
  aiModel.value = isUsingLocalOverride.value ? aiConfig.model : "";
  aiStatusMessage.value = isUsingLocalOverride.value
    ? "使用 /llm-api/chat/stream 流式生成，并传入当前模型参数。"
    : "使用 /llm-api/chat/stream 流式生成，模型参数由 astral-llm-service 默认配置决定。";
}

function escapePromptText(text?: string) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`");
}

function limitPromptText(text?: string, maxLength = 16000) {
  const normalized = String(text || "").replace(/\r/g, "");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n/* ... truncated ... */`;
}

function buildScriptGenerationPrompt(params: {
  sceneId?: string;
  objectId?: string;
  objectName?: string;
  objectType?: string;
  scriptName?: string;
  currentSource?: string;
  requirement: string;
  mode?: string;
}) {
  return `你是 3D 编辑器脚本助手，请按用户需求生成可直接运行的 JavaScript 脚本。

输出要求：
- 必须只输出 JSON 对象，不要 Markdown 代码块，不要额外解释。
- JSON 格式：{"source":"...","explanation":"...","warnings":["..."]}。
- source 必须是完整脚本源码字符串。

运行时约束：
- afterAnimation 签名为 (delta, toBeRender)。
- 键盘事件使用 onKeyDown(event)。
- 可用内置变量：this, THREE, helper, renderer, scene, camera, controls, timer。
- 若包含连续动画，请在 afterAnimation 中调用 toBeRender(true)。
- 不要使用 window/globalThis 保存状态。
- 不要给 this 挂载临时状态（禁止 this.xxx = ...）；this 只表示当前脚本对象。
- 临时状态必须定义为脚本顶层 let/const，例如：let target = null; let axis = null; let speed = 1;
- 不要虚构不存在的 API、生命周期或参数。
- 尽量在 currentSource 基础上最小改动，避免无关重写。

脚本 API 速查：
- 内置方法：render(delta?)
- 生命周期：loaded(); beforeAnimation(delta); afterAnimation(delta,toBeRender); beforeRender(delta); afterRender(delta); beforeDestroy(); afterDestroy();
- 常用事件：onPick/onDoubleClick/onKeyDown/onKeyUp/onPointerDown/onPointerUp/onPointerMove/onTouchStart/onTouchEnd
- helper：new helper.Animation(this); helper.objectByUuid(uuid)

上下文：
- sceneId: ${escapePromptText(params.sceneId)}
- objectId: ${escapePromptText(params.objectId)}
- objectName: ${escapePromptText(params.objectName)}
- objectType: ${escapePromptText(params.objectType)}
- scriptName: ${escapePromptText(params.scriptName)}
- mode: ${escapePromptText(params.mode)}

用户需求：
${escapePromptText(params.requirement)}

当前脚本：
\`\`\`javascript
${limitPromptText(params.currentSource)}
\`\`\``;
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
  aiThinking.value = "";
  pushAiMessage("user", requirement);

  const assistantMessage: AiMessage = { role: "assistant", content: "正在流式生成..." };
  aiMessages.value.push(assistantMessage);

  try {
    const sceneInfo = App.project.getKey("sceneInfo") || {};
    const prompt = buildScriptGenerationPrompt({
      sceneId: sceneInfo.id,
      objectId: currentObject.uuid,
      objectName: currentObject.name,
      objectType: currentObject.type,
      scriptName: script.name,
      currentSource: script.source,
      requirement,
      mode: mode.value,
    });

    let streamedContent = "";
    let streamedReasoning = "";

    const streamResult = await fetchAiChatStream(
      {
        ...buildStreamModelOptions(),
        messages: [{ role: "user", content: prompt }],
      },
      {
        onMeta(meta) {
          aiProvider.value = "stream";
          aiModel.value = meta.model || aiConfig.model || aiModel.value;
          aiStatusMessage.value = "正在接收流式响应...";
        },
        onReasoning(chunk) {
          streamedReasoning += chunk;
          aiThinking.value = normalizeThinking(streamedReasoning);
        },
        onMessage(chunk) {
          streamedContent += chunk;
          assistantMessage.content = `正在生成代码...\n\n${streamedContent.slice(-1600)}`;
        },
      },
    );

    const recovered = recoverSourceEnvelope(streamResult.content || streamedContent);
    const recoveredSource = (recovered.source || "").trim();
    if (!recoveredSource) {
      aiError.value = "AI 返回的代码内容为空";
      assistantMessage.content = aiError.value;
      pushAiMessage("system", "流式响应已结束，但未解析到 source 字段或代码内容。");
      return;
    }

    aiBaseSource.value = script.source;
    aiGeneratedSource.value = recoveredSource;
    aiDiffPending.value = true;
    aiProvider.value = "stream";
    aiModel.value = streamResult.meta?.model || aiConfig.model || aiModel.value;

    const mergedThinking = [streamResult.reasoning || streamedReasoning, recovered.thinking]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    aiThinking.value = normalizeThinking(mergedThinking);

    assistantMessage.content = recovered.explanation || "已生成代码预览，请确认后应用。";
    if (aiThinking.value) {
      pushAiMessage("system", "已捕获模型深度思考，可在上方“深度思考”面板查看。");
    }
    recovered.warnings.filter(Boolean).forEach((warning) => pushAiMessage("system", warning));
    aiStatusMessage.value = "流式生成成功。";
    window.$message?.success("已生成代码差异预览，请确认后应用。");
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : "AI 生成失败";
    assistantMessage.content = aiError.value;
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

.script-ai-thinking {
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.08);
  padding: 6px 8px;
}

.script-ai-config {
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.06);
  padding: 6px 8px;
}

.script-ai-config summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.8;
  user-select: none;
}

.script-ai-config-body {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}

.script-ai-config-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}

.script-ai-config-tip {
  font-size: 11px;
  opacity: 0.65;
  line-height: 1.4;
}

.script-ai-thinking summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.8;
  user-select: none;
}

.script-ai-thinking-content {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  max-height: 180px;
  overflow: auto;
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

  .script-ai-config-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
