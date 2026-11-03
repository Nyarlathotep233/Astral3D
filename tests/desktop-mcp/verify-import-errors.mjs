import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
let config;try{config=JSON.parse(input).mcpServers.h3d;}catch{throw Error('Copy MCP config first');}
const client=new Client({name:'h3d-import-errors',version:'1.0.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 const sceneId='db24d798905d186dfb61505f9396d5b8';
 const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
 const session=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready');assert.ok(session);
 const binding={sessionId:session.sessionId,sceneId};
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:{...binding,...args}});assert.ok(!r.isError,JSON.stringify(r.content));return r.structuredContent;};
 const initial=await call('h3d_scene_query',{limit:100}), status=await call('h3d_scene_status');
 const failures=[];
 for(const file of ['missing-buffer.gltf','missing-texture.gltf']) {
   const jobId=randomUUID(),filePath=new URL(`../../.codex-logs/desktop-mcp/import-fixtures/models/${file}`,import.meta.url);
   const {fileURLToPath}=await import('node:url');
   await call('h3d_model_prepare',{jobId,filePath:fileURLToPath(filePath)});
   let job;
   for(let i=0;i<150;i++){job=await call('h3d_model_job',{jobId,action:'status'});if(job.state!=='preparing')break;await delay(200);}
   assert.equal(job.state,'failed',JSON.stringify(job));assert.ok(job.error);failures.push({file,error:job.error});
 }
 assert.deepEqual(await call('h3d_scene_query',{limit:100}),initial);
 assert.equal((await call('h3d_scene_status')).sceneRevision,status.sceneRevision);
 const result={sceneId,failures,noPartialObjects:true,revisionUnchanged:true,saved:false};
 await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(result);
} finally {await client.close();}
