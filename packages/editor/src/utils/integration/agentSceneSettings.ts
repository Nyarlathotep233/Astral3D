import { THREE } from '@astral3d/engine';
import { App, Hooks, Utils } from '@astral3d/engine';
import { readGridVisible, readHelpersVisible, setGridVisible, setHelpersVisible } from '@/hooks/useSceneVisibility';
import { copyAgentValue, mergeAgentValue } from './agentObjects';
import type { AgentEditContext, AgentOperation } from './agentTypes';

const sections = ['renderer','csm','effect','weather','drawing','xr'];
export const agentSceneSettingsHelp = {
  config:{type:'scene-config',section:sections,values:'partial nested patch matching scene_settings.project current keys/types; xr uses boolean'},
  background:{type:'background',mode:'none|color|texture|equirectangular',color:'#rrggbb',textureUuid:'registered texture',intensity:'number',blurriness:'number',rotation:'radians'},
  environment:{type:'environment',mode:'none|background|texture|equirectangular|modelviewer',textureUuid:'registered texture',intensity:'number',rotation:'radians'},
  properties:{type:'scene-properties',values:'{name,backgroundIntensity,backgroundBlurriness,environmentIntensity}'},
  view:{type:'view',select:'{uuid}|{ref}|null',focus:'{uuid}|{ref}',camera:'{uuid}|{ref}',shading:'default|wireframe|solid|normals|realistic',position:'[x,y,z]',lookAt:'[x,y,z]',grid:'boolean',helpers:'boolean'},
};
function notify() { Hooks.useDispatchSignal('sceneGraphChanged'); window.viewer?.render(); }
function texture(uuid: string) {
  let value = App.textures[uuid];
  if (!value) for (const material of Object.values(App.materials)) for (const item of Object.values(material)) if (item?.isTexture && item.uuid===uuid) value=item;
  if (!value) throw new Error(`Texture not found: ${uuid}; upload/prepare the texture first`);
  return value;
}
function validatePatch(base:any,patch:any,path='') {
  if(!patch || typeof patch!=='object'||Array.isArray(patch))throw new Error(`${path} requires an object patch`);
  for(const[key,value]of Object.entries(patch)) {
    if(['__proto__','prototype','constructor'].includes(key)||!Object.hasOwn(base,key))throw new Error(`Unknown scene setting: ${path}${key}`);
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`${path}${key} must be finite`);
    if(value&&typeof value==='object'&&!Array.isArray(value)&&base[key]&&typeof base[key]==='object'&&!Array.isArray(base[key]))validatePatch(base[key],value,`${path}${key}.`);
    else if(base[key]!==null&&typeof base[key]!==typeof value)throw new Error(`Invalid scene setting type: ${path}${key}`);
  }
}
/** Persisted renderer/weather/effect changes are reversible and share Project.setKey with GUI. */
export function prepareSceneSettingsOperation(op:AgentOperation,ctx:AgentEditContext):boolean {
  if(op.type==='scene-config') {
    if(!sections.includes(op.section))throw new Error(`section must be one of ${sections.join(', ')}`);
    ctx.steps.push(()=>{
      const before=copyAgentValue(App.project.getKey(op.section));
      if(op.section!=='drawing'&&op.section!=='xr')validatePatch(before,op.values,`${op.section}.`);
      const after=typeof before==='object'?mergeAgentValue(before,op.values):op.values;
      if(op.section==='xr'&&typeof after!=='boolean')throw new Error('xr requires a boolean value');
      const apply=(value:any)=>{App.project.setKey(op.section,copyAgentValue(value));notify();};
      return{execute(){apply(after);},undo(){apply(before);}};
    });return true;
  }
  if(op.type==='background'||op.type==='environment') {
    ctx.steps.push(()=>{
      const scene=App.scene;
      const signals=window.viewer?.modules.registerSignal as unknown as {useBackgroundAsEnvironment:boolean}|undefined;
      const useBackgroundAsEnvironment=signals?.useBackgroundAsEnvironment;
      const before={background:scene.background,environment:scene.environment,backgroundIntensity:scene.backgroundIntensity,backgroundBlurriness:scene.backgroundBlurriness,backgroundRotation:scene.backgroundRotation.clone(),environmentIntensity:scene.environmentIntensity,environmentRotation:scene.environmentRotation.clone()};
      const mode=op.mode||(op.color?'color':op.textureUuid?'texture':'none');
      const resource=op.textureUuid?texture(op.textureUuid):null;
      const mapping=resource?.mapping;
      const apply=()=>{
        if(op.type==='background') {
          if(!['none','color','texture','equirectangular'].includes(mode))throw new Error('Unknown background mode');
          const intensity=op.intensity??scene.backgroundIntensity,blur=op.blurriness??scene.backgroundBlurriness,rotation=op.rotation??scene.backgroundRotation.y;
          if(![intensity,blur,rotation].every(Number.isFinite))throw new Error('Background values must be finite');
          Hooks.useDispatchSignal('sceneBackgroundChanged',mode==='none'?'':mode==='color'?'Color':mode==='texture'?'Texture':'Equirectangular',op.color||'#000000',resource,resource,blur,intensity,rotation*THREE.MathUtils.RAD2DEG);
        } else {
          if(!['none','background','texture','equirectangular','modelviewer'].includes(mode))throw new Error('Unknown environment mode');
          if(mode==='background'&&!(scene.background as any)?.isTexture)throw new Error('Environment background requires a texture background');
          Hooks.useDispatchSignal('sceneEnvironmentChanged',mode==='none'?'':mode==='background'?'Background':mode==='modelviewer'?'ModelViewer':'Equirectangular',resource);
          if(op.intensity!==undefined){if(!Number.isFinite(op.intensity))throw new Error('Environment intensity must be finite');scene.environmentIntensity=op.intensity;}
          if(op.rotation!==undefined){if(!Number.isFinite(op.rotation))throw new Error('Environment rotation must be finite');scene.environmentRotation.y=op.rotation;}
        }
        notify();
      };
      return{execute:apply,undo(){
        // Reset Signals' environment coupling before restoring the exact prior references.
        Hooks.useDispatchSignal('sceneEnvironmentChanged','',null);
        scene.background=before.background;scene.environment=before.environment;
        scene.backgroundIntensity=before.backgroundIntensity;scene.backgroundBlurriness=before.backgroundBlurriness;
        scene.backgroundRotation.copy(before.backgroundRotation);scene.environmentRotation.copy(before.environmentRotation);scene.environmentIntensity=before.environmentIntensity;
        if(signals&&useBackgroundAsEnvironment!==undefined)signals.useBackgroundAsEnvironment=useBackgroundAsEnvironment;
        if(resource&&mapping!==undefined)resource.mapping=mapping;
        window.viewer?.updatePTBackground();window.viewer?.updatePTEnvironment();notify();
      }};
    });return true;
  }
  if(op.type==='scene-properties') {
    const allowed=['name','backgroundIntensity','backgroundBlurriness','environmentIntensity'];
    ctx.steps.push(()=>{const old={};for(const[key,value]of Object.entries(op.values||{})){if(!allowed.includes(key))throw new Error(`Unsupported scene property: ${key}`);if(typeof value!==typeof App.scene[key]||typeof value==='number'&&!Number.isFinite(value))throw new Error(`Invalid scene property: ${key}`);old[key]=App.scene[key];}const apply=(values:any)=>{Object.assign(App.scene,values);notify();};return{execute(){apply(op.values);},undo(){apply(old);}};});return true;
  }
  if(op.type==='view') {
    ctx.steps.push(()=>{
      const controls=window.viewer.modules.controls;
      const before={selection:App.selected,camera:App.viewportCamera,shading:App.viewportShading,position:window.viewer.camera.position.clone(),quaternion:window.viewer.camera.quaternion.clone(),controls:controls.toJSON(),grid:readGridVisible(),helpers:readHelpersVisible()};
      return{execute(){
        if(op.select!==undefined)op.select===null?App.deselect():App.select(ctx.resolve(op.select));
        if(op.focus)Utils.focusObject(ctx.resolve(op.focus),window.viewer.modules.controls, false);
        if(op.camera){const camera=ctx.resolve(op.camera);if(!(camera as any).isCamera)throw new Error('View camera target must be a camera');App.setViewportCamera(camera.uuid);}
        if(op.shading){if(!['default','wireframe','solid','normals','realistic'].includes(op.shading))throw new Error('Unsupported view shading');App.setViewportShading(op.shading);}
        if(op.position){if(!Array.isArray(op.position)||op.position.length!==3||!op.position.every(Number.isFinite))throw new Error('View position needs three finite components');void controls.setPosition(op.position[0],op.position[1],op.position[2],false);controls.update(0);}
        if(op.lookAt){if(!Array.isArray(op.lookAt)||op.lookAt.length!==3||!op.lookAt.every(Number.isFinite))throw new Error('lookAt needs three finite components');void controls.setTarget(op.lookAt[0],op.lookAt[1],op.lookAt[2],false);controls.update(0);}
        if(op.grid!==undefined)setGridVisible(!!op.grid);if(op.helpers!==undefined)setHelpersVisible(!!op.helpers);notify();
      },undo(){App.setViewportCamera(before.camera.uuid);App.setViewportShading(before.shading);controls.fromJSON(before.controls,false);controls.update(0);window.viewer.camera.position.copy(before.position);window.viewer.camera.quaternion.copy(before.quaternion);before.selection?App.select(before.selection):App.deselect();setGridVisible(before.grid);setHelpersVisible(before.helpers);notify();}};
    });return true;
  }
  return false;
}

export function describeSceneSettings() {
  const scene=App.scene;
  return{project:Object.fromEntries(sections.map(key=>[key,copyAgentValue(App.project.getKey(key))])),background:(scene.background as THREE.Color)?.isColor?{color:(scene.background as THREE.Color).getHexString()}:{textureUuid:(scene.background as THREE.Texture)?.uuid||null},environment:{textureUuid:scene.environment?.uuid||null,intensity:scene.environmentIntensity},backgroundIntensity:scene.backgroundIntensity,backgroundBlurriness:scene.backgroundBlurriness,backgroundRotation:scene.backgroundRotation.toArray(),environmentRotation:scene.environmentRotation.toArray()};
}
