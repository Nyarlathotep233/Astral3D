import * as THREE from 'three';
import { App, AtomicBatchCommand, BatchRecoveryError, ObjectRegistrationError, Hooks, SetPositionCommand, SetRotationCommand, SetScaleCommand, SetValueCommand } from '@astral3d/engine';
import { isSceneSaving } from '@/utils/common/saveSceneToService';
import { materialAt, materialStep, scriptStep } from './desktopEditSteps';
import { desktopModelJobs } from './desktopModels';

let revision = 0;
const results = new Map<string, { request: string; result?: any; error?: string }>();
let installed = false;
let indeterminate = false;

export function resetDesktopEdits() { results.clear(); revision++; indeterminate = false; }
export function installDesktopEditTracking() {
  if (installed) return;
  installed = true;
  for (const signal of ['historyChanged','objectAdded','objectRemoved','objectChanged','sceneGraphChanged','materialChanged','geometryChanged','scriptAdded','scriptChanged','scriptRemoved','sceneBackgroundChanged','sceneEnvironmentChanged','sceneFogSettingsChanged','rendererConfigUpdate']) {
    Hooks.useAddSignal(signal, () => { revision++; });
  }
}
export function desktopEditStatus() {
  const tip = (commands: any[]) => { const cmd = commands.at(-1); return cmd ? { id: cmd.id, name: cmd.name, batch: cmd.type === 'AtomicBatchCommand' } : null; };
  return { sceneRevision: revision, history: { undo: tip(App.history.undos), redo: tip(App.history.redos), persistent: false }, editRecoveryRequired: indeterminate };
}

// Add/remove must be idempotent inverses even when an object signal listener throws.
// Ordinary App commands remain unchanged; these steps are used only by atomic MCP batches.
function membership(object: THREE.Object3D, parent: THREE.Object3D, index: number, adding: boolean, preparedScripts?: ISceneJson['scripts']) {
  const scripts = new Map<THREE.Object3D, ISceneScript[]>();
  object.traverse(child => { const list=preparedScripts?.[child.uuid] || App.scripts[child.uuid]; if (list) scripts.set(child,list); });
  const assertStopped = () => { if (scripts.size && window.viewer.enableScript) throw new Error('Scripted object edits require the editor runtime to be stopped'); };
  let restoredFailure = false;
  const attach = () => {
    if (restoredFailure) { restoredFailure = false; return; }
    try { assertStopped(); } catch (error) { restoredFailure = true; throw error; }
    try { App.addObject(object, parent, index, true); }
    catch (error) {
      // Resource traversal already recovered without touching membership. Do not decrement
      // the whole subtree again when AtomicBatchCommand invokes this step's inverse.
      if (error instanceof ObjectRegistrationError || error instanceof BatchRecoveryError) restoredFailure = true;
      throw error;
    }
    for (const [child, list] of scripts) { App.scripts[child.uuid] = list; for (const script of list) Hooks.useDispatchSignal('scriptAdded', child, script); }
  };
  const detach = () => {
    if (restoredFailure) { restoredFailure = false; return; }
    try { assertStopped(); } catch (error) { restoredFailure = true; throw error; }
    try { if (object.parent) App.removeObject(object); }
    catch (error) { if (error instanceof ObjectRegistrationError || error instanceof BatchRecoveryError) restoredFailure = true; throw error; }
    for (const [child, list] of scripts) { delete App.scripts[child.uuid]; for (const script of list) Hooks.useDispatchSignal('scriptRemoved', child, script); }
  };
  return adding ? { execute: attach, undo: detach } : { execute: detach, undo: attach };
}

