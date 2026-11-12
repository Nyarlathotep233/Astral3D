import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from '../../packages/desktop/node_modules/esbuild/lib/main.js';
import ts from '../../packages/editor/node_modules/typescript/lib/typescript.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../packages/editor/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { zipSync, unzipSync, strFromU8 } from '../../packages/editor/node_modules/three/examples/jsm/libs/fflate.module.js';

const root = new URL('../../', import.meta.url);
const dialogPath = 'packages/editor/src/views/editor/layouts/assets/bimLibrary/BimUploadDialog.vue';
const libraryPath = 'packages/editor/src/views/editor/layouts/assets/BIMLibrary.vue';
const loaderPath = 'packages/sdk/lib/core/loader/Loader.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }

async function moduleFromSource(file, names, env, functionName) {
  const contents = await readFile(new URL(file,root),'utf8');
  let source = contents.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] || contents;
  if (functionName) {
    const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    source=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===functionName).getText();
  }
  const code = source.replace(/^import [^\r\n]*\r?\n/gm,'');
  const compiled = await transform(`const {${Object.keys(env).join(',')}}=__env;\n${code}\n${names.length ? `export {${names.join(',')}};` : ''}`, {
    loader:'ts',format:'cjs',target:'es2022',logLevel:'silent',
  });
  const module = {exports:{}};
  const context = vm.createContext({__env:env,module,exports:module.exports,Error,File,Blob,URL,console,Uint8Array,ArrayBuffer,TextDecoder,setTimeout:env.setTimeout || setTimeout});
  new vm.Script(compiled.code,{filename:file}).runInContext(context);
  return module.exports;
}

function environment() {
  const notifications = [], calls = [], timers = [];
  const env = {
    reactive: value => value, ref: value => ({value}), t: value => value,
    withDefaults: () => ({}), defineProps: () => ({}), defineEmits: () => (...args) => calls.push(['emit',...args]), defineExpose: () => {},
    onMounted: () => {}, onBeforeUnmount: () => {}, h: () => {},
    NButton:{}, NTag:{}, NIcon:{}, Reload:{}, CheckmarkCircle:{}, CloseOutline:{},
    NEED_CONVERT_BIM_MODEL:['rvt'],
    useDragStore: () => ({}), useWebsocketStore: () => ({uname:'current-user'}),
    onWebSocket: () => {}, offWebSocket: () => {}, filterSize:value=>value, dateTimeFormat:()=>'',
    fetchUpload: async data => {calls.push(['thumbnail',data]);return {error:null,data:'thumbnail.png'};},
    fetchUploadRvt: async data => {calls.push(['rvt',data]);return {error:null,data:'static/tmp/bim/input.rvt'};},
    fetchAddBim2Gltf: async data => {calls.push(['submit',data]);return {error:null,data:{id:1}};},
    fetchGetBim2GltfList: async () => ({data:{items:[],pages:1}}),
    fetch: async () => ({ok:true,blob:async()=>new Blob(['GLB'])}),
    Loader:{loadFiles:async()=>{calls.push(['load']);}}, Hooks:{useDispatchSignal: name=>calls.push(['signal',name])},
    setTimeout: callback => {timers.push(callback);return timers.length;},
    window:{$t:value=>value,$notification:{info:opts=>{
      const notice={...opts,destroyed:false,destroy(){this.destroyed=true;}};notifications.push(notice);return notice;
    }},$dialog:{info:opts=>calls.push(['dialog',opts])},$message:{error:message=>calls.push(['error',message])}},
  };
  return {env,notifications,calls,timers};
}

async function dialogFixture(overrides={}) {
  const fixture=environment();Object.assign(fixture.env,overrides);
  const api=await moduleFromSource(dialogPath,['BIMModel','submit','handleTaskResult','getNotice','formRef','uploadBIMRef','uploadThumbnailRef'],fixture.env);
  api.formRef.value={validate:callback=>callback(null)};
  api.uploadBIMRef.value={clear:()=>fixture.calls.push(['clear-rvt'])};
  api.uploadThumbnailRef.value={clear:()=>fixture.calls.push(['clear-thumbnail'])};
  const file=new File(['test fixture'],'source.rvt');
  Object.assign(api.BIMModel,{bimFile:file,fileName:file.name});
  return {...fixture,api,file,submit:()=>api.submit({preventDefault(){}})};
}
const terminal=(id,status='completed')=>({item:{id},conversionStatus:status});

