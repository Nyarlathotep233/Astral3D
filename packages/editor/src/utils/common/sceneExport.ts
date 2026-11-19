import { THREE } from '@astral3d/engine';
import JSZip from 'jszip';
import { App, Package } from '@astral3d/engine';
import { createPrefabFile } from './prefab';

export const EXPORT_FORMATS = ['json','glb','gltf','obj','ply','ply-binary','stl','stl-binary','usdz','prefab','project-json','project-zip','standalone'] as const;
export type SceneExportFormat = typeof EXPORT_FORMATS[number];
export interface SceneExportOptions { format: SceneExportFormat; object?: THREE.Object3D; name?: string; onProgress?: (progress:number)=>void; fetchResource?: typeof fetch; }
const safeName=(name:string)=>name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,150)||'Scene';
const json=(value:unknown)=>JSON.stringify(value,null,2);
function file(data:BlobPart,name:string,type:string) { return new File([data],name,{type}); }
function clips(object:THREE.Object3D) {
  const result=new Map<string,THREE.AnimationClip>();
  object.traverse(node=>node.animations.forEach((item:any)=>{const clip=item.getClip?.()||item;result.set(clip.uuid,clip);}));
  return [...result.values()];
}
function scripts(object:THREE.Object3D) {
  const result:Record<string,any>={};object.traverse(node=>{if(App.scripts[node.uuid])result[node.uuid]=App.scripts[node.uuid];});return result;
}
/** Produce a File only. Callers choose browser download or MCP artifact publication. */
export async function createSceneExport(options:SceneExportOptions):Promise<File> {
  const format=options.format;
  if(!EXPORT_FORMATS.includes(format))throw new Error(`Unsupported export format: ${format}`);
  if(format.startsWith('project-')||format==='standalone') {
    if(options.object&&options.object!==App.scene)throw new Error(`${format} exports the complete project; omit object target`);
    return createProjectExport(options);
  }
  const object=options.object||sceneExportRoot();
  const name=safeName(options.name||object.name||'Astral3DScene');
  if(format==='prefab')return createPrefabFile(object);
  if(format==='json') {
    // The extra scripts field is accepted by H3D import and leaves standard ObjectLoader JSON valid.
    return file(json({...object.toJSON(),scripts:scripts(object)}),`${name}.json`,'application/json');
  }
  object.updateWorldMatrix(true,true);
  if(format==='glb'||format==='gltf') {
    const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
    const output=await new GLTFExporter().parseAsync(object,{binary:format==='glb',animations:clips(object),onlyVisible:false,includeCustomExtensions:true});
    return file(output instanceof ArrayBuffer?output:json(output),`${name}.${format}`,format==='glb'?'model/gltf-binary':'model/gltf+json');
  }
  if(format==='obj') {
    const {OBJExporter}=await import('three/examples/jsm/exporters/OBJExporter.js');return file(new OBJExporter().parse(object),`${name}.obj`,'text/plain');
  }
  if(format.startsWith('ply')) {
    const {PLYExporter}=await import('three/examples/jsm/exporters/PLYExporter.js');
    const output=await new Promise<string|ArrayBuffer>((resolve,reject)=>{try{new PLYExporter().parse(object,resolve,{binary:format==='ply-binary',littleEndian:true});}catch(error){reject(error);}});
    return file(output,`${name}${format==='ply-binary'?'-binary':''}.ply`,'application/octet-stream');
  }
  if(format.startsWith('stl')) {
    const {STLExporter}=await import('three/examples/jsm/exporters/STLExporter.js');
    const output=new STLExporter().parse(object,{binary:format==='stl-binary'} as any);
    return file(output as BlobPart,`${name}${format==='stl-binary'?'-binary':''}.stl`,'model/stl');
  }
  const {USDZExporter}=await import('three/examples/jsm/exporters/USDZExporter.js');
  return file(await new USDZExporter().parseAsync(object),`${name}.usdz`,'model/vnd.usdz+zip');
}