function prepare(operations: any[]) {
  const factories: Array<() => {execute():void;undo():void}> = [];
  const refs = new Map<string, THREE.Object3D>();
  const removed = new Set<string>();
  const created: THREE.Object3D[] = [];
  const imported = new Set<string>();
  const parentOf = new Map<THREE.Object3D, THREE.Object3D>();
  const resolve = (target: any): THREE.Object3D => {
    const object = target?.ref ? refs.get(target.ref) : App.scene.getObjectByProperty('uuid', target?.uuid);
    if (!object || object === App.scene || (object as any).ignore || removed.has(object.uuid)) throw new Error(`Object unavailable: ${target?.uuid || target?.ref}`);
    let parent = parentOf.get(object) || object.parent;
    while (parent) { if (removed.has(parent.uuid)) throw new Error('Target is inside a removed subtree'); parent = parentOf.get(parent) || parent.parent; }
    return object;
  };
  const transforms = (object: THREE.Object3D, op: any) => {
    if (op.position) factories.push(() => new SetPositionCommand(object, new THREE.Vector3(...op.position)));
    if (op.rotation || op.rotationOrder) factories.push(() => new SetRotationCommand(object, new THREE.Euler(...(op.rotation || [object.rotation.x,object.rotation.y,object.rotation.z]), op.rotationOrder || object.rotation.order), undefined));
    if (op.scale) factories.push(() => new SetScaleCommand(object, new THREE.Vector3(...op.scale), undefined));
  };
  try {
    for (const op of operations) {
      if(op.type==='insert-model') {
        if(refs.has(op.ref))throw new Error(`Duplicate local ref: ${op.ref}`);
        if(imported.has(op.jobId))throw new Error('A prepared model can only be inserted once');
        const prepared=desktopModelJobs.ready(op.jobId), object=prepared.object, parent=op.parent?resolve(op.parent):App.scene;
        imported.add(op.jobId); refs.set(op.ref,object); parentOf.set(object,parent);
        factories.push(()=>membership(object,parent,parent.children.length,true,prepared.scripts));
        if(op.name!==undefined)factories.push(()=>new SetValueCommand(object,'name',op.name));
        transforms(object,op);
      } else if (op.type === 'create') {
        if (refs.has(op.ref)) throw new Error(`Duplicate local ref: ${op.ref}`);
        const parent = op.parent ? resolve(op.parent) : App.scene;
        let object: THREE.Object3D;
        if (op.kind === 'group') object = new THREE.Group();
        else {
          const geometry = op.kind === 'box' ? new THREE.BoxGeometry() : op.kind === 'sphere' ? new THREE.SphereGeometry(0.5) : op.kind === 'plane' ? new THREE.PlaneGeometry() : null;
          if (!geometry) throw new Error('Unsupported primitive');
          object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
          object.castShadow = true; object.receiveShadow = true;
        }
        object.name = op.name; created.push(object); refs.set(op.ref, object); parentOf.set(object, parent);
        factories.push(() => membership(object, parent, parent.children.length, true));
        transforms(object, op);
      } else {
        const object = resolve(op.target);
        if (op.type === 'transform') transforms(object, op);
        else if (op.type === 'material') {
          const material = materialAt(object, op.slot);
          for (const key of Object.keys(op.values)) if ((material as any)[key] === undefined) throw new Error(`Material ${material.type} does not support ${key}`);
          factories.push(() => materialStep(object, op,
            value => {
              const old = materialAt(object, op.slot);
              if (old === value) return;
              App.setObjectMaterial(object, op.slot, value);
              App.removeMaterialFromRefCounter(old);
              App.addMaterialToRefCounter(value);
              Hooks.useDispatchSignal('materialRemoved'); Hooks.useDispatchSignal('materialAdded');
            },
            value => Hooks.useDispatchSignal('materialChanged', value)));
        } else if (op.type.startsWith('script-')) {
          if (window.viewer.enableScript) throw new Error('Script editing requires the editor runtime to be stopped');
          factories.push(() => scriptStep(App.scripts as any, object, op, Hooks.useDispatchSignal));
        }
        else if (op.type === 'attributes') {
          for (const key of ['name','visible','castShadow','receiveShadow']) if (op[key] !== undefined) factories.push(() => new SetValueCommand(object, key, op[key]));
        } else if (op.type === 'remove') {
          removed.add(object.uuid);
          factories.push(() => membership(object, object.parent!, object.parent!.children.indexOf(object), false));
        } else throw new Error(`Unsupported operation: ${op.type}`);
      }
    }
    return { factories, refs: Object.fromEntries([...refs].map(([ref, object]) => [ref, object.uuid])), created, imported };
  } catch (error) { disposeCreated(created); throw error; }
}

function disposeCreated(created: THREE.Object3D[]) {
  for (const object of created) {
    if (object.parent) continue;
    const mesh = object as THREE.Mesh;
    if (mesh.geometry && App.geometries[mesh.geometry.uuid] === mesh.geometry) delete App.geometries[mesh.geometry.uuid];
    mesh.geometry?.dispose();
    if (mesh.material && !Array.isArray(mesh.material)) mesh.material.dispose();
  }
}

export function applyDesktopEdit(method: string, args: any) {
  if (method === 'h3d_operation_status') {
    const item = results.get(args.operationId);
    return item ? { state: item.error ? 'failed' : 'completed', result: item.result, error: item.error } : { state: 'unknown' };
  }
  const request = JSON.stringify({ method, ...args });
  const previous = results.get(args.operationId);
  if (previous) {
    if (previous.request !== request) throw new Error('operationId already belongs to a different request');
    if (previous.error) throw new Error(previous.error);
    return previous.result;
  }
  if (indeterminate) throw new Error('A prior batch recovery failed; reload or inspect the scene before further MCP edits');
  if (isSceneSaving()) throw new Error('Scene save is in progress; wait for its result before editing');
  if (args.expectedRevision !== revision) throw new Error(`Scene revision conflict: expected ${args.expectedRevision}, actual ${revision}`);
  if (results.size >= 1000) throw new Error('Session operation ledger is full; start a new session after saving your work');
  const record: {request:string;result?:any;error?:string} = { request };
  results.set(args.operationId, record);
  const selection = App.selected;
  try {
    let refs: Record<string,string> = {};
    let batchId: number;
    if (method === 'h3d_scene_batch') {
      const prepared = prepare(args.operations);
      refs = prepared.refs;
      const command = new AtomicBatchCommand(prepared.factories, args.label);
      try { App.execute(command); } catch (error) { disposeCreated(prepared.created); throw error; }
      for(const id of prepared.imported)desktopModelJobs.consume(id);
      batchId = command.id;
    } else if (method === 'h3d_history') {
      const stack = args.action === 'undo' ? App.history.undos : App.history.redos;
      const top = stack.at(-1);
      if (top?.id !== args.batchId || top?.type !== 'AtomicBatchCommand') throw new Error('Requested batch is not at the history tip; human edits will not be undone');
      args.action === 'undo' ? App.undo() : App.redo();
      batchId = args.batchId;
    } else throw new Error('Unsupported edit tool');
    record.result = { operationId: args.operationId, batchId, refs, ...desktopEditStatus(), saved: false };
    return record.result;
  } catch (error) {
    if (error instanceof BatchRecoveryError) indeterminate = true;
    record.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (selection && App.scene.getObjectByProperty('uuid', selection.uuid)) App.select(selection);
    else App.deselect();
  }
}
