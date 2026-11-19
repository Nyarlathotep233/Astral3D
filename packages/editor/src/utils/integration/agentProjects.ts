import { App, defaultProjectInfo } from '@astral3d/engine';
import JSZip from 'jszip';
import { router } from '@/router';
import { isNavigationFailure, NavigationFailureType } from 'vue-router';
import { fetchGetAllScenes, fetchGetOneScene, fetchAddScene, fetchDeleteScenes } from '@/http/api/scenes';
import { fetchSceneExampleList, fetchCreateSceneExampleFromScene } from '@/http/api/sceneExample';
import { fetchUpload } from '@/http/api/sys';
import { request } from '@/http/request';
import { saveSceneToService, getLastSceneSaveReceipt } from '@/utils/common/saveSceneToService';
import { agentState } from './agentState';
import { agentSourceFile } from './agentFiles';
export const agentProjectHelp={
  binding:'All writes need sessionId, documentEpoch, operationId; edits to the active project also need sceneId and expectedRevision from scene_status.',
  list:{action:'list',offset:0,limit:50},get:{action:'get',id:'project ID; defaults to active project'},
  create:{action:'create',name:'project name',description:'optional',templateId:'optional template ID',open:'optional boolean',discardChanges:'required true to navigate away from unsaved changes'},
  open:{action:'open',id:'project ID',discardChanges:'false by default; save first or explicitly discard'},
  save:{action:'save',expectedVersion:'optional persisted sceneVersion; defaults to loaded version',note:'Explicitly persists current scene, returns durable receipt and cleanup warnings. Retry uncertain results with operation_status using the same operationId.'},
  rename:{action:'rename',name:'new project name',note:'Also explicitly saves the current scene'},
  delete:{action:'delete',id:'project ID',confirmSceneId:'must equal id'},
  templates:{action:'templates',offset:0,limit:50},
  createTemplate:{action:'create-template',id:'saved project ID',name:'optional template name',templateKey:'optional unique key',note:'Uses the existing admin authorization configured in the page; does not save first.'},
  import:{action:'import',source:'{artifactId} or {url,name}; project JSON/ZIP',name:'optional name override',open:'optional boolean',note:'Creates a new project and preserves the current scene. Use model import for plain object JSON.'},
};
export function unwrapAgentResponse<T=any>(result:any):T {if(result.error)throw new Error(result.error.message || 'Service request failed');if(result.data==null)throw new Error('Service returned no result');return result.data;}
function validName(name:any) {if(typeof name!=='string'||!name.trim()||name.length>200)throw new Error('name must contain 1 to 200 characters');return name.trim();}
function checkNavigation(args:any) {
  if (args.sessionId !== agentState.sessionId || args.documentEpoch !== agentState.documentEpoch || (args.sceneId ?? '') !== agentState.sceneId) {
    throw Object.assign(new Error('The original page or document changed before navigation'), {code:'STALE_DOCUMENT'});
  }
  if (args.expectedRevision !== agentState.revision) {
    throw Object.assign(new Error('Scene was edited before navigation. Inspect its changes first'), {code:'REVISION_CONFLICT'});
  }
  if (agentState.dirty && !args.discardChanges) throw new Error('Current scene has unsaved changes. Save it or explicitly set discardChanges:true');
}

async function navigate(path:string, args:any) {
  checkNavigation(args);
  // Lazy route components can resolve after a human has edited or re-paired the page.
  const removeGuard = router.beforeResolve(to => {
    if (to.path === path) checkNavigation(args);
  });
  try {
    const failure = await router.push(path);
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) throw failure;
  } finally {
    removeGuard();
  }
}

async function openProject(id:string, args:any) {
  checkNavigation(args);
  const info=unwrapAgentResponse(await fetchGetOneScene(id));
  await navigate(`/editor/${encodeURIComponent(info.id)}`, args);
  return {scene:info,navigating:true,next:'Poll scene_status until sceneState is ready, then use its new documentEpoch/revision'};
}
export async function agentProject(args:any):Promise<any> {
  switch(args.action) {
    case 'list': return unwrapAgentResponse(await fetchGetAllScenes({offset:args.offset||0,limit:Math.min(args.limit||50,100),sortby:'createTime',order:'desc'}));
    case 'get': return unwrapAgentResponse(await fetchGetOneScene(args.id||agentState.sceneId));
    case 'templates': return unwrapAgentResponse(await fetchSceneExampleList({offset:args.offset||0,limit:Math.min(args.limit||50,100)}));
    case 'create': {
      if (args.open) checkNavigation(args);
      const scene=unwrapAgentResponse(await fetchAddScene({...defaultProjectInfo().sceneInfo,id:'',sceneName:validName(args.name),sceneIntroduction:args.description||'',exampleSceneId:args.templateId||'',zip:'',coverPicture:'',sceneVersion:1,hasDrawing:0,projectType:0}));
      return args.open ? openProject(scene.id,args) : {scene};
    }
    case 'open': return openProject(args.id,args);
    case 'save': {
      const scene=await saveSceneToService({operationId:args.operationId,expectedVersion:args.expectedVersion??App.project.getKey('sceneInfo.sceneVersion')});
      return {scene,operationId:args.operationId,revision:agentState.revision,receipt:getLastSceneSaveReceipt()};
    }
    case 'rename': {
      const scene = await saveSceneToService({operationId:args.operationId, expectedVersion:args.expectedVersion, sceneName:validName(args.name)});
      return {scene,receipt:getLastSceneSaveReceipt()};
    }
    case 'delete': {
      const id=args.id||agentState.sceneId;
      if(args.confirmSceneId!==id)throw new Error('Deleting a project requires confirmSceneId equal to its id');
      const result=await fetchDeleteScenes(id);if(result.error)throw new Error(result.error.message);
      if (id === agentState.sceneId && args.documentEpoch === agentState.documentEpoch && args.expectedRevision === agentState.revision) {
        await navigate('/', {...args, discardChanges:true});
      }
      return {deletedSceneId:id};
    }
    case 'create-template': return unwrapAgentResponse(await fetchCreateSceneExampleFromScene(args.id||agentState.sceneId,{sceneName:args.name,sceneType:args.sceneType,sceneIntroduction:args.description,templateKey:args.templateKey}));
    case 'import': return importProject(args);
    default: throw new Error('Project action must be list/get/templates/create/open/save/rename/delete/create-template/import');
  }
}

