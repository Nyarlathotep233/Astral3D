/**
 * 三合一：TopUnit001 旋转 / HookRig001 小车 X / Hook002 挂钩 Y + WireRope 缩放
 * - Y / Shift+Y：吊臂绕本地 Y 轴步进（平滑）
 * - H / Shift+H：小车 position.x 步进（平滑 + clamp）
 * - G / Shift+G：挂钩 position.y 步进（平滑 + clamp）并同步钢丝绳 scale.y
 * - R：单次接口调用 -> uuid 派生 3 个 seed -> 同时生成角度/位置目标（平滑）
 *
 * 重点改动：
 * - TopUnit001 的旋转不再依赖 topUnit.rotation.y
 * - 使用“基准 quaternion + 当前逻辑角 currentRotY + 目标逻辑角 desiredRotY”
 * - 避免导出/导入后 Euler 等价角分支（如 0,0,0 与 -180,-180,-180）导致旋转语义跳变
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

// ==================== Rope 标定（保持原映射） ====================
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

// ==================== TopUnit 旋转状态（关键改动） ====================
// 这里不再从 topUnit.rotation.y 回读逻辑角度
// currentRotY / desiredRotY 表示“相对于 loaded() 时基准姿态”的本地 Y 旋转量
let currentRotY = 0;       // 当前逻辑角（rad）
let desiredRotY = 0;       // 目标逻辑角（rad）
const _baseTopQuat = new THREE.Quaternion();  // loaded() 时的基准姿态
const _axisY = new THREE.Vector3(0, 1, 0);
const _yawQuat = new THREE.Quaternion();

// 其它目标值（用于动画）
let desiredX = null;       // number
let desiredHookY = null;   // number

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

  if (typeof root.getObjectByName === "function") {
    const hit = root.getObjectByName(name);
    if (hit) return hit;
  }

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

// ---- TopUnit：应用逻辑角到真实姿态 ----
function applyTopUnitYaw(rad) {
  if (!topUnit) return;

  _yawQuat.setFromAxisAngle(_axisY, rad);
  topUnit.quaternion.copy(_baseTopQuat).multiply(_yawQuat).normalize();
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
  // this 通常是 glb 根节点
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

  // ===== 关键：记录 TopUnit 初始姿态作为“基准姿态” =====
  if (topUnit) {
    _baseTopQuat.copy(topUnit.quaternion);
    currentRotY = 0;
    desiredRotY = 0;
    applyTopUnitYaw(currentRotY);
  }

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

  // ---- 1) 吊臂旋转（改成脚本内部逻辑角 + quaternion 应用）----
  if (topUnit && animRot && desiredRotY != null) {
    const cur = currentRotY;
    const diff = shortestDiffRad(cur, desiredRotY);

    const epsRad = THREE.MathUtils.degToRad(EPS_DEG);
    if (Math.abs(diff) <= epsRad) {
      currentRotY = desiredRotY;
      applyTopUnitYaw(currentRotY);
      animRot = false;
      anyChanged = true;
    } else {
      const speedRad = THREE.MathUtils.degToRad(SPEED_DEG_PER_SEC);
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speedRad * delta);

      currentRotY = normalizeRad(cur + step);
      applyTopUnitYaw(currentRotY);

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

  // ---- 3) 挂钩 Y（并同步钢丝绳）----
  if (hook && animHook && desiredHookY != null) {
    const cur = hook.position.y;
    const diff = desiredHookY - cur;

    if (Math.abs(diff) <= EPS_HOOK_Y) {
      hook.position.y = desiredHookY;
      syncRopeByHookY(hook.position.y);
      animHook = false;
      anyChanged = true;
    } else {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED_HOOK_Y_PER_SEC * delta);
      hook.position.y = clamp(cur + step, HOOK_Y_MIN, HOOK_Y_MAX);
      syncRopeByHookY(hook.position.y);
      anyAnimating = true;
      anyChanged = true;
    }
  }

  if (anyAnimating) {
    toBeRender(true);
  }

  if (anyChanged) {
    this.updateMatrixWorld(true);
  }
}

// ==================== 键盘控制 ====================
async function onKeyDown(event) {
  const key = String(event.key || "").toLowerCase();
  const shift = !!event.shiftKey;

  // ---- Y：吊臂步进 ----
  if (key === KEY_ROT_STEP) {
    const dir = shift ? -1 : 1;
    const stepRad = THREE.MathUtils.degToRad(ROTATE_STEP_DEG);
    setDesiredRotY(currentRotY + dir * stepRad);
    return;
  }

  // ---- H：小车 X 步进 ----
  if (key === KEY_X_STEP) {
    if (!hookRig) return;
    const dir = shift ? -1 : 1;
    setDesiredX(hookRig.position.x + dir * STEP_X);
    return;
  }

  // ---- G：挂钩 Y 步进 ----
  if (key === KEY_HOOK_STEP) {
    if (!hook) return;
    // 这里约定：按 G 下放（更小），Shift+G 回收（更大）
    const dir = shift ? 1 : -1;
    setDesiredHookY(hook.position.y + dir * STEP_HOOK_Y);
    return;
  }

  // ---- R：接口触发随机目标 ----
  if (key === KEY_API) {
    if (fetching) {
      console.warn("[api] request already in progress");
      return;
    }

    fetching = true;
    try {
      const json = await fetchJsonWithTimeout(API_URL, TIMEOUT_MS);
      const uuid =
        (json && (json.uuid || (json.data && json.data.uuid))) ||
        (crypto && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()));

      const seedRot = seed01FromString(uuid + "::rot");
      const seedX = seed01FromString(uuid + "::x");
      const seedHook = seed01FromString(uuid + "::hook");

      const angleDeg = lerp(ANGLE_MIN_DEG, ANGLE_MAX_DEG, seedRot);
      const targetX = lerp(X_MIN, X_MAX, seedX);
      const targetHookY = lerp(HOOK_Y_MIN, HOOK_Y_MAX, seedHook);

      if (topUnit) setDesiredRotY(THREE.MathUtils.degToRad(angleDeg));
      if (hookRig) setDesiredX(targetX);
      if (hook) setDesiredHookY(targetHookY);

      console.log("[api] ok", {
        uuid,
        angleDeg,
        targetX,
        targetHookY,
      });
    } catch (err) {
      console.error("[api] failed", err);
    } finally {
      fetching = false;
    }

    return;
  }
}

/**
 * 可选：场景销毁前调用
 */
function beforeDestroy() {
  fetching = false;
}