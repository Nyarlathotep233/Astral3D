// In-memory edits only in the authorized blue-box test scene. Always undo on success.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input).mcpServers.h3d, sceneId='db24d798905d186dfb61505f9396d5b8';
const client=new Client({name:'h3d-material-script-acceptance',version:'1.0.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
 const s=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready');assert.ok(s);
 const binding={sessionId:s.sessionId,sceneId};
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:{...binding,...args}});assert.ok(!r.isError,JSON.stringify(r.content));return r.structuredContent;};
 const status=()=>call('h3d_scene_status');
 const batch=async(label,operations)=>call('h3d_scene_batch',{expectedRevision:(await status()).sceneRevision,operationId:randomUUID(),label,operations});
 const history=async(action,batchId)=>call('h3d_history',{expectedRevision:(await status()).sceneRevision,operationId:randomUUID(),action,batchId});
 const before=await call('h3d_scene_query',{limit:100});
 const source='globalThis.__mcpScriptProbe = (globalThis.__mcpScriptProbe || 0) + 1;';
 const created=await batch('Material/script acceptance',[{type:'create',ref:'box',kind:'box',name:'MCP材质脚本验收-不保存',position:[2,0,0]},{type:'script-add',target:{ref:'box'},script:{name:'probe',source}}]);
 const uuid=created.refs.box;
 const details=async()=>(await call('h3d_object_details',{uuids:[uuid],includeScripts:true})).objects[0];
 const original=await details();assert.equal(original.scriptCount,1);assert.equal(Object.hasOwn(original.scripts[0],'params'),false);
 const changed=await batch('Change material and script',[
  {type:'material',target:{uuid},slot:0,scope:'object',values:{color:'#ff2244',roughness:0.2,metalness:0.3}},
  {type:'script-update',target:{uuid},index:0,values:{name:'probe-edited',source:source+' // edited',params:{speed:2,axis:'Y'}}},
 ]);
 const edited=await details();assert.notEqual(edited.materials[0].uuid,original.materials[0].uuid);assert.equal(edited.materials[0].parameters.color.hexSRGB,'ff2244');assert.deepEqual(edited.scripts[0].params,{speed:2,axis:'Y'});
 const capture=await client.callTool({name:'h3d_viewport_capture',arguments:binding});assert.ok(!capture.isError);const image=capture.content.find(c=>c.type==='image');assert.ok(image);await writeFile(process.argv[2].replace(/\.json$/,'.png'),Buffer.from(image.data,'base64'));
 const removed=await batch('Remove scripted object',[{type:'remove',target:{uuid}}]);
 assert.equal((await call('h3d_scene_query',{limit:1})).total,before.total);
 await history('undo',removed.batchId);assert.deepEqual(await details(),edited);
 await history('undo',changed.batchId);assert.deepEqual(await details(),original);
 await history('redo',changed.batchId);assert.deepEqual(await details(),edited);
 const removeScript=await batch('Remove script',[{type:'script-remove',target:{uuid},index:0}]);assert.equal((await details()).scriptCount,0);
 await history('undo',removeScript.batchId);assert.deepEqual((await details()).scripts,edited.scripts);
 const shared=await batch('Shared material patch',[{type:'material',target:{uuid},slot:0,scope:'shared',values:{color:'#22ff44'}}]);assert.equal((await details()).materials[0].uuid,edited.materials[0].uuid);
 await history('undo',shared.batchId);assert.deepEqual(await details(),edited);
 await history('undo',changed.batchId);await history('undo',created.batchId);
 assert.deepEqual(await call('h3d_scene_query',{limit:100}),before);
 const result={sceneId,isolatedMaterial:true,sharedMaterial:true,materialUuidUndo:true,scriptAddUpdateRemove:true,absentParamsRestored:true,scriptedObjectRemoveUndo:true,undoRedo:true,originalObjectsRestored:true,saved:false};
 await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(result);
}finally{await client.close();}
