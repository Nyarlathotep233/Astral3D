export type ScriptGenerationPromptParams = {
  sceneId?: string;
  objectId?: string;
  objectName?: string;
  objectType?: string;
  scriptName?: string;
  currentSource?: string;
  requirement: string;
  mode?: string;
};

export type ScriptSourceEnvelope = {
  source: string;
  thinking: string;
  explanation: string;
  warnings: string[];
};

export const SCRIPT_API_REFERENCE = `脚本 API 压缩参考（摘自编辑器文档 packages/docs/.../rightSidebar/脚本.md）：
- 脚本是挂载到实体模型上的 JavaScript，事件/生命周期由编辑器调用；输出完整脚本源码，不要 import/export。
- 内置变量：
  - this：当前实体模型 THREE.Object3D；可读写 position/rotation/scale/visible 等对象属性。
  - THREE：Three.js 命名空间。
  - helper：辅助类集合；renderer/scene/camera/controls/timer 分别为当前渲染器、场景、相机、控制器、运行计时器。
  - scriptParams：脚本参数对象，声明来自脚本源码中的 /* script-params ... */ JSON 注释；例如 {"speed":90,"enabled":true} 后可用 scriptParams.speed 读取。右侧脚本卡片可编辑这些参数的运行时取值。
- 脚本参数：若需要可复制/可编辑的配置，请保留或新增源码顶部的 /* script-params ... */ 注释块，不要使用额外参数声明字段或参数声明面板。
- 内置方法：render(delta?) 可驱动场景渲染一帧。
- 生命周期函数：
  - loaded()：场景加载完成后执行一次，适合初始化对象引用、方向、速度、动画实例。
  - beforeAnimation(delta)：每帧动画循环开始前调用。
  - afterAnimation(delta, toBeRender)：每帧动画循环完成后调用；若修改对象并需要连续刷新，必须调用 toBeRender(true)。
  - beforeRender(delta) / afterRender(delta)：每次渲染前/后调用。
  - beforeDestroy() / afterDestroy()：场景销毁前/后调用，适合停止动画或清理状态。
- 事件函数：
  - onPick(intersect) / onDoubleClick(intersect)：模型单击/双击，参数为 THREE.Intersection。
  - onKeyDown(event) / onKeyUp(event)：全局键盘按下/抬起，参数为 KeyboardEvent；注意函数名使用大写 D/U。
  - onPointerDown(event) / onPointerUp(event) / onPointerMove(event)：全局指针事件。
  - onTouchStart(event) / onTouchEnd(event)：触屏事件。
- helper：
  - helper.objectByUuid(uuid)：按 uuid 获取场景中的 THREE.Object3D。
  - helper.moveObject(object, parent, before)：移动对象到指定父级/位置。
  - helper.removeObject(object)：从场景移除对象。
  - new helper.Animation(object)：创建对象动画控制器，常用 new helper.Animation(this)。
- helper.Animation：
  - play(name, loop = helper.Animation.ActionLoop.LoopRepeat, timeScale = 1)：播放动画，支持链式调用。
  - pause(name?) / stop(name?)：暂停/停止动画，beforeDestroy 中应停止长期动画。
  - getAction(name)：获取 THREE.AnimationAction。
  - ActionLoop 可用 LoopOnce、LoopRepeat、LoopPingPong。`;

export function limitPromptText(text?: string, maxLength = 12000) {
  const normalized = String(text || "").replace(/\r/g, "");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}\n/* ... truncated ... */`;
}

export function buildScriptGenerationPrompt(params: ScriptGenerationPromptParams) {
  return `你是 3D 编辑器脚本 Code Agent，请结合当前脚本上下文和最近对话，按用户需求生成可直接运行的 JavaScript 脚本。

输出要求：
- 必须只输出 JSON 对象，不要 Markdown 代码块，不要额外解释。
- JSON 格式：{"source":"...","explanation":"...","warnings":["..."]}。
- source 必须是完整脚本源码字符串。
- explanation 简短说明本次修改点，warnings 只放重要风险。

