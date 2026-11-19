import { App } from '@astral3d/engine';
import { createSceneExport, EXPORT_FORMATS } from '@/utils/common/sceneExport';
import { fetchAgentFile, publishAgentFile } from './agentFiles';

export const agentExportHelp={formats:EXPORT_FORMATS,format:'required',objectUuid:'optional target; defaults to full scene',target:'alternative {uuid}',name:'optional filename stem',preservation:'project-json/project-zip/standalone/prefab preserve H3D scripts and custom materials. Standard interchange formats preserve only capabilities supported by that format; use GLB/GLTF for mesh animation.'};
export async function agentExport(args:any):Promise<any> {
  const uuid=args.objectUuid||args.target?.uuid;
  const object=uuid?App.scene.getObjectByProperty('uuid',uuid):undefined;
  if(uuid&&!object)throw new Error(`Export object not found: ${uuid}`);
  const result=await createSceneExport({format:args.format,name:args.name,object,fetchResource:fetchAgentFile});
  return publishAgentFile(result);
}
