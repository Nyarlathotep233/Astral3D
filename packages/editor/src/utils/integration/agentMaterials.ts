import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { THREE, App, Hooks, AtomicBatchCommand, CircleGridShaderMaterial, DynamicCheckerboardShaderMaterial,
  FlickerShaderMaterial, SlowSmokeShaderMaterial, SnowingShaderMaterial, StreamerWallShaderMaterial } from '@astral3d/engine';
import type { AgentEditContext, AgentOperation, EditStep } from './agentTypes';
import { recordAgentDiagnostic } from './agentDiagnostics';
import { fetchAgentFile } from './agentFiles';

const MATERIALS = { LineBasicMaterial: THREE.LineBasicMaterial, LineDashedMaterial: THREE.LineDashedMaterial,
  MeshBasicMaterial: THREE.MeshBasicMaterial, MeshDepthMaterial: THREE.MeshDepthMaterial,
  MeshNormalMaterial: THREE.MeshNormalMaterial, MeshLambertMaterial: THREE.MeshLambertMaterial,
  MeshMatcapMaterial: THREE.MeshMatcapMaterial, MeshPhongMaterial: THREE.MeshPhongMaterial,
  MeshToonMaterial: THREE.MeshToonMaterial, MeshStandardMaterial: THREE.MeshStandardMaterial,
  MeshPhysicalMaterial: THREE.MeshPhysicalMaterial, ShaderMaterial: THREE.ShaderMaterial,
  RawShaderMaterial: THREE.RawShaderMaterial, ShadowMaterial: THREE.ShadowMaterial,
  SpriteMaterial: THREE.SpriteMaterial, PointsMaterial: THREE.PointsMaterial };
const BUILTINS = { CircleGridShaderMaterial, DynamicCheckerboardShaderMaterial, FlickerShaderMaterial,
  SlowSmokeShaderMaterial, SnowingShaderMaterial, StreamerWallShaderMaterial };
const loadedTextures = new WeakMap<AgentOperation, THREE.Texture>();
const textureFields = new Set(['name', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'flipY',
  'colorSpace', 'offset', 'repeat', 'center', 'rotation', 'generateMipmaps', 'channel', 'premultiplyAlpha']);
const blockedFields = new Set(['id', 'uuid', 'type', 'version', 'onBeforeCompile', 'customProgramCacheKey',
  'dispose', 'clone', 'copy', 'toJSON', 'constructor', '__proto__', 'prototype', 'isMaterial', 'needsUpdate']);

export function agentMaterialHelp() {
  return { materialKinds: Object.keys(MATERIALS), builtins: Object.keys(BUILTINS),
    uniformTypes: ['float', 'int', 'bool', 'color', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'texture', 'float[]', 'int[]'],
    scope: 'object clones the selected material slot; shared changes all objects using that material.',
    textures: 'Use textureUuid to reuse a loaded texture, or url/artifactUrl to load a new texture before committing. Texture configuration creates a copy.',
    shaders: 'GLSL is compiled and linked by the current WebGL renderer using the target geometry and scene lights before mutation.',
    operations: {
      'material-create': { target: '{uuid}|{ref}', kind: 'materialKinds or builtins entry', slot: 'integer, default 0', name: 'optional', values: 'THREE material properties; colors as CSS strings, vectors as numeric arrays', vertexShader: 'optional full GLSL', fragmentShader: 'optional full GLSL', uniforms: 'optional map of {type,value}', defines: 'optional map', glslVersion: 'optional 300 es' },
      material: { target: '{uuid}|{ref}', slot: 'default 0', scope: 'object (default) | shared', values: 'property patch; uniforms/defines replace their map', vertexShader: 'optional', fragmentShader: 'optional', uniforms: 'optional', defines: 'optional' },
      'material-assign': { target: '{uuid}|{ref}', slot: 'default 0', materialUuid: 'existing material UUID' },
      texture: { target: '{uuid}|{ref}', slot: 'material slot, default 0', scope: 'object | shared', map: 'map | normalMap | roughnessMap | other material texture property', uniform: 'alternative to map: shader sampler uniform name', textureUuid: 'existing UUID or null to clear', url: 'alternative to textureUuid: image URL', artifactUrl: 'alternative upload artifact URL', format: 'image | hdr | exr', textureValues: 'wrapS/wrapT, repeat:[x,y], offset:[x,y], rotation, colorSpace, flipY, anisotropy, etc.' },
      'texture-create': { url: 'image URL, or artifactUrl', format: 'image | hdr | exr', uuid: 'optional caller-generated UUID for reuse in the same batch', name: 'optional', textureValues: 'optional texture configuration; unreferenced resources are not serialized into scene files' },
      environment: { slot: 'background | environment | both', url: 'image/HDR/EXR URL, or artifactUrl, or textureUuid', textureUuid: 'existing UUID or null to clear', format: 'image | hdr | exr', intensity: 'nonnegative number', blurriness: '0..1 background blur', rotation: '[x,y,z] radians' },
    }, examples: [
      { type: 'material-create', target: { ref: 'surface' }, kind: 'ShaderMaterial', vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 tint; void main(){gl_FragColor=vec4(tint,1.0);}', uniforms: { tint: { type: 'color', value: '#44aaff' } } },
      { type: 'texture', target: { ref: 'surface' }, uniform: 'albedo', artifactUrl: '/agent/artifacts/UPLOAD_ID/files/albedo.png', textureValues: { colorSpace: 'srgb', wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [4,4] } },
      { type: 'environment', slot: 'both', url: '/static/resource/hdr/cloudy.hdr', format: 'hdr', intensity: 0.8, rotation: [0, 0.5, 0] },
    ] };
}

function textureUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Texture URL is required');
  const url = new URL(value, location.origin);
  if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) throw new Error('Unsupported texture URL scheme');
  if (url.protocol === 'data:' && !value.startsWith('data:image/')) throw new Error('Texture data URL must contain an image');
  return url.href;
}