test('BIM production upload is enabled and HTTP acceptance does not clear input',async()=>{
  const f=await dialogFixture();f.submit();await tick();
  assert.equal(f.calls.filter(x=>x[0]==='submit').length,1);
  assert.equal(f.api.BIMModel.bimFile,f.file);
  f.api.handleTaskResult(terminal(99));assert.equal(f.api.BIMModel.bimFile,f.file);
  f.api.handleTaskResult(terminal(1));assert.equal(f.api.BIMModel.bimFile,null);
  assert.equal(f.calls.filter(x=>x[0]==='clear-rvt').length,1);
  assert.equal(f.calls.filter(x=>x[0]==='clear-thumbnail').length,1);
  const source=await readFile(new URL(dialogPath,root),'utf8');
  assert.doesNotMatch(source,/import\.meta\.env\.PROD/);
  assert.match(source,/display-directive="show"/);
});

test('BIM upload advertises and accepts only the supported RVT format',async()=>{
  const source=await readFile(new URL('packages/editor/src/utils/common/constant.ts',root),'utf8');
  assert.match(source,/export const NEED_CONVERT_BIM_MODEL = \["rvt"\];/);
});

test('Everse upload exposes only standard/named views and colour/textures, with fixed internal coordinates',async()=>{
  const source=await readFile(new URL(dialogPath,root),'utf8');
  assert.match(source,/value="Default">标准三维视图/);
  assert.match(source,/value="Name"/);
  assert.match(source,/value="Colour"/);
  assert.match(source,/value="Realistic">\{\{t\("bim.Textures"\)\}\}/);
  assert.doesNotMatch(source,/value="(?:ViewDefault|ProjectBasePoint|MeasuringPoint)"|handleOptimizeChange|exportPropertyDisabled/);
  assert.doesNotMatch(source,/v-model:value="BIMModel.options.Optimize"/);
  const f=await dialogFixture();f.submit();await tick();
  const options=f.calls.find(x=>x[0]==='submit')[1].options;
  assert.equal(options.Optimize,false);
  assert.equal(options.CoordinateReference,'Origin');
  assert.equal(options.ExportProperty,true);
});

test('thumbnail, RVT upload, submission, and conversion failures retain the form',async()=>{
  for(const stage of ['thumbnail','rvt','submit','conversion','throw']) {
    const overrides={};
    if(stage==='thumbnail')overrides.fetchUpload=async()=>({error:{msg:'thumbnail failed'},data:null});
    if(stage==='rvt')overrides.fetchUploadRvt=async()=>({error:{msg:'rvt failed'},data:null});
    if(stage==='submit')overrides.fetchAddBim2Gltf=async()=>({error:{msg:'submit failed'},data:null});
    if(stage==='throw')overrides.fetchUploadRvt=async()=>{throw new Error('network failed');};
    const f=await dialogFixture(overrides);
    f.api.BIMModel.thumbnail=new File(['preview'],'cover.png');
    f.api.BIMModel.options.DisplayStyle='Realistic';
    f.submit();await tick();
    if(stage==='conversion')f.api.handleTaskResult(terminal(1,'failed'));
    assert.equal(f.api.BIMModel.bimFile,f.file,stage);
    assert.equal(f.api.BIMModel.options.DisplayStyle,'Realistic',stage);
    assert.equal(f.calls.filter(x=>x[0]==='clear-rvt').length,0,stage);
    if(stage==='thumbnail')assert.equal(f.calls.filter(x=>x[0]==='rvt').length,0);
  }
});

