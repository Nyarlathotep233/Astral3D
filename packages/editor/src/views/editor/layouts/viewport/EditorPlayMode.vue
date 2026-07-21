<template>
  <div v-if="state !== 'packing'" class="play-mode-controls">
    <n-button
      :type="state === 'idle' ? 'primary' : 'error'"
      size="small"
      @click.stop="togglePlay"
    >
      <template #icon>
        <n-icon>
          <PlayFilledAlt v-if="state === 'idle'" />
          <StopFilledAlt v-else />
        </n-icon>
      </template>
      {{ state === "idle" ? t("playMode.Run") : t("playMode.Stop") }}
    </n-button>

    <span v-if="state === 'loading'" class="play-mode-status">
      {{ t("playMode.Starting") }}
    </span>
    <span v-else-if="state === 'running'" class="play-mode-status">
      {{ t("playMode.Restart hint") }}
    </span>
  </div>

  <div v-if="iframeSrc" class="play-mode-runtime">
    <iframe
      ref="iframeRef"
      :src="iframeSrc"
      class="w-full h-full border-0"
      title="H3D Play Mode"
      allow="fullscreen; xr-spatial-tracking"
      allowfullscreen
    />
  </div>

  <div v-if="state === 'failed'" class="play-mode-error">
    <n-alert type="error" :title="t('playMode.Start failed')">
      {{ errorMessage }}
    </n-alert>
  </div>

  <Teleport to="body">
    <div v-if="state === 'packing'" class="play-mode-packing" role="status" aria-live="polite">
      <n-spin size="large" />
      <div class="mt-3 text-base">
        {{ cancelling ? t("playMode.Cancelling") : t("playMode.Packing") }}
        <span v-if="!cancelling && snapshotProgress > 0">{{ snapshotProgress }}%</span>
      </div>
      <n-button class="mt-3" :disabled="cancelling" @click="cancelPacking">
        {{ t("playMode.Cancel") }}
      </n-button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from "vue";
import {PlayFilledAlt, StopFilledAlt} from "@vicons/carbon";
import {App, Package} from "@astral3d/engine";
import {t} from "@/language";
import {
  isRuntimeEventMessage,
  isPlayStatusMessage,
  PLAY_MESSAGE_TYPE,
  RUNTIME_MESSAGE_TYPE,
  type PlayLoadMessage,
  type PlayPackageFile,
} from "@/utils/playMode";
import {
  getAllowedEditorParentOrigin,
  isAllowedEditorParentOrigin,
} from "@/utils/integration/editorObjectsBridge";

type PlayState = "idle" | "packing" | "loading" | "running" | "failed";

const PLAY_LOAD_TIMEOUT = 180_000;
const PACK_CANCELLED = "play mode packing cancelled";
const PLAY_RUNTIME_CHANNEL = "h3d-play";

const state = ref<PlayState>("idle");
const iframeRef = ref<HTMLIFrameElement | null>(null);
const iframeSrc = ref("");
const errorMessage = ref("");
const snapshotProgress = ref(0);
const cancelling = ref(false);

let activeSessionId = "";
let pendingSnapshot: PlayLoadMessage | null = null;
let loadTimer: number | undefined;
let disposed = false;
let runtimeErrorShown = false;

function clearLoadTimer() {
  if (loadTimer !== undefined) {
    window.clearTimeout(loadTimer);
    loadTimer = undefined;
  }
}

function resetPlaySession() {
  clearLoadTimer();
  activeSessionId = "";
  pendingSnapshot = null;
  iframeSrc.value = "";
  errorMessage.value = "";
  snapshotProgress.value = 0;
  cancelling.value = false;
  runtimeErrorShown = false;
  state.value = "idle";
}

function cancelPacking() {
  activeSessionId = "";
  cancelling.value = true;
}

function stopPlay() {
  if (state.value === "packing") {
    cancelPacking();
    return;
  }

  resetPlaySession();
}

function togglePlay() {
  if (state.value === "idle") {
    void startPlay();
    return;
  }

  stopPlay();
}

async function createSnapshot(sessionId: string): Promise<PlayLoadMessage> {
  const packageInstance = new Package(window.viewer);
  const packages: PlayPackageFile[] = [];

  try {
    const result = await packageInstance.pack({
      name: `play-${sessionId}`,
      layer: 2,
      zipUploadFun: async (file: File) => {
        if (activeSessionId !== sessionId) throw new Error(PACK_CANCELLED);

        const buffer = await file.arrayBuffer();
        if (activeSessionId !== sessionId) throw new Error(PACK_CANCELLED);

        packages.push({
          name: file.name,
          mimeType: file.type || "application/zip",
          buffer,
        });
        return file.name;
      },
      onProgress: (progress) => {
        if (Number.isFinite(progress)) snapshotProgress.value = Math.round(progress);
      },
    });

    const firstPackageName = String(result.firstUploadResult || "");
    if (!firstPackageName || !packages.some((file) => file.name === firstPackageName)) {
      throw new Error(t("playMode.First package missing"));
    }

    return {
      type: PLAY_MESSAGE_TYPE.load,
      sessionId,
      firstPackageName,
      packages,
    };
  } finally {
    packageInstance.dispose();
  }
}

