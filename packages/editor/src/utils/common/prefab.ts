import JSZip from "jszip";
import * as THREE from "three";
import { App, Loader, AddObjectWithScriptsCommand } from "@astral3d/engine";

const PREFAB_SIGNATURE = "h3d-prefab-package";
const PREFAB_VERSION = 1;

export interface PrefabPackage {
  signature: string;
  version: number;
  name: string;
  rootUuid: string;
  savedAt: string;
  object: any;
  scripts: ISceneJson['scripts'];
}

export type Vector3Like = THREE.Vector3 | {
  x?: number;
  y?: number;
  z?: number;
};

export type EulerLike = THREE.Euler | {
  x?: number;
  y?: number;
  z?: number;
  order?: THREE.EulerOrder;
};

export interface InstantiatePrefabOptions {
  name?: string;
  position?: Vector3Like;
  rotation?: EulerLike;
  scale?: Vector3Like;
  userData?: Record<string, any>;
  scriptParams?: Record<string, unknown>;
  commandName?: string;
}

function cloneScript(script: ISceneScript): ISceneScript {
  return JSON.parse(JSON.stringify(script));
}

function safeFilename(input: string) {
  return (input || "Prefab").replace(/[\\/:*?"<>|]/g, "_");
}

function collectPrefabScripts(object: THREE.Object3D): ISceneJson['scripts'] {
  const scripts: ISceneJson['scripts'] = {};

  object.traverse((child) => {
    const sourceScripts = App.scripts[child.uuid];
    if (!sourceScripts || sourceScripts.length === 0) return;
    scripts[child.uuid] = sourceScripts.map((script) => cloneScript(script));
  });

  return scripts;
}

function remapObjectAndResourceUuids(object: THREE.Object3D) {
  const objectUuidMap = new Map<string, string>();
  const geometries = new WeakSet<THREE.BufferGeometry>();
  const materials = new WeakSet<THREE.Material>();
  const textures = new WeakSet<THREE.Texture>();

  function remapTexture(texture: THREE.Texture) {
    if (!texture || textures.has(texture)) return;
    texture.uuid = THREE.MathUtils.generateUUID();
    textures.add(texture);
  }

  function remapMaterial(material: THREE.Material) {
    if (!material || materials.has(material)) return;

    material.uuid = THREE.MathUtils.generateUUID();
    materials.add(material);

    Object.values(material).forEach((value: any) => {
      if (value?.isTexture) remapTexture(value as THREE.Texture);
    });
  }

  object.traverse((child: any) => {
    const oldUuid = child.uuid;
    child.uuid = THREE.MathUtils.generateUUID();
    objectUuidMap.set(oldUuid, child.uuid);

    if (child.geometry && !geometries.has(child.geometry)) {
      child.geometry.uuid = THREE.MathUtils.generateUUID();
      geometries.add(child.geometry);
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => remapMaterial(material));
      } else {
        remapMaterial(child.material);
      }
    }
  });

  return objectUuidMap;
}

function remapScripts(scripts: ISceneJson['scripts'], uuidMap: Map<string, string>): ISceneJson['scripts'] {
  const remappedScripts: ISceneJson['scripts'] = {};

  Object.entries(scripts || {}).forEach(([oldUuid, scriptList]) => {
    const newUuid = uuidMap.get(oldUuid);
    if (!newUuid || !scriptList || scriptList.length === 0) return;
    remappedScripts[newUuid] = scriptList.map((script) => cloneScript(script));
  });

  return remappedScripts;
}

function mergeScriptParams(scripts: ISceneJson['scripts'], params?: Record<string, unknown>) {
  if (!params || Object.keys(params).length === 0) return scripts;

  Object.values(scripts || {}).forEach((scriptList) => {
    scriptList?.forEach((script) => {
      script.params = {
        ...(script.params || {}),
        ...params,
      };
    });
  });

  return scripts;
}

function toVector3(value: Vector3Like | undefined, fallback?: THREE.Vector3) {
  if (!value) return fallback?.clone();
  if (value instanceof THREE.Vector3) return value.clone();

  return new THREE.Vector3(
    Number.isFinite(value.x) ? Number(value.x) : fallback?.x ?? 0,
    Number.isFinite(value.y) ? Number(value.y) : fallback?.y ?? 0,
    Number.isFinite(value.z) ? Number(value.z) : fallback?.z ?? 0,
  );
}

