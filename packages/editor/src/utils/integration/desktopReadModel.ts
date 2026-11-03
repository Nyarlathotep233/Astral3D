import type { Object3D, Material } from 'three';

export function summarizeObject(object: Object3D, root: Object3D) {
  return {
    uuid: object.uuid, parentUuid: object.parent === root ? null : object.parent?.uuid ?? null,
    name: object.name, type: object.type, visible: object.visible, childCount: object.children.length,
    transform: {
      space: 'local', position: object.position.toArray(),
      rotation: { radians: [object.rotation.x, object.rotation.y, object.rotation.z], order: object.rotation.order },
      scale: object.scale.toArray(),
    },
  };
}

export function queryObjects(root: Object3D, args: { offset?: number; limit?: number; name?: string; type?: string; parentUuid?: string } = {}) {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 50;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page range');
  const items: ReturnType<typeof summarizeObject>[] = [];
  let total = 0;
  root.traverse(object => {
    if (object === root || (args.name !== undefined && !object.name.includes(args.name)) ||
      (args.type !== undefined && object.type !== args.type) ||
      (args.parentUuid !== undefined && object.parent?.uuid !== args.parentUuid)) return;
    if (total >= offset && items.length < limit) items.push(summarizeObject(object, root));
    total++;
  });
  return { items, offset, limit, total, nextOffset: offset + items.length < total ? offset + items.length : null };
}

function summarizeMaterial(material: Material, slot: number) {
  const source = material as Material & Record<string, any>;
  const parameters: Record<string, unknown> = {};
  for (const name of ['opacity', 'transparent', 'side', 'roughness', 'metalness', 'alphaTest', 'depthWrite', 'depthTest', 'wireframe']) {
    if (source[name] !== undefined) parameters[name] = source[name];
  }
  for (const name of ['color', 'emissive']) {
    if (source[name]?.isColor) parameters[name] = { hexSRGB: source[name].getHexString() };
  }
  const textures: Record<string, unknown> = {};
  for (const name of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'displacementMap', 'bumpMap']) {
    if (source[name]?.isTexture) textures[name] = { uuid: source[name].uuid, name: source[name].name };
  }
  return { slot, uuid: material.uuid, type: material.type, name: material.name, parameters, textures };
}

export function inspectObjects(root: Object3D, scripts: Record<string, any[]>, args: { uuids: string[]; includeScripts?: boolean; includeUserData?: boolean }) {
  if (!Array.isArray(args.uuids) || args.uuids.length < 1 || args.uuids.length > 20) throw new Error('Request 1 to 20 object UUIDs');
  return args.uuids.map(uuid => {
    const object = root.getObjectByProperty('uuid', uuid);
    if (!object) throw new Error(`Object not found: ${uuid}`);
    const material = (object as Object3D & { material?: Material | Material[] }).material;
    const geometry = (object as any).geometry;
    const result: Record<string, unknown> = {
      ...summarizeObject(object, root),
      materials: (Array.isArray(material) ? material : material ? [material] : []).map(summarizeMaterial),
      geometry: geometry ? { uuid: geometry.uuid, type: geometry.type, vertexCount: geometry.attributes?.position?.count ?? 0, indexCount: geometry.index?.count ?? 0 } : null,
      scriptCount: scripts[uuid]?.length ?? 0,
    };
    // Explicit opt-in; no App.toJSON(), which cleans/mutates the script table.
    if (args.includeScripts) result.scripts = JSON.parse(JSON.stringify(scripts[uuid] || []));
    if (args.includeUserData) result.userData = JSON.parse(JSON.stringify(object.userData));
    return result;
  });
}