/** Call before revision validation. Cleanup is only for a failed batch, never a committed history item. */
export async function prepareMaterialResources(operations: AgentOperation[]): Promise<() => void> {
  const created: THREE.Texture[] = [];
  try {
    for (const op of operations) {
      if (!['texture', 'texture-create', 'environment'].includes(op.type) || !(op.url || op.artifactUrl)) continue;
      const response = await fetchAgentFile(textureUrl(op.url || op.artifactUrl), { signal: AbortSignal.timeout(60_000) });
      const blob = await response.blob();
      if (blob.size > 64 * 1024 * 1024) throw new Error('Texture exceeds 64 MiB');
      const objectUrl = URL.createObjectURL(blob);
      let texture: THREE.Texture;
      const format = op.format || (/\.hdr(?:[?#]|$)/i.test(op.url || op.artifactUrl) ? 'hdr' : /\.exr(?:[?#]|$)/i.test(op.url || op.artifactUrl) ? 'exr' : 'image');
      try {
        if (!['image', 'hdr', 'exr'].includes(format)) throw new Error('Texture format must be image, hdr or exr');
        texture = await (format === 'hdr' ? new RGBELoader() : format === 'exr' ? new EXRLoader() : new THREE.TextureLoader()).loadAsync(objectUrl);
      }
      finally { URL.revokeObjectURL(objectUrl); }
      if (format === 'hdr' || format === 'exr' || op.type === 'environment') texture.mapping = THREE.EquirectangularReflectionMapping;
      if (op.uuid !== undefined) {
        if (typeof op.uuid !== 'string' || !/^[\da-f-]{36}$/i.test(op.uuid)) throw new Error('Texture uuid must be a UUID');
        texture.uuid = op.uuid;
      }
      texture.name = op.name || '';
      loadedTextures.set(op, texture);
      created.push(texture);
    }
  } catch (error) {
    created.forEach(texture => texture.dispose());
    recordAgentDiagnostic({ kind: 'resource', severity: 'error', phase: 'texture-load', message: String(error) });
    throw error;
  }
  return () => created.forEach(texture => { if (!Object.values(App.textures).includes(texture)) texture.dispose(); });
}

function cloneValue(value: any): any {
  if (value?.isTexture) return value;
  if (value?.clone) return value.clone();
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function cloneMaterial(material: THREE.Material): THREE.Material {
  const result = material.clone();
  if ('uniforms' in material) (result as THREE.ShaderMaterial).uniforms = cloneValue((material as THREE.ShaderMaterial).uniforms);
  return result;
}

function finiteArray(value: any, length?: number): number[] {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length) || value.some(item => !Number.isFinite(item))) {
    throw new Error(`Expected ${length ?? 'an array of'} finite numbers`);
  }
  return value;
}

function findTexture(uuid: string): THREE.Texture {
  if (App.textures[uuid]) return App.textures[uuid];
  for (const material of Object.values(App.materials)) {
    for (const value of Object.values(material)) if ((value as any)?.isTexture && (value as any).uuid === uuid) return value as THREE.Texture;
    for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms || {})) {
      if ((uniform.value as any)?.isTexture && uniform.value.uuid === uuid) return uniform.value;
    }
  }
  throw new Error(`Texture not found: ${uuid}`);
}