test('submission uses a captured snapshot and completion never erases later edits',async()=>{
  const pending=deferred(), requests=[];
  const f=await dialogFixture({fetchUploadRvt:()=>pending.promise,fetchAddBim2Gltf:async value=>{requests.push(value);return {data:{id:1},error:null};}});
  f.submit();
  const next=new File(['next'],'next.rvt');
  Object.assign(f.api.BIMModel,{bimFile:next,fileName:next.name});
  f.api.BIMModel.options.DisplayStyle='Realistic';
  pending.resolve({error:null,data:'source.rvt'});await tick();
  assert.equal(requests[0].fileName,'source.rvt');
  assert.equal(requests[0].options.DisplayStyle,'Colour');
  f.api.handleTaskResult(terminal(1));
  assert.equal(f.api.BIMModel.bimFile,next);
  assert.equal(f.api.BIMModel.options.DisplayStyle,'Realistic');
});

test('only the newest matching submission can reset; task notifications remain separate',async()=>{
  let id=0;const f=await dialogFixture({fetchAddBim2Gltf:async()=>({error:null,data:{id:++id}})});
  f.submit();await tick();f.submit();await tick();
  assert.notEqual(f.api.getNotice(1),f.api.getNotice(2));
  f.api.handleTaskResult(terminal(1));assert.equal(f.api.BIMModel.bimFile,f.file);
  f.api.handleTaskResult(terminal(2));assert.equal(f.api.BIMModel.bimFile,null);
});

test('completion before HTTP response is correlated later without losing edited input',async()=>{
  for(const edited of [false,true]){
    const pending=deferred();const f=await dialogFixture({fetchAddBim2Gltf:()=>pending.promise});
    f.submit();await tick();
    const notice=f.api.getNotice(7);f.api.handleTaskResult(terminal(7));
    if(edited)f.api.BIMModel.options.ViewName='later edit';
    pending.resolve({error:null,data:{id:7}});await tick();
    assert.equal(f.api.BIMModel.bimFile,edited?f.file:null);
    assert.equal(notice.destroyed,false);
    assert.equal(f.notifications[0].destroyed,true);
  }
});

test('BIM download rejects HTTP failures and awaits parsing before success',async()=>{
  const f=environment();
  const api=await moduleFromSource(libraryPath,['addToScene','Bim2GltfWsHandle','uploadDialogRef'],f.env);
  const failed=environment();failed.env.fetch=async()=>({ok:false,status:404});
  const failureApi=await moduleFromSource(libraryPath,['addToScene'],failed.env);
  await failureApi.addToScene({gltfFilePath:'missing.glb',fileName:'model'});
  assert.equal(failed.calls.filter(x=>x[0]==='load').length,0);
  assert.match(failed.notifications[0].content,/404/);
  const pending=deferred();f.env.Loader.loadFiles=()=>pending.promise;
  const loading=api.addToScene({gltfFilePath:'model.glb',fileName:'model'});await tick();
  assert.equal(f.calls.filter(x=>x[0]==='signal').length,0);
  pending.reject(new Error('invalid GLB'));await loading;
  assert.match(f.notifications[0].content,/invalid GLB/);
  assert.equal(f.calls.filter(x=>x[0]==='signal').length,0);
  f.env.Loader.loadFiles=async()=>[];
  await api.addToScene({gltfFilePath:'model.glb',fileName:'model'});
  assert.equal(f.calls.filter(x=>x[0]==='signal').length,1);
});

test('existing task notification shows optional backend failure message and forwards task identity',async()=>{
  const f=environment(), handled=[];
  const api=await moduleFromSource(libraryPath,['Bim2GltfWsHandle','uploadDialogRef'],f.env);
  const notice={};api.uploadDialogRef.value={getNotice:id=>{assert.equal(id,8);return notice;},handleTaskResult:value=>handled.push(value)};
  const data={...terminal(8,'failed'),message:'Named 3D view was not found'};
  api.Bim2GltfWsHandle({type:'bim2gltf',subscriber:'current-user',data});
  assert.equal(notice.content,data.message);assert.equal(notice.closable,true);assert.equal(handled[0],data);
});

