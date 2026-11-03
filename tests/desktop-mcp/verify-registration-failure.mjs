// Independent fault regression, NOT an autonomous Agent acceptance task.
// Arm a one-shot App.addMaterial fault through browser-harness first; no save/upload.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
let config;
try { config=JSON.parse(input).mcpServers.h3d; if(!config?.headers)throw Error(); }
catch { throw Error('Copy the native MCP configuration first; clipboard is not printed'); }
const sceneId='db24d798905d186dfb61505f9396d5b8';
const client=new Client({name:'h3d-registration-regression',version:'1.0.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
 const session=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready'); assert.ok(session);
 const binding={sessionId:session.sessionId,sceneId};
 const raw=(name,args={})=>client.callTool({name,arguments:{...binding,...args}});
 const call=async(name,args={})=>{const result=await raw(name,args);assert.ok(!result.isError,JSON.stringify(result.content));return result.structuredContent;};
 const before=await call('h3d_scene_query',{limit:100}), state=await call('h3d_scene_status');
 const jobId=randomUUID(),filePath=path.resolve(import.meta.dirname,'../../.codex-logs/desktop-mcp/import-fixtures/models/partial-registration.gltf');
 await call('h3d_model_prepare',{jobId,filePath});
 let job;
 for(let i=0;i<300;i++){job=await call('h3d_model_job',{jobId,action:'status'});if(job.state!=='preparing')break;await delay(200);}
 assert.equal(job.state,'ready');assert.equal(job.meshes,2);
 const args={expectedRevision:state.sceneRevision,operationId:randomUUID(),label:'Partial resource registration fault',operations:[{type:'insert-model',jobId,ref:'model'}]};
 const failure=await raw('h3d_scene_batch',args);
 assert.equal(failure.isError,true);assert.match(JSON.stringify(failure.content),/H3D injected resource registration failure/);
 assert.equal((await raw('h3d_scene_batch',args)).isError,true);
 assert.equal((await call('h3d_operation_status',{operationId:args.operationId})).state,'failed');
 assert.deepEqual(await call('h3d_scene_query',{limit:100}),before);
 assert.deepEqual((await call('h3d_scene_status')).history,state.history);
 assert.equal((await call('h3d_scene_status')).editRecoveryRequired,false);
 assert.equal((await call('h3d_model_job',{jobId,action:'status'})).state,'ready');
 assert.equal((await call('h3d_model_job',{jobId,action:'cancel'})).state,'cancelled');
 const evidence={sceneId,objectsUnchanged:true,historyUnchanged:true,failedRequestNotReplayed:true,jobNotConsumed:true,preparedResourcesCancelled:true,saved:false};
 await writeFile(process.argv[2],JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await client.close();}
