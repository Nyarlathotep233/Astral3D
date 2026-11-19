import { THREE } from '@astral3d/engine';
import JSZip from 'jszip';
import { App, Loader } from '@astral3d/engine';
import { agentMembershipStep } from './agentObjects';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { watch } from 'vue';
import { AgentImportJobs } from './agentImportJobs';
import { fetchAgentFile } from './agentFiles';
import { preparePrefab, remapObjectAndResourceUuids, remapScripts } from '@/utils/common/prefab';
import { validateAgentScript } from './agentScripts';
import { disposeDetachedObject } from '@/utils/common/disposeDetachedObject';
import { getBuiltinPrefabResource } from '@/views/editor/components/extraPane/resource/builtin/prefabRegistry';
import type { AgentOperation, AgentEditContext } from './agentTypes';
import { agentState } from './agentState';

export const IMPORT_FORMATS = ['3dm','3ds','3mf','amf','dae','drc','fbx','glb','gltf','json','ifc','kmz','ldr','mpd','md2','obj','pcd','ply','stl','svg','usdz','vox','vtk','vtp','wrl','xyz','zip','h3dprefab.zip'];
type Prepared = {object:THREE.Object3D; scripts:ISceneJson['scripts']};
function mesh(geometry:THREE.BufferGeometry) { return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:!!geometry.attributes.color})); }
function summary(object:THREE.Object3D) { let objects=0,meshes=0; object.traverse((o:any)=>{objects++;if(o.isMesh)meshes++;}); return {objects,meshes}; }

/** Workers/loaders may not settle their original promises when disposed. Cancel
 * promptly, and release any result that a loader still delivers after abort. */
