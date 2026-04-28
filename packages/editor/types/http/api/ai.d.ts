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
/**
 * 调用 astral-llm-service 已有的 SSE 流式聊天接口。
 */
export declare function fetchAiChatStream(data: IAiChatStreamRequest, handlers?: IAiChatStreamHandlers): Promise<IAiChatStreamResult>;