test('shared-loader callers consume rejected imports rather than reporting success or leaking rejections',async()=>{
  const cases=[
    ['packages/editor/src/components/es/plugin/builtin/GLTFHandler.vue','handleImportScene',[],{outputFiles:[new File(['bad'],'bad.glb')]}],
    ['packages/editor/src/views/editor/components/extraPane/resource/builtin/components/ModelCard.vue','loadModel',[],{props:{resource:{path:'bad.glb',name:'bad'}}}],
    ['packages/editor/src/views/editor/components/extraPane/resource/public/AssetsList.vue','addToScene',[{file:'bad.glb',name:'bad'}],{props:{type:'Model'},getServiceStaticFile:value=>value}],
    ['packages/editor/src/views/editor/layouts/Scene.vue','sceneDrop',[{preventDefault(){},target:null,layerX:0,layerY:0,dataTransfer:{types:[],files:[]}}],{dragStore:{},Vector2:THREE.Vector2}],
  ];
  for(const [file,name,args,extra] of cases){
    const f=environment();f.env.Loader.loadFiles=async()=>{throw Error('parse failed');};
    Object.assign(f.env,extra,{Astral3D:{Loader:f.env.Loader}});
    const api=await moduleFromSource(file,[name],f.env,name);
    await api[name](...args);await tick();
    assert.equal(f.calls.filter(value=>value[0]==='error').length,1,name);
    assert.equal(f.calls.filter(value=>value[0]==='signal').length,0,name);
  }
});

class FileReaderFixture {
  listeners={};addEventListener(name,callback){this.listeners[name]=callback;}
  async readAsArrayBuffer(file){
    if(file.readFailure){this.error=new Error('disk read failed');this.listeners.error();return;}
    const result=await file.arrayBuffer();this.listeners.load({target:{result}});
  }
}
function glb() {
  const json=JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{translation:[1000000.001,12,3],extras:{BIM:{parameters:[]}}}]});
  const text=Buffer.from(json.padEnd(Math.ceil(json.length/4)*4,' '));
  const bytes=Buffer.alloc(20+text.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(text.length,12);bytes.writeUInt32LE(0x4e4f534a,16);text.copy(bytes,20);return bytes;
}
async function loaderFixture() {
  const added=[];
  const env={THREE,FileReader:FileReaderFixture,TGALoader:class{},MTLLoader:class{},unzipSync,strFromU8,
    App:{execute:command=>added.push(command.object)},AddObjectCommand:class{constructor(object){this.object=object;}}};
  const {default:loader}=await moduleFromSource(loaderPath,[],env);
  let disposed=0;loader.createGLTFLoader=async(manager,isolated)=>{assert.equal(isolated,true);return new GLTFLoader(manager);};loader.disposeGLTFLoaderEffects=()=>disposed++;
  return {loader,added,get disposed(){return disposed;}};
}

test('shared GLB/glTF loader rejects parse/initialization/read failures and releases effects',async()=>{
  const f=await loaderFixture();
  for(const name of ['bad.glb','bad.gltf'])await assert.rejects(f.loader.loadFiles([new File(['not a model'],name)]));
  assert.equal(f.disposed,2);assert.equal(f.added.length,0);
  const failed=await loaderFixture();failed.loader.createGLTFLoader=async()=>{throw Error('decoder init failed');};
  await assert.rejects(failed.loader.loadFile(new File([glb()],'sample.glb')),/decoder init failed/);
  await assert.rejects(failed.loader.loadFile({name:'sample.glb',readFailure:true}),/disk read failed/);
});

test('shared GLB/ZIP and folder import preserve coordinates/metadata and propagate failure',async()=>{
  const f=await loaderFixture();const bytes=glb();
  const models=await f.loader.loadFiles([new File([bytes],'source.glb')]);
  assert.equal(models[0].children[0].position.x,1000000.001);
  assert.deepEqual(JSON.stringify(models[0].children[0].userData.BIM),JSON.stringify({parameters:[]}));
  const packed=zipSync({'model.glb':bytes});const model=await f.loader.handleZIP(packed,false);
  assert.equal(model.children[0].position.x,1000000.001);assert.equal(f.added.length,1);
  await assert.rejects(f.loader.handleZIP(zipSync({'bad.glb':new TextEncoder().encode('broken')})));
  const items=[{kind:'file',webkitGetAsEntry:()=>({isFile:true,fullPath:'/bad.glb',file:callback=>queueMicrotask(()=>callback(new File(['broken'],'bad.glb')))})}];
  await assert.rejects(f.loader.loadItemList(items));
});
