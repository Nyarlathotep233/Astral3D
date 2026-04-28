<template>
  <aside class="script-ai-agent-pane">
    <div class="script-ai-agent-header">
      <div class="min-w-0">
        <div class="script-ai-agent-title">AI Code Agent</div>
        <div class="script-ai-agent-subtitle">{{ contextLabel }}</div>
      </div>
      <div class="script-ai-agent-header-actions">
        <n-button size="tiny" quaternary @click="startNewSession">新会话</n-button>
        <n-button size="tiny" quaternary type="warning" @click="clearCurrentSession">清空</n-button>
      </div>
    </div>

    <div class="script-ai-agent-meta">
      <div>{{ aiStatusText }}</div>
      <div>历史按当前场景 / 对象 / 脚本保存在浏览器本地。</div>
    </div>

    <details class="script-ai-agent-config">
      <summary>模型配置</summary>
      <div class="script-ai-agent-config-body">
        <n-select
          :value="selectedProfileId"
          :options="profileOptions"
          size="small"
          placeholder="选择 AI 预设"
          @update:value="onProfileChange"
        />
        <div class="script-ai-agent-config-row">
          <n-input v-model:value="customProfileName" size="small" placeholder="本地配置名称" />
          <n-button size="small" @click="saveCurrentAsCustomProfile">保存本地</n-button>
          <n-button size="small" type="warning" :disabled="!isSelectedProfileCustom" @click="deleteSelectedCustomProfile">删除</n-button>
        </div>
        <n-input v-model:value="aiConfig.model" size="small" placeholder="model: 留空使用服务端默认" />
        <div class="script-ai-agent-config-row is-two">
          <n-select v-model:value="aiConfig.thinkingType" :options="thinkingTypeOptions" size="small" />
          <n-select
            v-model:value="aiConfig.reasoningEffort"
            :options="reasoningEffortOptions"
            size="small"
            :disabled="aiConfig.thinkingType === 'disabled'"
          />
        </div>
        <div class="script-ai-agent-tip">复用 astral-llm-service 已有 /chat/stream 接口。</div>
      </div>
    </details>

    <details v-if="aiThinking" class="script-ai-agent-thinking">
      <summary>深度思考</summary>
      <pre class="script-ai-agent-thinking-content">{{ aiThinking }}</pre>
    </details>

    <div v-if="pendingCandidate" class="script-ai-agent-card is-candidate">
      <div class="script-ai-agent-card-header">
        <div>
          <div class="script-ai-agent-card-title">当前候选修改</div>
          <div class="script-ai-agent-card-meta">{{ candidateLineSummary }}</div>
        </div>
        <n-tag size="small" type="warning">Diff 待处理</n-tag>
      </div>
      <div v-if="pendingCandidate.explanation" class="script-ai-agent-card-desc">{{ pendingCandidate.explanation }}</div>
      <div v-if="!canApplyPendingCandidate" class="script-ai-agent-warning">
        当前编辑器代码已变化。请放弃候选后重新生成，避免覆盖手动修改。
      </div>
      <div class="script-ai-agent-card-actions">
        <n-button size="small" @click="previewPendingCandidate">查看 Diff</n-button>
        <n-button size="small" type="primary" :disabled="!canApplyPendingCandidate" @click="applyPendingCandidate">应用到编辑器</n-button>
        <n-button size="small" @click="discardPendingCandidate">放弃</n-button>
      </div>
    </div>

    <div v-if="lastAppliedChange" class="script-ai-agent-card is-applied">
      <div class="script-ai-agent-card-header">
        <div>
          <div class="script-ai-agent-card-title">上次 AI 应用</div>
          <div class="script-ai-agent-card-meta">{{ formatTime(lastAppliedChange.createdAt) }}</div>
        </div>
        <n-tag size="small" :type="canUndoLastApply ? 'success' : 'default'">{{ canUndoLastApply ? '可撤回' : '不可撤回' }}</n-tag>
      </div>
      <div v-if="!canUndoLastApply" class="script-ai-agent-warning">当前编辑器代码已被手动修改，不能安全撤回。</div>
      <div class="script-ai-agent-card-actions is-one">
        <n-button size="small" :disabled="!canUndoLastApply" @click="undoLastApply">撤回上次应用</n-button>
      </div>
    </div>

    <n-scrollbar ref="historyRef" class="script-ai-agent-history">
      <div class="script-ai-agent-history-inner">
        <div v-if="!aiMessages.length" class="script-ai-agent-empty">
          像 code agent 一样直接描述需求。生成完成后会先进入 Diff 预览，不会自动保存脚本。
        </div>
        <div
          v-for="msg in aiMessages"
          :key="msg.id"
          class="script-ai-agent-message"
          :class="`is-${msg.role}`"
        >
          <div class="script-ai-agent-message-head">
            <span>{{ getRoleLabel(msg.role) }}</span>
            <span>{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div class="script-ai-agent-message-content">{{ msg.content }}</div>
        </div>
      </div>
    </n-scrollbar>

    <div class="script-ai-agent-bottom">
      <n-input
        v-model:value="aiRequirement"
        type="textarea"
        placeholder="描述你希望脚本做什么；支持多轮追问。Ctrl+Enter 发送。"
        :autosize="{ minRows: 3, maxRows: 7 }"
        :disabled="aiLoading"
        @keydown.ctrl.enter.prevent="generateWithAi"
      />
      <div class="script-ai-agent-actions">
        <n-button size="small" type="primary" :loading="aiLoading" :disabled="!canGenerate" @click="generateWithAi">
          {{ aiGenerateButtonText }}
        </n-button>
        <n-button size="small" :disabled="!aiLoading" @click="stopGeneration">停止生成</n-button>
      </div>
      <div class="script-ai-agent-status">
        <n-alert v-if="aiError" title="AI Error" type="error">{{ aiError }}</n-alert>
        <n-alert v-if="aiApplyMessage" title="Agent" type="success">{{ aiApplyMessage }}</n-alert>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { fetchAiChatStream, type IAiChatMessage } from "@/http/api/ai";
import { buildScriptGenerationPrompt, limitPromptText, recoverSourceEnvelope } from "@/components/code/scriptAiPrompt";

type AiAgentMessageRole = "user" | "assistant" | "system" | "action";
type AiAgentMessage = { id: string; role: AiAgentMessageRole; content: string; createdAt: number };
type AiPendingCandidate = { id: string; baseSource: string; source: string; explanation: string; warnings: string[]; createdAt: number };
type AiAppliedChange = { id: string; beforeSource: string; afterSource: string; createdAt: number };
type AiProfile = {
  id: string;
  name: string;
  custom?: boolean;
  config: { model: string; thinkingType: "enabled" | "disabled"; reasoningEffort: "high" | "max" };
};

const props = withDefaults(defineProps<{
  source: string;
  sceneId?: string;
  objectId?: string;
  objectName?: string;
  objectType?: string;
  scriptName?: string;
  mode?: string;
  diffPending?: boolean;
}>(), {
  source: "",
  sceneId: "",
  objectId: "",
  objectName: "",
  objectType: "",
  scriptName: "",
  mode: "javascript",
  diffPending: false,
});

const emit = defineEmits<{
  (e: "preview", payload: { baseSource: string; source: string; candidateId: string }): void;
  (e: "apply", payload: { baseSource: string; source: string; candidateId: string }): void;
  (e: "discard", payload?: { candidateId?: string }): void;
  (e: "undo", payload: { beforeSource: string; afterSource: string; applyId: string }): void;
}>();

const AI_PROFILE_STORAGE_KEY = "editor.ai.script.profiles.v1";
const AI_PROFILE_SELECTED_KEY = "editor.ai.script.profile.selected.v1";
const AI_SESSION_STORAGE_PREFIX = "editor.ai.script.sessions.v1";
const MAX_MESSAGES = 60;
const MAX_LLM_HISTORY_MESSAGES = 8;
const MAX_STORED_MESSAGE_CHARS = 5000;
const MAX_STORED_CANDIDATE_CHARS = 120000;

const BUILTIN_AI_PROFILES: AiProfile[] = [
  { id: "server-default", name: "服务端默认", config: { model: "", thinkingType: "enabled", reasoningEffort: "high" } },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", config: { model: "deepseek-v4-pro", thinkingType: "enabled", reasoningEffort: "high" } },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", config: { model: "deepseek-v4-flash", thinkingType: "disabled", reasoningEffort: "high" } },
];

