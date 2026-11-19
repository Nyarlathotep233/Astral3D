import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import * as THREE from '../../packages/editor/node_modules/three/build/three.module.js';
import { AtomicBatchCommand, BatchRecoveryError } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

const app={scene:new THREE.Scene(),scripts:{},materials:{},textures:{},geometries:{},selected:null,cameras:{},animationManager:{mixerMap:new Map(),actionMap:new Map()},
  addObject(object,parent=this.scene,index=parent.children.length){parent.add(object);parent.children.splice(parent.children.indexOf(object),1);parent.children.splice(index,0,object);this.clipAction(object);},
  removeObject(object){object.removeFromParent();},addGeometry(geometry){this.geometries[geometry.uuid]=geometry;},
  clipAction(object){if(!object.animations.length)return;let mixer=this.animationManager.mixerMap.get(object.uuid);if(!mixer){mixer=new THREE.AnimationMixer(object);this.animationManager.mixerMap.set(object.uuid,mixer);}object.animations=object.animations.map(item=>{const action=item.getClip?item:mixer.clipAction(item);this.animationManager.actionMap.set(action.getClip().uuid,action);return action;});},
  project:{info:{weather:{fog:{enabled:false,density:0.1}},effect:{enabled:false},renderer:{toneMappingExposure:1},csm:{enabled:false},drawing:{},xr:false},getKey(key){return this.info[key];},setKey(key,value){this.info[key]=value;}}
};
const engine={THREE,App:app,Hooks:{useDispatchSignal(){}},ObjectRegistrationError:class extends Error{},BatchRecoveryError,Group:()=>new THREE.Group(),Box:()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),Utils:{deepAssign:Object.assign}};
globalThis.__objectsTest={THREE,engine};globalThis.window={viewer:{render(){}}};
const entry=path.resolve(import.meta.dirname,'../../packages/editor/src/utils/integration');
const output=await build({stdin:{contents:`export * from ${JSON.stringify(entry+'/agentObjects.ts')};export * from ${JSON.stringify(entry+'/agentAnimation.ts')};export * from ${JSON.stringify(entry+'/agentSceneSettings.ts')};`,resolveDir:entry,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-modules',setup(b){
  b.onResolve({filter:/^three$|^@astral3d\/engine$|^@\/hooks\/useSceneVisibility$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='three'?Object.keys(THREE).map(k=>`export const ${k}=globalThis.__objectsTest.THREE.${k};`).join('\n'):a.path==='@astral3d/engine'?Object.keys(engine).map(k=>`export const ${k}=globalThis.__objectsTest.engine.${k};`).join('\n'):'export const readGridVisible=()=>true,readHelpersVisible=()=>true,setGridVisible=()=>{},setHelpersVisible=()=>{};'}));
}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
function prepare(operations){const refs=new Map();const ctx={steps:[],cleanup:[],register(ref,obj){assert.ok(!refs.has(ref));refs.set(ref,obj);},resolve(target){const object=target.ref?refs.get(target.ref):app.scene.getObjectByProperty('uuid',target.uuid);if(!object)throw Error('Unknown target');return object;}};for(const op of operations)assert.ok(api.prepareObjectOperation(op,ctx)||api.prepareAnimationOperation(op,ctx)||api.prepareSceneSettingsOperation(op,ctx));return {batch:new AtomicBatchCommand(ctx.steps),refs,ctx};}
function reset(){app.scene.clear();app.scripts={};app.geometries={};app.animationManager.mixerMap.clear();app.animationManager.actionMap.clear();}

test('detached creation supports arbitrary buffer geometry and commits one reversible hierarchy',()=>{
  reset();const result=prepare([{type:'create',kind:'Group',ref:'assembly'},{type:'create',kind:'mesh',ref:'custom',parent:{ref:'assembly'},geometry:{type:'buffer',attributes:{position:{itemSize:3,array:[0,0,0,1,0,0,0,1,0]}},index:[0,1,2],computeNormals:true},position:[2,3,4]}]);
  assert.equal(app.scene.children.length,0);result.batch.execute();assert.equal(result.refs.get('custom').parent,result.refs.get('assembly'));assert.equal(result.refs.get('custom').geometry.getAttribute('normal').count,3);
  result.batch.undo();assert.equal(app.scene.children.length,0);result.batch.execute();assert.equal(app.scene.children.length,1);
});
test('parametric complex geometry has real vertices and rejects invalid buffers',()=>{
  for(const spec of [{type:'extrude',shapes:[{points:[[0,0],[3,0],[3,3],[0,3]],holes:[[[1,1],[1,2],[2,2],[2,1]]]}],options:{depth:2,bevelEnabled:false}},{type:'lathe',points:[[0,0],[1,0],[1,3],[0,3]]},{type:'tube',path:{points:[[0,0,0],[1,2,0],[3,2,1]]}}]){const geometry=api.createAgentGeometry(spec);assert.ok(geometry.getAttribute('position').count>3);assert.ok(geometry.boundingSphere.radius>0);geometry.dispose();}
  assert.throws(()=>api.createAgentGeometry({type:'buffer',attributes:{position:{itemSize:3,array:[0,0,0]}},index:[3]}),/index/);
});
test('world transforms and reparent preserve the exact world matrix under a rotated nonuniform parent',()=>{
  reset();const a=new THREE.Group(),b=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry());a.position.set(3,4,5);b.scale.set(2,3,1);b.rotation.set(0.2,0.5,0.4);app.scene.add(a,b);a.add(mesh);mesh.rotation.y=0.7;app.scene.updateMatrixWorld(true);const before=mesh.matrixWorld.clone();
  const {batch}=prepare([{type:'reparent',target:{uuid:mesh.uuid},parent:{uuid:b.uuid},preserveWorld:true}]);batch.execute();app.scene.updateMatrixWorld(true);before.elements.forEach((v,i)=>assert.ok(Math.abs(v-mesh.matrixWorld.elements[i])<1e-8));batch.undo();assert.equal(mesh.parent,a);
  const world=prepare([{type:'transform',target:{uuid:mesh.uuid},space:'world',position:[10,20,30]}]);world.batch.execute();assert.deepEqual(mesh.getWorldPosition(new THREE.Vector3()).toArray(),[10,20,30]);world.batch.undo();assert.deepEqual(mesh.position.toArray(),[0,0,0]);
});
test('clone retains subtree scripts without aliasing and remove restores them on undo',()=>{
  reset();const source=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry());source.add(child);app.scene.add(source);app.scripts[child.uuid]=[{name:'logic',source:'function update() {}',params:{speed:3}}];
  const copied=prepare([{type:'clone',target:{uuid:source.uuid},ref:'copy'}]);copied.batch.execute();const clone=copied.refs.get('copy').children[0];assert.deepEqual(app.scripts[clone.uuid],app.scripts[child.uuid]);assert.notEqual(app.scripts[clone.uuid],app.scripts[child.uuid]);
  copied.batch.undo();assert.equal(app.scripts[clone.uuid],undefined);assert.ok(app.scripts[child.uuid]);copied.batch.execute();const removed=prepare([{type:'remove',target:{uuid:copied.refs.get('copy').uuid}}]);removed.batch.execute();assert.equal(app.scripts[clone.uuid],undefined);removed.batch.undo();assert.equal(app.scripts[clone.uuid][0].params.speed,3);
});
test('failure after sequential edits restores initial transform, object membership and scripts',()=>{
  reset();const object=new THREE.Mesh(new THREE.BoxGeometry());app.scene.add(object);const prepared=prepare([{type:'transform',target:{uuid:object.uuid},position:[1,2,3]},{type:'transform',target:{uuid:object.uuid},position:[4,5,6]},{type:'create',kind:'Group',ref:'temporary'},{type:'attributes',target:{uuid:object.uuid},values:{invented:true}}]);
  assert.throws(()=>prepared.batch.execute(),/Unsupported/);assert.deepEqual(object.position.toArray(),[0,0,0]);assert.deepEqual(app.scene.children,[object]);
});
test('instances can be edited and undone without losing colors or transforms',()=>{
  reset();const created=prepare([{type:'create',kind:'instanced',ref:'instances',instances:[{position:[1,0,0]},{position:[2,0,0]}]}]);created.batch.execute();const mesh=created.refs.get('instances');const edit=prepare([{type:'instances',target:{uuid:mesh.uuid},instances:[{index:1,position:[8,0,0],color:'#ff0000'}]}]);edit.batch.execute();const matrix=new THREE.Matrix4();mesh.getMatrixAt(1,matrix);assert.equal(matrix.elements[12],8);assert.ok(mesh.instanceColor);edit.batch.undo();mesh.getMatrixAt(1,matrix);assert.equal(matrix.elements[12],2);assert.equal(mesh.instanceColor,null);
});
test('animation tracks, sampling and undo restore both serialized clips and pose',()=>{
  reset();const object=new THREE.Group();app.scene.add(object);const created=prepare([{type:'animation',action:'create',target:{uuid:object.uuid},clipId:'move-clip',name:'Move',tracks:[{name:'.position',type:'vector',times:[0,1],values:[0,0,0,2,0,0]}]}]);created.batch.execute();assert.equal(api.describeAnimations(object)[0].duration,1);
  const seek=prepare([{type:'animation',action:'seek',target:{uuid:object.uuid},clipId:'move-clip',time:0.5}]);seek.batch.execute();assert.equal(object.position.x,1);seek.batch.undo();assert.equal(object.position.x,0);
  const edit=prepare([{type:'animation',action:'keyframes',target:{uuid:object.uuid},clipId:'move-clip',trackName:'.position',times:[0,2],values:[0,0,0,4,0,0]}]);edit.batch.execute();assert.equal(api.describeAnimations(object)[0].duration,2);edit.batch.undo();assert.equal(api.describeAnimations(object)[0].duration,1);created.batch.undo();assert.equal(object.animations.length,0);
});
test('settings patches preserve sibling values and rollback invalid batches',()=>{
  reset();const before=structuredClone(app.project.info.weather);const result=prepare([{type:'scene-config',section:'weather',values:{fog:{enabled:true}}},{type:'scene-config',section:'weather',values:{unknown:1}}]);assert.throws(()=>result.batch.execute(),/Unknown scene setting/);assert.deepEqual(app.project.info.weather,before);
  assert.throws(()=>api.copyAgentValue(JSON.parse('{"__proto__":{"polluted":1}}')),/Reserved/);
});

