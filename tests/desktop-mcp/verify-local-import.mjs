// Uses the existing bundled model and authorized blue-box scene; no directory grant or save.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
let config;
try { config=JSON.parse(input).mcpServers.h3d; if(!config?.url||!config?.headers)throw Error(); }
catch { throw new Error('Copy the native MCP configuration first; clipboard content is not printed'); }
const sceneId='db24d798905d186dfb61505f9396d5b8';
const filePath=process.argv[3] || 'C:/project/3D/Astral3D/Astral3D/packages/editor/public/static/model/furniture/WoodenStool_astral3d.optimize.glb';
const client=new Client({name:'h3d-local-import-acceptance',version:'1.0.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
 const session=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready');assert.ok(session);
 const binding={sessionId:session.sessionId,sceneId};
 const raw=(name,args={})=>client.callTool({name,arguments:{...binding,...args}});
 const call=async(name,args={})=>{const r=await raw(name,args);assert.ok(!r.isError,JSON.stringify(r.content));return r.structuredContent;};
 const status=()=>call('h3d_scene_status');
 const initial=await call('h3d_scene_query',{limit:100}), before=await status();
 const jobId=randomUUID();
 await call('h3d_model_prepare',{jobId,filePath});
 let job;
 for(let i=0;i<300;i++) { job=await call('h3d_model_job',{jobId,action:'status'});if(job.state!=='preparing')break;await delay(200); }
 assert.equal(job.state,'ready',JSON.stringify(job));assert.ok(job.meshes>0);
 assert.deepEqual(await call('h3d_scene_query',{limit:100}),initial);
 assert.equal((await status()).sceneRevision,before.sceneRevision);
 assert.equal((await call('h3d_model_prepare',{jobId,filePath})).state,'ready');
 assert.equal((await raw('h3d_model_prepare',{jobId,filePath:'other/model.glb'})).isError,true);
 for(const bad of ['../package.json','C:/Windows/win.ini','C:/h3d-deliberately-missing-model.glb'])assert.equal((await raw('h3d_model_prepare',{jobId:randomUUID(),filePath:bad})).isError,true);
 const cancelledId=randomUUID();await call('h3d_model_prepare',{jobId:cancelledId,filePath});
 assert.equal((await call('h3d_model_job',{jobId:cancelledId,action:'cancel'})).state,'cancelled');
 const batchArgs={operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,label:'MCP local model acceptance',operations:[{type:'insert-model',jobId,ref:'model',name:'MCP本地木凳-不保存',position:[2,0,0],scale:[2,2,2]}]};
 const inserted=await call('h3d_scene_batch',batchArgs);
 assert.equal((await call('h3d_scene_query',{limit:1})).total,initial.total+job.objects);
 assert.equal((await call('h3d_model_job',{jobId,action:'status'})).state,'consumed');
 assert.equal((await raw('h3d_model_job',{jobId,action:'cancel'})).isError,true);
 assert.deepEqual(await call('h3d_scene_batch',batchArgs),inserted);
 const duplicate=await raw('h3d_scene_batch',{...batchArgs,operationId:randomUUID(),expectedRevision:(await status()).sceneRevision});assert.equal(duplicate.isError,true);
 const detail=(await call('h3d_object_details',{uuids:[inserted.refs.model]})).objects[0];
 const current=await call('h3d_scene_query',{limit:100});
 const mesh=current.items.find(o=>o.type==='Mesh'&&!initial.items.some(old=>old.uuid===o.uuid));assert.ok(mesh);
 const meshDetail=async()=>(await call('h3d_object_details',{uuids:[mesh.uuid]})).objects[0];
 const originalMesh=await meshDetail();
 const edited=await call('h3d_scene_batch',{operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,label:'Edit imported material',operations:[{type:'material',target:{uuid:mesh.uuid},slot:0,scope:'object',values:{roughness:0.15,color:'#22aa88'}}]});
 assert.equal((await meshDetail()).materials[0].parameters.roughness,0.15);
 assert.deepEqual((await meshDetail()).materials[0].textures,originalMesh.materials[0].textures);
 await call('h3d_history',{operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,action:'undo',batchId:edited.batchId});
 assert.deepEqual(await meshDetail(),originalMesh);
 const screenshot=await raw('h3d_viewport_capture');assert.ok(!screenshot.isError);
 const image=screenshot.content.find(c=>c.type==='image');assert.ok(image);
 await writeFile(process.argv[2].replace(/\.json$/,'.png'),Buffer.from(image.data,'base64'));
 const history=async(action)=>call('h3d_history',{operationId:randomUUID(),expectedRevision:(await status()).sceneRevision,action,batchId:inserted.batchId});
 await history('undo');assert.deepEqual(await call('h3d_scene_query',{limit:100}),initial);
 await history('redo');assert.deepEqual((await call('h3d_object_details',{uuids:[inserted.refs.model]})).objects[0],detail);
 await history('undo');assert.deepEqual(await call('h3d_scene_query',{limit:100}),initial);
 const result={sceneId,filePath,objects:job.objects,meshes:job.meshes,detachedPreparation:true,cancellation:true,retryDeduplicated:true,pathErrors:true,consumedOnlyOnce:true,materialEditUndo:true,textureReferencesPreserved:true,undoRedoIdentity:true,restored:true,saved:false};
 await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(result);
} finally { await client.close(); }
