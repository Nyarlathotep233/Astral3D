// Real formal MCP integration test. Reuses the shipped tower-crane package and
// authorized blue-box scene. No save/upload/Play; undo all owned test batches.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

let input='';for await(const chunk of process.stdin)input+=chunk;
let config;
try { config=JSON.parse(input).mcpServers.h3d;if(!config?.url||!config.headers)throw Error(); }
catch { throw Error('Copy the native MCP configuration first; clipboard content is not printed'); }
assert.ok(process.argv[2]?.endsWith('.json'),'Provide evidence JSON path');
const client=new Client({name:'h3d-prefab-acceptance',version:'1.0.0'});
const sceneId='db24d798905d186dfb61505f9396d5b8', evidence=[];
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
  const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
  const session=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready');assert.ok(session);
  const binding={sessionId:session.sessionId,sceneId};
  const raw=(name,args={})=>client.callTool({name,arguments:{...binding,...args}});
  const call=async(name,args={})=>{const r=await raw(name,args);assert.ok(!r.isError,JSON.stringify(r.content));return r.structuredContent;};
  const status=()=>call('h3d_scene_status');
  const query=async()=>{const items=[];let offset=0;do{const r=await call('h3d_scene_query',{offset,limit:100});items.push(...r.items);offset=r.nextOffset;}while(offset!==null);return items;};
  const details=async items=>{const result=[];for(let i=0;i<items.length;i+=20)result.push(...(await call('h3d_object_details',{uuids:items.slice(i,i+20).map(o=>o.uuid),includeScripts:true,includeUserData:true})).objects);return result;};
  const waitJob=async jobId=>{for(let i=0;i<600;i++){const job=await call('h3d_model_job',{jobId,action:'status'});if(job.state!=='preparing')return job;await delay(200);}throw Error('Prefab preparation timed out');};
  const batch=async(label,operations)=>call('h3d_scene_batch',{operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,label,operations});
  const history=async(action,batchId)=>call('h3d_history',{operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,action,batchId});
  const before=await query(), initialDetails=await details(before);
  assert.equal((await status()).renderingAPI,'webgpu');
  const unknownId=randomUUID();await call('h3d_import_prepare',{jobId:unknownId,source:{type:'builtin-prefab',key:'h3d-deliberately-missing'}});
  assert.equal((await waitJob(unknownId)).state,'failed');assert.deepEqual(await query(),before);
  const sources=[
    {type:'local-prefab',filePath:path.resolve(import.meta.dirname,'../../packages/editor/public/static/prefabs/tower-crane.h3dprefab.zip')},
    {type:'builtin-prefab',key:'tower-crane'},
  ];
  for(const [index,source] of sources.entries()) {
    const jobId=randomUUID(), revision=(await status()).sceneRevision, owned=[];
    try {
      await call('h3d_import_prepare',{jobId,source});
      const job=await waitJob(jobId);assert.equal(job.state,'ready',JSON.stringify(job));assert.ok(job.objects>1&&job.scripts>0);
      assert.deepEqual(await query(),before);assert.equal((await status()).sceneRevision,revision);
      assert.equal((await call('h3d_import_prepare',{jobId,source})).state,'ready');
      const cancelled=randomUUID();await call('h3d_import_prepare',{jobId:cancelled,source});
      assert.equal((await call('h3d_model_job',{jobId:cancelled,action:'cancel'})).state,'cancelled');
      const inserted=await batch('Prefab import acceptance',[{type:'insert-model',jobId,ref:'prefab',name:`MCP预制体验收-${index}-不保存`,position:[2,0,0],scale:[0.02,0.02,0.02]}]);owned.push(inserted.batchId);
      const all=await query(), imported=all.filter(o=>!before.some(b=>b.uuid===o.uuid));
      assert.equal(imported.length,job.objects);
      const original=await details(imported);assert.equal(original.reduce((n,o)=>n+o.scriptCount,0),job.scripts);
      const mesh=original.find(o=>o.materials.some(m=>m.parameters.roughness!==undefined));assert.ok(mesh);
      const edited=await batch('Edit prefab material',[{type:'material',target:{uuid:mesh.uuid},slot:0,scope:'object',values:{roughness:0.15,color:'#22aa88'}}]);owned.push(edited.batchId);
      const modified=(await details([mesh]))[0];assert.equal(modified.materials[0].parameters.roughness,0.15);
      assert.deepEqual(modified.materials[0].textures,mesh.materials[0].textures);
      await history('undo',edited.batchId);owned.pop();assert.deepEqual(await details(imported),original);
      const screenshot=await raw('h3d_viewport_capture');assert.ok(!screenshot.isError);
      const image=screenshot.content.find(c=>c.type==='image');assert.ok(image);
      await writeFile(process.argv[2].replace(/\.json$/,`-${index}.png`),Buffer.from(image.data,'base64'));
      await history('undo',inserted.batchId);owned.pop();assert.deepEqual(await query(),before);assert.deepEqual(await details(before),initialDetails);
      await history('redo',inserted.batchId);owned.push(inserted.batchId);assert.deepEqual(await details(imported),original);
      await history('undo',inserted.batchId);owned.pop();assert.deepEqual(await query(),before);assert.deepEqual(await details(before),initialDetails);
      evidence.push({source,objects:job.objects,scripts:job.scripts,detached:true,materialEditUndo:true,undoRedoIdentity:true,cancelled:true,restored:true,saved:false});
    } finally {
      // Do not unwind a human's intervening edit: formal history enforces tip identity.
      for(const id of owned.reverse())await history('undo',id);
      const job=await call('h3d_model_job',{jobId,action:'status'});
      if(job.state==='ready'||job.state==='preparing')await call('h3d_model_job',{jobId,action:'cancel'});
    }
  }
  await writeFile(process.argv[2],JSON.stringify({sceneId,evidence},null,2));console.log({sceneId,passedSources:evidence.length,saved:false});
} finally {await client.close();}