// A shallow root filters editor-only objects without cloning special SDK types or changing membership.
function sceneExportRoot() {const scene=App.scene.clone(false);scene.uuid=App.scene.uuid;scene.children=App.scene.children.filter(object=>!object.ignore);return scene;}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function checkedFetch(fetcher:typeof fetch,url:string) {const response=await fetcher(url);if(!response.ok)throw new Error(`Export resource failed: ${url} (HTTP ${response.status})`);return response;}
/** Package.pack owns serialization of scripts, GLSL materials, textures, clips and CAD drawing. */
async function createProjectExport(options:SceneExportOptions):Promise<File> {
  const sceneInfo=structuredClone(App.project.getKey('sceneInfo'));
  const name=safeName(options.name||sceneInfo.sceneName||sceneInfo.id||'Scene');
  const instance=new Package(window.viewer);
  const packages=new Map<string,File>();
  let firstPackageName='';
  try {
    const result=await instance.pack({name:`${name}-${Date.now()}`,layer:2,zipUploadFun:async value=>{packages.set(value.name,value);return value.name;},onProgress:options.onProgress});
    firstPackageName=String(result.firstUploadResult||'');
    if(!firstPackageName||!packages.has(firstPackageName))throw new Error('Export did not produce its first package');
  } finally {
    instance.dispose();
    // Older SDK versions wrote zip during pack. Preserve the actual live project even on failure.
    if(App.project.getKey('sceneInfo.zip')!==sceneInfo.zip)App.project.setKey('sceneInfo.zip',sceneInfo.zip);
  }
  const packageNames=[...packages.keys()];
  const resources={firstPackage:firstPackageName,groupPackages:packageNames.filter(n=>n!==firstPackageName),packageFileCount:packageNames.length,coverPicture:sceneInfo.coverPicture||'',packageContentHint:['scene.json','config.json','Textures/*','Geometries/*','Drawing/*']};
  const manifest:any={signature:options.format==='project-json'?'h3d-scene-project-package':options.format==='project-zip'?'h3d-scene-project-package-zip':'h3d-scene-standalone-preview-package-zip',version:1,exportedAt:new Date().toISOString(),sourceSceneId:sceneInfo.id,sourceSceneInfo:sceneInfo,firstPackageName,packageFiles:packageNames,initRequirements:{resources}};
  const fetcher=options.fetchResource||fetch;
  if(options.format==='project-json') {
    manifest.packageFiles=Object.fromEntries(await Promise.all([...packages].map(async([key,value])=>[key,await readAsDataUrl(value)])));
    if(sceneInfo.coverPicture)try{const url=/^(blob:|data:|https?:)/.test(sceneInfo.coverPicture)?sceneInfo.coverPicture:`/file/static/${sceneInfo.coverPicture}`;manifest.coverImageDataUrl=await readAsDataUrl(await(await checkedFetch(fetcher,url)).blob());}catch{/* Cover is optional; scene assets are not. */}
    return file(json(manifest),`${name}.h3d-project.json`,'application/json');
  }
  const archive=new JSZip();
  if(options.format==='standalone')await populateStandalone(archive,packages,manifest,fetcher,name);
  for(const[key,value]of packages)archive.file(`packages/${key}`,await value.arrayBuffer());
  archive.file('project.json',json(manifest));
  return file(await archive.generateAsync({type:'blob'}),`${name}.${options.format==='standalone'?'h3d-standalone-preview':'h3d-project'}.zip`,'application/zip');
}

