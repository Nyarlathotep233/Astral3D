import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import { AtomicBatchCommand } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

const project = { sceneInfo: { id: 'scene-a', zip: 'server.zip', hasDrawing: 0 } };
const app = { scene: new THREE.Scene(), scripts: {}, textures: {}, materials: {}, materialsRefCounter: new Map(),
  project: { getKey(key) { return key === 'sceneInfo.id' ? project.sceneInfo.id : project[key]; } },
  setObjectMaterial(object, slot, material) { if (Array.isArray(object.material)) object.material[slot] = material; else object.material = material; },
  addMaterialToRefCounter(material) { this.materials[material.uuid] = material; this.materialsRefCounter.set(material,(this.materialsRefCounter.get(material)||0)+1); },
  removeMaterialFromRefCounter(material) { const n=this.materialsRefCounter.get(material)-1; if(n){this.materialsRefCounter.set(material,n);}else{this.materialsRefCounter.delete(material);delete this.materials[material.uuid];} },
};
let signal = () => {};
const db = new Map();
class FakePackage {
  async pack(options) {
    project.sceneInfo.zip = ''; project.sceneInfo.hasDrawing = 1;
    const filename = await options.zipUploadFun(new File(['snapshot'], 'first.zip'));
    return { firstUploadResult: filename };
  }
  dispose() {}
}
globalThis.__agentFixture = { THREE, app, AtomicBatchCommand, FakePackage, signal: (...args) => signal(...args),
  store: { async setItem(key,value) {db.set(key,structuredClone(value));},async getItem(key){return structuredClone(db.get(key)||null);} } };
