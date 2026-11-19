import { App } from '@astral3d/engine';
import { request } from '@/http/request';
import { fetchGetAssetsList, fetchAddAsset, fetchUpdateAsset, fetchRemoveAsset } from '@/http/api/assetsInfo';
import { fetchUpload } from '@/http/api/sys';
import { BUILTIN_PREFAB_RESOURCES } from '@/views/editor/components/extraPane/resource/builtin/prefabRegistry';
import { agentSourceFile, fetchAgentFile } from './agentFiles';
import { unwrapAgentResponse } from './agentProjects';
import { agentModelJobs } from './agentImports';
import { getServiceStaticFile } from '@/utils/common/file';

const supportedTypes=['Model','Material','Texture','Billboard','HDR','Tiles'];
export const agentAssetsHelp={
  list:{action:'list',type:supportedTypes,offset:0,limit:50},get:{action:'get',id:'asset ID'},
  builtin:{action:'builtin'},resources:{action:'resources',note:'Returns live scene material and texture UUIDs'},
  prepare:{action:'prepare',id:'asset ID',jobId:'optional unique ID',note:'Models return detached import jobs; other assets return URLs'},
  publish:{action:'publish',source:'{artifactId} or {url,name}',type:supportedTypes,name:'display name',category:'existing category ID',tags:'optional comma-separated string',thumbnail:'optional persistent image URL'},
  publishFiles:{action:'publish-files',artifactId:'uploaded bundle ID',note:'Persists relative paths for Tiles/HTML and returns entryUrl/baseUrl/files. Use persistent URLs for resources that remain URL-based when saved.'},
  update:{action:'update',id:'asset ID',values:'name/category/tags/thumbnail patch'},delete:{action:'delete',id:'asset ID',confirmAssetId:'must equal id'},
  convert:{action:'convert',kind:'cad | bim',source:'{artifactId} or {url,name}',options:'existing Revit converter options; BIM requires the external converter'},
  conversions:{action:'conversions',kind:'cad | bim',offset:0,limit:50},conversionStatus:{action:'conversion-status',kind:'cad | bim',id:'conversion ID'},
};
const page=(args:any)=>({offset:args.offset||0,limit:Math.min(args.limit||50,100),sortby:'createTime',order:'desc' as const});
function id(value:any) {if(!/^[a-zA-Z0-9_-]+$/.test(String(value)))throw new Error('Invalid resource id');return String(value);}
export async function agentAssets(args:any):Promise<any> {
  switch(args.action) {
    case 'builtin': return {prefabs:BUILTIN_PREFAB_RESOURCES};
    case 'resources': return {
      materials:Object.values(App.materials).map(m=>({uuid:m.uuid,name:m.name,type:m.type})),
      textures:Object.values(App.textures).map(t=>({uuid:t.uuid,name:t.name,type:t.type,mapping:t.mapping})),
    };
    case 'list': {
      if(args.type&&!supportedTypes.includes(args.type))throw new Error('Invalid asset type');
      return unwrapAgentResponse(await fetchGetAssetsList({...page(args),...(args.type?{query:`type:${args.type}`}:{})}));
    }
    case 'get': return unwrapAgentResponse(await request.get(`/assets/assetsInfo/${id(args.id)}`));
    case 'prepare': {
      const asset:any=unwrapAgentResponse(await request.get(`/assets/assetsInfo/${id(args.id)}`));
      if(asset.type!=='Model')return {asset,url:getServiceStaticFile(asset.file)+(asset.type==='Tiles'&&!asset.file.endsWith('.json')?'/tileset.json':''),next:'Use the URL in texture/material/background/billboard/tiles operations as appropriate'};
      return agentModelJobs.start(args.jobId||crypto.randomUUID(),{type:asset.file.endsWith('.h3dprefab.zip')?'prefab':'url',url:getServiceStaticFile(asset.file),name:asset.file.split('/').pop()});
    }
    case 'publish': {
      if(!supportedTypes.includes(args.type))throw new Error('Asset type must be Model/Material/Texture/Billboard/HDR/Tiles');
      if(typeof args.name!=='string'||!args.name.trim()||!args.category)throw new Error('Asset requires name and category');
      const file=await agentSourceFile(args.source);
      const uploaded=unwrapAgentResponse(await fetchUpload({file,biz:`upload/agent-assets/${crypto.randomUUID()}`,type:args.type}));
      const asset={name:args.name,type:args.type,category:args.category,thumbnail:args.thumbnail||'',file:uploaded,size:file.size,tags:args.tags||''};
      try {
        return unwrapAgentResponse(await fetchAddAsset(asset));
      } catch (error) {
        // The insert can commit after the client times out. Its unique upload path
        // identifies this publication even when the response containing its ID was lost.
        const lookup = await request.get<IAssets.Item[]>('/assets/assetsInfo/list', {params:{file:uploaded}}).catch(() => null);
        const published = lookup?.data?.find(item => item.file === uploaded);
        if (published) return published;
        throw Object.assign(new Error(`Asset publication is unconfirmed. Uploaded file retained: ${uploaded}`, {cause:error}), {outcome:'unknown'});
      }
    }
    case 'publish-files': {
      // Keep relative bundle paths for Tiles, HTML and their dependent resources.
      const artifact=await fetchAgentFile(`/agent/artifacts/${encodeURIComponent(args.artifactId||args.source?.artifactId||'')}`).then(r=>r.json());
      const base=`upload/3DEditor/resources/${crypto.randomUUID()}`,uploaded:string[]=[];
      try {
        for(const item of artifact.files) {
          const parts=item.path.split('/');
          if(parts.some(part=>!part||part==='.'||part==='..'||/[\\:*?"<>|\x00-\x1f]/.test(part)))throw new Error('Invalid resource bundle path');
          const name=parts.pop();const response=await fetchAgentFile(item.url);
          const path=unwrapAgentResponse<string>(await fetchUpload({file:new File([await response.blob()],name,{type:item.mimeType}),biz:[base,...parts].join('/')}));uploaded.push(path);
        }
        return {entryUrl:getServiceStaticFile(`${base}/${artifact.entryPath}`),baseUrl:getServiceStaticFile(base)+'/',files:artifact.files.map(item=>({path:item.path,url:getServiceStaticFile(`${base}/${item.path}`)})),persistent:true};
      } catch(error:any) {
        for(const fileUrl of uploaded){const result=await request.get('/common/deleteFile',{params:{fileUrl}});if(result.error)error.message+=`; cleanup failed: ${fileUrl}`;}
        throw error;
      }
    }
    case 'update': {
      const current:any=unwrapAgentResponse(await request.get(`/assets/assetsInfo/${id(args.id)}`));
      const patch:any={};for(const key of ['name','category','tags','thumbnail'])if(args.values?.[key]!==undefined)patch[key]=args.values[key];
      return unwrapAgentResponse(await fetchUpdateAsset({...current,...patch}));
    }
    case 'delete': {
      if(String(args.confirmAssetId)!==id(args.id))throw new Error('Deleting an asset requires confirmAssetId equal to id');
      const result=await fetchRemoveAsset(args.id);if(result.error)throw new Error(result.error.message);return {deletedAssetId:args.id};
    }
    case 'conversions': case 'conversion-status': {
      const kind=args.kind;if(!['cad','bim'].includes(kind))throw new Error('kind must be cad or bim');
      const data:any=unwrapAgentResponse(await request.get(`/editor3d/${kind==='cad'?'cad':'bim2gltf'}/getAll`,{params:{...page(args),...(args.id?{query:`id:${id(args.id)}`}:{})}}));
      return {...data,items:(data.items||[]).map(item=>({...item,state:item.conversionStatus===1?'ready':item.conversionStatus===2?'failed':'processing',url:item.converterFilePath||item.gltfFilePath?getServiceStaticFile(item.converterFilePath||item.gltfFilePath):null}))};
    }
    case 'convert': {
      if(!['cad','bim'].includes(args.kind))throw new Error('kind must be cad or bim');
      if(args.kind==='bim') {
        const status:any=unwrapAgentResponse(await request.get('/editor3d/bim2gltf/status'));
        if(!status.available)throw Object.assign(new Error('Revit conversion service is unavailable'),{code:'DEPENDENCY_UNAVAILABLE'});
      }
      const file=await agentSourceFile(args.source);
      const {useWebsocketStore}=await import('@/store/modules/websocket');const uname=useWebsocketStore().uname;
      if(args.kind==='cad') {
        return unwrapAgentResponse(await request.post('/editor3d/cad/dwg2dxf',{file,fileName:file.name,conversionStatus:0},{params:{uname},headers:{'Content-Type':'multipart/form-data'}}));
      }
      const path=unwrapAgentResponse(await request.post('/editor3d/bim2gltf/uploadRvt',{file},{headers:{'Content-Type':'multipart/form-data'}}));
      return unwrapAgentResponse(await request.post('/editor3d/bim2gltf/addAndConversion',{bimFilePath:path,bimFileSize:file.size,fileName:file.name,fileSourceIp:'',thumbnail:'',conversionStatus:0,options:args.options||{}},{params:{uname}}));
    }
    default:throw new Error('Asset action must be builtin/resources/list/get/prepare/publish/publish-files/update/delete/conversions/conversion-status/convert');
  }
}