// These are SDK public assets, served with the same relative layout as its UMD file.
const RUNTIME_FILES=[
  'resource/textures/dot.png','resource/textures/smoke.png','resource/textures/noise.png',
  'libs/draco/gltf/draco_decoder.js','libs/draco/gltf/draco_decoder.wasm','libs/draco/gltf/draco_wasm_wrapper.js',
  'libs/basis/basis_transcoder.js','libs/basis/basis_transcoder.wasm','static/images/logo.png',
];
async function populateStandalone(archive:JSZip,packages:Map<string,File>,manifest:any,fetcher:typeof fetch,name:string) {
  let runtime=await(await checkedFetch(fetcher,'/standalone-runtime/astral3d.umd.js')).text();
  // These two built-in shaders use document-root URLs; make them package-relative too.
  const shaderTextures=['GradationBlue.png','FlowTexture.png'].map(n=>`static/images/resource/material/shader/texture2D/${n}`);
  for(const path of shaderTextures){runtime=runtime.split(JSON.stringify('/'+path)).join(JSON.stringify('./runtime/'+path));archive.file('runtime/'+path,await(await checkedFetch(fetcher,'/'+path)).arrayBuffer());}
  archive.file('runtime/astral3d.umd.js',runtime);
  const runtimeFiles=[...RUNTIME_FILES];
  const lut=App.project.getKey('effect.LUT');if(lut?.enabled&&lut.lut)runtimeFiles.push(`resource/luts/${lut.lut}`);
  await Promise.all(runtimeFiles.map(async path=>archive.file('runtime/'+path,await(await checkedFetch(fetcher,'/standalone-runtime/'+path)).arrayBuffer())));
  const assets=new StandaloneAssetGraph(archive,fetcher);
  const references:string[]=[];
  App.scene.traverse((node:any)=>{
    if(node.isTilesGroup&&node.options?.url)references.push(node.options.url);
    if(node.isBillboard&&node.options?.image?.url)references.push(node.options.image.url);
    if(node.isHtmlPanel||node.isHtmlSprite)for(const code of node.options?.codes||[])if(typeof code.content==='string')references.push(...extractResourceUrls(code.content).filter(url=>/^(https?:|blob:|\/)/i.test(url)));
  });
  for(const url of new Set(references))await assets.add(url,location.href,true);
  await assets.finish();
  if(assets.aliases.size)for(const[key,value]of packages) {
    const inner=await JSZip.loadAsync(await value.arrayBuffer());
    for(const entry of Object.values(inner.files))if(!entry.dir&&/\.(json|html|css)$/.test(entry.name)) {
      const text=await entry.async('string');inner.file(entry.name,assets.replace(text));
    }
    packages.set(key,file(await inner.generateAsync({type:'blob'}),key,'application/zip'));
  }
  manifest.externalResources=Object.fromEntries(assets.aliases);
  manifest.runtimeDependencies=runtimeFiles;
  manifest.runtimeNetworkNotice='Scene assets and declared HTML/Tiles resource dependencies are included. User scripts can still intentionally call APIs or construct URLs at runtime.';
  archive.file('index.html',buildStandalonePreviewHtml(name));
  archive.file('README.txt','Extract this ZIP, serve its directory with any static HTTP server, and open index.html. The viewer also works below a URL subdirectory. Scripts execute as authored and may intentionally call external services.');
}

