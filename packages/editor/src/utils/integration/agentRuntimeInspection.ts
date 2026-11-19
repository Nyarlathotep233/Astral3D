import type { AnimationAction, BufferGeometry, Material, Object3D, Texture } from 'three';

type Field = 'transform' | 'animation' | 'materials';
export interface SampleOptions {
  runId?: string;
  uuids: string[];
  fields?: Field[];
  count?: number;
  intervalMs?: number;
  materialProperties?: string[];
  uniformNames?: string[];
}

const defaultProperties = ['color', 'opacity', 'transparent', 'alphaTest', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'side'];
const isFrameKey = (key: string) => /frame|spriteIndex|uvOffset|uvRepeat|animationState/i.test(key);

// Copy bounded render values now. Three objects and their backing arrays remain live between samples.
function renderValue(value: any): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 256);
  if (value.isTexture) return { textureUuid: value.uuid };
  if (value.isColor) return { hexSRGB: value.getHexString() };
  if (value.isVector2 || value.isVector3 || value.isVector4 || value.isMatrix3 || value.isMatrix4 || value.isQuaternion) return value.toArray();
  if (Array.isArray(value) || ArrayBuffer.isView(value) && 'length' in value) {
    const array = value as ArrayLike<unknown>;
    if (array.length <= 64 && Array.from(array).every(item => typeof item === 'number' || typeof item === 'boolean')) return Array.from(array);
    return { length: array.length, omitted: true };
  }
  return { omitted: true };
}

function readValues(source: Record<string, any>, names: string[]) {
  return Object.fromEntries(names.filter(key => Object.hasOwn(source, key)).map(key => [key, renderValue(source[key])]));
}

function frameState(source: Record<string, any>) {
  return readValues(source, Object.keys(source).filter(isFrameKey).slice(0, 16));
}

function textureState(key: string, texture: Texture) {
  return {
    key, uuid: texture.uuid, offset: texture.offset.toArray(), repeat: texture.repeat.toArray(),
    rotation: texture.rotation, center: texture.center.toArray(), matrix: texture.matrix.toArray(),
    version: texture.version, frame: frameState(texture.userData),
  };
}

function materialState(material: Material & Record<string, any>, slot: number, fields: Set<Field>, options: SampleOptions) {
  const uniforms = material.uniforms ?? {};
  const uniformKeys = Object.keys(uniforms);
  const readUniforms = (keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(uniforms, key))
    .map(key => [key, renderValue(uniforms[key]?.value)]));
  const result: Record<string, unknown> = { slot, uuid: material.uuid, type: material.type };
  if (fields.has('materials')) {
    // Physical materials expose some render parameters (e.g. transmission) through prototype accessors.
    const names = options.materialProperties ?? defaultProperties;
    result.parameters = Object.fromEntries(names.filter(key => key in material && !(key in Object.prototype) && typeof material[key] !== 'function')
      .map(key => [key, renderValue(material[key])]));
    const keys = options.uniformNames ?? uniformKeys.slice(0, 16);
    result.uniforms = readUniforms(keys);
    result.uniformCount = uniformKeys.length;
  }
  if (fields.has('animation')) {
    result.frame = frameState(material.userData);
    result.frameUniforms = readUniforms(uniformKeys.filter(isFrameKey).slice(0, 16));
    const maps = Object.keys(material).filter(key => material[key]?.isTexture)
      .map(key => textureState(key, material[key]));
    for (const key of uniformKeys) {
      const texture = uniforms[key]?.value;
      if (texture?.isTexture) maps.push(textureState('uniforms.' + key, texture));
    }
    result.maps = maps;
  }
  return result;
}

function clipState(entry: Object3D['animations'][number] | AnimationAction) {
  if ('getClip' in entry) {
    const clip = entry.getClip();
    return { uuid: clip.uuid, name: clip.name, duration: clip.duration, time: entry.time,
      running: entry.isRunning(), paused: entry.paused, weight: entry.getEffectiveWeight(), timeScale: entry.getEffectiveTimeScale() };
  }
  return { uuid: entry.uuid, name: entry.name, duration: entry.duration };
}

function sampleObject(object: Object3D, fields: Set<Field>, options: SampleOptions) {
  const result: Record<string, unknown> = { uuid: object.uuid, name: object.name, type: object.type, visible: object.visible };
  if (fields.has('transform')) {
    object.updateWorldMatrix(true, false);
    const position = object.position.clone(), rotation = object.quaternion.clone(), scale = object.scale.clone();
    object.matrixWorld.decompose(position, rotation, scale);
    Object.assign(result, { worldPosition: position.toArray(), worldQuaternion: rotation.toArray(), worldScale: scale.toArray() });
  }
  const mesh = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
  if (fields.has('animation')) {
    const uv = mesh.geometry?.getAttribute('uv');
    const uvValues: number[] = [];
    for (let i = 0; uv && i < Math.min(12, uv.count); i++) uvValues.push(uv.getX(i), uv.getY(i));
    Object.assign(result, { uv: uvValues, uvCount: uv?.count ?? 0, frame: frameState(object.userData),
      clips: object.animations.slice(0, 32).map(clipState), clipCount: object.animations.length });
  }
  if ((fields.has('materials') || fields.has('animation')) && mesh.material) {
    const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    result.materialCount = slots.length;
    result.materials = slots.slice(0, 16).map((material, slot) => materialState(material, slot, fields, options));
  }
  return result;
}

export function sampleRuntimeObjects(root: Object3D, options: SampleOptions) {
  const fields = new Set<Field>(options.fields ?? ['transform', 'animation', 'materials']);
  const wanted = new Set(options.uuids);
  const found = new Map<string, Object3D>();
  // A script can remove or replace objects between samples. Resolve all UUIDs in one tree walk.
  root.traverse(object => { if (wanted.has(object.uuid)) found.set(object.uuid, object); });
  return options.uuids.map(uuid => {
    const object = found.get(uuid);
    return object ? sampleObject(object, fields, options) : { uuid, missing: true };
  });
}

export async function sampleRuntimeSeries(options: SampleOptions, sceneForRun: () => Object3D) {
  const { count = 1, intervalMs = 200 } = options;
  const samples: Array<{ timestampMs: number; objects: ReturnType<typeof sampleRuntimeObjects> }> = [];
  const deadline = performance.now() + 15000;
  const encoder = new TextEncoder();
  let bytes = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, intervalMs));
    if (performance.now() > deadline) throw Object.assign(new Error('The preview could not sample within 15 seconds.'), { code: 'SAMPLE_TIMEOUT' });
    const root = sceneForRun();
    const sample = { timestampMs: performance.now(), objects: sampleRuntimeObjects(root, options) };
    bytes += encoder.encode(JSON.stringify(sample)).byteLength;
    if (bytes > 1900000) throw Object.assign(new Error('Sample result exceeds the response budget. Request fewer objects, fields or samples.'), { code: 'RESULT_TOO_LARGE' });
    samples.push(sample);
  }
  return samples;
}
