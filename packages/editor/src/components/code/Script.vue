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
          <summary>模型配置</summary>
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
            <n-input v-model:value="aiConfig.provider" size="small" placeholder="provider: openai/openai-compatible" />
            <n-input v-model:value="aiConfig.endpoint" size="small" placeholder="endpoint: https://.../v1/chat/completions" />
            <n-input v-model:value="aiConfig.model" size="small" placeholder="model: gpt-4o-mini / MiniMax-M2.7 / ..." />
            <n-input v-model:value="aiConfig.apiKey" size="small" placeholder="api key（仅本地存储）" type="password" show-password-on="click" />
            <div class="script-ai-config-row">
              <n-input-number v-model:value="aiConfig.timeoutMs" size="small" :min="5000" :max="300000" :step="5000" placeholder="timeout(ms)" />
              <n-input-number v-model:value="aiConfig.temperature" size="small" :min="0" :max="1" :step="0.1" placeholder="temperature" />
            </div>
            <div class="script-ai-config-tip">配置仅保存在当前浏览器 localStorage，不会自动写入后端配置文件。</div>
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
import { fetchAiScriptStatus, fetchGenerateScript } from "@/http/api/ai";

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
    provider: string;
    endpoint: string;
    model: string;
    apiKey: string;
    timeoutMs: number;
    temperature: number;
  };
};

const AI_PROFILE_STORAGE_KEY = "editor.ai.script.profiles.v1";
const AI_PROFILE_SELECTED_KEY = "editor.ai.script.profile.selected.v1";

const BUILTIN_AI_PROFILES: AiProfile[] = [
  {
    id: "server-default",
    name: "服务端默认",
    config: {
      provider: "",
      endpoint: "",
      model: "",
      apiKey: "",
      timeoutMs: 90000,
      temperature: 0.2,
    },
  },
  {
    id: "openai-default",
    name: "OpenAI 官方",
    config: {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      apiKey: "",
      timeoutMs: 90000,
      temperature: 0.2,
    },
  },
  {
    id: "minimax-compat",
    name: "MiniMax (compat)",
    config: {
      provider: "openai-compatible",
      endpoint: "https://api.minimaxi.com/v1/chat/completions",
      model: "MiniMax-M2.7",
      apiKey: "",
      timeoutMs: 90000,
      temperature: 0.2,
    },
  },
  {
    id: "deepseek-compat",
    name: "DeepSeek (compat)",
    config: {
      provider: "openai-compatible",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      model: "deepseek-chat",
      apiKey: "",
      timeoutMs: 90000,
      temperature: 0.2,
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
const aiProvider = ref("unknown");
const aiModel = ref("");
const aiStatusMessage = ref("正在获取 AI 状态...");
const aiThinking = ref("");
const customProfiles = ref<AiProfile[]>([]);
const selectedProfileId = ref("server-default");
const customProfileName = ref("");
const aiConfig = reactive({
  provider: "",
  endpoint: "",
  model: "",
  apiKey: "",
  timeoutMs: 90000,
  temperature: 0.2,
});

const isAiDiffMode = computed(() => {
  return mode.value === "javascript" && aiDiffPending.value && !!aiGeneratedSource.value;
});

const isUsingLocalOverride = computed(() => selectedProfileId.value !== "server-default");

const aiGenerateButtonText = computed(() => {
  if (isUsingLocalOverride.value) return "AI 生成（本地配置）";
  return "AI 生成";
});

const aiStatusText = computed(() => {
  const modelSuffix = aiModel.value ? ` / ${aiModel.value}` : "";
  const profile = selectedProfile.value ? `配置：${selectedProfile.value.name}。` : "";
  const overrideSuffix = isUsingLocalOverride.value ? "已启用请求级覆盖。 " : "";
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
  aiProvider.value = "unknown";
  aiModel.value = "";
  aiStatusMessage.value = "正在获取 AI 状态...";
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
          provider: String(item.config.provider || ""),
          endpoint: String(item.config.endpoint || ""),
          model: String(item.config.model || ""),
          apiKey: String(item.config.apiKey || ""),
          timeoutMs: Number(item.config.timeoutMs || 90000),
          temperature: Number(item.config.temperature ?? 0.2),
        },
      }));
  } catch {
    customProfiles.value = [];
  }
}

function estimateProviderFromLocalConfig() {
  const provider = (aiConfig.provider || "").trim();
  const hasKey = !!(aiConfig.apiKey || "").trim();
  if ((provider === "openai" || provider === "openai-compatible") && hasKey) {
    return "live";
  }
  return provider || "unknown";
}

