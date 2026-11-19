import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import JSZip from '../../packages/editor/node_modules/jszip/lib/index.js';
const root=path.resolve(import.meta.dirname,'../..'),sdk=path.join(root,'packages/sdk/lib');
const app={scene:new THREE.Scene(),metadata:{},scripts:{},project:{getKey(key){return key==='drawing'?{isUploaded:false}:key==='sceneInfo'?{id:'matrix',sceneName:'Matrix',zip:'saved.zip'}:{};},setKey(){}},addObject(object,parent=this.scene){parent.add(object);}};
globalThis.__persistence={THREE,app};globalThis.HTMLImageElement=class{};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onload?.({target:this});});}};
const bundled=await build({stdin:{contents:`import ${JSON.stringify(sdk+'/core/expansion/Object3D.ts')};export {ObjectLoader} from ${JSON.stringify(sdk+'/core/loader/ObjectLoader.js')};export {Package} from ${JSON.stringify(sdk+'/core/loader/Package.ts')};export {createAgentGeometry,GEOMETRY_CATALOG} from ${JSON.stringify(root+'/packages/editor/src/utils/integration/agentObjects.ts')};`,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^[A-Za-z]:[\\/]/},a=>({path:path.normalize(a.path),namespace:'file'}));
  b.onResolve({filter:/^three$/},()=>({path:'three',namespace:'fixture'}));
  b.onResolve({filter:/^@astral3d\/engine$/},()=>({path:'engine',namespace:'fixture'}));
  b.onResolve({filter:/^@\//},a=>a.path==='@/core/loader/Package.Skeleton'?{path:path.join(sdk,'core/loader/Package.Skeleton.ts')}:{path:a.path,namespace:'fixture'});
  b.onResolve({filter:/^\.\.\/objects\/Tile\.js$/},()=>({path:'dummy',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:
    a.path==='three'?Object.keys(THREE).map(k=>`export const ${k}=globalThis.__persistence.THREE.${k};`).join('\n'):
    a.path==='engine'?`export const THREE=globalThis.__persistence.THREE,App=globalThis.__persistence.app,Hooks={useDispatchSignal(){}};export {TeapotGeometry} from ${JSON.stringify(sdk+'/core/geometries/TeapotGeometry.ts')};export class ObjectRegistrationError extends Error{};export class BatchRecoveryError extends Error{};`:
    a.path.startsWith('@/constant')?'export const BASE64_TYPES={},TEXTURE_MAPPING={},TEXTURE_WRAPPING={},TEXTURE_FILTER={},TYPED_ARRAYS={Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array};':
    a.path==='@/utils'?`export {zip,unzip} from ${JSON.stringify(sdk+'/utils/handler/pako.ts')};export function fetchController(){return (url,opts)=>fetch(url,{signal:opts.signal}).then(opts.onSuccess,opts.onError);}`:
    a.path==='@/hooks'?'export const useDispatchSignal=()=>{};':
    a.path==='@/core/app/App'?'export default globalThis.__persistence.app;':
    a.path.includes('HtmlPanel')?'export class HtmlPanel{};export class HtmlSprite{};':'export default class Dummy{};'}));
}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const camera=new THREE.PerspectiveCamera();const viewer={scene:app.scene,camera,modules:{controls:{toJSON(){return '{}';},fromJSON(){}}},options:{request:{baseUrl:''}},installScripts(){},dispatchEvent(){},addTiles(){}};
app.fromJSON=async json=>{const scene=await new api.ObjectLoader().parseAsync(json.scene);app.scene.copy(scene,false);app.scene.children=[];if(scene.children.length)app.scene.add(...scene.children.slice());return app.scene;};
async function pack(scene){viewer.scene=scene;const instance=new api.Package(viewer),files=new Map();await instance.pack({name:'first',layer:2,zipUploadFun:async value=>{files.set(value.name,Buffer.from(await value.arrayBuffer()));return value.name;}});return{instance,files};}
async function unpack(files){const originalFetch=globalThis.fetch;globalThis.fetch=async url=>{const value=files.get(String(url).split('/').pop());return value?new Response(value):new Response('',{status:404});};const instance=new api.Package(viewer);try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Unpack did not settle')),3000);instance.unpack({url:'http://fixture/first.zip',onComplete(){clearTimeout(timer);resolve(app.scene);},onError(error){clearTimeout(timer);reject(error);}});});}finally{instance.dispose();globalThis.fetch=originalFetch;}}
function fingerprint(object){const result={};object.traverse(node=>{if(!node.geometry)return;node.geometry.computeBoundingBox();result[node.name]={type:node.type,geometryType:node.geometry.type,count:node.geometry.attributes.position.count,index:node.geometry.index?.count||0,min:node.geometry.boundingBox.min.toArray(),max:node.geometry.boundingBox.max.toArray(),material:Array.isArray(node.material)?node.material.map(m=>m.uuid):node.material.uuid};if(node.isInstancedMesh)Object.assign(result[node.name],{instances:node.count,matrix:[...node.instanceMatrix.array],colors:[...node.instanceColor.array]});});return result;}

test('every supported geometry, four curve types and renderable object types survive real Package ZIP + ObjectLoader',async()=>{
  const scene=new THREE.Scene(),assembly=new THREE.Group();assembly.name='Assembly';scene.add(assembly);
  const shapes=[{points:[[0,0],[3,0],[3,3],[0,3]],holes:[[[1,1],[1,2],[2,2],[2,1]]]}];
  const special={shape:{shapes},extrude:{shapes,options:{depth:2,bevelEnabled:false}},lathe:{points:[[0,0],[1,0],[1,2],[0,2]]},buffer:{attributes:{position:{itemSize:3,array:[0,0,0,1,0,0,0,1,0]}},index:[0,1,2],computeNormals:true}};
  for(const type of Object.keys(api.GEOMETRY_CATALOG)){const mesh=new THREE.Mesh(api.createAgentGeometry({type,...special[type]}),new THREE.MeshStandardMaterial());mesh.name=type;assembly.add(mesh);}
  const paths={line:[[0,0,0],[1,2,3]],quadratic:[[0,0,0],[2,4,0],[4,0,0]],cubic:[[0,0,0],[1,4,0],[3,4,0],[4,0,0]],catmullrom:[[0,0,0],[1,2,0],[3,0,1]]};
  for(const[type,points]of Object.entries(paths)){const mesh=new THREE.Mesh(api.createAgentGeometry({type:'tube',path:{type,points},radius:.2,tubularSegments:24}),new THREE.MeshStandardMaterial());mesh.name='tube-'+type;assembly.add(mesh);}
  const curvedExtrude=new THREE.Mesh(api.createAgentGeometry({type:'extrude',shapes,options:{steps:12,bevelEnabled:false,extrudePath:{type:'quadratic',points:paths.quadratic}}}),new THREE.MeshStandardMaterial());curvedExtrude.name='extrude-path';assembly.add(curvedExtrude);
  const meshParent=new THREE.Mesh(new THREE.SphereGeometry(2),[new THREE.MeshStandardMaterial({color:'red'}),new THREE.MeshStandardMaterial({color:'blue'})]);meshParent.name='Mesh parent';const meshChild=new THREE.Mesh(new THREE.BoxGeometry(),meshParent.material);meshChild.name='Mesh child';meshParent.add(meshChild);scene.add(meshParent);
  for(const [name,Class,Material]of [['Points',THREE.Points,THREE.PointsMaterial],['Line',THREE.Line,THREE.LineBasicMaterial],['LineSegments',THREE.LineSegments,THREE.LineBasicMaterial]]){const object=new Class(new THREE.BoxGeometry(),new Material());object.name=name;assembly.add(object);}
  const instanced=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);instanced.name='Instances';instanced.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,2,1));instanced.setColorAt(0,new THREE.Color('red'));instanced.setColorAt(1,new THREE.Color('blue'));assembly.add(instanced);
  const expected=fingerprint(scene);const {files}=await pack(scene);const restored=await unpack(files);assert.deepEqual(fingerprint(restored),expected);assert.equal(Object.keys(expected).length,Object.keys(api.GEOMETRY_CATALOG).length+11);
  const repacked=await pack(restored);assert.deepEqual(fingerprint(await unpack(repacked.files)),expected);
});