export function decodeAgentUniform(input: any, previous?: any): any {
  if (!input || typeof input !== 'object' || !('value' in input)) throw new Error('A uniform needs {type, value}');
  const value = input.value;
  switch (input.type) {
    case 'float': if (!Number.isFinite(value)) throw new Error('Uniform float must be finite'); return value;
    case 'int': if (!Number.isInteger(value)) throw new Error('Uniform int must be an integer'); return value;
    case 'bool': if (typeof value !== 'boolean') throw new Error('Uniform bool must be boolean'); return value;
    case 'color': return new THREE.Color(value?.hexSRGB ? `#${value.hexSRGB}` : value);
    case 'vec2': return new THREE.Vector2().fromArray(finiteArray(value, 2));
    case 'vec3': return new THREE.Vector3().fromArray(finiteArray(value, 3));
    case 'vec4': return new THREE.Vector4().fromArray(finiteArray(value, 4));
    case 'mat3': return new THREE.Matrix3().fromArray(finiteArray(value, 9));
    case 'mat4': return new THREE.Matrix4().fromArray(finiteArray(value, 16));
    case 'texture': return value === null ? null : findTexture(typeof value === 'string' ? value : value.uuid);
    case 'float[]': return finiteArray(value).slice();
    case 'int[]': if (finiteArray(value).some(item => !Number.isInteger(item))) throw new Error('Uniform int[] must contain integers'); return value.slice();
    case undefined: {
      // GUI program properties retain existing typed values; new vector/sampler values require an explicit type.
      if (previous?.isColor) {
        // Color.toJSON() encodes sRGB as an integer. Keep the original linear
        // precision when the GUI only edited another uniform.
        if (value === previous.getHex()) return previous.clone();
        if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) return new THREE.Color(value);
        if ([value?.r, value?.g, value?.b].every(Number.isFinite)) return new THREE.Color().setRGB(value.r, value.g, value.b);
        throw new Error('Color uniform requires a 24-bit sRGB integer or finite r/g/b channels');
      }
      if (previous?.isVector2) return new THREE.Vector2(value.x, value.y);
      if (previous?.isVector3) return new THREE.Vector3(value.x, value.y, value.z);
      if (previous?.isVector4) return new THREE.Vector4(value.x, value.y, value.z, value.w);
      if (previous?.isMatrix3) return new THREE.Matrix3().fromArray(finiteArray(value.elements, 9));
      if (previous?.isMatrix4) return new THREE.Matrix4().fromArray(finiteArray(value.elements, 16));
      if (previous?.isTexture) return findTexture(typeof value === 'string' ? value : value.uuid);
      if (value === null || typeof value === 'boolean' || typeof value === 'string' || Number.isFinite(value) || Array.isArray(value)) return cloneValue(value);
      throw new Error('Structured uniform values require a type');
    }
    default: throw new Error(`Unsupported uniform type: ${input.type}`);
  }
}

