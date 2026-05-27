import * as THREE from "three";
import {App} from "@astral3d/engine";
import {instantiatePrefab} from "@/utils/common/prefab";
import {saveSceneToService} from "@/utils/common/saveSceneToService";
import {getBuiltinPrefabResource} from "@/views/editor/components/extraPane/resource/builtin/prefabRegistry";

const SCENE_QUERY_TYPE = "H3D_EDITOR_SCENE_QUERY";
const SCENE_QUERY_ACK_TYPE = "H3D_EDITOR_SCENE_QUERY_ACK";
const OBJECT_ADD_TYPE = "H3D_EDITOR_OBJECT_ADD";
const OBJECT_ADD_ACK_TYPE = "H3D_EDITOR_OBJECT_ADD_ACK";
const SCENE_SAVE_TYPE = "H3D_EDITOR_SCENE_SAVE";
const SCENE_SAVE_ACK_TYPE = "H3D_EDITOR_SCENE_SAVE_ACK";
const BRIDGE_READY_TYPE = "H3D_EDITOR_BRIDGE_READY";

const ALLOWED_ORIGINS = new Set([
  "https://d6ctest.haolink.cn",
  "https://d6cnext.haolink.cn",
  "http://d6c.haolink.cn:20001",
  "http://localhost:8001",
]);

type VectorPayload = {
  x?: unknown;
  y?: unknown;
  z?: unknown;
};

type RotationPayload = VectorPayload & {
  order?: unknown;
};

type ObjectAddPayload = {
  prefabKey?: unknown;
  name?: unknown;
  position?: VectorPayload;
  rotation?: RotationPayload;
  scale?: VectorPayload;
  transform?: {
    position?: VectorPayload;
    rotation?: RotationPayload;
    scale?: VectorPayload;
  };
  userData?: Record<string, unknown>;
  scriptParams?: Record<string, unknown>;
  commandName?: unknown;
};

type EditorObjectsMessage = {
  type?: unknown;
  requestId?: unknown;
  payload?: ObjectAddPayload;
};

type PendingMessage = {
  origin: string;
  source: MessageEventSource | null;
  data: EditorObjectsMessage;
};

let installed = false;
let sceneReady = false;
let pendingMessages: PendingMessage[] = [];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined || value === null) return value;

  try {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(value);
    }

    return value;
  } catch {
    return value;
  }
}

function serializeVector3(value: THREE.Vector3) {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function serializeEuler(value: THREE.Euler) {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
    order: value.order,
  };
}

function parseVector3(value: unknown, fieldName: string) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) throw new Error(`${fieldName} 必须是对象`);

  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);

  if (x === null || y === null || z === null) {
    throw new Error(`${fieldName} 必须包含有效的 x/y/z 数值`);
  }

  return new THREE.Vector3(x, y, z);
}

function isEulerOrder(value: string): value is THREE.EulerOrder {
  return ["XYZ", "YZX", "ZXY", "XZY", "YXZ", "ZYX"].includes(value);
}

function parseEuler(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) throw new Error("rotation 必须是对象");

  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);

  if (x === null || y === null || z === null) {
    throw new Error("rotation 必须包含有效的 x/y/z 数值");
  }

  const order = stringValue(value.order);
  return new THREE.Euler(x, y, z, isEulerOrder(order) ? order : "XYZ");
}

function serializeScript(script: ISceneScript) {
  return {
    name: script.name,
    source: script.source,
    params: cloneJsonValue(script.params || {}),
  };
}

function getObjectPath(object: THREE.Object3D) {
  const names: string[] = [];
  let current: THREE.Object3D | null = object;

  while (current && current !== App.scene) {
    names.unshift(current.name || current.type || current.uuid);
    current = current.parent;
  }

  return names;
}

function serializeObject(object: THREE.Object3D) {
  return {
    uuid: object.uuid,
    name: object.name,
    type: object.type,
    visible: object.visible,
    path: getObjectPath(object),
    transform: {
      position: serializeVector3(object.position),
      rotation: serializeEuler(object.rotation),
      scale: serializeVector3(object.scale),
    },
    userData: cloneJsonValue(object.userData || {}),
    scripts: (App.scripts[object.uuid] || []).map((script) => serializeScript(script)),
  };
}

function buildSceneQueryPayload() {
  const objects: ReturnType<typeof serializeObject>[] = [];

  App.scene.traverse((object) => {
    if (object === App.scene) return;
    objects.push(serializeObject(object));
  });

  return {
    ok: true,
    objects,
    errors: [],
  };
}

function normalizeObjectAddPayload(payload: ObjectAddPayload | undefined) {
  if (!isPlainObject(payload)) throw new Error("payload 必须是对象");

  const prefabKey = stringValue(payload.prefabKey);
  if (!prefabKey) throw new Error("prefabKey 不能为空");

  const prefab = getBuiltinPrefabResource(prefabKey);
  if (!prefab) throw new Error(`不支持的 prefabKey: ${prefabKey}`);

  const transform = isPlainObject(payload.transform) ? payload.transform : {};

  return {
    prefab,
    prefabKey,
    name: stringValue(payload.name),
    position: parseVector3(payload.position ?? transform.position, "position"),
    rotation: parseEuler(payload.rotation ?? transform.rotation),
    scale: parseVector3(payload.scale ?? transform.scale, "scale"),
    userData: isPlainObject(payload.userData) ? payload.userData : {},
    scriptParams: isPlainObject(payload.scriptParams) ? payload.scriptParams : {},
    commandName: stringValue(payload.commandName),
  };
}