test('cross-package material arrays and non-map texture dependencies are restored without polling',async()=>{
  const scene=new THREE.Scene();const texture=new THREE.DataTexture(new Uint8Array([255,128,0,255]),1,1);texture.needsUpdate=true;const material=new THREE.MeshStandardMaterial({normalMap:texture,roughnessMap:texture});
  for(let i=0;i<2;i++){const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),[material,new THREE.MeshStandardMaterial()]);group.name='Group '+i;mesh.name='Mesh '+i;group.add(mesh);scene.add(group);}
  const {files}=await pack(scene);const restored=await unpack(files);for(let i=0;i<2;i++){const mesh=restored.getObjectByName('Mesh '+i);assert.equal(mesh.material[0].normalMap.uuid,texture.uuid);assert.equal(mesh.material[0].roughnessMap.uuid,texture.uuid);}
});

test('missing group, corrupt ZIP and missing geometry report one error and never completion',async()=>{
  const scene=new THREE.Scene(),group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));scene.add(group);
  const {files}=await pack(scene);const missing=new Map(files);missing.delete(group.uuid+'.zip');await assert.rejects(unpack(missing),/HTTP 404/);
  const corrupt=new Map(files);corrupt.set(group.uuid+'.zip',Buffer.from('not a zip'));await assert.rejects(unpack(corrupt),/zip|central directory/i);
  const archive=await JSZip.loadAsync(files.get(group.uuid+'.zip'));for(const name of Object.keys(archive.files))if(name.startsWith('Geometries/')&&!archive.files[name].dir)archive.remove(name);
  const missingGeometry=new Map(files);missingGeometry.set(group.uuid+'.zip',await archive.generateAsync({type:'nodebuffer'}));await assert.rejects(unpack(missingGeometry),/missing geometries/);
});