const fixtureEngine = `
import * as Script from ${JSON.stringify(path.resolve(import.meta.dirname,'../../packages/sdk/lib/core/script/scriptParams.ts'))};
export { Script };
export const THREE=globalThis.__agentFixture.THREE, App=globalThis.__agentFixture.app, AtomicBatchCommand=globalThis.__agentFixture.AtomicBatchCommand,
  Package=globalThis.__agentFixture.FakePackage, Hooks={useDispatchSignal:(...args)=>globalThis.__agentFixture.signal(...args)};
${['CircleGridShaderMaterial','DynamicCheckerboardShaderMaterial','FlickerShaderMaterial','SlowSmokeShaderMaterial','SnowingShaderMaterial','StreamerWallShaderMaterial'].map(name=>`export const ${name}={InstanceShaderMaterial:()=>new globalThis.__agentFixture.THREE.ShaderMaterial()};`).join('\n')}
`;
const result = await build({ stdin: { contents: `export * from './packages/editor/src/utils/integration/agentMaterials.ts'; export * from './packages/editor/src/utils/integration/agentScripts.ts'; export * from './packages/editor/src/utils/integration/agentRuntime.ts';`, resolveDir: path.resolve(import.meta.dirname,'../..'), loader:'ts' },
  bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"'},
  plugins:[{name:'agent-fixture',setup(b){
    b.onResolve({filter:/^@astral3d\/engine$|^three$|^localforage$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='three'?Object.keys(THREE).map(key=>`export const ${key}=globalThis.__agentFixture.THREE.${key};`).join('\n'):args.path==='localforage'?'export default {createInstance:()=>globalThis.__agentFixture.store}':fixtureEngine,loader:'js',resolveDir:path.resolve(import.meta.dirname,'../..')}));
  }}],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function context(object) {return {resolve:()=>object,register(){},steps:[],cleanup:[]};}
function reset() {
  app.scene = new THREE.Scene();app.materials={};app.textures={};app.scripts={};app.materialsRefCounter.clear();signal=()=>{};
  globalThis.window = {viewer:{enableScript:false,renderer:{isWebGLRenderer:true,compile(){},properties:{get:()=>({programs:new Map([['test',{program:{}}]])})},getContext:()=>({LINK_STATUS:1,getProgramParameter:()=>true})},camera:new THREE.PerspectiveCamera(),updatePTBackground(){},updatePTEnvironment(){},render(){}},location:{origin:'http://localhost'}};
  globalThis.location={origin:'http://localhost',href:'http://localhost/'};
}
function mesh(material=new THREE.MeshStandardMaterial()) {const object=new THREE.Mesh(new THREE.BoxGeometry(),material);app.scene.add(object);for(const m of Array.isArray(material)?material:[material])app.addMaterialToRefCounter(m);return object;}

test('script validation never invokes top-level source; add/update/remove undo retains identity and order',()=>{
  reset(); const object=mesh(),ctx=context(object);globalThis.__scriptExecuted=0;
  api.prepareScriptOperation({type:'script-add',target:{},name:'logic',source:'globalThis.__scriptExecuted++; function loaded() {}'},ctx);
  assert.equal(app.scripts[object.uuid],undefined);
  const command=new AtomicBatchCommand(ctx.steps);command.execute();assert.equal(globalThis.__scriptExecuted,0);
  const script=app.scripts[object.uuid][0];command.undo();assert.equal(app.scripts[object.uuid],undefined);command.execute();assert.equal(app.scripts[object.uuid][0],script);
  const change=context(object);api.prepareScriptOperation({type:'script-update',target:{},name:'logic',newName:'updated',source:'function loaded(){throw Error("runtime only");}'},change);
  const edit=new AtomicBatchCommand(change.steps);edit.execute();assert.equal(script.name,'updated');edit.undo();assert.equal(script.name,'logic');assert.equal(app.scripts[object.uuid][0],script);
});
test('invalid scripts and out-of-range parameters leave scripts untouched',()=>{
  reset();const object=mesh();
  assert.throws(()=>api.prepareScriptOperation({type:'script-add',target:{},name:'bad',source:'function {'},context(object)),/validation failed/);
  const ctx=context(object);api.prepareScriptOperation({type:'script-add',target:{},name:'bad-param',source:'/* script-params {"speed":{"type":"number","default":1,"min":0,"max":2}} */',params:{speed:3}},ctx);
  assert.throws(()=>new AtomicBatchCommand(ctx.steps).execute(),/numeric range/);assert.deepEqual(app.scripts,{});
});
test('material slot clone and shared edits preserve sharing, sampler identity, and exact counts across undo',()=>{
  reset();const shared=new THREE.MeshStandardMaterial({color:'#ff0000'}),second=new THREE.MeshStandardMaterial();const texture=new THREE.Texture();shared.map=texture;app.textures[texture.uuid]=texture;
  const first=mesh([shared,second]),other=mesh(shared),ctx=context(first);
  api.prepareMaterialOperation({type:'material',target:{},slot:0,values:{roughness:0.2}},ctx);assert.equal(first.material[0],shared);
  const command=new AtomicBatchCommand(ctx.steps);command.execute();assert.notEqual(first.material[0],shared);assert.equal(first.material[0].map,texture);assert.equal(other.material,shared);assert.equal(first.material[1],second);
  command.undo();assert.equal(first.material[0],shared);assert.equal(app.materialsRefCounter.get(shared),2);command.execute();assert.equal(app.materialsRefCounter.get(shared),1);
  const sharedCtx=context(other);api.prepareMaterialOperation({type:'material',target:{},scope:'shared',values:{metalness:0.8}},sharedCtx);const edit=new AtomicBatchCommand(sharedCtx.steps);edit.execute();assert.equal(shared.metalness,0.8);edit.undo();assert.equal(shared.metalness,0);
});
test('GPU linker failure rolls back the entire batch before invalid shader assignment',()=>{
  reset();const object=mesh(),before=object.material,ctx=context(object);
  api.prepareMaterialOperation({type:'material',target:{},values:{roughness:0.25}},ctx);
  api.prepareMaterialOperation({type:'material-create',target:{},kind:'ShaderMaterial',fragmentShader:'invalid GLSL'},ctx);
  let active;window.viewer.renderer.compile=(_object)=>{active=_object.material};window.viewer.renderer.getContext=()=>({LINK_STATUS:1,VERTEX_SHADER:2,SHADER_TYPE:3,getProgramParameter:()=>active.fragmentShader!=='invalid GLSL',getAttachedShaders:()=>[],getProgramInfoLog:()=>'syntax error'});
  assert.throws(()=>new AtomicBatchCommand(ctx.steps).execute(),/GPU shader compilation/);
  assert.equal(object.material,before);assert.equal(before.roughness,1);assert.deepEqual(Object.keys(app.materials),[before.uuid]);assert.equal(app.materialsRefCounter.get(before),1);
});
test('listener failure restores partial material registration and texture inventory',()=>{
  reset();const object=mesh(),before=object.material,ctx=context(object),texture=new THREE.Texture();app.textures[texture.uuid]=texture;
  api.prepareMaterialOperation({type:'texture',target:{},textureUuid:texture.uuid},ctx);
  let thrown=false;signal=event=>{if(event==='materialAdded'&&!thrown){thrown=true;throw Error('listener');}};
  assert.throws(()=>new AtomicBatchCommand(ctx.steps).execute(),/listener/);assert.equal(object.material,before);assert.equal(app.materialsRefCounter.get(before),1);assert.deepEqual(Object.keys(app.materials),[before.uuid]);
});
test('typed GLSL uniforms and sampler assignments survive THREE JSON round trips',()=>{
  reset();const object=mesh(),ctx=context(object),texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);app.textures[texture.uuid]=texture;
  api.prepareMaterialOperation({type:'material-create',target:{},kind:'ShaderMaterial',uniforms:{tint:{type:'color',value:'#44aaff'},offset:{type:'vec3',value:[1,2,3]},transform:{type:'mat4',value:new THREE.Matrix4().toArray()},map:{type:'texture',value:texture.uuid}}},ctx);
  new AtomicBatchCommand(ctx.steps).execute();const loader=new THREE.MaterialLoader();loader.setTextures({[texture.uuid]:texture});const restored=loader.parse(object.material.toJSON());
  assert.ok(restored.uniforms.tint.value.isColor);assert.deepEqual(restored.uniforms.offset.value.toArray(),[1,2,3]);assert.ok(restored.uniforms.transform.value.isMatrix4);assert.equal(restored.uniforms.map.value,texture);
});