/** Import as a new project: the open scene and its unsaved edits remain untouched. */
async function importProject(args:any) {
  if(args.open&&agentState.dirty&&!args.discardChanges)throw new Error('Current scene has unsaved changes. Save it or set discardChanges:true before importing and opening');
  const file=await agentSourceFile(args.source);
  let manifest:any;const files=new Map<string,Blob>();
  if(file.name.toLowerCase().endsWith('.json')) {
    manifest=JSON.parse(await file.text());
    if(!['h3d-scene-project-package','astral3d-scene-project-package'].includes(manifest.signature))throw new Error('Not a project JSON package');
    for(const [name,data] of Object.entries(manifest.packageFiles||{})) {
      if(typeof data!=='string'||!data.startsWith('data:'))throw new Error('Project JSON packages require embedded files');
      files.set(name,await fetch(data).then(r=>r.blob()));
    }
  } else {
    const archive=await JSZip.loadAsync(file);const entry=archive.file('project.json');
    if(!entry)throw new Error('Project ZIP is missing project.json');
    manifest=JSON.parse(await entry.async('string'));
    if(!['h3d-scene-project-package-zip','astral3d-scene-project-package-zip'].includes(manifest.signature))throw new Error('Not a project ZIP package');
    for(const name of manifest.packageFiles||[]) {const value=archive.file(`packages/${name}`);if(!value)throw new Error(`Missing package ${name}`);files.set(name,await value.async('blob'));}
  }
  if(manifest.version!==1||!files.size||files.size>256||!files.has(manifest.firstPackageName))throw new Error('Invalid or incomplete project manifest');
  if([...files.values()].reduce((sum,blob)=>sum+blob.size,0)>512*1024*1024)throw new Error('Project exceeds the 512 MiB import limit');
  for(const [name,file] of files) {
    if(!/^[^/\\:*?"<>|]+\.zip$/i.test(name)||name.includes('..'))throw new Error('Invalid project package filename');
    const zip=await JSZip.loadAsync(file);
    if(name===manifest.firstPackageName&&!zip.file('scene.json'))throw new Error('First package is missing scene.json');
  }
  const biz=`upload/3DEditor/import/${crypto.randomUUID()}`,uploaded:string[]=[];
  let committed=false,createAttempted=false;
  try {
    let first='';
    for(const [name,blob] of files) {const path=unwrapAgentResponse(await fetchUpload({file:new File([blob],name,{type:'application/zip'}),biz}));uploaded.push(path);if(name===manifest.firstPackageName)first=path;}
    const source=manifest.sourceSceneInfo||{};
    const importedId=crypto.randomUUID().replaceAll('-','');
    const name=validName(args.name||source.sceneName||'Imported project');
    createAttempted=true;
    const scene=unwrapAgentResponse(await fetchAddScene({...defaultProjectInfo().sceneInfo,id:importedId,sceneName:name,sceneIntroduction:source.sceneIntroduction||'',sceneVersion:1,projectType:0,hasDrawing:source.hasDrawing?1:0,zip:first,coverPicture:'',exampleSceneId:''}));
    committed=true;
    return {scene,importedPackages:files.size,...(args.open?await openProject(scene.id,args):{})};
  } catch(error:any) {
    // A lost create response may already have committed. Preserve its files;
    // deleting them would silently corrupt the newly created project.
    if(committed||createAttempted){if(!committed)Object.assign(error,{outcome:'unknown'});throw error;}
    const failures:string[]=[];
    for(const path of uploaded) {const result=await request.get('/common/deleteFile',{params:{fileUrl:path}});if(result.error)failures.push(path);}
    if(failures.length)error.message+=`; cleanup failed for temporary files: ${failures.join(', ')}`;
    throw error;
  }
}
