import { LoadingManager, type Object3D } from 'three';
import { Loader, assertSupportedMaterials } from '@astral3d/engine';
import { DesktopImportJobs } from './desktopImportJobs';

function disposeModel(object:Object3D) {
  const resources = new Set<any>(), images = new Set<any>();
  object.traverse((child:any)=>{
    if(child.geometry)resources.add(child.geometry);
    for(const material of Array.isArray(child.material)?child.material:child.material?[child.material]:[]) {
      resources.add(material);
      for(const value of Object.values(material) as any[]) if(value?.isTexture) {resources.add(value);if(value.source?.data)images.add(value.source.data);}
    }
  });
  for(const resource of resources)resource.dispose();
  for(const image of images)if(typeof image.close==='function')image.close();
}

export const desktopModelJobs = new DesktopImportJobs<Object3D>(async (source, signal, phase) => {
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
    let objects=0,meshes=0;
    object.traverse((child:any)=>{objects++;if(child.isMesh)meshes++;});
    return {value:object,summary:{filePath:source.filePath,objects,meshes,animations:gltf.animations.length}};
  } catch(error) { if(object)disposeModel(object);throw error; }
  finally { signal.removeEventListener('abort',abort);if(loader)Loader.disposeGLTFLoaderEffects(loader); }
}, disposeModel);