test('program info confirmation and define-only edits preserve exact color uniforms', () => {
  reset();
  const color = new THREE.Color().setRGB(.213452, .108765, .725434);
  const material = new THREE.ShaderMaterial({uniforms:{tint:{value:color}, gain:{value:1}}});
  const object = mesh(material), history = [];
  app.execute = command => { command.execute(); history.push(command); };
  const form = JSON.parse(JSON.stringify({defines:material.defines, uniforms:material.uniforms}));
  assert.equal(form.uniforms.tint.value, color.getHex());
  api.applyGuiMaterialEdit(object, 0, form);
  assert.equal(history.length, 0);
  form.defines = {LIGHTING:1};
  api.applyGuiMaterialEdit(object, 0, form);
  assert.ok(material.uniforms.tint.value.equals(color));
  form.uniforms.gain.value = 2;
  api.applyGuiMaterialEdit(object, 0, form);
  assert.ok(material.uniforms.tint.value.equals(color));
  form.uniforms.tint.value = 0x21aaff;
  api.applyGuiMaterialEdit(object, 0, form);
  assert.equal(material.uniforms.tint.value.getHex(), 0x21aaff);
  history.at(-1).undo();
  assert.ok(material.uniforms.tint.value.equals(color));
});
test('environment assignment is reversible and does not intercept legacy mode operations',()=>{
  reset();const texture=new THREE.Texture();app.textures[texture.uuid]=texture;const before=new THREE.Color('#112233');app.scene.background=before;
  assert.equal(api.prepareMaterialOperation({type:'environment',mode:'modelviewer'},context(null)),false);
  const ctx=context(null);api.prepareMaterialOperation({type:'environment',slot:'both',textureUuid:texture.uuid,intensity:0.7,rotation:[0,0.5,0]},ctx);const command=new AtomicBatchCommand(ctx.steps);command.execute();assert.equal(app.scene.environment,texture);assert.equal(app.scene.background,texture);assert.equal(app.scene.backgroundRotation.y,0.5);command.undo();assert.equal(app.scene.background,before);assert.equal(app.scene.environment,null);
});
test('run-before snapshot persists buffers before transfer and packing restores project metadata',async()=>{
  reset();project.sceneInfo={id:'scene-a',zip:'server.zip',hasDrawing:0};
  const snapshot=await api.packAuthoringSnapshot('run-a');assert.deepEqual(project.sceneInfo,{id:'scene-a',zip:'server.zip',hasDrawing:0});
  await api.persistAgentRunSnapshot('scene-a',snapshot);structuredClone(snapshot,{transfer:snapshot.packages.map(file=>file.buffer)});assert.equal(snapshot.packages[0].buffer.byteLength,0);
  const saved=await api.getAgentRunRecovery('scene-a');assert.equal(new TextDecoder().decode(saved.snapshot.packages[0].buffer),'snapshot');assert.equal(saved.state,'active');
  await api.dismissAgentRunRecovery('scene-a','wrong-run');assert.equal((await api.getAgentRunRecovery('scene-a')).state,'active');await api.dismissAgentRunRecovery('scene-a','run-a');assert.equal((await api.getAgentRunRecovery('scene-a')).state,'stopped');
});
test('play controller refuses overlapping snapshots and reports truthful execution isolation',async()=>{
  reset();let state='idle',starts=0;const unbind=api.registerAgentPlayController({async start(){starts++;state='loading';},stop(){state='idle'},status(){return{state,runId:'run-a'};},runtimeViewer(){return undefined;}});
  const started=await api.agentPlay('start');assert.equal(started.state,'loading');assert.match(started.executionIsolation,/cannot be interrupted/);await assert.rejects(api.agentPlay('start'),/already active/);await api.agentPlay('restart');assert.equal(starts,2);await api.agentPlay('stop');assert.equal((await api.agentPlay('status')).state,'idle');unbind();await assert.rejects(api.agentPlay('status'),/not ready/);
});
test('capture bounds preserve aspect ratio without resizing the live viewport',async()=>{
  reset();const canvas={width:1600,height:1000};window.viewer.renderer.domElement=canvas;
  let drawn;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage:(...args)=>{drawn=args;}}),toDataURL:()=> 'data:image/png;base64,cGljdHVyZQ=='})};
  const capture=await api.agentCapture({width:640,height:480});assert.equal(capture.width,640);assert.equal(capture.height,400);assert.deepEqual(drawn,[canvas,0,0,640,400]);assert.deepEqual(canvas,{width:1600,height:1000});
  await assert.rejects(api.agentCapture({width:4097}),/dimensions/);await assert.rejects(api.agentCapture({target:'runtime'}),/not running/);
});

