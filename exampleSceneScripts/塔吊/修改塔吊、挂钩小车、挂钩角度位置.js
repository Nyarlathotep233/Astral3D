/**
 * 三合一：TopUnit001 旋转 / HookRig001 小车 X / Hook002 挂钩 Y + WireRope 缩放
 * - Y / Shift+Y：吊臂 rotation.y 步进（平滑）
 * - H / Shift+H：小车 position.x 步进（平滑 + clamp）
 * - G / Shift+G：挂钩 position.y 步进（平滑 + clamp）并同步钢丝绳 scale.y
 * - R：单次接口调用 -> uuid 派生 3 个 seed -> 同时生成角度/位置目标（平滑）
 *
 * @document http://editor-doc.astraljs.com/guide/component/h4v1bkyh/
 */

// ==================== 目标节点名称 ====================
const TOP_UNIT_NAME = "TopUnit001";
const HOOK_RIG_NAME = "HookRig001";
const HOOK_NAME = "Hook002";
const ROPE_NAME = "WireRope";

// ==================== 热键 ====================
const KEY_ROT_STEP = "y";
const KEY_X_STEP = "h";
const KEY_HOOK_STEP = "g";
const KEY_API = "r";

// ==================== 步进参数 ====================
const ROTATE_STEP_DEG = 10; // 每次 Y 步进角度
const STEP_X = 0.5;         // 每次 H 步进 X
const STEP_HOOK_Y = 1;      // 每次 G 步进 HookY（下放/回收）

// ==================== 范围限制 ====================
const X_MIN = -25;
const X_MAX = 7;

const HOOK_Y_MIN = -34;
const HOOK_Y_MAX = 0;

// ==================== 过渡动画参数 ====================
const SPEED_DEG_PER_SEC = 90;     // 角速度（度/秒）
const SPEED_X_PER_SEC = 10;       // X 速度（单位/秒）
const SPEED_HOOK_Y_PER_SEC = 8;   // HookY 速度（单位/秒）

const EPS_DEG = 0.2;              // 角度收敛阈值（度）
const EPS_X = 0.01;               // X 收敛阈值
const EPS_HOOK_Y = 0.01;          // HookY 收敛阈值

// ==================== 接口（R 键触发） ====================
const API_URL = "https://httpbin.org/uuid";
const TIMEOUT_MS = 5000;

// 用 seed 映射到角度范围（度）
const ANGLE_MIN_DEG = -180;
const ANGLE_MAX_DEG = 180;

// ==================== Rope 标定（保持你原来的映射） ====================
// HookY=0 => RopeScaleY=1；HookY=-40 => RopeScaleY=11.5
const HOOK_Y_AT_SCALE_1 = 0;
const ROPE_SCALE_Y_AT_HOOK_0 = 1;

const HOOK_Y_AT_SCALE_11_5 = -40;
const ROPE_SCALE_Y_AT_HOOK_NEG40 = 11.5;

// ==================== 运行时缓存 ====================
let topUnit = null;
let hookRig = null;
let hook = null;
let rope = null;

let ROPE_SCALE_Y_MIN = 1;
let ROPE_SCALE_Y_MAX = 11.5;

// 目标值（用于动画）
let desiredRotY = null;   // rad
let desiredX = null;      // number
let desiredHookY = null;  // number

// 动画开关
let animRot = false;
let animX = false;
let animHook = false;

// 接口请求防连按
let fetching = false;

// ==================== 工具函数 ====================
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function findByName(root, name) {
  if (!root) return null;
  // threejs 原生（如果可用）更快
  if (typeof root.getObjectByName === "function") {
    const hit = root.getObjectByName(name);
    if (hit) return hit;
  }
  // 兜底递归
  if (root.name === name) return root;
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    const hit = findByName(children[i], name);
    if (hit) return hit;
  }
  return null;
}

// ---- 角度最短路（避免 179° 到 -179° 走大圈）----
function normalizeRad(a) {
  const twoPI = Math.PI * 2;
  a = ((a % twoPI) + twoPI) % twoPI; // [0, 2PI)
  if (a > Math.PI) a -= twoPI;       // (-PI, PI]
  return a;
}
function shortestDiffRad(from, to) {
  return normalizeRad(to - from);
}

// ---- uuid -> seed01 (0~1) ----
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function seed01FromString(str) {
  return fnv1a32(str) / 4294967296;
}