async function startPlay() {
  const sceneId = String(App.project.getKey("sceneInfo.id") || "");
  if (!sceneId) {
    window.$message?.error(t("scene['The project does not exist!']"));
    return;
  }

  const sessionId = crypto.randomUUID();
  activeSessionId = sessionId;
  state.value = "packing";
  cancelling.value = false;
  snapshotProgress.value = 0;
  errorMessage.value = "";
  runtimeErrorShown = false;

  try {
    const snapshot = await createSnapshot(sessionId);
    if (activeSessionId !== sessionId || disposed) {
      if (!disposed) resetPlaySession();
      return;
    }

    pendingSnapshot = snapshot;
    const query = new URLSearchParams({editorPlay: "true", sessionId});
    iframeSrc.value = `${window.location.origin}/#/preview/${encodeURIComponent(sceneId)}?${query}`;
    state.value = "loading";

    loadTimer = window.setTimeout(() => {
      if (activeSessionId !== sessionId) return;
      errorMessage.value = t("playMode.Load timeout");
      state.value = "failed";
    }, PLAY_LOAD_TIMEOUT);
  } catch (error) {
    if (disposed) return;
    if (activeSessionId !== sessionId || (error instanceof Error && error.message === PACK_CANCELLED)) {
      resetPlaySession();
      return;
    }

    errorMessage.value = error instanceof Error ? error.message : String(error);
    state.value = "failed";
  }
}

function handlePlayStatus(event: MessageEvent) {
  const targetWindow = iframeRef.value?.contentWindow;
  if (
    !targetWindow
    || event.source !== targetWindow
    || event.origin !== window.location.origin
    || !isPlayStatusMessage(event.data)
    || !activeSessionId
    || event.data.sessionId !== activeSessionId
  ) return;

  switch (event.data.type) {
    case PLAY_MESSAGE_TYPE.ready: {
      if (state.value !== "loading" || !pendingSnapshot) return;

      const snapshot = pendingSnapshot;
      const transfer = snapshot.packages.map((file) => file.buffer);
      targetWindow.postMessage(snapshot, window.location.origin, transfer);
      pendingSnapshot = null;
      break;
    }
    case PLAY_MESSAGE_TYPE.started:
      clearLoadTimer();
      state.value = "running";
      postRuntimeReady();
      break;
    case PLAY_MESSAGE_TYPE.error:
      clearLoadTimer();
      errorMessage.value = event.data.message || t("playMode.Start failed");
      state.value = "failed";
      break;
    case PLAY_MESSAGE_TYPE.runtimeError:
      console.error(`[Play Mode] ${event.data.message || t("playMode.Runtime error")}`);
      if (!runtimeErrorShown) {
        runtimeErrorShown = true;
        window.$message?.error(t("playMode.Runtime error hint"));
      }
      break;
  }
}

function postRuntimeReady() {
  const parentOrigin = getAllowedEditorParentOrigin();
  if (!parentOrigin || window.parent === window) return;

  window.parent.postMessage({
    type: RUNTIME_MESSAGE_TYPE,
    channel: PLAY_RUNTIME_CHANNEL,
    event: "ready",
    payload: {sessionId: activeSessionId},
  }, parentOrigin);
}

function relayRuntimeMessage(event: MessageEvent) {
  if (state.value !== "running" || !isRuntimeEventMessage(event.data)) return;

  const targetWindow = iframeRef.value?.contentWindow;
  if (!targetWindow) return;

  if (
    window.parent !== window
    && event.source === window.parent
    && isAllowedEditorParentOrigin(event.origin)
  ) {
    targetWindow.postMessage(event.data, window.location.origin);
    return;
  }

  const parentOrigin = getAllowedEditorParentOrigin();
  if (
    parentOrigin
    && event.source === targetWindow
    && event.origin === window.location.origin
  ) {
    window.parent.postMessage(event.data, parentOrigin);
  }
}

function handleWindowMessage(event: MessageEvent) {
  handlePlayStatus(event);
  relayRuntimeMessage(event);
}

onMounted(() => {
  window.addEventListener("message", handleWindowMessage);
});

onBeforeUnmount(() => {
  disposed = true;
  activeSessionId = "";
  clearLoadTimer();
  pendingSnapshot = null;
  window.removeEventListener("message", handleWindowMessage);
});
</script>

<style scoped lang="less">
.play-mode-controls {
  position: absolute;
  top: 4px;
  left: 50%;
  z-index: 42;
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
}

.play-mode-status {
  padding: 4px 8px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  white-space: nowrap;
}

.play-mode-runtime {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: #0b1020;
}

.play-mode-error {
  position: absolute;
  top: 52px;
  left: 50%;
  z-index: 43;
  width: min(520px, calc(100% - 32px));
  transform: translateX(-50%);
}

.play-mode-packing {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.72);
}
</style>