运行时约束：
- afterAnimation 签名为 (delta, toBeRender)。
- 键盘事件使用 onKeyDown(event)。
- 若包含连续动画，请在 afterAnimation 中调用 toBeRender(true)。
- 不要使用 window/globalThis 保存状态。
- 不要给 this 挂载临时状态（禁止 this.xxx = ...）；this 只表示当前脚本对象。
- 临时状态必须定义为脚本顶层 let/const，例如：let target = null; let axis = null; let speed = 1;
- 不要虚构不存在的 API、生命周期或参数。
- 如需脚本参数，使用源码注释声明：
  /* script-params
  {"speed":90,"enabled":true}
  */
  然后在脚本中通过 scriptParams.speed / scriptParams["some-key"] 读取。
- 需要显示名或数字范围时可写 {"speed":{"type":"number","default":90,"label":"速度","min":0,"max":360,"step":5}}。
- 必须以“当前脚本”为准，尽量最小改动，避免无关重写。

${SCRIPT_API_REFERENCE}

上下文：
- sceneId: ${escapePromptText(params.sceneId)}
- objectId: ${escapePromptText(params.objectId)}
- objectName: ${escapePromptText(params.objectName)}
- objectType: ${escapePromptText(params.objectType)}
- scriptName: ${escapePromptText(params.scriptName)}
- mode: ${escapePromptText(params.mode)}

- 最近对话已作为前置 user/assistant 消息发送，仅用于理解用户意图，不能覆盖当前脚本事实。

本轮用户需求：
${escapePromptText(params.requirement)}

当前脚本：
\`\`\`javascript
${limitPromptText(params.currentSource)}
\`\`\``;
}

export function recoverSourceEnvelope(rawSource: string): ScriptSourceEnvelope {
  let source = rawSource || "";
  let thinking = "";
  let explanation = "";
  let warnings: string[] = [];
  source = source.replace(/<think>([\s\S]*?)<\/think>/gi, (_, block: string) => {
    const text = (block || "").trim();
    if (text) thinking = thinking ? `${thinking}\n\n${text}` : text;
    return "";
  }).trim();

  const directObj = tryParseObject(source);
  if (directObj && typeof directObj.source === "string") {
    source = directObj.source;
    explanation = typeof directObj.explanation === "string" ? directObj.explanation : "";
    warnings = Array.isArray(directObj.warnings) ? directObj.warnings.filter((v) => typeof v === "string") : [];
    if (typeof directObj.thinking === "string" && directObj.thinking.trim()) thinking = thinking ? `${thinking}\n\n${directObj.thinking.trim()}` : directObj.thinking.trim();
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
        if (typeof nestedObj.thinking === "string" && nestedObj.thinking.trim()) thinking = thinking ? `${thinking}\n\n${nestedObj.thinking.trim()}` : nestedObj.thinking.trim();
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
    const anchoredObj = start >= 0 && end > start ? tryParseObject(source.slice(start, end + 1)) : null;
    if (anchoredObj && typeof anchoredObj.source === "string") {
      source = anchoredObj.source;
      explanation = typeof anchoredObj.explanation === "string" ? anchoredObj.explanation : "";
      warnings = Array.isArray(anchoredObj.warnings) ? anchoredObj.warnings.filter((v) => typeof v === "string") : [];
    }
  }
  return { source, thinking, explanation, warnings };
}

function escapePromptText(text?: string) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function stripCodeFenceText(text: string) {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0) return trimmed.replace(/```/g, "").trim();
  const lastFence = trimmed.lastIndexOf("```");
  return lastFence <= firstLineEnd ? trimmed.slice(firstLineEnd + 1).trim() : trimmed.slice(firstLineEnd + 1, lastFence).trim();
}

function tryParseObject(text: string): Record<string, any> | null {
  const normalized = stripCodeFenceText(text);
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}