test('duplicate UUIDs reject saving before uploads and cyclic package references reject loading',async()=>{
  const scene=new THREE.Scene(),a=new THREE.Group(),b=new THREE.Group();b.uuid=a.uuid;scene.add(a,b);viewer.scene=scene;let uploads=0;
  await assert.rejects(new api.Package(viewer).pack({name:'first',zipUploadFun:async()=>{uploads++;}}),/duplicate object UUID/);assert.equal(uploads,0);
  const valid=new THREE.Scene(),group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));valid.add(group);const {files}=await pack(valid);
  const archive=await JSZip.loadAsync(files.get(group.uuid+'.zip'));const entry=JSON.parse(await archive.file(group.uuid+'.json').async('string'));entry.object.children.push(group.uuid);archive.file(group.uuid+'.json',JSON.stringify(entry));files.set(group.uuid+'.zip',await archive.generateAsync({type:'nodebuffer'}));await assert.rejects(unpack(files),/cyclic group/);
});

test('disposing a pending package prevents late scene attachment and completion',async()=>{
  const originalFetch=globalThis.fetch;let resolveResponse;globalThis.fetch=()=>new Promise(resolve=>{resolveResponse=resolve;});const instance=new api.Package(viewer);let completed=0,failed=0;
  instance.unpack({url:'http://fixture/first.zip',onComplete(){completed++;},onError(){failed++;}});instance.dispose();resolveResponse(new Response('broken zip'));await new Promise(resolve=>setTimeout(resolve,30));globalThis.fetch=originalFetch;assert.equal(completed,0);assert.equal(failed,0);
});
