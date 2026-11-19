import { THREE } from '@astral3d/engine';
import { App, Hooks } from '@astral3d/engine';
import type { AgentEditContext, AgentOperation } from './agentTypes';

const trackClasses:Record<string,any>={number:THREE.NumberKeyframeTrack,vector:THREE.VectorKeyframeTrack,quaternion:THREE.QuaternionKeyframeTrack,color:THREE.ColorKeyframeTrack,boolean:THREE.BooleanKeyframeTrack,string:THREE.StringKeyframeTrack};
const widths:Record<string,number>={number:1,vector:3,quaternion:4,color:3,boolean:1,string:1};
export const agentAnimationHelp = {
  operation:{type:'animation',target:'{uuid}|{ref}',action:'create|remove|replace|track-set|track-remove|keyframes|play|pause|stop|seek|configure',clipId:'required except create, or use clipName',name:'new/updated clip name',duration:'seconds; -1 derives from tracks',tracks:'track descriptors for create/replace',track:'descriptor for track-set',trackName:'for track-remove/keyframes',times:'keyframes replacement',values:'keyframes replacement; configure uses {timeScale,weight,enabled,clampWhenFinished,loop,repetitions}',time:'seek seconds',paused:'pause boolean'},
  track:{name:'Three binding, e.g. .position or object-uuid.position',type:'number|vector|quaternion|color|boolean|string',times:'strictly increasing nonnegative seconds',values:'flattened values; width number/boolean/string=1, vector/color=3, quaternion=4',interpolation:'linear|discrete|smooth'},
  example:{type:'animation',target:{ref:'arm'},action:'create',name:'swing',tracks:[{name:'.rotation[y]',type:'number',times:[0,1,2],values:[-0.5,0.5,-0.5]}]},
};
export function createAgentTrack(spec:any):THREE.KeyframeTrack {
  const Class=trackClasses[spec.type];if(!Class)throw new Error('Track type must be number/vector/quaternion/color/boolean/string');
  if(typeof spec.name!=='string'||!spec.name)throw new Error('Track requires an object UUID/property binding name');
  const times=spec.times,values=spec.values;
  if(!Array.isArray(times)||!times.length||times.some((v,i)=>!Number.isFinite(v)||v<0||i>0&&v<=times[i-1]))throw new Error('Keyframe times must be finite, nonnegative and strictly increasing');
  if(!Array.isArray(values)||values.length!==times.length*widths[spec.type])throw new Error('Keyframe value count does not match track type and times');
  if(values.some(v=>spec.type==='boolean'?typeof v!=='boolean':spec.type==='string'?typeof v!=='string':!Number.isFinite(v)))throw new Error('Invalid keyframe values');
  const interpolation={linear:THREE.InterpolateLinear,discrete:THREE.InterpolateDiscrete,smooth:THREE.InterpolateSmooth}[spec.interpolation||(['boolean','string'].includes(spec.type)?'discrete':'linear')];
  if(!interpolation)throw new Error('Unknown interpolation');
  const track=new Class(spec.name,times,values,interpolation);
  if(!track.validate())throw new Error('Invalid animation track');
  return track;
}
function copyClip(clip:THREE.AnimationClip) { const copy=clip.clone();(copy as any).uuid=clip.uuid;return copy; }
function clips(object:THREE.Object3D) { return object.animations.map((v:any)=>v.getClip?v.getClip():v) as THREE.AnimationClip[]; }
function states(object:THREE.Object3D) {
  return new Map(object.animations.filter((v:any)=>v.getClip).map((a:any)=>[a.getClip().uuid,{running:a.isScheduled(),paused:a.paused,enabled:a.enabled,time:a.time,timeScale:a.timeScale,weight:a.weight,loop:a.loop,repetitions:a.repetitions,clampWhenFinished:a.clampWhenFinished}]));
}
function pose(object:THREE.Object3D) { const result:any[]=[];object.traverse((o:any)=>result.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone(),o.morphTargetInfluences?.slice()]));return result; }
function restorePose(snapshot:any[]) { for(const[o,p,q,s,m]of snapshot){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);if(m)o.morphTargetInfluences=m.slice();o.updateMatrix();} }
function notify(object:THREE.Object3D) { Hooks.useDispatchSignal('objectChanged',object);Hooks.useDispatchSignal('objectSelected',App.selected);Hooks.useDispatchSignal('sceneGraphChanged'); }
function installClips(object:THREE.Object3D,list:THREE.AnimationClip[],playback:Map<string,any>) {
  let mixer=App.animationManager.mixerMap.get(object.uuid);
  if(mixer){mixer.stopAllAction();mixer.uncacheRoot(object);}
  for(const clip of clips(object))App.animationManager.actionMap.delete(clip.uuid);
  object.animations=list.map(copyClip);App.clipAction(object);
  mixer=App.animationManager.mixerMap.get(object.uuid);
  for(const action of object.animations as any[]) {
    const state=playback.get(action.getClip().uuid);if(!state)continue;
    Object.assign(action,{paused:state.paused,enabled:state.enabled,time:state.time,timeScale:state.timeScale,weight:state.weight,loop:state.loop,repetitions:state.repetitions,clampWhenFinished:state.clampWhenFinished});
    if(state.running)action.play();
  }
  mixer?.update(0);notify(object);
}
export function prepareAnimationOperation(op:AgentOperation,ctx:AgentEditContext):boolean {
  if(op.type!=='animation')return false;
  const object=ctx.resolve(op.target);
  ctx.steps.push(()=>{
    const existing=clips(object),before=existing.map(copyClip),playback=states(object),beforePose=pose(object);
    const index=op.clipId?existing.findIndex(clip=>clip.uuid===op.clipId):op.clipName?existing.findIndex(clip=>clip.name===op.clipName):-1;
    if(op.action!=='create'&&index<0)throw new Error('Animation clip not found; query animations for its clipId');
    if(['play','pause','stop','seek','configure'].includes(op.action)) {
      const action=App.animationManager.actionMap.get(existing[index].uuid)!;
      if(!action)throw new Error('Animation action unavailable');
      const beforeState={time:action.time,paused:action.paused,enabled:action.enabled,timeScale:action.timeScale,weight:action.weight,loop:action.loop,repetitions:action.repetitions,clampWhenFinished:action.clampWhenFinished,running:action.isScheduled()};
      return{execute(){
        if(op.action==='play'){action.play();action.paused=false;}
        if(op.action==='pause')action.paused=op.paused??true;
        if(op.action==='stop')action.stop();
        if(op.action==='seek'){if(!Number.isFinite(op.time)||op.time<0)throw new Error('Animation time must be nonnegative seconds');action.play();action.paused=true;action.time=op.time;}
        if(op.action==='configure')for(const[key,value]of Object.entries(op.values||{})){
          if(!['timeScale','weight','enabled','clampWhenFinished','loop','repetitions'].includes(key))throw new Error(`Unsupported animation property: ${key}`);
          if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`${key} must be finite`);action[key]=value;
        }
        action.getMixer().update(0);notify(object);
      },undo(){action.stop();Object.assign(action,beforeState);if(beforeState.running)action.play();action.getMixer().update(0);restorePose(beforePose);notify(object);}};
    }
    const after=before.map(copyClip);
    if(op.action==='create') {
      const clip=new THREE.AnimationClip(op.name||'Animation',op.duration??-1,(op.tracks||[]).map(createAgentTrack),op.blendMode??THREE.NormalAnimationBlendMode);
      if(op.clipId){if(existing.some(c=>c.uuid===op.clipId))throw new Error('Animation clipId already exists');(clip as any).uuid=op.clipId;}
      after.push(clip);
    } else if(op.action==='remove')after.splice(index,1);
    else if(op.action==='replace') {
      const old=after[index];after[index]=new THREE.AnimationClip(op.name??old.name,op.duration??-1,(op.tracks||[]).map(createAgentTrack),op.blendMode??old.blendMode);(after[index] as any).uuid=old.uuid;
    } else if(['track-set','track-remove','keyframes'].includes(op.action)) {
      const clip=after[index];const name=op.track?.name||op.trackName;
      const at=clip.tracks.findIndex(track=>track.name===name);
      if(op.action==='track-remove'){if(at<0)throw new Error('Track not found');clip.tracks.splice(at,1);}
      else {
        let spec=op.track;
        if(op.action==='keyframes') {
          if(at<0)throw new Error('Track not found');const old=clip.tracks[at];
          spec={name:old.name,type:old.ValueTypeName,times:op.times,values:op.values,interpolation:op.interpolation};
        }
        const next=createAgentTrack(spec);if(at<0)clip.tracks.push(next);else clip.tracks[at]=next;
      }
      clip.resetDuration();
    } else throw new Error('Unknown animation action');
    return{execute(){installClips(object,after,playback);},undo(){installClips(object,before,playback);restorePose(beforePose);notify(object);}};
  });return true;
}
export function describeAnimations(object:THREE.Object3D) {
  return clips(object).map(clip=>({clipId:clip.uuid,name:clip.name,duration:clip.duration,blendMode:clip.blendMode,tracks:clip.tracks.map(track=>({name:track.name,type:track.ValueTypeName,times:Array.from(track.times),values:Array.from(track.values),interpolation:track.getInterpolation()})),state:states(object).get(clip.uuid)||null}));
}