test('centering a parametric geometry persists the modified vertices instead of recreating old parameters',()=>{
  reset();const object=new THREE.Mesh(api.createAgentGeometry({type:'lathe',points:[[0,0],[1,0],[1,3],[0,3]]}));app.scene.add(object);const before=object.geometry;
  const result=prepare([{type:'geometry',target:{uuid:object.uuid},action:'center'}]);result.batch.execute();const json=object.geometry.toJSON();assert.equal(json.type,'BufferGeometry');const restored=new THREE.BufferGeometryLoader().parse(json);restored.computeBoundingBox();assert.deepEqual(restored.boundingBox.min.toArray(),object.geometry.boundingBox.min.toArray());assert.deepEqual(restored.boundingBox.max.toArray(),object.geometry.boundingBox.max.toArray());result.batch.undo();assert.equal(object.geometry,before);
});

test('remove unregisters animated subtrees and undo restores the exact running mixer and action',()=>{
  reset();const group=new THREE.Group(),child=new THREE.Group();group.add(child);app.scene.add(group);child.animations.push(new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack('.position',[0,1],[0,0,0,1,0,0])]));app.clipAction(child);const mixer=app.animationManager.mixerMap.get(child.uuid),action=child.animations[0];action.play();action.time=0.4;
  const result=prepare([{type:'remove',target:{uuid:group.uuid}}]);result.batch.execute();assert.equal(app.animationManager.mixerMap.has(child.uuid),false);assert.equal(app.animationManager.actionMap.has(action.getClip().uuid),false);
  result.batch.undo();assert.equal(app.animationManager.mixerMap.get(child.uuid),mixer);assert.equal(app.animationManager.actionMap.get(action.getClip().uuid),action);assert.equal(action.time,0.4);assert.ok(action.isRunning());
});
