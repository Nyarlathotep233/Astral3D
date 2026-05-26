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
  return new File([blob], `${safeFilename(prefab.name)}.h3dprefab.zip`, { type: "application/zip" });
}

export async function loadPrefabObject(source: string | Blob): Promise<THREE.Object3D> {
  const prefab = await loadPrefabPackage(source);
  const object = await Loader.objectLoader.parseAsync(prefab.object) as THREE.Object3D;
  object.name = object.name || prefab.name;

  return object;
}

export async function instantiatePrefab(source: string | Blob, position?: THREE.Vector3) {
  const prefab = await loadPrefabPackage(source);
  const object = await Loader.objectLoader.parseAsync(prefab.object) as THREE.Object3D;
  const uuidMap = remapObjectAndResourceUuids(object);
  const scripts = remapScripts(prefab.scripts || {}, uuidMap);

  object.name = object.name || prefab.name;
  object.userData = {
    ...object.userData,
    prefab: {
      mode: "snapshot",
      name: prefab.name,
      rootUuid: prefab.rootUuid,
    },
  };

  if (position) {
    object.position.copy(position);
  }

  App.execute(new AddObjectWithScriptsCommand(object, scripts), `Add Prefab: ${prefab.name || object.name}`);

  return object;
}

export const Prefab = {
  createPrefabFile,
  loadPrefabObject,
  instantiatePrefab,
};