/** Download declared dependencies transitively; failures reject the export instead of making a broken offline ZIP. */
class StandaloneAssetGraph {
  aliases=new Map<string,string>();
  private records=new Map<string,{path:string,bytes:ArrayBuffer,text?:string,dependencies:Map<string,string>}>();
  constructor(private archive:JSZip,private fetcher:typeof fetch){}
  async add(input:string,base:string,root=false):Promise<void> {
    if(!input||/^(data:|#|javascript:|mailto:)/i.test(input))return;
    const url=new URL(input,base).href;
    if(this.records.has(url))return;
    if(this.records.size>=10000)throw new Error('Standalone has more than 10,000 external resources; split this project before exporting');
    const parsed=new URL(url);
    const encoded=Array.from(new TextEncoder().encode(url)).reduce((value,n)=>((value^n)*16777619)>>>0,2166136261).toString(16);
    const path=`assets/${this.records.size}-${encoded}-${safeName(decodeURIComponent(parsed.pathname.split('/').pop()||'resource'))}`;
    const record:{path:string,bytes:ArrayBuffer,text?:string,dependencies:Map<string,string>}={path,bytes:new ArrayBuffer(0),dependencies:new Map()};
    this.records.set(url,record);this.aliases.set(url,'./'+path);if(root)this.aliases.set(input,'./'+path);
    const response=await checkedFetch(this.fetcher,url);record.bytes=await response.arrayBuffer();
    const contentType=response.headers.get('content-type')||'';
    if(/\.(json|gltf|css|html|js)$/i.test(parsed.pathname)||/(json|text\/html|text\/css)/i.test(contentType)) {
      record.text=new TextDecoder().decode(record.bytes);
      const dependencies:string[]=[];
      if(/\.(json|gltf)$/i.test(parsed.pathname)||contentType.includes('json')) {
        const visit=(value:any)=>{if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){if(['uri','url'].includes(key)&&typeof child==='string')dependencies.push(child);else visit(child);}};visit(JSON.parse(record.text));
      } else dependencies.push(...extractResourceUrls(record.text));
      for(const dependency of dependencies){if(!/^(data:|#|javascript:|mailto:)/i.test(dependency)){record.dependencies.set(dependency,new URL(dependency,url).href);await this.add(dependency,url);}}
    }
  }
  replace(value:string) {let result=value;for(const[url,path]of [...this.aliases].sort((a,b)=>b[0].length-a[0].length))result=result.split(url).join(path);return result;}
  async finish() {
    for(const record of this.records.values()) {
      if(record.text!==undefined) {
        let text=record.text;
        // URLs inside an asset resolve relative to assets/, unlike URLs embedded in the scene JSON.
        for(const[relative,source]of record.dependencies) {
          const target=this.records.get(source)!;
          const replacement='./'+target.path.slice('assets/'.length);
          text=text.split(source).join(replacement);
          if(relative)text=text.split(JSON.stringify(relative)).join(JSON.stringify(replacement)).split(`"${relative}"`).join(`"${replacement}"`).split(`'${relative}'`).join(`'${replacement}'`).split(`(${relative})`).join(`(${replacement})`);
        }
        this.archive.file(record.path,text);
      } else this.archive.file(record.path,record.bytes);
    }
  }
}
function extractResourceUrls(text:string) {
  const urls=[...text.matchAll(/(?:url\(\s*["']?|(?:@import|import|from)\s*["'])([^\s"'<>\)]+)/gi)].map(match=>match[1]);
  for(const[tag]of text.matchAll(/<(?:img|script|source|video|audio|iframe|input|embed|track|link)\b[^>]*>/gi)) {
    const link=/^<link\b/i.test(tag);
    if(link&&!/\brel\s*=\s*["'][^"']*(?:stylesheet|icon|preload|modulepreload)[^"']*["']/i.test(tag))continue;
    const attribute=tag.match(link?/\bhref\s*=\s*["']([^"']+)["']/i:/\bsrc\s*=\s*["']([^"']+)["']/i);
    if(attribute)urls.push(attribute[1]);
    const poster=tag.match(/\bposter\s*=\s*["']([^"']+)["']/i);if(poster)urls.push(poster[1]);
  }
  return urls.filter(url=>!url.startsWith('#'));
}

export function buildStandalonePreviewHtml(name:string) {
  const title=name.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body,#app{width:100%;height:100%;margin:0}body{background:#0b1020}.css3d-imported-content,.css3d-imported-content html,.css3d-imported-content body{background:transparent!important}#status{position:fixed;top:12px;left:12px;z-index:10;background:#101830;color:white;padding:12px;font:14px sans-serif;white-space:pre-wrap}</style></head><body><div id="app"></div><div id="status">Loading scene…</div><script src="./runtime/astral3d.umd.js"></script><script>
(async()=>{const status=document.getElementById('status');try{const manifest=await fetch('./project.json').then(r=>{if(!r.ok)throw Error('project.json: '+r.status);return r.json()});const sdk=window.Astral3D;const viewer=window.viewer=new sdk.Viewer({container:document.getElementById('app'),edit:{enabled:false},grid:{enabled:false},request:{baseUrl:''}});const loader=new sdk.Package(viewer);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Scene load timeout')),180000);loader.unpack({url:'./packages/'+manifest.firstPackageName,onProgress:p=>status.textContent='Loading scene '+Number(p||0).toFixed(1)+'%',onComplete:()=>{clearTimeout(timer);loader.dispose();resolve()}})});status.remove()}catch(error){console.error(error);status.textContent=error.stack||String(error)}})();
</script></body></html>`;
}

export function downloadSceneExport(value:File) {const url=URL.createObjectURL(value);const anchor=document.createElement('a');anchor.href=url;anchor.download=value.name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
