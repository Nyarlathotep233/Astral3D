import { THREE } from '@astral3d/engine';
import * as Engine from '@astral3d/engine';
import type { AgentEditContext, AgentOperation, EditStep } from './agentTypes';

const { App, Hooks, ObjectRegistrationError, BatchRecoveryError } = Engine;
const notify = (object: THREE.Object3D) => { object.updateMatrixWorld(true); Hooks.useDispatchSignal('objectChanged', object); Hooks.useDispatchSignal('sceneGraphChanged'); };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function copyAgentValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyAgentValue) as T;
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) { if (forbidden.has(key)) throw new Error('Reserved property name'); result[key] = copyAgentValue(item); }
    return result as T;
  }
  return value;
}
export function mergeAgentValue<T>(base: T, patch: any): T {
  const result: any = copyAgentValue(base);
  for (const [key, value] of Object.entries(patch || {})) {
    if (forbidden.has(key)) throw new Error('Reserved property name');
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object'
      ? mergeAgentValue(result[key], value) : copyAgentValue(value);
  }
  return result;
}
function finite(value: any, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`); return value; }
function vector(value: any, size: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== size) throw new Error(`${label} needs ${size} components`);
  return value.map(v => finite(v, label));
}

export const GEOMETRY_CATALOG = {
  box: ['width','height','depth','widthSegments','heightSegments','depthSegments'],
  sphere: ['radius','widthSegments','heightSegments','phiStart','phiLength','thetaStart','thetaLength'],
  plane: ['width','height','widthSegments','heightSegments'],
  circle: ['radius','segments','thetaStart','thetaLength'],
  cylinder: ['radiusTop','radiusBottom','height','radialSegments','heightSegments','openEnded','thetaStart','thetaLength'],
  cone: ['radius','height','radialSegments','heightSegments','openEnded','thetaStart','thetaLength'],
  capsule: ['radius','length','capSegments','radialSegments'],
  ring: ['innerRadius','outerRadius','thetaSegments','phiSegments','thetaStart','thetaLength'],
  torus: ['radius','tube','radialSegments','tubularSegments','arc'],
  torusknot: ['radius','tube','tubularSegments','radialSegments','p','q'],
  tetrahedron: ['radius','detail'], octahedron: ['radius','detail'], dodecahedron: ['radius','detail'], icosahedron: ['radius','detail'],
  teapot: ['size','segments','bottom','lid','body','fitLid','blinn'],
  shape: ['shapes','curveSegments'], extrude: ['shapes','options'], lathe: ['points','segments','phiStart','phiLength'],
  tube: ['path','tubularSegments','radius','radialSegments','closed'], buffer: ['attributes','index','groups','morphAttributes'],
} as const;

function contour(spec: any): THREE.Shape {
  const points = Array.isArray(spec) ? spec : spec.points;
  if (!Array.isArray(points) || points.length < 3) throw new Error('Shape requires at least three 2D points');
  const result = new THREE.Shape(points.map(p => new THREE.Vector2(...vector(p, 2, 'shape point') as [number, number])));
  for (const hole of spec.holes || []) {
    if (!Array.isArray(hole) || hole.length < 3) throw new Error('A hole requires three points');
    result.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(...vector(p, 2, 'hole point') as [number, number]))));
  }
  return result;
}
function curve(spec: any): THREE.Curve<THREE.Vector3> {
  const points = (Array.isArray(spec) ? spec : spec?.points)?.map(p => new THREE.Vector3(...vector(p, 3, 'curve point') as [number, number, number]));
  if (!points || points.length < 2) throw new Error('Curve requires at least two 3D points');
  switch (spec.type) {
    case 'line': return new THREE.LineCurve3(points[0], points[1]);
    case 'quadratic': if (points.length !== 3) throw new Error('Quadratic curve needs three points'); return new THREE.QuadraticBezierCurve3(...points as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    case 'cubic': if (points.length !== 4) throw new Error('Cubic curve needs four points'); return new THREE.CubicBezierCurve3(...points as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    default: return new THREE.CatmullRomCurve3(points, !!spec.closed, spec.curveType || 'centripetal', spec.tension ?? 0.5);
  }
}
/** Detached construction: no registry or live scene is changed. */
export function createAgentGeometry(spec: any = { type: 'box' }): THREE.BufferGeometry {
  if (typeof spec === 'string') spec = { type: spec };
  const kind = String(spec.type || 'box').replace(/Geometry$/i, '').toLowerCase();
  const p = copyAgentValue(spec.parameters || spec);
  const constructors: Record<string, any> = {
    box: THREE.BoxGeometry, sphere: THREE.SphereGeometry, plane: THREE.PlaneGeometry, circle: THREE.CircleGeometry,
    cylinder: THREE.CylinderGeometry, cone: THREE.ConeGeometry, capsule: THREE.CapsuleGeometry, ring: THREE.RingGeometry,
    torus: THREE.TorusGeometry, torusknot: THREE.TorusKnotGeometry, tetrahedron: THREE.TetrahedronGeometry,
    octahedron: THREE.OctahedronGeometry, dodecahedron: THREE.DodecahedronGeometry, icosahedron: THREE.IcosahedronGeometry,
    teapot: Engine.TeapotGeometry,
  };
  let geometry: THREE.BufferGeometry;
  if (constructors[kind]) {
    const args = spec.args || GEOMETRY_CATALOG[kind].map(key => p[key]);
    for (const item of args) if (typeof item === 'number') finite(item, 'geometry parameter');
    geometry = new constructors[kind](...args);
  } else if (kind === 'shape' || kind === 'extrude') {
    const shapes = (p.shapes || [p.points]).map(contour);
    geometry = kind === 'shape' ? new THREE.ShapeGeometry(shapes, p.curveSegments)
      : new THREE.ExtrudeGeometry(shapes, { ...p.options, ...(p.options?.extrudePath ? { extrudePath: curve(p.options.extrudePath) } : {}) });
  } else if (kind === 'lathe' || kind === 'doublecone') {
    const points = p.points || [[0, -1], [1, 0], [0, 1]];
    geometry = new THREE.LatheGeometry(points.map(v => new THREE.Vector2(...vector(v, 2, 'lathe point') as [number,number])), p.segments, p.phiStart, p.phiLength);
  } else if (kind === 'tube') {
    geometry = new THREE.TubeGeometry(curve(p.path || { points: [[0,0,0],[0,1,0]] }), p.tubularSegments, p.radius, p.radialSegments, p.closed);
  } else if (kind === 'buffer') {
    geometry = new THREE.BufferGeometry();
    const arrays: Record<string, any> = { Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };
    const attribute = (a: any) => {
      if (!Number.isInteger(a.itemSize) || a.itemSize < 1 || a.itemSize > 16 || !Array.isArray(a.array) || a.array.length % a.itemSize) throw new Error('Invalid geometry attribute');
      a.array.forEach(v => finite(v, 'attribute value'));
      const ArrayClass = arrays[a.arrayType || 'Float32Array']; if (!ArrayClass) throw new Error('Unsupported geometry arrayType');
      return new THREE.BufferAttribute(new ArrayClass(a.array), a.itemSize, !!a.normalized);
    };
    try {
      for (const [name, a] of Object.entries(p.attributes || {})) { if (forbidden.has(name)) throw new Error('Reserved attribute'); geometry.setAttribute(name, attribute(a)); }
      if (!geometry.getAttribute('position')) throw new Error('Buffer geometry requires position');
      if (p.index) {
        const count = geometry.getAttribute('position').count;
        if (!Array.isArray(p.index) || p.index.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('Geometry index outside vertices');
        geometry.setIndex(p.index);
      }
      for (const g of p.groups || []) geometry.addGroup(g.start, g.count, g.materialIndex || 0);
      for (const [key, attrs] of Object.entries(p.morphAttributes || {})) geometry.morphAttributes[key] = (attrs as any[]).map(attribute);
      geometry.morphTargetsRelative = !!p.morphTargetsRelative;
      if (p.computeNormals && !geometry.getAttribute('normal')) geometry.computeVertexNormals();
    } catch (error) { geometry.dispose(); throw error; }
  } else throw new Error(`Unsupported geometry: ${kind}`);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function transformState(object: THREE.Object3D) { return { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), order: object.rotation.order, matrixAutoUpdate: object.matrixAutoUpdate, matrix: object.matrix.clone() }; }
function restoreTransform(object: THREE.Object3D, state: ReturnType<typeof transformState>) { object.rotation.order = state.order; object.position.copy(state.position); object.quaternion.copy(state.quaternion); object.scale.copy(state.scale); object.matrixAutoUpdate = state.matrixAutoUpdate; if(state.matrixAutoUpdate)object.updateMatrix();else object.matrix.copy(state.matrix); notify(object); }
function assignTransformMatrix(object:THREE.Object3D,matrix:THREE.Matrix4) {
  matrix.decompose(object.position,object.quaternion,object.scale);
  const decomposed=new THREE.Matrix4().compose(object.position,object.quaternion,object.scale);
  // Rotated nonuniform parents can introduce shear. Retain the exact matrix in
  // that case instead of silently moving the object during preserveWorld.
  if(matrix.elements.some((v,i)=>Math.abs(v-decomposed.elements[i])>1e-8))object.matrixAutoUpdate=false;
  object.matrix.copy(matrix);
}
function applyTransform(object: THREE.Object3D, op: any) {
  if (op.space && !['local','world'].includes(op.space)) throw new Error('Transform space must be local or world');
  if (op.rotationOrder && !['XYZ','YXZ','ZXY','ZYX','YZX','XZY'].includes(op.rotationOrder)) throw new Error('Invalid Euler rotation order');
  const world = op.space === 'world';
  object.updateWorldMatrix(true, false);
  const position = world ? object.getWorldPosition(new THREE.Vector3()) : object.position.clone();
  const quaternion = world ? object.getWorldQuaternion(new THREE.Quaternion()) : object.quaternion.clone();
  const scale = world ? object.getWorldScale(new THREE.Vector3()) : object.scale.clone();
  if (op.position) position.fromArray(vector(op.position,3,'position'));
  if (op.rotation) quaternion.setFromEuler(new THREE.Euler(...vector(op.rotation,3,'rotation') as [number,number,number], op.rotationOrder || object.rotation.order));
  if (op.quaternion) quaternion.fromArray(vector(op.quaternion,4,'quaternion')).normalize();
  if (op.scale) scale.fromArray(vector(op.scale,3,'scale'));
  const matrix = new THREE.Matrix4().compose(position,quaternion,scale);
  if (world && object.parent) {
    object.parent.updateWorldMatrix(true,false);
    if (Math.abs(object.parent.matrixWorld.determinant()) < 1e-12) throw new Error('Cannot transform below a singular parent');
    matrix.premultiply(object.parent.matrixWorld.clone().invert());
  }
  assignTransformMatrix(object,matrix);
  if (op.rotationOrder) object.rotation.order = op.rotationOrder;
  if(object.matrixAutoUpdate)object.updateMatrix(); notify(object);
}

/** Handles both partial membership notifications and partial resource registration failures. */
export function agentMembershipStep(object: THREE.Object3D, parent: THREE.Object3D, index: number, adding: boolean, preparedScripts?: Record<string, any[]>): EditStep {
  const scripts = new Map<string, any[]>();
  const animations = new Map<string,{mixer:any,actions:Map<string,any>}>();
  object.traverse(child => { const value = preparedScripts?.[child.uuid] ?? App.scripts[child.uuid]; if (value) scripts.set(child.uuid,value); });
  let registrationRestored = false;
  const attach = () => {
    if (registrationRestored) { registrationRestored = false; return; }
    if (object.parent === parent) return;
    let sceneParent:THREE.Object3D|null=parent;
    for(;sceneParent&&sceneParent!==App.scene;sceneParent=sceneParent.parent)if(sceneParent===object)throw new Error('Object cannot be its own ancestor');
    if(sceneParent!==App.scene)throw new Error('Object parent must belong to the current scene');
    try { App.addObject(object,parent,Math.min(index,parent.children.length),true); }
    catch (error) { if (error instanceof ObjectRegistrationError || error instanceof BatchRecoveryError) registrationRestored=true; throw error; }
    for(const[uuid,state]of animations){App.animationManager.mixerMap.set(uuid,state.mixer);for(const[id,action]of state.actions)App.animationManager.actionMap.set(id,action);}
    for (const [uuid,list] of scripts) { App.scripts[uuid] = list; const child=object.getObjectByProperty('uuid',uuid); for(const script of list)Hooks.useDispatchSignal('scriptAdded',child,script); }
    object.traverse((child:any)=>{if(child.isTilesGroup)void window.viewer?.modules.tilesManage.addTiles(child);});
  };
  const detach = () => {
    if (registrationRestored) { registrationRestored = false; return; }
    if (object.parent) {
      object.traverse(child=>{const mixer=App.animationManager.mixerMap.get(child.uuid);if(mixer)animations.set(child.uuid,{mixer,actions:new Map((child.animations as any[]).filter(action=>action.getClip).map(action=>[action.getClip().uuid,action]))});});
      try { App.removeObject(object); }
      catch (error) { if (error instanceof ObjectRegistrationError || error instanceof BatchRecoveryError) registrationRestored=true; throw error; }
    }
    for(const[uuid,state]of animations){App.animationManager.mixerMap.delete(uuid);for(const id of state.actions.keys())App.animationManager.actionMap.delete(id);}
    for (const [uuid,list] of scripts) { delete App.scripts[uuid]; const child=object.getObjectByProperty('uuid',uuid); for(const script of list)Hooks.useDispatchSignal('scriptRemoved',child,script); }
    object.traverse((child:any)=>{if(child.isTilesGroup)window.viewer?.modules.tilesManage.removeTiles(child,false);});
  };
  return adding ? {execute:attach,undo:detach} : {execute:detach,undo:attach};
}
function cleanupDetached(object: THREE.Object3D, ownedGeometry: boolean, ownedMaterial: boolean) {
  if (object.parent) return;
  object.traverse((child: any) => {
    if (ownedGeometry) { if (App.geometries[child.geometry?.uuid] === child.geometry) delete App.geometries[child.geometry.uuid]; child.geometry?.dispose(); }
    if (ownedMaterial) for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) material.dispose();
    if (child.isTilesGroup) child.dispose();
    if (child.isEmitterProxy && child.emitter?.destroy) { child.dispose(); Engine.ParticleSystem.Body3DMap.delete(child.uuid); }
    if (child.isHtmlPanel || child.isHtmlSprite) child.element.remove();
  });
}

const basicNames = ['Group','Box','Capsule','Circle','Cylinder','Dodecahedron','Icosahedron','DoubleCone','Octahedron','Plane','Ring','Sphere','Sprite','Tetrahedron','Torus','TorusKnot','Tube','Teapot','AmbientLight','DirectionalLight','HemisphereLight','PointLight','Spotlight','OrthographicCamera','PerspectiveCamera'];
export const OBJECT_KINDS = [...basicNames, 'mesh','line','lineSegments','points','instanced','billboard','html','htmlSprite','tiles','particle'];
/** Serializable help is exposed by scene_capabilities; keys describe actual operation fields. */
export const agentObjectHelp = {
  target:'{uuid:string} for an existing object, or {ref:string} for an earlier create/clone in the same batch',
  create:{type:'create',ref:'unique batch ref (required)',kind:OBJECT_KINDS,name:'optional name',parent:'target, default scene',index:'optional child index',geometry:'{type,parameters} from geometry catalog; buffer {attributes:{position:{array,itemSize:3,type:"Float32Array"}},index,groups,morphAttributes}',materialUuid:'existing material UUID',position:'[x,y,z]',rotation:'Euler radians [x,y,z]',quaternion:'[x,y,z,w]',scale:'[x,y,z]',space:'local(default)|world',attributes:'same as attributes operation',options:'billboard/tiles/HTML options',html:'HTML source; requires allowScripts:true',count:'instanced mesh count',instances:'array of {index,matrix:[16 column-major numbers]} or {index,position,rotation,scale,color}',preset:'particle: smoke|fire|fireLine|firefly|fireworks',config:'particle config, matching GUI initializer/behaviour config'},
  clone:{type:'clone',target:'source target',ref:'new batch ref',parent:'optional target',name:'optional',allowScripts:'required true for cloning HTML; attached object scripts are copied with new UUIDs'},
  remove:{type:'remove',target:'target; subtree scripts, resources and animation registration restored by undo'},
  attributes:{type:'attributes',target:'target',values:'name, visible, castShadow, receiveShadow, renderOrder, frustumCulled, userData, layers; light color/intensity/distance/decay/angle/penumbra/groundColor/target/shadow; camera near/far/fov/aspect/zoom/left/right/top/bottom'},
  transform:{type:'transform',target:'target',position:'[x,y,z]',rotation:'Euler radians [x,y,z]',quaternion:'[x,y,z,w]',scale:'[x,y,z]',rotationOrder:'XYZ|YXZ|ZXY|ZYX|YZX|XZY',space:'local|world'},
  reparent:{type:'reparent',target:'target',parent:'target, omit for scene',index:'optional index',preserveWorld:'default true; exact matrices preserve shear from nonuniform parents'},
  geometry:{type:'geometry',target:'mesh target',geometry:'new full geometry descriptor',parameters:'patch existing parametric geometry',action:'replace(default)|normals|center'},
  instances:{type:'instances',target:'InstancedMesh target',instances:'[{index,matrix:[16 numbers],color:"#ffffff"}] or position/rotation/scale'},
  billboard:{type:'billboard',target:'Billboard target',options:'GUI text/style options patch'},
  html:{type:'html',target:'HTML target',html:'replacement HTML',options:'HTML options',allowScripts:true},
  tiles:{type:'tiles',target:'Tiles target',options:'errorTarget, LRUCache, debug; create a new object to change URL'},
  particle:{type:'particle',target:'Particle target',config:'initializer/behaviour config patch',system:'spriteSystem|meshSystem (default derived from body type)',body:'optional Three Object JSON'},
  geometryCurves:{shape:'points:[[x,y],...] and holes:[[[x,y],...]]',extrude:'shape plus depth/steps/bevel settings or extrudePath curve',lathe:'points:[[radius,y],...]',tube:'path:{type:catmullrom|line|quadratic|cubic,points:[[x,y,z],...]} plus radius/tubularSegments/radialSegments/closed'},
};
function createObject(op: AgentOperation): THREE.Object3D {
  const kind = String(op.kind || 'mesh');
  const basic = basicNames.find(name => name.toLowerCase() === kind.toLowerCase());
  if (basic && !op.geometry && !op.parameters) return (Engine as any)[basic]();
  if (kind.toLowerCase() === 'billboard') return new Engine.Billboard(mergeAgentValue(Engine.getDefaultBillboardOptions(),op.options));
  if (kind.toLowerCase() === 'tiles') return new Engine.Tiles(mergeAgentValue(Engine.getDefault3DTilesOptions(),op.options));
  if (kind === 'html' || kind === 'htmlSprite') {
    // The existing converter may execute embedded code; require an explicit operation-level choice.
    if (op.allowScripts !== true) throw new Error('HTML creation requires allowScripts=true because editor HTML parsing can execute code');
    return Engine.HtmlPanelConverter.getInstance().parseToCSS3D({isSprite:kind==='htmlSprite',isSingleHtml:!op.files,codes:op.files || [{name:'index.html',content:String(op.html || ''),isIndex:true}]});
  }
  if (kind.toLowerCase() === 'particle') return createParticleObject(op);
  if (basic && /Light|Camera/i.test(basic)) return (Engine as any)[basic]();
  const geometry = createAgentGeometry(op.geometry || {type:kind==='mesh'||kind==='instanced'||kind==='points'||kind==='line'||kind==='lineSegments'?'box':kind,parameters:op.parameters});
  const material = op.materialUuid ? App.materials[op.materialUuid] : kind==='points' ? new THREE.PointsMaterial({size:op.pointSize ?? 0.1}) : ['line','lineSegments'].includes(kind) ? new THREE.LineBasicMaterial() : new THREE.MeshStandardMaterial();
  if (!material) { geometry.dispose(); throw new Error('Material UUID not found'); }
  if (kind === 'instanced') {
    const count = op.instances?.length ?? op.count;
    if (!Number.isInteger(count) || count < 1 || count > 1000000) { geometry.dispose(); throw new Error('Instanced mesh count must be 1..1000000'); }
    const mesh = new THREE.InstancedMesh(geometry,material,count);
    (op.instances || Array.from({length:count},()=>({}))).forEach((instance,index)=>{mesh.setMatrixAt(index,instanceMatrix(instance));if(instance.color!==undefined)mesh.setColorAt(index,new THREE.Color(instance.color));});
    mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); return mesh;
  }
  if (kind==='points') return new THREE.Points(geometry,material);
  if (kind==='line') return new THREE.Line(geometry,material);
  if (kind==='lineSegments') return new THREE.LineSegments(geometry,material);
  return new THREE.Mesh(geometry,material);
}
function instanceMatrix(spec: any) {
  if (spec.matrix) return new THREE.Matrix4().fromArray(vector(spec.matrix,16,'instance matrix'));
  const quaternion = spec.quaternion ? new THREE.Quaternion().fromArray(vector(spec.quaternion,4,'instance quaternion'))
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(...vector(spec.rotation||[0,0,0],3,'instance rotation') as [number,number,number]));
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(vector(spec.position||[0,0,0],3,'instance position')),quaternion,new THREE.Vector3().fromArray(vector(spec.scale||[1,1,1],3,'instance scale')));
}
function assertObject(object: THREE.Object3D) { if (object===App.scene || object.ignore) throw new Error('Scene root and editor helper objects cannot be edited as ordinary objects'); }
function cloneAgentObject(source:THREE.Object3D,allowScripts:boolean) {
  const map=new Map<THREE.Object3D,THREE.Object3D>();
  const ownedBillboards:any[]=[];
  const clone=(node:any):THREE.Object3D=>{
    let result:any;
    if(node.isBillboard){result=new Engine.Billboard(copyAgentValue(node.options),node.material.clone());ownedBillboards.push(result);}
    else if(node.isTilesGroup)result=new Engine.Tiles(copyAgentValue(node.options));
    else if(node.isHtmlPanel||node.isHtmlSprite) {
      if(!allowScripts)throw new Error('Cloning HTML requires allowScripts=true');
      result=Engine.HtmlPanelConverter.getInstance().parseToCSS3D(copyAgentValue(node.options));
    } else if(node.isEmitterProxy){const json=copyAgentValue(node.toJSON().object);json.uuid=THREE.MathUtils.generateUUID();result=Engine.ParticleEmitter.fromJSON(json,false);}
    else result=node.clone(false);
    map.set(node,result);
    result.name=node.name;result.position.copy(node.position);result.quaternion.copy(node.quaternion);result.scale.copy(node.scale);result.matrix.copy(node.matrix);result.matrixAutoUpdate=node.matrixAutoUpdate;
    result.visible=node.visible;result.castShadow=node.castShadow;result.receiveShadow=node.receiveShadow;result.userData=copyAgentValue(node.userData);
    if(!node.isTilesGroup)for(const child of node.children)result.add(clone(child));
    return result;
  };
  const result=clone(source);
  for(const[old,copy]of map) {
    if((old as any).isSkinnedMesh) {
      const mesh=copy as THREE.SkinnedMesh,original=old as THREE.SkinnedMesh;
      mesh.skeleton=original.skeleton.clone();mesh.bindMatrix.copy(original.bindMatrix);
      mesh.skeleton.bones=original.skeleton.bones.map(bone=>{const cloned=map.get(bone);if(!cloned)throw new Error('Clone the complete skeleton hierarchy, including all bones');return cloned as THREE.Bone;});
      mesh.bind(mesh.skeleton,mesh.bindMatrix);
    }
    copy.animations=old.animations.map((item:any)=>{const clip=(item.getClip?item.getClip():item).clone();for(const track of clip.tracks)for(const[from,to]of map)track.name=track.name.replaceAll(from.uuid,to.uuid);return clip;});
  }
  return{object:result,map,cleanup(){if(result.parent)return;cleanupDetached(result,false,false);for(const billboard of ownedBillboards){billboard.material.map?.dispose();billboard.material.dispose();}}};
}

function attributeStep(object: any, values: Record<string,any>): EditStep {
  const scalar = new Set(['name','visible','castShadow','receiveShadow','renderOrder','frustumCulled','matrixAutoUpdate','intensity','distance','decay','angle','penumbra','power','fov','aspect','near','far','zoom','focus','filmGauge','filmOffset','left','right','top','bottom']);
  const snapshots: Array<{key:string; value:any}> = [];
  for (const [key,value] of Object.entries(values)) {
    if (scalar.has(key)) {
      if (!(key in object)) throw new Error(`Object does not have ${key}`);
      if (typeof object[key] !== typeof value || typeof value==='number' && !Number.isFinite(value)) throw new Error(`Invalid ${key}`);
      snapshots.push({key,value:object[key]});
    } else if (['color','groundColor'].includes(key)) {
      if (!object[key]?.isColor) throw new Error(`Object does not have ${key}`); snapshots.push({key,value:object[key].clone()});
    } else if (key==='userData') snapshots.push({key,value:object.userData});
    else if (key==='layers') { if (!Number.isInteger(value)) throw new Error('layers must be an integer mask'); snapshots.push({key,value:object.layers.mask}); }
    else if (key==='target') { if (!object.target) throw new Error('Object has no target'); vector(value,3,'light target'); snapshots.push({key,value:object.target.position.clone()}); }
    else if (key==='shadow') { if (!object.shadow) throw new Error('Object has no shadow'); snapshots.push({key,value:{bias:object.shadow.bias,normalBias:object.shadow.normalBias,radius:object.shadow.radius,mapSize:object.shadow.mapSize.toArray(),camera:{near:object.shadow.camera.near,far:object.shadow.camera.far,left:object.shadow.camera.left,right:object.shadow.camera.right,top:object.shadow.camera.top,bottom:object.shadow.camera.bottom}}}); }
    else throw new Error(`Unsupported object attribute: ${key}`);
  }
  const apply = (data: any) => {
    for (const [key,value] of Object.entries(data)) {
      if (['color','groundColor'].includes(key)) object[key].set(value);
      else if (key==='layers') object.layers.mask=value;
      else if (key==='target') { value instanceof THREE.Vector3 ? object.target.position.copy(value) : object.target.position.fromArray(value); object.target.updateMatrixWorld(); }
      else if (key==='shadow') {
        const s:any=value;
        for (const name of ['bias','normalBias','radius']) if(s[name]!==undefined)object.shadow[name]=finite(s[name],`shadow.${name}`);
        if(s.mapSize)object.shadow.mapSize.fromArray(vector(s.mapSize,2,'shadow.mapSize'));
        if(s.camera)for(const [name,v]of Object.entries(s.camera)){if(v!==undefined && ['near','far','left','right','top','bottom'].includes(name))object.shadow.camera[name]=finite(v,`shadow.camera.${name}`);}
        object.shadow.camera.updateProjectionMatrix(); object.shadow.needsUpdate=true;
      } else object[key]=key==='userData'?copyAgentValue(value):value;
    }
    object.updateProjectionMatrix?.(); notify(object);
  };
  return {execute(){apply(values);},undo(){apply(Object.fromEntries(snapshots.map(s=>[s.key,s.value])));}};
}

export function prepareObjectOperation(op: AgentOperation, ctx: AgentEditContext): boolean {
  if (op.type==='create' || op.type==='clone') {
    if(typeof op.ref!=='string'||!op.ref)throw new Error('create/clone requires a ref');
    let object: THREE.Object3D; let scripts: Record<string,any[]>|undefined;let cloneCleanup:(()=>void)|undefined;
    if(op.type==='clone') {
      const source=ctx.resolve(op.target); assertObject(source); const cloned=cloneAgentObject(source,op.allowScripts===true);object=cloned.object;cloneCleanup=cloned.cleanup;scripts={};
      for(const[old,copy]of cloned.map) {
        if(App.scripts[old.uuid])scripts[copy.uuid]=copyAgentValue(App.scripts[old.uuid]);
      }
    } else object=createObject(op);
    object.name=op.name ?? object.name ?? op.kind;
    ctx.cleanup.push(cloneCleanup||(()=>cleanupDetached(object,op.type==='create',op.type==='create'&&!op.materialUuid)));
    ctx.register(op.ref,object);
    ctx.steps.push(()=>{
      const parent=op.parent?ctx.resolve(op.parent):App.scene;
      return agentMembershipStep(object,parent,op.index??parent.children.length,true,scripts);
    });
    if(op.position||op.rotation||op.quaternion||op.scale)ctx.steps.push(()=>{const old=transformState(object);return{execute(){applyTransform(object,op);},undo(){restoreTransform(object,old);}};});
    if(op.attributes||op.properties)ctx.steps.push(()=>attributeStep(object,op.attributes||op.properties));
    return true;
  }
  if(!['remove','attributes','transform','reparent','geometry','instances','billboard','html','tiles','particle'].includes(op.type))return false;
  const object:any=ctx.resolve(op.target); assertObject(object);
  if(op.type==='remove')ctx.steps.push(()=>{if(!object.parent)throw new Error('Object is not in the scene');return agentMembershipStep(object,object.parent,object.parent.children.indexOf(object),false);});
  else if(op.type==='attributes')ctx.steps.push(()=>attributeStep(object,op.values||Object.fromEntries(['name','visible','castShadow','receiveShadow','userData'].filter(k=>op[k]!==undefined).map(k=>[k,op[k]]))));
  else if(op.type==='transform')ctx.steps.push(()=>{const old=transformState(object);return{execute(){applyTransform(object,op);},undo(){restoreTransform(object,old);}};});
  else if(op.type==='reparent')ctx.steps.push(()=>{
    const parent=op.parent?ctx.resolve(op.parent):App.scene;
    for(let p:THREE.Object3D|null=parent;p;p=p.parent)if(p===object)throw new Error('Reparent would create a cycle');
    const previous=object.parent, index=previous?.children.indexOf(object), old=transformState(object);
    if(!previous)throw new Error('Cannot reparent a detached object');
    object.updateWorldMatrix(true,false); const world=object.matrixWorld.clone();
    const move=(to:THREE.Object3D,at:number)=>{object.removeFromParent();to.add(object);to.children.splice(to.children.indexOf(object),1);to.children.splice(Math.max(0,Math.min(at,to.children.length)),0,object);};
    return {execute(){parent.updateWorldMatrix(true,false);if(op.preserveWorld!==false&&Math.abs(parent.matrixWorld.determinant())<1e-12)throw new Error('Cannot reparent under singular transform');move(parent,op.index??parent.children.length);if(op.preserveWorld!==false)assignTransformMatrix(object,parent.matrixWorld.clone().invert().multiply(world));if(object.matrixAutoUpdate)object.updateMatrix();notify(object);},undo(){move(previous,index!);restoreTransform(object,old);}};
  });
  else if(op.type==='geometry')ctx.steps.push(()=>{
    if(!object.geometry)throw new Error('Object has no geometry');const before=object.geometry;
    const after=op.action==='center'?new THREE.BufferGeometry().copy(before):op.action==='normals'?before.clone():createAgentGeometry(op.geometry||{type:before.type,parameters:mergeAgentValue(before.parameters||{},op.parameters||{})});
    if(op.action==='normals')after.computeVertexNormals();if(op.action==='center')after.center();
    ctx.cleanup.push(()=>{if(object.geometry!==after)after.dispose();});
    const previousEntry=App.geometries[after.uuid];
    const apply=(geometry:THREE.BufferGeometry)=>{object.geometry=geometry;App.addGeometry(geometry);geometry.computeBoundingSphere();Hooks.useDispatchSignal('geometryChanged',object);notify(object);};
    return{execute(){apply(after);},undo(){if(previousEntry)App.geometries[after.uuid]=previousEntry;else delete App.geometries[after.uuid];apply(before);}};
  });
  else if(op.type==='instances')ctx.steps.push(()=>{
    if(!object.isInstancedMesh)throw new Error('Object is not instanced');
    const updates=(op.instances||[]).map(v=>{if(!Number.isInteger(v.index)||v.index<0||v.index>=object.count)throw new Error('Instance index out of range');return{index:v.index,matrix:instanceMatrix(v),color:v.color};});
    const matrices=object.instanceMatrix.array.slice(),colors=object.instanceColor?.clone()||null;
    const update=()=>{object.instanceMatrix.needsUpdate=true;if(object.instanceColor)object.instanceColor.needsUpdate=true;object.computeBoundingBox();object.computeBoundingSphere();notify(object);};
    return{execute(){for(const v of updates){object.setMatrixAt(v.index,v.matrix);if(v.color!==undefined)object.setColorAt(v.index,new THREE.Color(v.color));}update();},undo(){object.instanceMatrix.array.set(matrices);object.instanceColor=colors?.clone()||null;update();}};
  });
  else if(op.type==='billboard')ctx.steps.push(()=>{
    if(!object.isBillboard)throw new Error('Object is not a billboard');const old=copyAgentValue(object.options),next=mergeAgentValue(old,op.options);
    const apply=(value:any)=>{Engine.Utils.deepAssign(object.options,copyAgentValue(value));object.material.map.redraw();notify(object);};return{execute(){apply(next);},undo(){apply(old);}};
  });
  else if(op.type==='tiles')ctx.steps.push(()=>{
    if(!object.isTilesGroup)throw new Error('Object is not a tiles group');if(op.options?.url&&op.options.url!==object.options.url)throw new Error('Replace tiles source with a new tiles object');
    const old=copyAgentValue(object.options),next=mergeAgentValue(old,op.options);
    const apply=(value:any)=>{object.options=copyAgentValue(value);object.renderer.errorTarget=value.errorTarget;Object.assign(object.renderer.lruCache,value.LRUCache);object.setDebug(value.debug);notify(object);};return{execute(){apply(next);},undo(){apply(old);}};
  });
  else if(op.type==='html') {
    if(!object.isHtmlPanel&&!object.isHtmlSprite)throw new Error('Object is not an HTML panel');
    const replacement=createObject({...op,type:'create',kind:object.isHtmlSprite?'htmlSprite':'html'});
    ctx.cleanup.push(()=>cleanupDetached(replacement,false,false));
    ctx.steps.push(()=>{const oldElement=object.element,oldOptions=object.options;const apply=(element:any,options:any)=>{object.element.remove();object.element=element;object.options=options;notify(object);};return{execute(){apply(replacement.element,replacement.options);},undo(){apply(oldElement,oldOptions);}};});
  } else if(op.type==='particle')ctx.steps.push(()=>particleStep(object,op));
  return true;
}

function particleDescription(config:any,system=config.init.body.body?.type==='Sprite'?'spriteSystem':'meshSystem') {
  if(!['spriteSystem','meshSystem'].includes(system))throw new Error('Particle system must be spriteSystem or meshSystem');
  const init=Object.entries({mass:'Mass',life:'Life',radius:'Radius',rotation:'Rotation',position:'Position',velocity:config.init.velocity.velocity?.type||'VectorVelocity',body:'Body'}).filter(([key])=>config.init[key]?.isEnabled).map(([,name])=>name);
  const behaviours=Object.entries({color:'Color',scale:'Scale',alpha:'Alpha',force:'Force',rotate:'Rotate',randomDrift:'RandomDrift',spring:'Spring',attraction:'Attraction',collision:'Collision'}).filter(([key])=>config.behaviour[key]?.isEnabled).map(([,name])=>name);
  return{config,system,useInitializers:init,useBehaviours:behaviours,bodyObjectJSON:null};
}
function createParticleObject(op:any):THREE.Object3D {
  if(op.preset){
    if(!['smoke','fire','fireLine','firefly','fireworks'].includes(op.preset))throw new Error('Unknown particle preset');
    const {emitter,body}=Engine.Particles[op.preset]();const proxy=new Engine.ParticleEmitter(emitter);
    Engine.ParticleSystem.Body3DMap.set(proxy.uuid,body);return proxy;
  }
  const defaults:any=Engine.getDefaultParticleConfig();defaults.init.body.isEnabled=true;defaults.init.body.body={...(defaults.init.body.body||{}),type:'Point'};
  const config=mergeAgentValue(defaults,op.config||{});
  if(op.body){config.init.body.isEnabled=true;config.init.body.body={...(config.init.body.body||{}),type:op.body.object?.type==='Sprite'?'Sprite':'Mesh'};}
  const descriptor=particleDescription(config,op.system);
  if(op.body)descriptor.bodyObjectJSON=op.body;
  return Engine.ParticleEmitter.fromJSON({uuid:THREE.MathUtils.generateUUID(),name:op.name||'Particle',type:'Particle',children:[],emitter:descriptor} as any,false);
}
function particleStep(object:any,op:any):EditStep {
  if(!object.isEmitterProxy)throw new Error('Object is not a particle emitter');
  const before=object.toJSON().object;
  const after=copyAgentValue(before);after.emitter.config=mergeAgentValue(before.emitter.config,op.config||{});
  Object.assign(after.emitter,particleDescription(after.emitter.config,op.system||before.emitter.system));
  after.emitter.bodyObjectJSON=op.body||before.emitter.bodyObjectJSON;
  const apply=(json:any)=>{
    object.emitter.parent?.removeEmitter(object.emitter);object.dispose();
    const restored=Engine.ParticleEmitter.fromJSON(json,false);restored.disposeEvents();
    object.emitter=restored.emitter;object.particleSystemName=restored.particleSystemName;object.initEvent();
    Hooks.useDispatchSignal('emitterAdd2ParticleSystem',object.emitter,object.particleSystemName);object.syncProperties();notify(object);
  };
  return{execute(){apply(after);},undo(){apply(before);}};
}
