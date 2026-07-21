export const PLAY_MESSAGE_TYPE = {
  ready: "h3d:play:ready",
  load: "h3d:play:load",
  started: "h3d:play:started",
  error: "h3d:play:error",
  runtimeError: "h3d:play:runtime-error",
} as const;

export const RUNTIME_MESSAGE_TYPE = "h3d:runtime:event" as const;

export interface RuntimeEventMessage {
  type: typeof RUNTIME_MESSAGE_TYPE;
  channel: string;
  event: string;
  payload?: unknown;
}

export interface PlayPackageFile {
  name: string;
  mimeType: string;
  buffer: ArrayBuffer;
}

export interface PlayLoadMessage {
  type: typeof PLAY_MESSAGE_TYPE.load;
  sessionId: string;
  firstPackageName: string;
  packages: PlayPackageFile[];
}

export type PlayStatusMessage = {
  type:
    | typeof PLAY_MESSAGE_TYPE.ready
    | typeof PLAY_MESSAGE_TYPE.started
    | typeof PLAY_MESSAGE_TYPE.error
    | typeof PLAY_MESSAGE_TYPE.runtimeError;
  sessionId: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPlayLoadMessage(value: unknown): value is PlayLoadMessage {
  if (!isRecord(value) || value.type !== PLAY_MESSAGE_TYPE.load) return false;
  if (typeof value.sessionId !== "string" || typeof value.firstPackageName !== "string") return false;
  if (!Array.isArray(value.packages)) return false;

  return value.packages.every((file) =>
    isRecord(file)
    && typeof file.name === "string"
    && typeof file.mimeType === "string"
    && file.buffer instanceof ArrayBuffer
  );
}

export function isPlayStatusMessage(value: unknown): value is PlayStatusMessage {
  if (!isRecord(value) || typeof value.sessionId !== "string") return false;
  if (value.message !== undefined && typeof value.message !== "string") return false;

  return [
    PLAY_MESSAGE_TYPE.ready,
    PLAY_MESSAGE_TYPE.started,
    PLAY_MESSAGE_TYPE.error,
    PLAY_MESSAGE_TYPE.runtimeError,
  ].includes(value.type as PlayStatusMessage["type"]);
}

export function isRuntimeEventMessage(value: unknown): value is RuntimeEventMessage {
  return isRecord(value)
    && value.type === RUNTIME_MESSAGE_TYPE
    && typeof value.channel === "string"
    && value.channel.trim().length > 0
    && typeof value.event === "string"
    && value.event.trim().length > 0;
}