test('live tree and samples observe the preview, resolve current UUIDs and detach every captured value', async t => {
  reset();
  const scene = new THREE.Scene(), parent = new THREE.Group();
  parent.position.set(4, 0, 0);
  const material = new THREE.MeshPhysicalMaterial({ transmission: 0.5 });
  material.map = new THREE.Texture();
  const child = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  child.name = 'Created during Play';
  child.position.set(2, 0, 0);
  const mixer = new THREE.AnimationMixer(child);
  const clip = new THREE.AnimationClip('moving', 2, []);
  const action = mixer.clipAction(clip).play();
  child.animations.push(action);
  parent.add(child); scene.add(parent);
  t.after(api.registerAgentPlayController({ status: () => ({ state: 'running', runId: 'first' }), runtimeViewer: () => ({ scene }) }));
  assert.equal(app.scene.getObjectByName(child.name), undefined);
  assert.equal(api.agentRuntimeQuery({ parentUuid: parent.uuid }).items[0].uuid, child.uuid);

  let index = 0;
  const data = await api.agentRuntimeSample({ runId: 'first', uuids: [child.uuid], count: 3, intervalMs: 50,
    materialProperties: ['transmission'] }, () => {
    if (++index === 2) { material.map.offset.x = 0.25; mixer.update(0.2); }
    if (index === 3) parent.remove(child);
  });
  const [first, second, last] = data.samples.map(sample => sample.objects[0]);
  assert.deepEqual(first.worldPosition, [6, 0, 0]);
  assert.deepEqual(first.materials[0].parameters, { transmission: 0.5 });
  assert.equal(first.materials[0].maps[0].offset[0], 0);
  assert.equal(second.materials[0].maps[0].offset[0], 0.25);
  assert.equal(second.clips[0].time, 0.2);
  assert.deepEqual(last, { uuid: child.uuid, missing: true });
});

test('timed samples never combine two runs and idle inspection cannot start Play', async t => {
  reset();
  let state = 'idle', runId = 'first', reads = 0;
  t.after(api.registerAgentPlayController({ status: () => ({ state, runId }), runtimeViewer: () => ({ scene: app.scene }) }));
  assert.throws(() => api.agentRuntimeQuery({}), { code: 'RUNTIME_NOT_RUNNING' });
  state = 'running';
  await assert.rejects(api.agentRuntimeSample({ uuids: ['tracked'], count: 2, intervalMs: 50 }, () => {
    if (++reads === 2) runId = 'second';
  }), { code: 'STALE_RUN' });
});
