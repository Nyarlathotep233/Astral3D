import { LoadingManager, type Object3D } from 'three';
import { Loader, assertSupportedMaterials } from '@astral3d/engine';
import { DesktopImportJobs } from './desktopImportJobs';
import { preparePrefab } from '@/utils/common/prefab';
import { disposeDetachedObject } from '@/utils/common/disposeDetachedObject';
import { getBuiltinPrefabResource } from '@/views/editor/components/extraPane/resource/builtin/prefabRegistry';

type PreparedObject = { object: Object3D; scripts: ISceneJson['scripts'] };
function summary(object: Object3D) {
  let objects=0,meshes=0;
  object.traverse((child:any)=>{objects++;if(child.isMesh)meshes++;});
  return {objects,meshes,animations:object.animations.length};
}

export const desktopModelJobs = new DesktopImportJobs<PreparedObject>(async (source, signal, phase) => {
  if (source.type === 'local-prefab' || source.type === 'builtin-prefab') {
    const resource = source.type === 'builtin-prefab' ? getBuiltinPrefabResource(source.key) : null;
    if (source.type === 'builtin-prefab' && !resource) throw new Error(`Unknown built-in prefab: ${source.key}`);
    const url = resource ? new URL(resource.path, window.location.href).href : source.resolvedLocal.url;
    const manager = new LoadingManager();
    const loader = Loader.createObjectLoader(manager);
    loader.setResourcePath(url.slice(0,url.lastIndexOf('/')+1));
    const abort = () => manager.abort();
    signal.addEventListener('abort',abort,{once:true});
    let prepared: Awaited<ReturnType<typeof preparePrefab>> | undefined;
    try {
      phase('parsing');
      prepared = await preparePrefab(url, {scriptParams:source.scriptParams}, {signal,loader,confirmEmbeddedContent:source.confirmEmbeddedContent});
      assertSupportedMaterials(prepared.object);
      return {value:prepared,summary:{source:source.type,...(resource?{key:resource.key}:{filePath:source.filePath}),...summary(prepared.object),
        scripts:Object.values(prepared.scripts).reduce((total,list)=>total+(list?.length||0),0),embeddedContent:prepared.embeddedContent}};
    } catch (error) { if(prepared)disposeDetachedObject(prepared.object);throw error; }
    finally { signal.removeEventListener('abort',abort); }
  }
  const {url,resourceRoot} = source.resolvedLocal;
  const manager = new LoadingManager(), failures:string[]=[];
  manager.onError = () => { failures.push('A model dependency failed to load'); };
  manager.setURLModifier(value=>{
    if(signal.aborted)throw new Error('Model preparation cancelled');
    if(value.startsWith('data:')||value.startsWith('blob:'))return value;
    const resolved = new URL(value, url);
    // Only local model/dependency files and the SDK's fixed KTX decoder assets are reachable.
    if(resolved.href.startsWith(resourceRoot) || /^h3d:\/\/app\/libs\/basis\/basis_transcoder\.(js|wasm)$/.test(resolved.href))return resolved.href;
    failures.push('Unsupported non-local model dependency');
    throw new Error(failures.at(-1));
  });
  const abort = () => manager.abort();
  signal.addEventListener('abort',abort,{once:true});
  let loader:Awaited<ReturnType<typeof Loader.createGLTFLoader>>|undefined, object:Object3D|undefined;
  try {
    const response = await fetch(url,{signal,cache:'no-store'});
    if(!response.ok)throw new Error(`Model read failed: HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    signal.throwIfAborted(); phase('parsing');
    loader = await Loader.createGLTFLoader(manager,true);
    signal.throwIfAborted();
    const gltf = await loader.parseAsync(data,url.slice(0,url.lastIndexOf('/')+1));
    object=gltf.scene; object.animations=gltf.animations;
    signal.throwIfAborted();
    // GLTFLoader may swallow a failed texture and return a null map. Never insert that partial result.
    if(failures.length)throw new Error(failures.join('; '));
    assertSupportedMaterials(object);
    return {value:{object,scripts:{}},summary:{filePath:source.filePath,...summary(object)}};
  } catch(error) { if(object)disposeDetachedObject(object);throw error; }
  finally { signal.removeEventListener('abort',abort);if(loader)Loader.disposeGLTFLoaderEffects(loader); }
}, value=>disposeDetachedObject(value.object));
