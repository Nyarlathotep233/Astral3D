import { App, AtomicBatchCommand } from '@astral3d/engine';
import type { Object3D } from 'three';
import { agentState, agentStatus, announceAgentState } from './agentState';
import { prepareObjectOperation, GEOMETRY_CATALOG, OBJECT_KINDS, agentObjectHelp } from './agentObjects';
import { prepareMaterialOperation, prepareMaterialResources, agentMaterialHelp } from './agentMaterials';
import { prepareScriptOperation, agentScriptHelp } from './agentScripts';
import { prepareSceneSettingsOperation, describeSceneSettings, agentSceneSettingsHelp } from './agentSceneSettings';
import { prepareAnimationOperation, describeAnimations, agentAnimationHelp } from './agentAnimation';
import { agentModelJobs, prepareImportOperation, IMPORT_FORMATS } from './agentImports';
import { queryObjects, inspectObjects } from './agentReadModel';
import { recordAgentDiagnostic } from './agentDiagnostics';
import { publishAgentFile } from './agentFiles';
import type { AgentEditContext } from './agentTypes';
import { agentProjectHelp } from './agentProjects';
import { agentAssetsHelp } from './agentAssets';
import { agentExportHelp } from './agentExports';

const preparers = [prepareObjectOperation, prepareMaterialOperation, prepareScriptOperation, prepareSceneSettingsOperation, prepareAnimationOperation, prepareImportOperation];
const operations = new Map<string,{request:string;state:string;result?:any;error?:string}>();
let queue = Promise.resolve<any>(null), queued = 0;
let jobsEpoch = agentState.documentEpoch;
export function agentCapabilities() {
  return {renderer:'WebGL',geometry:GEOMETRY_CATALOG,objectKinds:OBJECT_KINDS,objects:agentObjectHelp,animation:agentAnimationHelp,settings:agentSceneSettingsHelp,materials:agentMaterialHelp(),scripts:agentScriptHelp(),
    sceneOperations:['create','clone','remove','transform','attributes','reparent','geometry','instances','billboard','html','tiles','particle','material-create','material','material-assign','texture','texture-create','script-add','script-update','script-remove','animation','scene-config','background','environment','scene-properties','view','insert-model'],
    imports:{formats:IMPORT_FORMATS,prepare:{source:'{artifactId} for a completed upload; or {type:"url",url,name,entry?,files?:[{path,url}]} or {type:"builtin-prefab",key}',jobId:'optional unique ID'},poll:'h3d_import_job {action:"status",jobId}; cancel with action:"cancel"',insert:{type:'insert-model',jobId:'ready job ID',ref:'new batch object reference',parent:'optional object target'},limits:'16 pending preparations; 120 second deadline; prepared resources are invalid after changing page pairing/document'},projects:agentProjectHelp,assets:agentAssetsHelp,
    exports:agentExportHelp,
    capture:{target:'editor (default) | runtime',width:'optional 64..4096',height:'optional 64..4096',format:'png (default) | jpeg'},
    limits:{batchOperations:200,queuedRequests:32,objectDetails:20,queryPage:100},
    runtime:{preview:'iframe',scripts:'trusted JavaScript',recovery:'persistent authoring snapshot; main-thread infinite loops require page reload',
      inspection:'While Play is running, list h3d_runtime_scene_query and pass its runId and UUIDs to h3d_runtime_sample. Read world transforms, texture UVs, frame uniforms, clip times and material parameters. Repeat bounded windows for longer traces.'},
  };
}
function fail(message:string,code='INVALID_STATE'):never { throw Object.assign(new Error(message),{code}); }
function checkBinding(args:any,write=false,allowInactive=false) {
  if(args.sessionId !== agentState.sessionId) fail('Session is no longer authorized','STALE_SESSION');
  if(args.documentEpoch !== undefined && args.documentEpoch !== agentState.documentEpoch) fail('Document changed; read current scene status','STALE_DOCUMENT');
  if(args.sceneId !== undefined && (args.sceneId ?? '') !== agentState.sceneId) fail('Scene changed; read current scene status','STALE_SCENE');
  if(write) {
    if(agentState.recoveryRequired) fail('A previous rollback failed. Recover or reload the project before editing','RECOVERY_REQUIRED');
    if(agentState.sceneState !== 'ready' && !(allowInactive && agentState.sceneState==='inactive')) fail('Scene is not ready');
    if(args.documentEpoch !== agentState.documentEpoch || (args.sceneId ?? '') !== agentState.sceneId) fail('Writes require current sceneId and documentEpoch','STALE_DOCUMENT');
    if(args.expectedRevision !== agentState.revision) fail('Scene revision changed; inspect current state before applying edits','REVISION_CONFLICT');
    if(typeof args.operationId !== 'string' || !args.operationId) fail('Write requires operationId');
  }
}
function canonical(value:any):string { return JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v); }
function isWrite(method:string,args:any) {
  return ['h3d_scene_batch','h3d_history'].includes(method) || method==='h3d_project' && ['save','rename','delete','open','create','create-template','import'].includes(args.action) || method==='h3d_play' && args.action!=='status' || method==='h3d_assets' && !['list','get','templates','builtin','conversions','conversion-status','resources','prepare'].includes(args.action);
}
export function executeAgentRequest(method:string,args:any={}) {
  // Observation must not hold the edit queue during timed sampling. Stop/Restart can interrupt a read.
  if (method === 'h3d_runtime_scene_query' || method === 'h3d_runtime_sample') return inspectPreview(method, args);
  if(['h3d_scene_status','h3d_operation_status','h3d_import_job','h3d_job','h3d_diagnostics'].includes(method)||method==='h3d_play'&&args.action==='status')return run(method,args);
  if(queued >= 32) return Promise.reject(Object.assign(new Error('Editor request queue is full'),{code:'BUSY'}));
  queued++;
  const result = queue.then(()=>run(method,args));
  queue = result.catch(()=>{}).finally(()=>{queued--;});
  return result;
}