async function buildObjectAddPayload(payload: ObjectAddPayload | undefined) {
  const item = normalizeObjectAddPayload(payload);
  const object = await instantiatePrefab(item.prefab.path, {
    name: item.name,
    position: item.position,
    rotation: item.rotation,
    scale: item.scale,
    userData: item.userData,
    scriptParams: item.scriptParams,
    commandName: item.commandName || `External Add: ${item.name || item.prefab.name}`,
  });

  return {
    ok: true,
    objectUuid: object.uuid,
    object: serializeObject(object),
    errors: [],
  };
}

async function buildSceneSavePayload() {
  const sceneInfo = await saveSceneToService();

  return {
    ok: true,
    sceneInfo: cloneJsonValue(sceneInfo || {}),
    errors: [],
  };
}

function postResponse(message: PendingMessage, type: string, payload: Record<string, unknown>) {
  const response = {
    type,
    requestId: message.data.requestId,
    payload,
  };

  const target = message.source || (globalThis.parent === globalThis ? null : globalThis.parent);
  if (!target) return;

  target.postMessage(response, { targetOrigin: message.origin });
}

function getParentTargetOrigin() {
  try {
    const referrerOrigin = new URL(globalThis.document.referrer).origin;
    return ALLOWED_ORIGINS.has(referrerOrigin) ? referrerOrigin : "*";
  } catch {
    return "*";
  }
}

function postBridgeReady() {
  if (globalThis.parent === globalThis) return;

  globalThis.parent.postMessage(
    {
      type: BRIDGE_READY_TYPE,
      payload: {
        sceneReady,
      },
    },
    getParentTargetOrigin(),
  );
}

function postErrorResponse(message: PendingMessage, type: string, error: unknown) {
  const fallbackMessage = (() => {
    try {
      return JSON.stringify(error);
    } catch {
      return "未知错误";
    }
  })();

  postResponse(message, type, {
    ok: false,
    errors: [{ message: error instanceof Error ? error.message : fallbackMessage }],
  });
}

async function handleEditorObjectsMessage(message: PendingMessage) {
  if (message.data.type === SCENE_QUERY_TYPE) {
    postResponse(message, SCENE_QUERY_ACK_TYPE, buildSceneQueryPayload());
    return;
  }

  if (message.data.type === OBJECT_ADD_TYPE) {
    postResponse(message, OBJECT_ADD_ACK_TYPE, await buildObjectAddPayload(message.data.payload));
    return;
  }

  if (message.data.type === SCENE_SAVE_TYPE) {
    postResponse(message, SCENE_SAVE_ACK_TYPE, await buildSceneSavePayload());
  }
}

function getAckType(type: unknown) {
  if (type === OBJECT_ADD_TYPE) return OBJECT_ADD_ACK_TYPE;
  if (type === SCENE_SAVE_TYPE) return SCENE_SAVE_ACK_TYPE;
  return SCENE_QUERY_ACK_TYPE;
}

function flushPendingMessages() {
  if (!sceneReady || pendingMessages.length === 0) return;

  const messages = pendingMessages;
  pendingMessages = [];
  messages.forEach((message) => {
    handleEditorObjectsMessage(message).catch((error) => {
      postErrorResponse(
        message,
        getAckType(message.data.type),
        error,
      );
    });
  });
}

function handleWindowMessage(event: MessageEvent) {
  const data = event.data as EditorObjectsMessage;

  if (
    !isPlainObject(data) ||
    (data.type !== SCENE_QUERY_TYPE && data.type !== OBJECT_ADD_TYPE && data.type !== SCENE_SAVE_TYPE)
  ) {
    return;
  }

  if (!ALLOWED_ORIGINS.has(event.origin)) {
    console.warn("[editor-objects-bridge] blocked origin:", event.origin);
    return;
  }

  const message = {
    origin: event.origin,
    source: event.source,
    data,
  };

  if (!sceneReady) {
    pendingMessages.push(message);
    return;
  }

  handleEditorObjectsMessage(message).catch((error) => {
    postErrorResponse(
      message,
      getAckType(data.type),
      error,
    );
  });
}

export function installEditorObjectsBridge() {
  if (installed) return;

  globalThis.addEventListener("message", handleWindowMessage);
  installed = true;
  postBridgeReady();
}

export function uninstallEditorObjectsBridge() {
  if (!installed) return;

  globalThis.removeEventListener("message", handleWindowMessage);
  installed = false;
  sceneReady = false;
  pendingMessages = [];
}

export function setEditorObjectsBridgeReady(ready: boolean) {
  sceneReady = ready;
  postBridgeReady();
  flushPendingMessages();
}
