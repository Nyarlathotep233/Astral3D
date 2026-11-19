// Real browser -> WebSocket bridge -> MCP SDK -> Java/MySQL persistence.
// Creates dedicated acceptance projects; never edits pre-existing user projects.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const require=createRequire(import.meta.url);
const bridgeRequire=createRequire(new URL('../../packages/mcp-bridge/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/index.js')));
const {StreamableHTTPClientTransport}=await import(pathToFileURL(bridgeRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.EDITOR_URL||'https://localhost:8090', service=process.env.API_URL||'http://127.0.0.1:8080/api';
const output=path.resolve('.git/codex-runtime/web-mcp-e2e');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors']});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(45000);
const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));
let client,pairing,sceneId;
const evidence={checks:[],projects:[],browserErrors};
const mark=(message)=>{evidence.checks.push(message);console.log(message);};
async function api(endpoint,data) {const r=await fetch(service+endpoint,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const result=await r.json();if(!r.ok||result.success===false||result.code!==200)throw new Error(JSON.stringify(result));return result.result;}
async function connect() {
  await page.getByRole('button',{name:'连接 Agent',exact:true}).click();
  const created=page.waitForResponse(response=>response.url().endsWith('/agent/sessions')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'授权连接此页面'}).click();
  const createdPair=await (await created).json();
  const state = await page.evaluateHandle(async () => (await import('/src/utils/integration/agentState.ts')).agentState);
  await page.waitForFunction(s => s.connection === 'connected' && s.sceneState === 'ready', state);
  await state.dispose();
  pairing={url:createdPair.mcpUrl,token:createdPair.agentToken,sessionId:createdPair.sessionId};
  await page.keyboard.press('Escape');
  client=new Client({name:'h3d-browser-acceptance',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(pairing.url),{requestInit:{headers:{Authorization:`Bearer ${pairing.token}`}}}));
}
async function call(name,args={},expectError=false) {
  const result=await client.callTool({name,arguments:{...(name==='h3d_sessions_list'||name==='h3d_capabilities'||name==='h3d_help'||name.startsWith('h3d_upload')||name==='h3d_artifact_release'?{}:{sessionId:pairing.sessionId}),...args}},undefined,{timeout:180000});
  const data=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text);
  if(expectError){assert.equal(result.isError,true,JSON.stringify(data));return data;}
  if(result.isError)throw new Error(`${name}: ${JSON.stringify(data)}`);return data;
}
async function binding(){const status=await call('h3d_scene_status');return {sessionId:pairing.sessionId,sceneId:status.sceneId,documentEpoch:status.documentEpoch,expectedRevision:status.revision,operationId:crypto.randomUUID()};}
async function batch(operations,label='Acceptance edit'){return call('h3d_scene_batch',{...await binding(),operations,label});}
async function capture(name){const item=await call('h3d_viewport_capture',{width:1280,height:800});const r=await fetch(new URL(item.url,pairing.url),{headers:{Authorization:`Bearer ${pairing.token}`}});assert.equal(r.status,200);await writeFile(path.join(output,name),Buffer.from(await r.arrayBuffer()));return item;}
async function waitForScene(id) {
  const state = await page.evaluateHandle(async () => (await import('/src/utils/integration/agentState.ts')).agentState);
  try {
    await page.waitForFunction(({s, id}) => s.sceneId === id && s.sceneState === 'ready', {s:state, id}, {timeout:120000});
  } finally { await state.dispose(); }
}
try {
  const scene=await api('/editor3d/scenes/add',{id:'',sceneName:`MCP验收-${new Date().toISOString()}`,sceneType:'其他',sceneIntroduction:'Automatically generated acceptance scene',sceneVersion:1,zip:'',coverPicture:'',hasDrawing:0,projectType:0});
  sceneId=scene.id;evidence.projects.push(sceneId);
  await page.goto(`${base}/#/editor/${sceneId}`);await connect();
  const tools=await client.listTools();assert(tools.tools.some(t=>t.name==='h3d_scene_batch'));
  let help;
  for(let i=0;i<50;i++){help=await call('h3d_capabilities');if(help.editorCapabilities?.objects?.create)break;await new Promise(r=>setTimeout(r,100));}
  assert(help.editorCapabilities?.objects?.create,JSON.stringify(help));
  mark('Real browser pairing and MCP tool discovery');
  const result=await batch([
    {type:'create',kind:'Group',ref:'campus',name:'MCP campus'},
    {type:'create',kind:'mesh',ref:'ground',parent:{ref:'campus'},name:'Ground',geometry:{type:'box',parameters:{width:32,height:.2,depth:22}},position:[0,-.1,0]},
    {type:'material-create',target:{ref:'ground'},kind:'MeshStandardMaterial',values:{color:'#293b4e',roughness:.8}},
    ...Array.from({length:12},(_,i)=>({type:'create',kind:'mesh',ref:`tower${i}`,parent:{ref:'campus'},name:`Tower ${i}`,geometry:{type:'box',parameters:{width:1.7,height:2+i%4,depth:1.7}},position:[-10+(i%6)*4,1+i%4/2,-4+Math.floor(i/6)*8]})),
    {type:'create',kind:'mesh',ref:'sculpture',parent:{ref:'campus'},name:'Shader sculpture',geometry:{type:'torusknot',parameters:{radius:1.5,tube:.35,tubularSegments:96,radialSegments:16}},position:[0,4,0]},
    {type:'material-create',target:{ref:'sculpture'},kind:'ShaderMaterial',vertexShader:'varying vec3 vNormal; void main(){vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vNormal;uniform vec3 tint;void main(){gl_FragColor=vec4(tint*(0.45+0.55*abs(vNormal)),1.0);}',uniforms:{tint:{type:'color',value:'#36c5f0'}}},
    {type:'script-add',target:{ref:'sculpture'},name:'spin',source:'function beforeAnimation(delta){this.rotation.y += delta * 0.6;render();}',params:{}},
    {type:'animation',target:{ref:'tower0'},action:'create',name:'bob',tracks:[{name:'.position[y]',type:'number',times:[0,1,2],values:[1,2,1]}]},
    {type:'create',kind:'DirectionalLight',ref:'sun',position:[6,12,8],attributes:{intensity:3,castShadow:true}},
    {type:'create',kind:'AmbientLight',ref:'fill',attributes:{intensity:1.2}},
    {type:'view',position:[24,22,28],lookAt:[0,2,0],grid:false,helpers:false},
  ]);
  assert(result.objects.sculpture.uuid);mark('Complex hierarchy, geometry, WebGL shader, scripts, animation and lighting batch');
  const before=await call('h3d_scene_status');
  await call('h3d_scene_batch',{...await binding(),operations:[{type:'create',kind:'mesh',ref:'discard',name:'must rollback'},{type:'transform',target:{uuid:'missing-object'},position:[1,2,3]}]},true);
  assert.equal((await call('h3d_scene_query',{name:'must rollback'})).total,0);
  assert.equal((await call('h3d_scene_status')).revision,before.revision);mark('Failed batch leaves no partial object or revision');
  const editArgs={...await binding(),label:'Idempotency check',operations:[{type:'transform',target:{uuid:result.objects.sculpture.uuid},position:[0,4.5,0]}]};
  const edit=await call('h3d_scene_batch',editArgs);assert.deepEqual(await call('h3d_scene_batch',editArgs),edit);
  await call('h3d_history',{...await binding(),action:'undo',batchId:edit.batchId});
  await call('h3d_history',{...await binding(),action:'redo',batchId:edit.batchId});mark('Operation deduplication and identified undo/redo');
  await call('h3d_play',{...await binding(),action:'start'});
  for(let i=0;i<120;i++){const status=await call('h3d_play',{action:'status'});if(status.state==='running')break;if(['failed','unresponsive'].includes(status.state))throw Error(JSON.stringify(status));await new Promise(resolve=>setTimeout(resolve,250));if(i===119)throw Error('Play timed out');}
  await call('h3d_play',{...await binding(),action:'stop'});mark('Actual preview runtime starts and returns to authoring');
  await capture('scene.png');
  const saved=await call('h3d_project',{...await binding(),action:'save',expectedVersion:1});assert.equal(saved.scene.sceneVersion,2);
  const exported=await call('h3d_export',{format:'project-zip',operationId:crypto.randomUUID()});assert(exported.artifactId);mark('Explicit versioned save and project ZIP export');
  const obj=Buffer.from('o UploadedTriangle\nv 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3\n');
  const upload=await call('h3d_upload_prepare',{name:'triangle.obj',size:obj.length,contentType:'text/plain'});
  assert.equal((await fetch(upload.uploadUrl,{method:'PUT',headers:upload.headers,body:obj})).status,200);
  const artifact=await call('h3d_upload_complete',{uploadId:upload.uploadId});
  const job=await call('h3d_import_prepare',{source:{artifactId:artifact.artifactId}});
  for(let i=0;i<100;i++){const state=await call('h3d_import_job',{action:'status',jobId:job.jobId});if(state.state==='ready')break;if(state.state==='failed')throw Error(JSON.stringify(state));await new Promise(resolve=>setTimeout(resolve,100));}
  await batch([{type:'insert-model',jobId:job.jobId,ref:'uploaded'}]);mark('Local binary HTTP upload, detached parse and atomic insertion');
  const imported=await call('h3d_project',{...await binding(),action:'import',name:'MCP exported project roundtrip',source:{artifactId:exported.artifactId}});evidence.projects.push(imported.scene.id);
  await call('h3d_project',{...await binding(),action:'open',id:imported.scene.id,discardChanges:true});await waitForScene(imported.scene.id);
  const items=await call('h3d_scene_query',{name:'Shader sculpture'});assert.equal(items.total,1);
  const details=await call('h3d_object_details',{uuids:[items.items[0].uuid],includeScripts:true});assert.equal(details[0].scripts[0].name,'spin');assert.equal(details[0].materials[0].type,'ShaderMaterial');mark('Project export/import preserves scripts and custom material');
  await call('h3d_project',{...await binding(),action:'open',id:sceneId,discardChanges:true});await waitForScene(sceneId);
  assert.equal((await call('h3d_scene_query',{name:'Tower '})).total,12);mark('Saved scene reopens from real Java/MySQL storage');
  if(process.env.RUN_CODEX==='1') {
    const codexBefore={objects:(await call('h3d_scene_query',{limit:100})).total,version:(await call('h3d_scene_status')).sceneVersion};
    const prompt='Use ONLY the h3d MCP tools to inspect the paired H3D scene and add a visually coherent complex fountain/plaza to the existing campus. Use a group hierarchy, at least 10 objects, one custom GLSL material, one scripted moving element and a camera/view adjustment. Read h3d_help and capabilities first. The renderer is WebGL. Each write needs scene status binding, expectedRevision and unique operationId. If diagnostics report a fault, correct it. Capture the viewport, run and stop preview, explicitly save, then report exact object counts and tool outcomes. Do not use shell, filesystem, external connectors or modify source code. This is an authorized acceptance test project.';
    const binary=process.env.CODEX_BINARY||'codex';
    const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--json','--approve-for-me','-c',`mcp_servers.h3d.url="${pairing.url}"`,'-c','mcp_servers.h3d.bearer_token_env_var="H3D_AGENT_TOKEN"','-c','mcp_servers.h3d.tool_timeout_sec=180',prompt];
    const child=spawn(binary,args,{cwd:process.cwd(),env:{...process.env,H3D_AGENT_TOKEN:pairing.token},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const transcript=createWriteStream(path.join(output,'codex-acceptance.jsonl'));
    mark('Started real Codex MCP acceptance');
    child.stdout.on('data',chunk=>transcript.write(chunk));child.stderr.on('data',chunk=>transcript.write(chunk));
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    await new Promise(resolve=>transcript.end(resolve));assert.equal(code,0,'Codex acceptance exited unsuccessfully');
    const authoredCount=(await call('h3d_scene_query',{limit:100})).total;
    assert(authoredCount>=codexBefore.objects+10,'Codex must actually add at least 10 objects; a declined/no-op turn is not a pass');
    assert((await call('h3d_scene_status')).sceneVersion>codexBefore.version,'Codex must actually persist its scene changes');
    mark('Real Codex client completed scene authoring through the MCP endpoint');
    await capture('codex-scene.png');
    // An agent's successful exit is insufficient: validate the saved scene and runtime independently.
    await client.close();await page.reload();await connect();await waitForScene(sceneId);
    assert.equal((await call('h3d_scene_query',{limit:100})).total,authoredCount,'All authored objects must survive reloading');
    await call('h3d_play',{...await binding(),action:'start'});
    let running=false;
    for(let i=0;i<120;i++){
      const runtime=await call('h3d_play',{action:'status'});
      if(runtime.state==='running'){running=true;break;}
      if(['failed','unresponsive'].includes(runtime.state))throw Error(JSON.stringify(runtime));
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert(running,'The Codex-authored scene must actually run after reloading');
    await call('h3d_viewport_capture',{target:'runtime',width:1280,height:800});
    await call('h3d_play',{...await binding(),action:'stop'});
    mark('Codex-authored scene survives reload and runs in the real preview');
  }
  await page.screenshot({path:path.join(output,'editor.png')});
  evidence.finalStatus=await call('h3d_scene_status');
  assert.deepEqual(browserErrors,[],'The complete acceptance flow must not throw uncaught browser errors');
  await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({ok:true,checks:evidence.checks.length,sceneId,projects:evidence.projects,output}));
} catch(error) {
  evidence.failure=error.stack||String(error);
  await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));
  await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  console.error(error);process.exitCode=1;
} finally {await client?.close();await browser.close();}