const historyRef = ref<any>();
const aiRequirement = ref("");
const aiLoading = ref(false);
const aiError = ref("");
const aiApplyMessage = ref("");
const aiMessages = ref<AiAgentMessage[]>([]);
const pendingCandidate = ref<AiPendingCandidate | null>(null);
const lastAppliedChange = ref<AiAppliedChange | null>(null);
const aiProvider = ref("stream");
const aiModel = ref("");
const aiStatusMessage = ref("使用 astral-llm-service /chat/stream 流式生成。");
const aiThinking = ref("");
const sessionId = ref(createId("session"));
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

let activeController: AbortController | null = null;
let mounted = false;

const sessionStorageKey = computed(() => {
  const raw = [props.sceneId || "local-scene", props.objectId || "unknown-object", props.scriptName || "unnamed-script"].join("|");
  return `${AI_SESSION_STORAGE_PREFIX}:${encodeURIComponent(raw)}`;
});
const contextLabel = computed(() => `${props.objectName || props.objectId || "未命名对象"} / ${props.scriptName || "未命名脚本"}`);
const allProfiles = computed(() => [...BUILTIN_AI_PROFILES, ...customProfiles.value]);
const profileOptions = computed(() => allProfiles.value.map((profile) => ({ label: profile.name, value: profile.id })));
const selectedProfile = computed(() => allProfiles.value.find((profile) => profile.id === selectedProfileId.value) || BUILTIN_AI_PROFILES[0]);
const isSelectedProfileCustom = computed(() => !!selectedProfile.value?.custom);
const isUsingLocalOverride = computed(() => selectedProfileId.value !== "server-default");
const aiGenerateButtonText = computed(() => isUsingLocalOverride.value ? "发送给 Agent（本地预设）" : "发送给 Agent");
const aiStatusText = computed(() => {
  const modelSuffix = aiModel.value ? ` / ${aiModel.value}` : "";
  const profile = selectedProfile.value ? `配置：${selectedProfile.value.name}。` : "";
  const overrideSuffix = isUsingLocalOverride.value ? "已启用请求级模型参数。 " : "";
  return `${profile}${overrideSuffix}模式：${resolveProviderLabel(aiProvider.value)}${modelSuffix}。${aiStatusMessage.value}`;
});
const canGenerate = computed(() => !aiLoading.value && !!aiRequirement.value.trim() && !pendingCandidate.value && !props.diffPending);
const canApplyPendingCandidate = computed(() => !!pendingCandidate.value && props.source === pendingCandidate.value.baseSource);
const canUndoLastApply = computed(() => !!lastAppliedChange.value && !props.diffPending && props.source === lastAppliedChange.value.afterSource);
const candidateLineSummary = computed(() => {
  if (!pendingCandidate.value) return "";
  return `${formatTime(pendingCandidate.value.createdAt)} · ${countLines(pendingCandidate.value.baseSource)} 行 → ${countLines(pendingCandidate.value.source)} 行`;
});

