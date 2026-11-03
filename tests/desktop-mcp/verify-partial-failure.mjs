// Requires the browser's one-shot updateMatrixWorld failure probe; no save or upload.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Client } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../packages/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input).mcpServers.h3d,sceneId='db24d798905d186dfb61505f9396d5b8';
const client=new Client({name:'h3d-partial-failure-check',version:'1.0.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 const sessions=(await client.callTool({name:'h3d_sessions_list',arguments:{}})).structuredContent.sessions;
 const session=sessions.find(s=>s.sceneId===sceneId&&s.state==='ready');assert.ok(session);
 const binding={sessionId:session.sessionId,sceneId};const call=(name,args={})=>client.callTool({name,arguments:{...binding,...args}});
 const before=(await call('h3d_scene_query',{limit:100})).structuredContent;
 const target=before.items.find(i=>i.type==='Mesh');assert.ok(target);
 const status=(await call('h3d_scene_status')).structuredContent;
 const failure=await call('h3d_scene_batch',{expectedRevision:status.sceneRevision,operationId:randomUUID(),label:'Injected partial mutation',operations:[{type:'create',ref:'probe',kind:'box',name:'must-rollback'},{type:'transform',target:{uuid:target.uuid},space:'local',position:[123,456,789]}]});
 assert.equal(failure.isError,true);assert.match(JSON.stringify(failure.content),/H3D injected partial transform failure/);
 const after=(await call('h3d_scene_query',{limit:100})).structuredContent;
 assert.deepEqual(after,before);assert.deepEqual((await call('h3d_scene_status')).structuredContent.history,status.history);
 const evidence={sceneId,currentStepRestored:true,previousCreateRestored:true,historyUnchanged:true,originalObjectsUnchanged:true,saved:false};
 await writeFile(process.argv[2],JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await client.close();}