// ---- fetch json with timeout ----
async function fetchJsonWithTimeout(url, timeoutMs) {
  if (typeof AbortController === "undefined") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Rope 映射 ----
function ropeScaleYFromHookY(hookY) {
  const slope =
    (ROPE_SCALE_Y_AT_HOOK_NEG40 - ROPE_SCALE_Y_AT_HOOK_0) /
    (HOOK_Y_AT_SCALE_11_5 - HOOK_Y_AT_SCALE_1);
  const b = ROPE_SCALE_Y_AT_HOOK_0;
  return slope * hookY + b;
}
function syncRopeByHookY(hookY) {
  if (!rope) return;
  const s = ropeScaleYFromHookY(hookY);
  rope.scale.y = clamp(s, ROPE_SCALE_Y_MIN, ROPE_SCALE_Y_MAX);
}

// ---- 设置目标值（并启动动画）----
function setDesiredRotY(rad) {
  if (!topUnit) return;
  desiredRotY = normalizeRad(rad);
  animRot = true;
}
function setDesiredX(x) {
  if (!hookRig) return;
  desiredX = clamp(x, X_MIN, X_MAX);
  animX = true;
}
function setDesiredHookY(y) {
  if (!hook) return;
  desiredHookY = clamp(y, HOOK_Y_MIN, HOOK_Y_MAX);
  animHook = true;
}

// ==================== 生命周期 ====================
function loaded() {
  // this 建议是 glb 根
  topUnit = findByName(this, TOP_UNIT_NAME);
  hookRig = findByName(this, HOOK_RIG_NAME);
  hook = findByName(this, HOOK_NAME);
  rope = findByName(this, ROPE_NAME);

  if (!topUnit) console.warn(`[init] not found "${TOP_UNIT_NAME}"`);
  if (!hookRig) console.warn(`[init] not found "${HOOK_RIG_NAME}"`);
  if (!hook) console.warn(`[init] not found "${HOOK_NAME}"`);
  if (!rope) console.warn(`[init] not found "${ROPE_NAME}"`);

  // ropeScale 范围：按 HOOK_Y_MIN~MAX 自动换算
  ROPE_SCALE_Y_MIN = ropeScaleYFromHookY(HOOK_Y_MAX); // ~1
  ROPE_SCALE_Y_MAX = ropeScaleYFromHookY(HOOK_Y_MIN); // ~HookY=-34 对应值

  // 初始化 clamp/目标
  if (hookRig) hookRig.position.x = clamp(hookRig.position.x, X_MIN, X_MAX);
  if (hook) hook.position.y = clamp(hook.position.y, HOOK_Y_MIN, HOOK_Y_MAX);

  if (topUnit) desiredRotY = normalizeRad(topUnit.rotation.y);
  if (hookRig) desiredX = hookRig.position.x;
  if (hook) desiredHookY = hook.position.y;

  if (hook && rope) syncRopeByHookY(hook.position.y);

  this.updateMatrixWorld(true);
  render();

  console.log("[init] ok", {
    hasTopUnit: !!topUnit,
    hasHookRig: !!hookRig,
    hasHook: !!hook,
    hasRope: !!rope,
    ropeScaleRange: [ROPE_SCALE_Y_MIN, ROPE_SCALE_Y_MAX],
  });
}

// ==================== 统一过渡动画（每帧） ====================
function afterAnimation(delta, toBeRender) {
  let anyAnimating = false;
  let anyChanged = false;

  // ---- 1) 吊臂旋转 ----
  if (topUnit && animRot && desiredRotY != null) {
    const cur = normalizeRad(topUnit.rotation.y);
    const diff = shortestDiffRad(cur, desiredRotY);

    const epsRad = THREE.MathUtils.degToRad(EPS_DEG);
    if (Math.abs(diff) <= epsRad) {
      topUnit.rotation.y = desiredRotY;
      animRot = false;
      anyChanged = true;
    } else {
      const speedRad = THREE.MathUtils.degToRad(SPEED_DEG_PER_SEC);
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speedRad * delta);
      topUnit.rotation.y = normalizeRad(cur + step);
      anyAnimating = true;
      anyChanged = true;
    }
  }

  // ---- 2) 小车 X ----
  if (hookRig && animX && desiredX != null) {
    const cur = hookRig.position.x;
    const diff = desiredX - cur;

    if (Math.abs(diff) <= EPS_X) {
      hookRig.position.x = desiredX;
      animX = false;
      anyChanged = true;
    } else {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED_X_PER_SEC * delta);
      hookRig.position.x = clamp(cur + step, X_MIN, X_MAX);
      anyAnimating = true;
      anyChanged = true;
    }
  }

  // ---- 3) HookY + RopeScale ----
  if (hook && rope && animHook && desiredHookY != null) {
    const cur = hook.position.y;
    const diff = desiredHookY - cur;

    if (Math.abs(diff) <= EPS_HOOK_Y) {
      hook.position.y = desiredHookY;
      animHook = false;
      anyChanged = true;
    } else {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED_HOOK_Y_PER_SEC * delta);
      hook.position.y = clamp(cur + step, HOOK_Y_MIN, HOOK_Y_MAX);
      anyAnimating = true;
      anyChanged = true;
    }

    // Rope 永远以“当前 hookY”推导，避免漂移
    syncRopeByHookY(hook.position.y);
  }

  if (anyChanged) {
    // 只更新一次矩阵
    this.updateMatrixWorld(true);
  }

  // 只要还有任何动画没结束，就要求下一帧继续渲染
  if (anyAnimating) {
    toBeRender(true);
  }
}