function toEuler(value: EulerLike | undefined, fallback?: THREE.Euler) {
  if (!value) return fallback?.clone();
  if (value instanceof THREE.Euler) return value.clone();

  return new THREE.Euler(
    Number.isFinite(value.x) ? Number(value.x) : fallback?.x ?? 0,
    Number.isFinite(value.y) ? Number(value.y) : fallback?.y ?? 0,
    Number.isFinite(value.z) ? Number(value.z) : fallback?.z ?? 0,
    value.order || fallback?.order || "XYZ",
  );
}

function applyPrefabOptions(object: THREE.Object3D, options: InstantiatePrefabOptions) {
  if (options.name && options.name.trim()) {
    object.name = options.name.trim();
  }

  const position = toVector3(options.position);
  if (position) object.position.copy(position);

  const rotation = toEuler(options.rotation);
  if (rotation) object.rotation.copy(rotation);

  const scale = toVector3(options.scale);
  if (scale) object.scale.copy(scale);

  if (options.userData) {
    object.userData = {
      ...object.userData,
      ...options.userData,
    };
  }
}

async function loadPrefabPackage(source: string | Blob): Promise<PrefabPackage> {
  const blob = typeof source === "string" ? await fetch(source).then((res) => {
    if (!res.ok) throw new Error(`Prefab load failed: ${res.status}`);
    return res.blob();
  }) : source;

  const zip = await JSZip.loadAsync(blob);
  const prefabFile = zip.file("prefab.json");
  if (!prefabFile) throw new Error("Invalid prefab package: missing prefab.json");

  const prefab = JSON.parse(await prefabFile.async("string")) as PrefabPackage;
  if (prefab.signature !== PREFAB_SIGNATURE || prefab.version !== PREFAB_VERSION || !prefab.object) {
    throw new Error("Invalid prefab package");
  }

  return prefab;
}

export async function createPrefabFile(object: THREE.Object3D) {
  const prefab: PrefabPackage = {
    signature: PREFAB_SIGNATURE,
    version: PREFAB_VERSION,
    name: object.name || "Prefab",
    rootUuid: object.uuid,
    savedAt: new Date().toISOString(),
    object: object.toJSON(),
    scripts: collectPrefabScripts(object),
  };

  const zip = new JSZip();
  zip.file("prefab.json", JSON.stringify(prefab, null, 2), {
    compression: "DEFLATE",
    compressionOptions: {
      level: 7,
    },
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const shortId = THREE.MathUtils.generateUUID().slice(0, 8);
  return new File([blob], `${safeFilename(prefab.name)}-${shortId}.h3dprefab.zip`, { type: "application/zip" });
}

export async function loadPrefabObject(source: string | Blob): Promise<THREE.Object3D> {
  const prefab = await loadPrefabPackage(source);
  const object = await Loader.objectLoader.parseAsync(prefab.object) as THREE.Object3D;
  object.name = object.name || prefab.name;

  return object;
}

export async function instantiatePrefab(source: string | Blob, positionOrOptions?: THREE.Vector3 | InstantiatePrefabOptions) {
  const options: InstantiatePrefabOptions = positionOrOptions instanceof THREE.Vector3
    ? { position: positionOrOptions }
    : positionOrOptions || {};

  const prefab = await loadPrefabPackage(source);
  const object = await Loader.objectLoader.parseAsync(prefab.object) as THREE.Object3D;
  const uuidMap = remapObjectAndResourceUuids(object);
  const scripts = mergeScriptParams(remapScripts(prefab.scripts || {}, uuidMap), options.scriptParams);

  object.name = object.name || prefab.name;
  object.userData = {
    ...object.userData,
    prefab: {
      mode: "snapshot",
      name: prefab.name,
      rootUuid: prefab.rootUuid,
    },
  };

  applyPrefabOptions(object, options);

  App.execute(new AddObjectWithScriptsCommand(object, scripts), options.commandName || `Add Prefab: ${prefab.name || object.name}`);

  return object;
}

export const Prefab = {
  createPrefabFile,
  loadPrefabObject,
  instantiatePrefab,
};
