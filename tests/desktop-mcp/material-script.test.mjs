import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, Texture } from '../../packages/editor/node_modules/three/build/three.module.js';
import { materialStep, scriptStep } from '../../packages/editor/src/utils/integration/desktopEditSteps.ts';
import { AtomicBatchCommand } from '../../packages/sdk/lib/core/commands/AtomicBatchCommand.ts';

test('shared and object-only material edits preserve slots, texture refs and undo identities',()=>{
 const shared=new MeshStandardMaterial({color:0x123456});shared.map=new Texture();
 const a=new Mesh(new BoxGeometry(),[shared,shared]),b=new Mesh(new BoxGeometry(),shared);
 const edit=materialStep(a,{slot:1,scope:'object',values:{color:'#ff0000',roughness:0.2}},v=>a.material[1]=v,()=>{});
 edit.execute();const isolated=a.material[1];assert.notEqual(isolated.uuid,shared.uuid);assert.equal(isolated.map,shared.map);
 assert.equal(a.material[0],shared);assert.equal(b.material,shared);assert.equal(shared.color.getHexString(),'123456');
 edit.undo();assert.equal(a.material[1],shared);edit.execute();assert.equal(a.material[1],isolated);
 const group=materialStep(b,{slot:0,scope:'shared',values:{color:'#00ff00'}},v=>b.material=v,()=>{});
 group.execute();assert.equal(a.material[0].color.getHexString(),'00ff00');group.undo();assert.equal(shared.color.getHexString(),'123456');
 assert.throws(()=>materialStep(b,{slot:2,scope:'shared',values:{}},()=>{},()=>{}),/slot/);
});

test('script add/update/remove never evaluate source and restore absent params, arrays and object identity',()=>{
 const mesh=new Mesh(), scripts={}, events=[];const notify=(...v)=>events.push(v);
 const source='globalThis.__mustNeverRun = true;';
 const batch=new AtomicBatchCommand([
  ()=>scriptStep(scripts,mesh,{type:'script-add',script:{name:'test',source}},notify),
  ()=>scriptStep(scripts,mesh,{type:'script-update',index:0,values:{params:{speed:2},source:source+' // edited'}},notify),
 ]);
 batch.execute();const array=scripts[mesh.uuid],script=array[0];assert.equal(globalThis.__mustNeverRun,undefined);
 assert.deepEqual(script.params,{speed:2});batch.undo();assert.equal(Object.hasOwn(scripts,mesh.uuid),false);
 batch.execute();assert.equal(scripts[mesh.uuid],array);assert.equal(array[0],script);
 const remove=scriptStep(scripts,mesh,{type:'script-remove',index:0},notify);remove.execute();assert.equal(array.length,0);remove.undo();assert.equal(array[0],script);
 const set=scriptStep(scripts,mesh,{type:'script-update',index:0,values:{name:'changed'}},()=>{throw Error('notify');});
 const atomic=new AtomicBatchCommand([()=>set]);assert.throws(()=>atomic.execute());assert.equal(script.name,'test');
});
