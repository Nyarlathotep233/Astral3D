export interface IAiScriptRequest {
    sceneId?: string;
    objectId?: string;
    objectName?: string;
    objectType?: string;
    scriptName?: string;
    currentSource?: string;
    requirement: string;
    mode?: string;
    provider?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    temperature?: number;
}
export interface IAiScriptResponse {
    requestId: string;
    model: string;
    provider?: string;
    scriptName: string;
    source: string;
    explanation: string;
    warnings: string[];
    thinking?: string;
}
export interface IAiScriptStatusResponse {
    provider: string;
    liveReady: boolean;
    model: string;
    endpoint: string;
    message: string;
}
/**
 * 统一脚本生成：仅调用真实模型，失败直接返回错误
 */
export declare function fetchGenerateScript(data: IAiScriptRequest): Promise<Service.RequestResult<T>>;
/**
 * 获取当前 AI 脚本生成状态（是否已配置真实模型）
 */
export declare function fetchAiScriptStatus(): Promise<Service.RequestResult<T>>;