// ==================== 统一键盘处理 ====================
function handleKeyDown(event) {
  const key = (event.key || "").toLowerCase();

  // ---- Y：步进旋转 ----
  if (key === KEY_ROT_STEP || event.code === "KeyY") {
    if (!topUnit) return;
    const dir = event.shiftKey ? -1 : 1;
    const stepRad = THREE.MathUtils.degToRad(ROTATE_STEP_DEG);
    setDesiredRotY(topUnit.rotation.y + dir * stepRad);
    render();
    return;
  }

  // ---- H：步进小车 X ----
  if (key === KEY_X_STEP || event.code === "KeyH") {
    if (!hookRig) return;
    const dir = event.shiftKey ? -1 : 1;
    setDesiredX(hookRig.position.x + dir * STEP_X);
    render();
    return;
  }

  // ---- G：步进 HookY（下放/回收）----
  if (key === KEY_HOOK_STEP || event.code === "KeyG") {
    if (!hook) return;
    const dir = event.shiftKey ? +1 : -1; // G 下放（更负）；Shift+G 回收（更正）
    setDesiredHookY(hook.position.y + dir * STEP_HOOK_Y);
    render();
    return;
  }

  // ---- R：单次接口请求 -> 同时驱动三个目标 ----
  if (key === KEY_API || event.code === "KeyR") {
    if (fetching) {
      console.log("[api] fetching... ignore duplicate R");
      return;
    }

    fetching = true;
    console.log("[api] fetching:", API_URL);

    fetchJsonWithTimeout(API_URL, TIMEOUT_MS)
      .then((data) => {
        const uuid = String(data.uuid || "");
        // 用同一个 uuid 派生 3 个 seed，避免三者完全同步
        const seedRot = seed01FromString(uuid + "::rot");
        const seedX = seed01FromString(uuid + "::x");
        const seedHook = seed01FromString(uuid + "::hook");

        // 角度（度）/ X / HookY
        const angleDeg = lerp(ANGLE_MIN_DEG, ANGLE_MAX_DEG, seedRot);
        const nextX = lerp(X_MIN, X_MAX, seedX);
        const nextHookY = lerp(HOOK_Y_MIN, HOOK_Y_MAX, seedHook);

        if (topUnit) setDesiredRotY(THREE.MathUtils.degToRad(angleDeg));
        if (hookRig) setDesiredX(nextX);
        if (hook) setDesiredHookY(nextHookY);

        console.log("[api] ok:", data);
        console.log("[api] uuid =", uuid);
        console.log("[api] seeds =", { seedRot, seedX, seedHook });
        console.log("[api] desired =", { angleDeg: angleDeg.toFixed(1), x: nextX, hookY: nextHookY });

        render();
      })
      .catch((err) => {
        // 不回退：只记录错误
        console.error("[api] fetch failed:", err);
      })
      .finally(() => {
        fetching = false;
      });

    return;
  }
}

function onKeyDown(event) {
  return handleKeyDown.call(this, event);
}
function onKeydown(event) {
  return handleKeyDown.call(this, event);
}