function resolveProviderLabel(provider: string) {
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
  aiConfig.provider = target.config.provider || "";
  aiConfig.endpoint = target.config.endpoint || "";
  aiConfig.model = target.config.model || "";
  aiConfig.apiKey = target.config.apiKey || "";
  aiConfig.timeoutMs = Math.min(300000, Math.max(5000, Number(target.config.timeoutMs || 90000)));
  aiConfig.temperature = Math.min(1, Math.max(0, Number(target.config.temperature ?? 0.2)));
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
    aiStatusMessage.value = "使用服务端默认配置。";
  } else {
    aiProvider.value = estimateProviderFromLocalConfig();
    aiModel.value = aiConfig.model || aiModel.value;
    aiStatusMessage.value = "已切换到本地覆盖配置。";
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
      provider: aiConfig.provider.trim(),
      endpoint: aiConfig.endpoint.trim(),
      model: aiConfig.model.trim(),
      apiKey: aiConfig.apiKey.trim(),
      timeoutMs: Math.min(300000, Math.max(5000, Number(aiConfig.timeoutMs || 90000))),
      temperature: Math.min(1, Math.max(0, Number(aiConfig.temperature ?? 0.2))),
    };
    selectedProfileId.value = existing.id;
  } else {
    const id = `custom-${Date.now()}`;
    customProfiles.value.push({
      id,
      name,
      custom: true,
      config: {
        provider: aiConfig.provider.trim(),
        endpoint: aiConfig.endpoint.trim(),
        model: aiConfig.model.trim(),
        apiKey: aiConfig.apiKey.trim(),
        timeoutMs: Math.min(300000, Math.max(5000, Number(aiConfig.timeoutMs || 90000))),
        temperature: Math.min(1, Math.max(0, Number(aiConfig.temperature ?? 0.2))),
      },
    });
    selectedProfileId.value = id;
  }

  saveCustomProfilesToStorage();
  window.$message?.success("已保存到本地 AI 配置");
}

function deleteSelectedCustomProfile() {
  if (!isSelectedProfileCustom.value) return;
  customProfiles.value = customProfiles.value.filter((profile) => profile.id !== selectedProfileId.value);
  saveCustomProfilesToStorage();
  selectedProfileId.value = "server-default";
  applyProfileToConfig(BUILTIN_AI_PROFILES[0]);
  customProfileName.value = "";
  window.$message?.success("已删除本地 AI 配置");
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

function buildRuntimeOverridePayload() {
  if (!isUsingLocalOverride.value) return {};

  const provider = (aiConfig.provider || "").trim();
  const endpoint = (aiConfig.endpoint || "").trim();
  const model = (aiConfig.model || "").trim();
  const apiKey = (aiConfig.apiKey || "").trim();
  const timeoutMs = Math.min(300000, Math.max(5000, Number(aiConfig.timeoutMs || 90000)));
  const temperature = Math.min(1, Math.max(0, Number(aiConfig.temperature ?? 0.2)));

  if (!provider) {
    throw new Error("本地配置缺少 provider");
  }
  const isLiveProvider = provider === "openai" || provider === "openai-compatible";
  if (isLiveProvider) {
    if (!endpoint) throw new Error("本地配置缺少 endpoint");
    if (!model) throw new Error("本地配置缺少 model");
    if (!apiKey) throw new Error("本地配置缺少 apiKey");
  }

  return {
    provider,
    endpoint,
    model,
    apiKey,
    timeoutMs,
    temperature,
  };
}

async function loadAiStatus() {
  try {
    const res = await fetchAiScriptStatus();
    if (res.error !== null || !res.data) {
      aiProvider.value = isUsingLocalOverride.value ? estimateProviderFromLocalConfig() : "unknown";
      aiStatusMessage.value = isUsingLocalOverride.value
        ? "服务端状态获取失败，当前使用本地覆盖配置。"
        : (res.error?.msg || "状态获取失败。");
      return;
    }

    aiProvider.value = isUsingLocalOverride.value ? estimateProviderFromLocalConfig() : (res.data.provider || "unknown");
    aiModel.value = res.data.model || "";
    aiStatusMessage.value = isUsingLocalOverride.value
      ? "当前使用本地覆盖配置，请以实际生成结果为准。"
      : (res.data.message || "状态已更新。");
  } catch (error) {
    aiProvider.value = isUsingLocalOverride.value ? estimateProviderFromLocalConfig() : "unknown";
    aiStatusMessage.value = isUsingLocalOverride.value
      ? "服务端状态获取异常，当前使用本地覆盖配置。"
      : (error instanceof Error ? error.message : "状态获取异常。");
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
  aiThinking.value = "";
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
      ...buildRuntimeOverridePayload(),
    };

    const res = await fetchGenerateScript(requestPayload);

    if (res.error !== null || !res.data?.source) {
      aiError.value = res.error?.msg || "AI 返回为空";
      pushAiMessage("system", aiError.value);
      return;
    }

    const recovered = recoverSourceEnvelope(res.data.source);
    const recoveredSource = (recovered.source || "").trim();
    if (!recoveredSource) {
      aiError.value = "AI 返回的代码内容为空";
      pushAiMessage("system", aiError.value);
      return;
    }

    aiBaseSource.value = script.source;
    aiGeneratedSource.value = recoveredSource;
    aiDiffPending.value = true;
    aiProvider.value = res.data.provider || aiProvider.value || "unknown";
    aiModel.value = res.data.model || aiModel.value;
    const mergedThinking = [res.data.thinking || "", recovered.thinking || ""].filter(Boolean).join("\n\n").trim();
    aiThinking.value = normalizeThinking(mergedThinking);

    const mergedWarnings = [...(res.data.warnings || []), ...(recovered.warnings || [])].filter(Boolean);
    const explanation = recovered.explanation || res.data.explanation;
    pushAiMessage("assistant", explanation || "已生成代码预览，请确认后应用。");
    if (aiThinking.value) {
      pushAiMessage("system", "已捕获模型深度思考，可在上方“深度思考”面板查看。");
    }
    mergedWarnings.forEach((warning) => pushAiMessage("system", warning));
    aiStatusMessage.value = "AI 生成成功。";
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
