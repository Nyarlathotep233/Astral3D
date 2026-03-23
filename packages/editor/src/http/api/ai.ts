import { request } from "@/http/request";

export interface IAiMockScriptRequest {
  sceneId?: string;
  objectId?: string;
  objectName?: string;
  objectType?: string;
  scriptName?: string;
  currentSource?: string;
  requirement: string;
  mode?: string;
}

export interface IAiMockScriptResponse {
  requestId: string;
  model: string;
  scriptName: string;
  source: string;
  explanation: string;
  warnings: string[];
}

/**
 * 迭代 A：mock 脚本生成
 */
export function fetchGenerateMockScript(data: IAiMockScriptRequest) {
  return request.post<IAiMockScriptResponse>("/editor3d/ai/script/mock", data);
}