function abortable<T>(promise:Promise<T>,signal:AbortSignal,abort:()=>void,disposeLate:(value:T)=>void):Promise<T> {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const onAbort=()=>{if(settled)return;settled=true;abort();reject(signal.reason||new DOMException('Import cancelled','AbortError'));};
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
    promise.then(value=>{if(settled){disposeLate(value);return;}settled=true;signal.removeEventListener('abort',onAbort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',onAbort);reject(error);});
  });
}

/** Three r176 decoder dispose() does not cancel initialization. Guard its worker
 * boundary too, so a late WASM response cannot recreate resources after abort. */
function ownDecoder(loader:any,signal:AbortSignal,initName:'_initDecoder'|'_initLibrary'|'init') {
  let released=false;
  const clearLateResources=()=>{
    if(Array.isArray(loader.workerPool)){for(const worker of loader.workerPool)worker.terminate();loader.workerPool.length=0;}
    else loader.workerPool?.dispose();
    if(loader.workerSourceURL){URL.revokeObjectURL(loader.workerSourceURL);loader.workerSourceURL='';}
  };
  const check=()=>{if(signal.aborted||released){clearLateResources();throw signal.reason||new DOMException('Import cancelled','AbortError');}};
  if(loader._getWorker){
    const getWorker=loader._getWorker.bind(loader);
    loader._getWorker=async(...args:any[])=>{await loader[initName]();check();const worker=await getWorker(...args);check();return worker;};
  } else if(loader.workerPool?.postMessage){
    const post=loader.workerPool.postMessage.bind(loader.workerPool);
    loader.workerPool.postMessage=(...args:any[])=>{check();return post(...args);};
  }
  return()=>{
    if(released)return;released=true;
    // KTX2 decrements its global active-loader count on dispose, even if init was never called.
    if(initName!=='init'||loader.transcoderPending)loader.dispose();
    clearLateResources();
    const pending=loader.decoderPending||loader.libraryPending||loader.transcoderPending;
    if(pending)void pending.then(clearLateResources,()=>{});
  };
}

/** Native loaders parse detached data. No App.fromJSON or implicit script execution. */
async function parseModel(file:File, manager:THREE.LoadingManager, files:Map<string,File>, signal:AbortSignal):Promise<THREE.Object3D> {
  const extension = file.name.split('.').pop()!.toLowerCase();
  const data = await file.arrayBuffer(); signal.throwIfAborted();
  const text = () => new TextDecoder().decode(data);
  switch(extension) {
    case 'glb': case 'gltf': {
      const loader = await Loader.createGLTFLoader(manager);
      // Each job owns its decoders. Releasing one import must not stop a parallel
      // job or a GUI import using Loader's shared workers.
      const draco=new DRACOLoader(manager).setDecoderPath('/assets/libs/draco/gltf/');
      const ktx=new KTX2Loader(manager).setTranscoderPath('/assets/libs/basis/').detectSupport(window.viewer.renderer);
      loader.setDRACOLoader(draco);loader.setKTX2Loader(ktx);
      const releaseDraco=ownDecoder(draco,signal,'_initDecoder'),releaseKtx=ownDecoder(ktx,signal,'init');
      const release=()=>{releaseDraco();releaseKtx();};
      try { const gltf=await abortable(loader.parseAsync(data,''),signal,release,value=>disposeDetachedObject(value.scene)); gltf.scene.animations=gltf.animations; return gltf.scene; }
      finally { release(); }
    }
    case 'obj': {
      const {OBJLoader}=await import('three/examples/jsm/loaders/OBJLoader.js');
      const loader=new OBJLoader(manager);
      const library=/^\s*mtllib\s+(.+)$/m.exec(text())?.[1]?.trim();
      const libraryPath=library?decodeURIComponent(new URL(library,`https://bundle.invalid/${file.name}`).pathname.slice(1)):undefined;
      const mtl=libraryPath?files.get(libraryPath):[...files.values()].find(f=>f.name.toLowerCase().endsWith('.mtl'));
      if(library&&!mtl)throw new Error(`Missing OBJ material library: ${library}`);
      if(mtl) {
        // URLModifier resolves against the OBJ entry, so make the MTL base absolute
        // within the virtual bundle to preserve nested material/texture paths.
        const base=`https://bundle.invalid/${mtl.name.slice(0,mtl.name.lastIndexOf('/')+1)}`;
        const materials=new MTLLoader(manager).parse(await mtl.text(),base); materials.preload(); loader.setMaterials(materials);
      }
      return loader.parse(text());
    }
    case 'fbx': { const {FBXLoader}=await import('three/examples/jsm/loaders/FBXLoader.js'); return new FBXLoader(manager).parse(data,''); }
    case 'dae': { const {ColladaLoader}=await import('three/examples/jsm/loaders/ColladaLoader.js'); return new ColladaLoader(manager).parse(text(),'').scene; }
    case '3ds': { const {TDSLoader}=await import('three/examples/jsm/loaders/TDSLoader.js'); return new TDSLoader(manager).parse(data,''); }
    case '3mf': { const {ThreeMFLoader}=await import('three/examples/jsm/loaders/3MFLoader.js'); return new ThreeMFLoader(manager).parse(data); }
    case 'amf': { const {AMFLoader}=await import('three/examples/jsm/loaders/AMFLoader.js'); return new AMFLoader(manager).parse(data); }
    case 'kmz': { const {KMZLoader}=await import('three/examples/jsm/loaders/KMZLoader.js'); return new KMZLoader(manager).parse(data).scene; }
    case 'stl': { const {STLLoader}=await import('three/examples/jsm/loaders/STLLoader.js'); return mesh(new STLLoader(manager).parse(data)); }
    case 'ply': { const {PLYLoader}=await import('three/examples/jsm/loaders/PLYLoader.js'); return mesh(new PLYLoader(manager).parse(data)); }
    case 'pcd': { const {PCDLoader}=await import('three/examples/jsm/loaders/PCDLoader.js'); return new PCDLoader(manager).parse(data); }
    case 'vtk': case 'vtp': { const {VTKLoader}=await import('three/examples/jsm/loaders/VTKLoader.js'); return mesh(new VTKLoader(manager).parse(data,'')); }
    case 'xyz': { const {XYZLoader}=await import('three/examples/jsm/loaders/XYZLoader.js'); const g=(new XYZLoader(manager) as any).parse(text()) as THREE.BufferGeometry; return new THREE.Points(g,new THREE.PointsMaterial({size:.02,vertexColors:!!g.attributes.color})); }
    case 'wrl': { const {VRMLLoader}=await import('three/examples/jsm/loaders/VRMLLoader.js'); return new VRMLLoader(manager).parse(text(),''); }
    case 'usdz': { const {USDZLoader}=await import('three/examples/jsm/loaders/USDZLoader.js'); return new USDZLoader(manager).parse(data); }
    case 'md2': { const {MD2Loader}=await import('three/examples/jsm/loaders/MD2Loader.js'); const g=new MD2Loader(manager).parse(data); const o=mesh(g); o.animations=(g as any).animations||[]; return o; }
    case 'vox': { const {VOXLoader,VOXMesh}=await import('three/examples/jsm/loaders/VOXLoader.js'); const g=new THREE.Group(); for(const c of new VOXLoader(manager).parse(data))g.add(new VOXMesh(c as any));return g; }
    case 'svg': {
      const {SVGLoader}=await import('three/examples/jsm/loaders/SVGLoader.js'); const g=new THREE.Group();g.scale.set(.1,-.1,.1);
      for(const p of new SVGLoader(manager).parse(text()).paths)for(const s of SVGLoader.createShapes(p))g.add(new THREE.Mesh(new THREE.ShapeGeometry(s),new THREE.MeshBasicMaterial({color:p.color,side:THREE.DoubleSide})));
      return g;
    }
    case '3dm': { const {Rhino3dmLoader}=await import('three/examples/jsm/loaders/3DMLoader.js'); const l=new Rhino3dmLoader(manager);l.setLibraryPath('/assets/libs/rhino3dm/');const release=ownDecoder(l,signal,'_initLibrary');try{return await abortable(new Promise<THREE.Object3D>((resolve,reject)=>l.parse(data,resolve,reject)),signal,release,disposeDetachedObject);}finally{release();} }
    case 'ldr': case 'mpd': { const {LDrawLoader}=await import('three/examples/jsm/loaders/LDrawLoader.js');const l=new LDrawLoader(manager);const g=await new Promise<THREE.Group>((resolve,reject)=>(l as any).parse(text(),resolve,reject));g.rotation.x=Math.PI;return g; }
    case 'drc': { const loader=new DRACOLoader(manager).setDecoderPath('/assets/libs/draco/');const release=ownDecoder(loader,signal,'_initDecoder');try{return await abortable(new Promise<THREE.Object3D>((resolve,reject)=>loader.parse(data,(g:THREE.BufferGeometry)=>resolve(mesh(g)),reject)),signal,release,disposeDetachedObject);}finally{release();} }
    case 'ifc': { const {IFCLoader}=await import('web-ifc-three/IFCLoader'); const l=new IFCLoader(manager); await l.ifcManager.setWasmPath('/assets/libs/web-ifc/'); const model=await l.parse(data); (model as any).isIFC=true;return model as any; }
    case 'json': {
      const json=JSON.parse(text());
      if(json.metadata?.type?.toLowerCase()==='buffergeometry')return mesh(new THREE.BufferGeometryLoader(manager).parse(json));
      if(!json.object)throw new Error('Expected Three.js object/geometry JSON; project packages use project import');
      const objectLoader=new (Loader.objectLoader.constructor as any)(manager);
      const resources=new Set<{dispose:()=>void}>();
      for(const name of ['parseGeometries','parseTextures','parseMaterials']) {
        const parse=objectLoader[name].bind(objectLoader);
        objectLoader[name]=(...args:any[])=>{const result=parse(...args);for(const value of Object.values(result) as any[])if(value?.dispose)resources.add(value);return result;};
      }
      const parse=objectLoader.parseAsync(json).catch(error=>{resources.forEach(resource=>resource.dispose());throw error;});
      return abortable(parse,signal,()=>resources.forEach(resource=>resource.dispose()),disposeDetachedObject);
    }
    default:throw new Error(`Unsupported import format: ${extension}`);
  }
}

export const agentModelJobs = new AgentImportJobs<Prepared>(async (source,signal,phase) => {
  if(source.artifact) {
    const artifact=source.artifact;
    const entry=artifact.files?.find(file=>file.path===artifact.entryPath)||artifact.files?.[0];
    source={...source,url:entry?.url||artifact.url,name:source.name||entry?.path||artifact.name,entry:source.entry||artifact.entryPath,files:artifact.files};
  }
  const resource=source.type==='builtin-prefab'?getBuiltinPrefabResource(source.key):null;
  if(source.type==='builtin-prefab'&&!resource)throw new Error(`Unknown prefab: ${source.key}`);
  const url=resource?.path||source.url;
  if(!url)throw new Error('Import requires url (from upload_complete/assets) or builtin-prefab key');
  const response=await fetchAgentFile(url,{signal});const blob=await response.blob(); signal.throwIfAborted();
  const name=source.name||resource?.path.split('/').pop()||new URL(url,location.href).pathname.split('/').pop()||'model.glb';
  if(source.type==='prefab'||source.type==='builtin-prefab'||name.endsWith('.h3dprefab.zip')) {
    phase('parsing');const value=await preparePrefab(blob,{scriptParams:source.scriptParams},{signal,confirmEmbeddedContent:true});
    return {value,summary:summary(value.object)};
  }
  const files=new Map<string,File>();
  if(name.toLowerCase().endsWith('.zip')) {
    const zip=await JSZip.loadAsync(blob);
    for(const [path,entry] of Object.entries(zip.files))if(!entry.dir) {
      if(path.split('/').includes('..')||path.startsWith('/'))throw new Error('Invalid bundle path');
      if((entry as any)._data?.uncompressedSize>256*1024*1024)throw new Error('An expanded model file exceeds 256 MiB');
      files.set(path,new File([await entry.async('arraybuffer')],path));
    }
  } else files.set(name,new File([blob],name));
  for(const dependency of source.files||[]) {
    const r=await fetchAgentFile(dependency.url,{signal});files.set(dependency.path,new File([await r.blob()],dependency.path));
  }
  const entry=source.entry||[...files.keys()].find(p=>IMPORT_FORMATS.includes(p.split('.').pop()!.toLowerCase())&&!p.endsWith('.zip'));
  if(!entry||!files.has(entry))throw new Error('Bundle has no model entry; specify entry');
  const manager=new THREE.LoadingManager(),objectUrls:string[]=[],resourceNames=new Map<string,string>(),failures:string[]=[];
  let pending=0;let drained:()=>void=()=>{};
  const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager);
  manager.itemStart=(u)=>{pending++;start(u);};manager.itemEnd=(u)=>{end(u);pending--;if(!pending)drained();};
  manager.onError=(u)=>failures.push(`Dependency failed: ${resourceNames.get(u)||u}`);
  manager.setURLModifier(value=>{
    signal.throwIfAborted();
    if(/^(data:|blob:)/.test(value))return value;
    const key=decodeURIComponent(new URL(value,`https://bundle.invalid/${entry}`).pathname.slice(1));
    const dependency=files.get(key)||files.get(value.replace(/^\.\//,''));
    if(dependency){const u=URL.createObjectURL(dependency);objectUrls.push(u);resourceNames.set(u,dependency.name);return u;}
    if(value.startsWith('/assets/libs/')||value.includes('/libs/'))return value;
    if(files.size>1)throw new Error(`Missing model dependency: ${value}`);
    return new URL(value,new URL(url,location.href)).href;
  });
  let object:THREE.Object3D|undefined;
  try {
    let scripts:ISceneJson['scripts']={};
    if(entry.toLowerCase().endsWith('.json')) {
      const json=JSON.parse(await files.get(entry)!.text());
      for(const [uuid,list] of Object.entries(json.scripts||{})) {
        if(!Array.isArray(list))throw new Error('JSON scripts must map object UUIDs to script arrays');
        for(const script of list)validateAgentScript(script.source,uuid,script.name);
      }
      scripts=json.scripts||{};
    }
    phase('parsing'); object=await parseModel(files.get(entry)!,manager,files,signal);
    if(pending)await Promise.race([new Promise<void>(resolve=>{drained=resolve;}),new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))]);
    signal.throwIfAborted();if(failures.length)throw new Error(failures.join('; '));
    if(object.type==='Scene'){const group=new THREE.Group();group.uuid=object.uuid;group.name=object.name;group.userData=object.userData;group.animations=object.animations;group.add(...object.children.slice());object=group;}
    const uuidMap=remapObjectAndResourceUuids(object);scripts=remapScripts(scripts,uuidMap);
    object.name=source.name||object.name||entry;
    return {value:{object,scripts},summary:summary(object)};
  } catch(error){if(object)disposeDetachedObject(object);if(failures.length)throw new Error(failures.join('; '));throw error;}
  finally {for(const u of objectUrls)URL.revokeObjectURL(u);}
}, value=>disposeDetachedObject(value.object),120_000,()=>`${agentState.sessionId}:${agentState.documentEpoch}`);
watch(()=>`${agentState.sessionId}:${agentState.documentEpoch}`,()=>agentModelJobs.invalidateScope(),{flush:'sync'});

export function prepareImportOperation(op:AgentOperation,ctx:AgentEditContext) {
  if(op.type!=='insert-model')return false;
  const prepared=agentModelJobs.ready(op.jobId);
  if(prepared.object.parent)throw new Error('Prepared model was already inserted');
  const parent=op.parent?ctx.resolve(op.parent):App.scene;
  if(op.ref)ctx.register(op.ref,prepared.object);
  ctx.steps.push(()=>{
    return agentMembershipStep(prepared.object,parent,parent.children.length,true,prepared.scripts);
  });
  return true;
}
