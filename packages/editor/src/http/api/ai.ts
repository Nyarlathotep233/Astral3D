export type IAiChatRole = "user" | "assistant";

export interface IAiChatMessage {
  role: IAiChatRole;
  content: string;
}

export interface IAiChatStreamRequest {
  model?: string;
  thinkingType?: "enabled" | "disabled";
  thinkingEnabled?: boolean;
  reasoningEffort?: "high" | "max";
  reasoning_effort?: "high" | "max";
  messages: IAiChatMessage[];
}

export interface IAiChatStreamMeta {
  requestId?: string;
  model?: string;
  thinkingType?: "enabled" | "disabled";
  reasoningEffort?: "high" | "max" | null;
  context?: Record<string, unknown>;
  limits?: Record<string, unknown>;
}

export interface IAiChatStreamResult {
  meta?: IAiChatStreamMeta;
  content: string;
  reasoning: string;
}

export interface IAiChatStreamHandlers {
  signal?: AbortSignal;
  onMeta?: (data: IAiChatStreamMeta) => void;
  onReasoning?: (content: string) => void;
  onMessage?: (content: string) => void;
  onDone?: (data: Record<string, unknown>) => void;
}

const CHAT_STREAM_URL = "/llm-api/chat/stream";

/**
 * 调用 astral-llm-service 已有的 SSE 流式聊天接口。
 */
export async function fetchAiChatStream(
  data: IAiChatStreamRequest,
  handlers: IAiChatStreamHandlers = {},
): Promise<IAiChatStreamResult> {
  const response = await fetch(CHAT_STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(data),
    signal: handlers.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  if (!response.body) {
    throw new Error("当前浏览器不支持读取流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let content = "";
  let reasoning = "";
  let meta: IAiChatStreamMeta | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";

    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;

      if (event.name === "meta") {
        meta = event.data as IAiChatStreamMeta;
        handlers.onMeta?.(meta);
        continue;
      }

      if (event.name === "reasoning") {
        const chunk = String(event.data?.content || "");
        reasoning += chunk;
        handlers.onReasoning?.(chunk);
        continue;
      }

      if (event.name === "message") {
        const chunk = String(event.data?.content || "");
        content += chunk;
        handlers.onMessage?.(chunk);
        continue;
      }

      if (event.name === "done") {
        handlers.onDone?.(event.data || {});
        continue;
      }

      if (event.name === "error") {
        throw new Error(String(event.data?.message || "LLM stream error"));
      }
    }
  }

  return {
    meta,
    content,
    reasoning,
  };
}

function parseSseEvent(rawEvent: string): { name: string; data: any } | null {
  const lines = rawEvent.split(/\r?\n/);
  let name = "message";
  let dataText = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      name = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataText += line.slice("data:".length).trim();
    }
  }

  if (!dataText) return null;

  return {
    name,
    data: JSON.parse(dataText),
  };
}