async function inspectPreview(method: string, args: any) {
  checkBinding(args);
  const binding = { ...args, documentEpoch: agentState.documentEpoch };
  const verifyBinding = () => {
    checkBinding(binding);
    if (agentState.connection !== 'connected') fail('Editor disconnected during runtime inspection', 'EDITOR_DISCONNECTED');
  };
  const runtime = await import('./agentRuntime');
  verifyBinding();
  return method === 'h3d_runtime_sample' ? runtime.agentRuntimeSample(args, verifyBinding) : runtime.agentRuntimeQuery(args);
}
async function run(method:string,args:any) {
  checkBinding(args);
  if(jobsEpoch!==agentState.documentEpoch){agentModelJobs.reset();jobsEpoch=agentState.documentEpoch;}
  if(method === 'h3d_operation_status') {
    const entry=operations.get(args.operationId);
    if(!entry||entry.state==='failed'||entry.state==='unknown') {
      const {fetchSceneSaveOperation}=await import('@/http/api/scenes');
      if(args.sceneId||agentState.sceneId){const receipt=await fetchSceneSaveOperation(args.sceneId||agentState.sceneId,args.operationId);if(!receipt.error&&receipt.data)return {operationId:args.operationId,state:'succeeded',persistence:'database',result:receipt.data};}
    }
    return {operationId:args.operationId,state:entry?.state||'unknown',result:entry?.result,error:entry?.error};
  }
  const write = isWrite(method,args), request = canonical({method,args});
  if(write) {
    const prior = operations.get(args.operationId);
    if(prior) {
      if(prior.request !== request) fail('operationId was already used for different arguments','OPERATION_CONFLICT');
      if(prior.state === 'succeeded') return prior.result;
      fail(prior.error || 'Operation is still running',prior.state.toUpperCase());
    }
    // Home-page navigation is allowed, but never bypass the current revision.
    // In particular, a stale open/discard request must not erase intervening human edits.
    const allowInactive = method==='h3d_project' && ['create','open','import'].includes(args.action) || method==='h3d_assets';
    checkBinding(args,true,allowInactive);
    if(operations.size >= 10000) fail('Operation ledger is full; reconnect with a fresh page');
    operations.set(args.operationId,{request,state:'running'});
  }
  try {
    const result = await dispatch(method,args);
    if(write) operations.set(args.operationId,{request,state:'succeeded',result});
    return result;
  } catch(error:any) {
    if(error.recoveryFailed) agentState.recoveryRequired = true;
    if(write) operations.set(args.operationId,{request,state:error.recoveryFailed?'recovery-required':error.outcome==='unknown'?'unknown':'failed',error:error.message||String(error)});
    recordAgentDiagnostic({severity:'error',kind:'runtime',phase:'editor',message:error.message||String(error)});
    throw error;
  } finally { announceAgentState(); }
}
async function batch(args:any) {
  if(!Array.isArray(args.operations) || !args.operations.length || args.operations.length > 200) fail('Batch requires 1 to 200 operations');
  for(const op of args.operations)if(['create','html','billboard','tiles','particle','scene-config'].includes(op.type)&&JSON.stringify(op).includes('/agent/artifacts/'))fail('This resource remains URL-based when saved. Publish its files first using h3d_assets action publish-files and use the persistent entryUrl/baseUrl');
  const refs = new Map<string,Object3D>();
  const ctx:AgentEditContext = {
    resolve(target) {const object = target?.ref ? refs.get(target.ref) : target?.uuid === App.scene.uuid ? App.scene : target?.uuid ? App.scene.getObjectByProperty('uuid',target.uuid) : undefined;if(!object)fail('Unknown target uuid/ref');return object;},
    register(ref,object) {if(typeof ref!=='string'||!ref||refs.has(ref))fail('Object ref must be unique within the batch');refs.set(ref,object);},
    steps:[],cleanup:[],
  };
  const jobs = args.operations.filter(op=>op.type==='insert-model').map(op=>op.jobId);
  if(new Set(jobs).size !== jobs.length) fail('A prepared model can be consumed only once');
  try {
    ctx.cleanup.push(await prepareMaterialResources(args.operations));
    checkBinding(args,true); // Resources may have loaded while a human edited the scene.
    for(const op of args.operations) if(!preparers.some(prepare=>prepare(op,ctx))) fail(`Unsupported operation: ${op.type}`);
    const command = new AtomicBatchCommand(ctx.steps,args.label || 'Agent edit');
    agentState.busy = true;
    App.execute(command);
    for(const jobId of jobs) agentModelJobs.consume(jobId);
    agentState.revision++;agentState.dirty = true;
    return {operationId:args.operationId,batchId:command.id,revision:agentState.revision,objects:Object.fromEntries([...refs].map(([ref,object])=>[ref,{uuid:object.uuid,name:object.name,type:object.type}]))};
  } catch(error:any) {
    if(!error.recoveryFailed) for(const cleanup of ctx.cleanup.reverse()) try {cleanup();}catch {}
    throw error;
  } finally {agentState.busy = false;}
}
async function dispatch(method:string,args:any):Promise<any> {
  switch(method) {
    case 'h3d_scene_status': return {...agentStatus(),scene:agentState.sceneState==='ready'?describeSceneSettings():null};
    case 'h3d_scene_query': return queryObjects(App.scene,args);
    case 'h3d_object_details': return inspectObjects(App.scene,App.scripts,args).map(value=>({...value,animations:describeAnimations(App.scene.getObjectByProperty('uuid',value.uuid as string)!)}));
    case 'h3d_scene_batch': return batch(args);
    case 'h3d_history': {
      const stack = args.action==='undo'?App.history.undos:App.history.redos;
      if(String(stack.at(-1)?.id) !== String(args.batchId)) fail('Requested batch is not the top history entry. Intervening edits must be handled explicitly','HISTORY_CONFLICT');
      agentState.busy=true;
      try {const command=App.history[args.action as 'undo'|'redo']();agentState.revision++;agentState.dirty=true;return {batchId:command?.id,revision:agentState.revision};}
      finally {agentState.busy=false;}
    }
    case 'h3d_diagnostics': return (await import('./agentRuntime')).agentDiagnostics(args);
    case 'h3d_import_prepare': return agentModelJobs.start(args.jobId || crypto.randomUUID(),args.source);
    case 'h3d_import_job': case 'h3d_job': {
      if(!['cancel','status'].includes(args.action))fail('Job action must be status or cancel');
      return args.action==='cancel'?agentModelJobs.cancel(args.jobId):agentModelJobs.status(args.jobId);
    }
    case 'h3d_play': return (await import('./agentRuntime')).agentPlay(args.action,args);
    case 'h3d_project': return (await import('./agentProjects')).agentProject(args);
    case 'h3d_assets': return (await import('./agentAssets')).agentAssets(args);
    case 'h3d_export': return (await import('./agentExports')).agentExport(args);
    case 'h3d_viewport_capture': {
      if(agentState.sceneState!=='ready')fail('Scene is not ready');
      const capture=await (await import('./agentRuntime')).agentCapture(args);
      const response=await fetch(`data:${capture.mimeType};base64,${capture.data}`);
      return {...await publishAgentFile(new File([await response.blob()],`viewport-${Date.now()}.${capture.mimeType==='image/jpeg'?'jpg':'png'}`,{type:capture.mimeType})),width:capture.width,height:capture.height,target:capture.target,...(capture.data.length<1500000?{data:capture.data,mimeType:capture.mimeType}:{})};
    }
    default: fail(`Unsupported editor method: ${method}`,'METHOD_NOT_FOUND');
  }
}
