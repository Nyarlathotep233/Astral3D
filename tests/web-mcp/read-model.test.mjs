import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {queryObjects} from '../../packages/editor/src/utils/integration/agentReadModel.ts';
const require=createRequire(new URL('../../packages/editor/package.json',import.meta.url));
const {Scene,Group,Mesh}=require('three');
test('scene queries exclude transient viewer subtrees and retain correct filtered paging',()=>{
 const scene=new Scene(),helper=new Group(),nestedHelper=new Mesh();helper.ignore=true;helper.add(nestedHelper);scene.add(helper);
 const authored=new Group();authored.name='garden';for(let i=0;i<3;i++){const mesh=new Mesh();mesh.name=`flower ${i}`;authored.add(mesh);}scene.add(authored);
 const first=queryObjects(scene,{limit:2});assert.equal(first.total,4);assert.equal(first.nextOffset,2);assert.deepEqual(first.items.map(v=>v.name),['garden','flower 0']);
 const second=queryObjects(scene,{offset:2,limit:2});assert.deepEqual(second.items.map(v=>v.name),['flower 1','flower 2']);assert.equal(second.nextOffset,null);
 const filtered=queryObjects(scene,{type:'Mesh',name:'flower',limit:2});assert.equal(filtered.total,3);assert.equal(filtered.items.length,2);
});