onMounted(() => {
  mounted = true;
  initializeProfiles();
  loadSessionFromStorage();
});
onBeforeUnmount(() => {
  mounted = false;
  abortActiveStream();
});
watch(sessionStorageKey, () => {
  if (!mounted) return;
  abortActiveStream();
  loadSessionFromStorage();
});

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function formatTime(value?: number) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function countLines(text: string) {
  return text ? text.split(/\r?\n/).length : 0;
}
function resolveProviderLabel(provider: string) {
  if (provider === "stream") return "LLM 流式接口";
  if (!provider || provider === "unknown") return "未就绪";
  return provider;
}
function getRoleLabel(role: AiAgentMessageRole) {
  if (role === "user") return "你";
  if (role === "assistant") return "Agent";
  if (role === "action") return "操作";
  return "系统";
}
function normalizeThinking(text?: string) {
  const normalized = text?.trim() || "";
  if (!normalized) return "";
  return normalized.length <= 12000 ? normalized : `${normalized.slice(0, 12000)}\n\n...（思考内容过长，已截断）`;
}
function limitText(text?: string, maxLength = MAX_STORED_MESSAGE_CHARS) {
  const normalized = String(text || "");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}\n...（内容过长，已截断）`;
}
function pushAiMessage(role: AiAgentMessageRole, content: string, options: { save?: boolean } = {}) {
  const text = content?.trim();
  if (!text) return null;
  const message: AiAgentMessage = { id: createId(role), role, content: text, createdAt: Date.now() };
  aiMessages.value.push(message);
  if (aiMessages.value.length > MAX_MESSAGES) aiMessages.value.splice(0, aiMessages.value.length - MAX_MESSAGES);
  void nextTick(() => historyRef.value?.scrollTo?.({ top: Number.MAX_SAFE_INTEGER }));
  if (options.save) saveSessionToStorage();
  return message;
}

function initializeProfiles() {
  loadCustomProfilesFromStorage();
  let initialProfileId = "server-default";
  try {
    initialProfileId = localStorage.getItem(AI_PROFILE_SELECTED_KEY) || initialProfileId;
  } catch {
    // ignore
  }
  if (!allProfiles.value.find((profile) => profile.id === initialProfileId)) initialProfileId = "server-default";
  onProfileChange(initialProfileId);
}
function loadCustomProfilesFromStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_PROFILE_STORAGE_KEY) || "[]");
    customProfiles.value = Array.isArray(parsed) ? parsed
      .filter((item) => item?.id && item?.name && item?.config)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        custom: true,
        config: {
          model: String(item.config.model || ""),
          thinkingType: item.config.thinkingType === "disabled" ? "disabled" : "enabled",
          reasoningEffort: item.config.reasoningEffort === "max" ? "max" : "high",
        },
      })) : [];
  } catch {
    customProfiles.value = [];
  }
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
  aiProvider.value = "stream";
  aiModel.value = profileId === "server-default" ? "" : aiConfig.model || aiModel.value;
  aiStatusMessage.value = profileId === "server-default" ? "使用服务端默认流式模型配置。" : "已切换到本地模型参数。";
}
function saveCurrentAsCustomProfile() {
  const name = customProfileName.value.trim();
  if (!name) {
    window.$message?.warning("请输入本地配置名称");
    return;
  }
  const config = { model: aiConfig.model.trim(), thinkingType: aiConfig.thinkingType, reasoningEffort: aiConfig.reasoningEffort };
  const existing = customProfiles.value.find((profile) => profile.name === name || profile.id === selectedProfileId.value);
  if (existing) {
    existing.name = name;
    existing.custom = true;
    existing.config = config;
    selectedProfileId.value = existing.id;
  } else {
    selectedProfileId.value = `custom-${Date.now()}`;
    customProfiles.value.push({ id: selectedProfileId.value, name, custom: true, config });
  }
  saveCustomProfilesToStorage();
  try {
    localStorage.setItem(AI_PROFILE_SELECTED_KEY, selectedProfileId.value);
  } catch {
    // ignore
  }
  window.$message?.success("已保存到本地 AI 模型参数");
}
function deleteSelectedCustomProfile() {
  if (!isSelectedProfileCustom.value) return;
  customProfiles.value = customProfiles.value.filter((profile) => profile.id !== selectedProfileId.value);
  saveCustomProfilesToStorage();
  onProfileChange("server-default");
  customProfileName.value = "";
  window.$message?.success("已删除本地 AI 模型参数");
}
function buildStreamModelOptions() {
  if (!isUsingLocalOverride.value) return {};
  const model = aiConfig.model.trim();
  return { ...(model ? { model } : {}), thinkingType: aiConfig.thinkingType, reasoningEffort: aiConfig.reasoningEffort };
}

function loadSessionFromStorage() {
  aiRequirement.value = "";
  aiError.value = "";
  aiApplyMessage.value = "";
  aiThinking.value = "";
  aiMessages.value = [];
  pendingCandidate.value = null;
  lastAppliedChange.value = null;
  sessionId.value = createId("session");
  emit("discard");
  try {
    const parsed = JSON.parse(localStorage.getItem(sessionStorageKey.value) || "null");
    if (!parsed || typeof parsed !== "object") {
      aiStatusMessage.value = "当前脚本暂无本地会话。";
      return;
    }
    sessionId.value = String(parsed.sessionId || createId("session"));
    aiMessages.value = sanitizeMessages(parsed.messages);
    pendingCandidate.value = sanitizeCandidate(parsed.pendingCandidate);
    lastAppliedChange.value = sanitizeAppliedChange(parsed.lastAppliedChange);
    aiThinking.value = normalizeThinking(parsed.thinking);
    aiStatusMessage.value = "已恢复当前脚本的本地会话。";
    if (pendingCandidate.value) previewPendingCandidate();
    void nextTick(() => historyRef.value?.scrollTo?.({ top: Number.MAX_SAFE_INTEGER }));
  } catch {
    aiStatusMessage.value = "本地会话读取失败，已使用空会话。";
  }
}
function saveSessionToStorage() {
  const candidate = pendingCandidate.value;
  const safeCandidate = candidate && candidate.baseSource.length + candidate.source.length <= MAX_STORED_CANDIDATE_CHARS ? candidate : null;
  try {
    localStorage.setItem(sessionStorageKey.value, JSON.stringify({
      version: 1,
      sessionId: sessionId.value,
      updatedAt: Date.now(),
      messages: aiMessages.value.slice(-MAX_MESSAGES).map((message) => ({ ...message, content: limitText(message.content) })),
      pendingCandidate: safeCandidate,
      lastAppliedChange: lastAppliedChange.value,
      thinking: normalizeThinking(aiThinking.value),
    }));
  } catch {
    window.$message?.warning("本地存储空间不足，AI 会话未能完整保存。");
  }
}
function sanitizeMessages(rawMessages: any): AiAgentMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages
    .filter((item) => item && ["user", "assistant", "system", "action"].includes(item.role) && typeof item.content === "string" && item.content.trim())
    .map((item) => ({ id: String(item.id || createId(item.role)), role: item.role as AiAgentMessageRole, content: limitText(item.content), createdAt: Number(item.createdAt) || Date.now() }))
    .slice(-MAX_MESSAGES);
}
function sanitizeCandidate(rawCandidate: any): AiPendingCandidate | null {
  if (!rawCandidate || typeof rawCandidate !== "object") return null;
  if (typeof rawCandidate.baseSource !== "string" || typeof rawCandidate.source !== "string") return null;
  if (rawCandidate.baseSource.length + rawCandidate.source.length > MAX_STORED_CANDIDATE_CHARS) return null;
  return {
    id: String(rawCandidate.id || createId("candidate")),
    baseSource: rawCandidate.baseSource,
    source: rawCandidate.source,
    explanation: String(rawCandidate.explanation || ""),
    warnings: Array.isArray(rawCandidate.warnings) ? rawCandidate.warnings.filter((warning: unknown) => typeof warning === "string") : [],
    createdAt: Number(rawCandidate.createdAt) || Date.now(),
  };
}
function sanitizeAppliedChange(rawChange: any): AiAppliedChange | null {
  if (!rawChange || typeof rawChange !== "object") return null;
  if (typeof rawChange.beforeSource !== "string" || typeof rawChange.afterSource !== "string") return null;
  return { id: String(rawChange.id || createId("apply")), beforeSource: rawChange.beforeSource, afterSource: rawChange.afterSource, createdAt: Number(rawChange.createdAt) || Date.now() };
}
function startNewSession() {
  abortActiveStream();
  sessionId.value = createId("session");
  aiRequirement.value = "";
  aiError.value = "";
  aiApplyMessage.value = "已开始新的本地会话。";
  aiThinking.value = "";
  aiMessages.value = [];
  pendingCandidate.value = null;
  lastAppliedChange.value = null;
  emit("discard");
  pushAiMessage("action", "已开始新的本地会话。", { save: true });
}
function clearCurrentSession() {
  if (!window.confirm("确定清空当前脚本的本地 AI 聊天记录和候选修改吗？")) return;
  abortActiveStream();
  aiRequirement.value = "";
  aiError.value = "";
  aiApplyMessage.value = "已清空当前脚本的本地会话。";
  aiThinking.value = "";
  aiMessages.value = [];
  pendingCandidate.value = null;
  lastAppliedChange.value = null;
  sessionId.value = createId("session");
  emit("discard");
  try {
    localStorage.removeItem(sessionStorageKey.value);
  } catch {
    // ignore
  }
}

function buildLlmHistoryMessages(): IAiChatMessage[] {
  return aiMessages.value
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_LLM_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role as "user" | "assistant", content: limitPromptText(message.content, 3000) }));
}
async function generateWithAi() {
  if (props.mode !== "javascript") return;
  const requirement = aiRequirement.value.trim();
  if (!requirement) {
    aiError.value = "请输入需求后再发送";
    return;
  }
  if (pendingCandidate.value || props.diffPending) {
    aiError.value = "当前有未处理的 Diff 候选，请先应用或放弃。";
    return;
  }

  const requestSessionKey = sessionStorageKey.value;
  const history = buildLlmHistoryMessages();
  aiLoading.value = true;
  aiError.value = "";
  aiApplyMessage.value = "";
  aiThinking.value = "";
  aiStatusMessage.value = "正在请求模型...";
  activeController = new AbortController();
  pushAiMessage("user", requirement);
  const assistantMessage = pushAiMessage("assistant", "正在流式生成...");

  try {
    const prompt = buildScriptGenerationPrompt({
      sceneId: props.sceneId,
      objectId: props.objectId,
      objectName: props.objectName,
      objectType: props.objectType,
      scriptName: props.scriptName,
      currentSource: props.source,
      requirement,
      mode: props.mode,
    });
    let streamedContent = "";
    let streamedReasoning = "";
    const streamResult = await fetchAiChatStream(
      { ...buildStreamModelOptions(), messages: [...history, { role: "user", content: prompt }] },
      {
        signal: activeController.signal,
        onMeta(meta) {
          if (requestSessionKey !== sessionStorageKey.value) return;
          aiProvider.value = "stream";
          aiModel.value = meta.model || aiConfig.model || aiModel.value;
          aiStatusMessage.value = "正在接收流式响应...";
        },
        onReasoning(chunk) {
          if (requestSessionKey !== sessionStorageKey.value) return;
          streamedReasoning += chunk;
          aiThinking.value = normalizeThinking(streamedReasoning);
        },
        onMessage(chunk) {
          if (requestSessionKey !== sessionStorageKey.value) return;
          streamedContent += chunk;
          if (assistantMessage) assistantMessage.content = `正在生成代码...\n\n${streamedContent.slice(-1600)}`;
          void nextTick(() => historyRef.value?.scrollTo?.({ top: Number.MAX_SAFE_INTEGER }));
        },
      },
    );
    if (requestSessionKey !== sessionStorageKey.value) return;

    const recovered = recoverSourceEnvelope(streamResult.content || streamedContent);
    const recoveredSource = (recovered.source || "").trim();
    if (!recoveredSource) {
      aiError.value = "AI 返回的代码内容为空";
      if (assistantMessage) assistantMessage.content = aiError.value;
      pushAiMessage("system", "流式响应已结束，但未解析到 source 字段或代码内容。");
      saveSessionToStorage();
      return;
    }

    pendingCandidate.value = {
      id: createId("candidate"),
      baseSource: props.source,
      source: recoveredSource,
      explanation: recovered.explanation || "已生成代码预览，请确认后应用。",
      warnings: recovered.warnings,
      createdAt: Date.now(),
    };
    previewPendingCandidate();
    aiThinking.value = normalizeThinking([streamResult.reasoning || streamedReasoning, recovered.thinking].filter(Boolean).join("\n\n"));
    aiProvider.value = "stream";
    aiModel.value = streamResult.meta?.model || aiConfig.model || aiModel.value;
    aiStatusMessage.value = "流式生成成功。";
    if (assistantMessage) assistantMessage.content = recovered.explanation || "已生成代码预览，请确认后应用。";
    if (aiThinking.value) pushAiMessage("system", "已捕获模型深度思考，可在上方“深度思考”面板查看。");
    recovered.warnings.filter(Boolean).forEach((warning) => pushAiMessage("system", warning));
    aiRequirement.value = "";
    saveSessionToStorage();
    window.$message?.success("已生成代码差异预览，请确认后应用。");
  } catch (error) {
    if (requestSessionKey !== sessionStorageKey.value) return;
    if (isAbortError(error)) {
      const message = "已停止本次 AI 生成。";
      aiStatusMessage.value = message;
      if (assistantMessage) assistantMessage.content = message;
      pushAiMessage("action", message);
      saveSessionToStorage();
      return;
    }
    aiError.value = error instanceof Error ? error.message : "AI 生成失败";
    if (assistantMessage) assistantMessage.content = aiError.value;
    pushAiMessage("system", aiError.value);
    saveSessionToStorage();
  } finally {
    if (requestSessionKey === sessionStorageKey.value) {
      aiLoading.value = false;
      activeController = null;
    }
  }
}
function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}
function abortActiveStream() {
  if (!activeController) return;
  activeController.abort();
  activeController = null;
  aiLoading.value = false;
}
function stopGeneration() {
  if (aiLoading.value) abortActiveStream();
}
function previewPendingCandidate() {
  if (!pendingCandidate.value) return;
  emit("preview", { baseSource: pendingCandidate.value.baseSource, source: pendingCandidate.value.source, candidateId: pendingCandidate.value.id });
}
function applyPendingCandidate() {
  if (!pendingCandidate.value) return;
  if (!canApplyPendingCandidate.value) {
    window.$message?.warning("当前代码已变化，请放弃候选后重新生成。");
    return;
  }
  const candidate = pendingCandidate.value;
  lastAppliedChange.value = { id: createId("apply"), beforeSource: candidate.baseSource, afterSource: candidate.source, createdAt: Date.now() };
  pendingCandidate.value = null;
  emit("apply", { baseSource: candidate.baseSource, source: candidate.source, candidateId: candidate.id });
  aiApplyMessage.value = "已将 AI 修改应用到编辑器。请点击“确定”保存脚本。";
  pushAiMessage("action", "已应用当前 AI 候选到编辑器，仍需点击“确定”保存脚本。", { save: true });
  window.$message?.success("AI 结果已应用到编辑器，请点击确定保存。");
}
function discardPendingCandidate() {
  if (!pendingCandidate.value) return;
  const candidateId = pendingCandidate.value.id;
  pendingCandidate.value = null;
  emit("discard", { candidateId });
  aiApplyMessage.value = "已放弃本次 AI 候选，编辑器保持原代码。";
  pushAiMessage("action", "已放弃当前 AI 候选。", { save: true });
}
function undoLastApply() {
  if (!lastAppliedChange.value) return;
  if (!canUndoLastApply.value) {
    window.$message?.warning("当前代码已被手动修改，不能安全撤回上次 AI 应用。");
    return;
  }
  const change = lastAppliedChange.value;
  emit("undo", { beforeSource: change.beforeSource, afterSource: change.afterSource, applyId: change.id });
  lastAppliedChange.value = null;
  aiApplyMessage.value = "已撤回上次 AI 应用。";
  pushAiMessage("action", "已撤回上次 AI 应用，编辑器已恢复到应用前代码。", { save: true });
  window.$message?.success("已撤回上次 AI 应用。");
}
</script>

<style scoped lang="less">
.script-ai-agent-pane {
  min-width: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  background: rgba(24, 24, 28, 0.92);
}
.script-ai-agent-header,
.script-ai-agent-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.script-ai-agent-header,
.script-ai-agent-meta,
.script-ai-agent-config,
.script-ai-agent-thinking,
.script-ai-agent-card {
  flex: 0 0 auto;
}
.script-ai-agent-title {
  font-size: 15px;
  font-weight: 700;
}
.script-ai-agent-subtitle,
.script-ai-agent-meta,
.script-ai-agent-tip,
.script-ai-agent-card-meta {
  font-size: 12px;
  opacity: 0.72;
  line-height: 1.45;
}
.script-ai-agent-subtitle {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.script-ai-agent-header-actions {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}
.script-ai-agent-config,
.script-ai-agent-thinking,
.script-ai-agent-card {
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 7px 8px;
}
.script-ai-agent-config {
  background: rgba(99, 102, 241, 0.07);
}
.script-ai-agent-thinking {
  background: rgba(148, 163, 184, 0.08);
}
.script-ai-agent-config summary,
.script-ai-agent-thinking summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.82;
  user-select: none;
}
.script-ai-agent-config-body,
.script-ai-agent-card,
.script-ai-agent-bottom,
.script-ai-agent-status {
  display: grid;
  gap: 8px;
}
.script-ai-agent-config-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}
.script-ai-agent-config-row.is-two,
.script-ai-agent-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.script-ai-agent-thinking-content {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  max-height: 160px;
  overflow: auto;
}
.script-ai-agent-card.is-candidate {
  background: rgba(250, 173, 20, 0.1);
  border-color: rgba(250, 173, 20, 0.35);
}
.script-ai-agent-card.is-applied {
  background: rgba(24, 160, 88, 0.1);
  border-color: rgba(24, 160, 88, 0.32);
}
.script-ai-agent-card-title {
  font-size: 13px;
  font-weight: 600;
}
.script-ai-agent-card-desc,
.script-ai-agent-warning {
  font-size: 12px;
  line-height: 1.45;
}
.script-ai-agent-warning {
  color: #ffb347;
}
.script-ai-agent-card-actions,
.script-ai-agent-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.script-ai-agent-card-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.script-ai-agent-card-actions.is-one {
  grid-template-columns: minmax(0, 1fr);
}
.script-ai-agent-history {
  flex: 1 1 0;
  min-height: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
}
.script-ai-agent-history-inner {
  padding: 8px;
}
.script-ai-agent-empty,
.script-ai-agent-message-content {
  font-size: 12px;
  line-height: 1.5;
}
.script-ai-agent-empty {
  opacity: 0.65;
}
.script-ai-agent-message {
  margin-bottom: 8px;
  border-radius: 8px;
  padding: 7px 9px;
}
.script-ai-agent-message.is-user {
  background: rgba(45, 140, 240, 0.14);
}
.script-ai-agent-message.is-assistant {
  background: rgba(24, 160, 88, 0.14);
}
.script-ai-agent-message.is-system {
  background: rgba(250, 173, 20, 0.12);
}
.script-ai-agent-message.is-action {
  background: rgba(148, 163, 184, 0.12);
}
.script-ai-agent-message-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  opacity: 0.72;
  margin-bottom: 3px;
}
.script-ai-agent-message-content {
  white-space: pre-wrap;
  word-break: break-word;
}
.script-ai-agent-bottom {
  flex: 0 0 auto;
  border-top: 1px solid var(--n-border-color);
  padding-top: 10px;
}
@media (max-width: 1400px) {
  .script-ai-agent-config-row,
  .script-ai-agent-config-row.is-two,
  .script-ai-agent-card-actions,
  .script-ai-agent-actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