function assignValue(target: any, key: string, value: any) {
  const current = target[key];
  if (current?.isColor) target[key] = new THREE.Color(value?.hexSRGB ? `#${value.hexSRGB}` : value);
  else if (current?.isVector2) target[key] = new THREE.Vector2().fromArray(finiteArray(value, 2));
  else if (current?.isVector3) target[key] = new THREE.Vector3().fromArray(finiteArray(value, 3));
  else if (current?.isVector4) target[key] = new THREE.Vector4().fromArray(finiteArray(value, 4));
  else if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${key} must be finite`);
  else target[key] = cloneValue(value);
}

function applyValues(material: THREE.Material, values: Record<string, any> = {}) {
  for (const [key, value] of Object.entries(values)) {
    if (blockedFields.has(key) || key.startsWith('is') || !(key in material) || typeof (material as any)[key] === 'function') {
      throw new Error(`Unsupported material property: ${key}`);
    }
    if (key === 'uniforms') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Uniforms must be an object');
      const previous = (material as THREE.ShaderMaterial).uniforms;
      (material as THREE.ShaderMaterial).uniforms = Object.fromEntries(Object.entries(value).map(([name, uniform]) =>
        [name, { value: decodeAgentUniform(uniform, previous?.[name]?.value) }]));
    } else if (key === 'defines') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Defines must be an object');
      for (const [name, define] of Object.entries(value)) {
        if (!/^[A-Za-z_]\w*$/.test(name) || !['string', 'number', 'boolean'].includes(typeof define) || /[\r\n]/.test(String(define))) throw new Error(`Invalid shader define: ${name}`);
      }
      (material as THREE.ShaderMaterial).defines = { ...value };
    } else if (key.endsWith('Map') || key === 'map' || key === 'matcap' || key === 'gradientMap') {
      (material as any)[key] = value === null ? null : findTexture(typeof value === 'string' ? value : value.uuid);
    } else assignValue(material, key, value);
  }
  material.needsUpdate = true;
}

export function validateMaterialForObject(object: THREE.Object3D, material: THREE.Material) {
  const renderer = window.viewer?.renderer as THREE.WebGLRenderer;
  if (!(renderer as any)?.isWebGLRenderer) throw new Error('Material validation requires the active WebGL renderer');
  const proxy = object.clone(false) as THREE.Mesh;
  proxy.material = material;
  proxy.visible = true;
  renderer.compile(proxy, window.viewer.camera, App.scene);
  const programs: Map<string, any> | undefined = (renderer.properties.get(material) as any).programs;
  if (!programs?.size) throw new Error('No GPU shader program was compiled for this object');
  const gl = renderer.getContext();
  for (const program of programs.values()) {
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      const shaders = gl.getAttachedShaders(program.program) || [];
      const logs = shaders.map(shader => `${gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}: ${gl.getShaderInfoLog(shader) || ''}`);
      const message = [gl.getProgramInfoLog(program.program), ...logs].filter(Boolean).join('\n');
      recordAgentDiagnostic({ kind: 'shader', severity: 'error', phase: 'compile', objectUuid: object.uuid, sceneId: String(App.project.getKey('sceneInfo.id') || ''),
        materialUuid: material.uuid, message: message || 'GPU shader linking failed' });
      throw new Error(`GPU shader compilation failed: ${message}`);
    }
  }
}

function materialAt(object: THREE.Object3D, slot: number): THREE.Material {
  if (!Number.isInteger(slot) || slot < 0) throw new Error('Material slot must be a nonnegative integer');
  const value = (object as THREE.Mesh).material;
  const result = Array.isArray(value) ? value[slot] : slot === 0 ? value : null;
  if (!result?.isMaterial) throw new Error(`Material slot not found: ${slot}`);
  return result;
}

function registerTextures(material: THREE.Material) {
  for (const value of Object.values(material)) if ((value as any)?.isTexture) App.textures[(value as THREE.Texture).uuid] = value as THREE.Texture;
  for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms || {})) {
    if (uniform.value?.isTexture) App.textures[uniform.value.uuid] = uniform.value;
  }
}

function swapMaterial(object: THREE.Object3D, slot: number, replacement: THREE.Material) {
  const previous = materialAt(object, slot);
  if (previous === replacement) return;
  App.setObjectMaterial(object, slot, replacement);
  App.removeMaterialFromRefCounter(previous);
  App.addMaterialToRefCounter(replacement);
  registerTextures(replacement);
  Hooks.useDispatchSignal('materialRemoved');
  Hooks.useDispatchSignal('materialAdded');
  Hooks.useDispatchSignal('materialChanged', replacement);
}

// Ref counts are internal in the legacy SDK; retain the exact map during transactional recovery.
function materialRefCounts() { return (App as unknown as { materialsRefCounter: Map<THREE.Material, number> }).materialsRefCounter; }
function notifyEnvironment() {
  window.viewer.updatePTBackground();
  window.viewer.updatePTEnvironment();
  Hooks.useDispatchSignal('sceneGraphChanged');
}

export function prepareMaterialOperation(op: AgentOperation, ctx: AgentEditContext): boolean {
  if (op.type === 'texture-create' || op.type === 'environment' && (op.slot !== undefined || op.url || op.artifactUrl)) {
    ctx.steps.push((): EditStep => {
      const scene = App.scene;
      const signals = window.viewer?.modules?.registerSignal as unknown as { useBackgroundAsEnvironment: boolean } | undefined;
      const previousCoupling = signals?.useBackgroundAsEnvironment;
      let texture = loadedTextures.get(op) || (op.textureUuid ? findTexture(op.textureUuid) : null);
      if (!texture && !(op.type === 'environment' && op.textureUuid === null)) throw new Error('Texture resource must be loaded before committing');
      if (texture && op.textureValues) {
        texture = texture.clone();
        if (op.type === 'texture-create' && op.uuid) texture.uuid = op.uuid;
        for (const [key, value] of Object.entries(op.textureValues)) {
          if (!textureFields.has(key)) throw new Error(`Unsupported texture property: ${key}`);
          assignValue(texture, key, value);
        }
        texture.needsUpdate = true;
        const configured = texture;
        ctx.cleanup.push(() => { if (!Object.values(App.textures).includes(configured)) configured.dispose(); });
      }
      if (op.type === 'texture-create' && texture && App.textures[texture.uuid]) throw new Error(`Texture UUID is already registered: ${texture.uuid}`);
      const registryBefore = { ...App.textures };
      const fields = ['background', 'environment', 'backgroundIntensity', 'environmentIntensity', 'backgroundBlurriness', 'backgroundRotation', 'environmentRotation'];
      const previous = Object.fromEntries(fields.map(key => [key, (scene as any)[key]?.isEuler ? (scene as any)[key].clone() : (scene as any)[key]]));
      const slots = op.slot === 'both' ? ['background', 'environment'] : [op.slot || 'environment'];
      if (op.type === 'environment' && slots.some(slot => !['background', 'environment'].includes(slot))) throw new Error('Environment slot must be background, environment or both');
      for (const key of ['intensity', 'blurriness']) if (op[key] !== undefined && (!Number.isFinite(op[key]) || op[key] < 0 || (key === 'blurriness' && op[key] > 1))) throw new Error(`Invalid environment ${key}`);
      if (op.rotation !== undefined) finiteArray(op.rotation, 3);
      let applied = false;
      return {
        execute() {
          applied = true;
          if (texture) App.textures[texture.uuid] = texture;
          if (op.type === 'environment') {
            if (slots.includes('environment') && signals) signals.useBackgroundAsEnvironment = false;
            for (const slot of slots) {
              (scene as any)[slot] = texture;
              if (op.intensity !== undefined) (scene as any)[`${slot}Intensity`] = op.intensity;
              if (op.rotation !== undefined) (scene as any)[`${slot}Rotation`].set(...op.rotation);
            }
            if (!slots.includes('environment') && signals?.useBackgroundAsEnvironment) {
              scene.environment = texture;
              scene.environmentRotation.copy(scene.backgroundRotation);
            }
            if (op.blurriness !== undefined) scene.backgroundBlurriness = op.blurriness;
            notifyEnvironment();
          }
        },
        undo() {
          if (!applied) return;
          for (const key of Object.keys(App.textures)) delete App.textures[key];
          Object.assign(App.textures, registryBefore);
          if (op.type === 'environment') {
            if (signals && previousCoupling !== undefined) signals.useBackgroundAsEnvironment = previousCoupling;
            for (const key of fields) (scene as any)[key] = previous[key];
            notifyEnvironment();
          }
          applied = false;
        },
      };
    });
    return true;
  }
  if (!['material', 'material-create', 'material-assign', 'texture'].includes(op.type)) return false;
  const object = ctx.resolve(op.target);
  const slot = op.slot ?? 0;
  if (op.scope !== undefined && !['object', 'shared'].includes(op.scope)) throw new Error('Material scope must be object or shared');
  ctx.steps.push((): EditStep => {
    const previous = materialAt(object, slot);
    const registryBefore = { materials: { ...App.materials }, textures: { ...App.textures }, refs: new Map(materialRefCounts()) };
    const shared = op.type !== 'material-create' && op.type !== 'material-assign' && op.scope === 'shared';
    const before = cloneMaterial(previous);
    let next: THREE.Material;
    if (op.type === 'material-assign') {
      next = App.materials[op.materialUuid];
      if (!next) throw new Error(`Material not found: ${op.materialUuid}`);
    } else if (op.type === 'material-create') {
      const kind = op.kind as keyof typeof MATERIALS;
      const builtin = BUILTINS[op.kind as keyof typeof BUILTINS];
      if (builtin) {
        next = builtin.InstanceShaderMaterial();
        next.userData.h3dBuiltinMaterial = op.kind;
      } else {
        const Constructor = MATERIALS[kind];
        if (!Constructor) throw new Error(`Unsupported material kind: ${op.kind}`);
        next = new Constructor();
      }
      if (op.name !== undefined) next.name = String(op.name);
    } else next = cloneMaterial(previous);
    if (op.type !== 'material-assign') {
      const values = { ...(op.values || {}) };
      for (const key of ['vertexShader', 'fragmentShader', 'uniforms', 'defines', 'glslVersion']) if (op[key] !== undefined) values[key] = op[key];
      applyValues(next, values);
    }
    if (op.type === 'texture') {
      const field = op.map || 'map';
      if (op.uniform !== undefined) {
        if (!('uniforms' in next) || typeof op.uniform !== 'string' || !/^[A-Za-z_]\w*$/.test(op.uniform)) throw new Error('Sampler uniform needs a shader material and a valid identifier');
      } else if (!(field in next) || !(field === 'map' || field === 'matcap' || /Map$/.test(field))) throw new Error(`Unsupported texture slot: ${field}`);
      let texture = op.textureUuid === null ? null : loadedTextures.get(op) || (op.textureUuid ? findTexture(op.textureUuid) : null);
      if (!texture && op.textureUuid !== null) throw new Error('Texture must be preloaded or identified by textureUuid');
      if (texture && op.textureValues) {
        texture = texture.clone();
        const configuredTexture = texture;
        ctx.cleanup.push(() => { if (!Object.values(App.textures).includes(configuredTexture)) configuredTexture.dispose(); });
        for (const [key, value] of Object.entries(op.textureValues)) {
          if (!textureFields.has(key)) throw new Error(`Unsupported texture property: ${key}`);
          assignValue(texture, key, value);
        }
        texture.needsUpdate = true;
      }
      if (op.uniform) (next as THREE.ShaderMaterial).uniforms[op.uniform] = { value: texture };
      else (next as any)[field] = texture;
      next.needsUpdate = true;
    }
    if (op.type !== 'material-assign') ctx.cleanup.push(() => { if (!Object.values(App.materials).includes(next)) next.dispose(); });
    let applied = false;
    return {
      execute() {
        // This is synchronous and happens before touching the live material/slot.
        validateMaterialForObject(object, next);
        applied = true;
        if (shared) {
          previous.copy(next);
          if ('uniforms' in next) (previous as THREE.ShaderMaterial).uniforms = cloneValue((next as THREE.ShaderMaterial).uniforms);
          previous.needsUpdate = true;
          registerTextures(previous);
          Hooks.useDispatchSignal('materialChanged', previous);
        } else swapMaterial(object, slot, next);
        Hooks.useDispatchSignal('objectChanged', object);
      },
      undo() {
        if (!applied) return;
        if (shared) {
          previous.copy(before);
          if ('uniforms' in before) (previous as THREE.ShaderMaterial).uniforms = cloneValue((before as THREE.ShaderMaterial).uniforms);
          previous.needsUpdate = true;
        } else App.setObjectMaterial(object, slot, previous);
        // Restore exact registry counts even if registration or a listener threw midway.
        for (const key of Object.keys(App.materials)) delete App.materials[key];
        Object.assign(App.materials, registryBefore.materials);
        for (const key of Object.keys(App.textures)) delete App.textures[key];
        Object.assign(App.textures, registryBefore.textures);
        materialRefCounts().clear();
        registryBefore.refs.forEach((count, material) => materialRefCounts().set(material, count));
        applied = false;
        Hooks.useDispatchSignal('materialChanged', previous);
        Hooks.useDispatchSignal('objectChanged', object);
      },
    };
  });
  return true;
}

/** The shader GUI and MCP use the same validated, reversible material mutation. */
export function applyGuiMaterialEdit(object: THREE.Object3D, slot: number, values: Record<string, any>) {
  const material = materialAt(object, slot);
  const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(material[key])));
  if (!Object.keys(changes).length) return;
  const steps: AgentEditContext['steps'] = [];
  const cleanup: Array<() => void> = [];
  try {
    prepareMaterialOperation({ type: 'material', target: { uuid: object.uuid }, slot, scope: 'shared', values:changes }, {
      resolve: () => object, register: () => { throw new Error('No object registration in material edit'); }, steps, cleanup,
    });
    App.execute(new AtomicBatchCommand(steps, 'Edit material program'));
  } catch (error: any) {
    if (!error.recoveryFailed) cleanup.reverse().forEach(dispose => dispose());
    throw error;
  }
}
