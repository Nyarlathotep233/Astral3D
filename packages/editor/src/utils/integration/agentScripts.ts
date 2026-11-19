import { App, Hooks, Script, AtomicBatchCommand } from '@astral3d/engine';
import type { AgentEditContext, AgentOperation, EditStep } from './agentTypes';
import { recordAgentDiagnostic } from './agentDiagnostics';

const EVENTS = ['loaded', 'beforeAnimation', 'afterAnimation', 'beforeRender', 'afterRender',
  'beforeDestroy', 'afterDestroy', 'onPick', 'onDoubleClick', 'onKeyDown', 'onKeyUp',
  'onPointerDown', 'onPointerUp', 'onPointerMove', 'onTouchStart', 'onTouchEnd'];
const CONTEXT = ['THREE', 'helper', 'scriptParams', 'renderer', 'scene', 'camera', 'controls', 'timer', 'render'];

export function validateAgentScript(source: unknown, objectUuid?: string, scriptName?: string) {
  if (typeof source !== 'string') throw new Error('Script source must be a string');
  if (source.length > 1024 * 1024) throw new Error('Script source exceeds 1 MiB');
  try {
    // Compile without invocation: top-level statements must never run during editing.
    new Function(...CONTEXT, ...EVENTS, `${source}\nreturn {};`);
    const parsed = Script.parseScriptParamsDeclaration(source);
    if (parsed.error) throw new Error(parsed.error);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordAgentDiagnostic({ kind: 'script', severity: 'error', phase: 'validate', message, objectUuid, scriptName, sceneId: String(App.project.getKey('sceneInfo.id') || '') });
    throw new Error(`Script ${scriptName || ''} validation failed: ${message}`);
  }
}

function jsonCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function validName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error('Script name must contain 1–256 characters');
  return value;
}

export function prepareScriptOperation(op: AgentOperation, ctx: AgentEditContext): boolean {
  if (!['script-add', 'script-update', 'script-remove'].includes(op.type)) return false;
  const object = ctx.resolve(op.target);
  const name = validName(op.name);
  if (op.type === 'script-add' || op.source !== undefined) validateAgentScript(op.source, object.uuid, name);
  if (op.newName !== undefined) validName(op.newName);
  if (op.params !== undefined && (!op.params || typeof op.params !== 'object' || Array.isArray(op.params))) {
    throw new Error('Script params must be an object');
  }
  ctx.steps.push((): EditStep => {
    if (window.viewer.enableScript) throw new Error('Edit scripts in the authoring scene; stop its script runtime first');
    const oldList = App.scripts[object.uuid];
    const list = oldList || [];
    const index = list.findIndex((item: any) => item.name === name);
    const existing = list[index];
    if (op.type === 'script-add' && existing) throw new Error(`Script already exists: ${name}`);
    if (op.type !== 'script-add' && !existing) throw new Error(`Script not found: ${name}`);
    const nextName = op.newName || name;
    if (nextName !== name && list.some((item: any) => item.name === nextName)) throw new Error(`Script already exists: ${nextName}`);
    const before = existing ? jsonCopy(existing) : null;
    const candidate = op.type === 'script-add' ? { name, source: op.source, params: {} } : jsonCopy(existing);
    if (op.source !== undefined) candidate.source = op.source;
    candidate.name = nextName;
    if (op.type !== 'script-remove') {
      validateAgentScript(candidate.source, object.uuid, candidate.name);
      const synced = Script.syncScriptParamsFromSource(candidate);
      if (synced.error) throw new Error(synced.error);
      if (op.params !== undefined) {
        const declared = Script.parseScriptParamsDeclaration(candidate.source).fields;
        for (const [key, value] of Object.entries(op.params)) {
          const field = declared.find(item => item.key === key);
          if (!field) throw new Error(`Script parameter is not declared: ${key}`);
          if (field.type !== 'json' && typeof value !== field.type) throw new Error(`Script parameter ${key} must be ${field.type}`);
          if (field.type === 'number' && (!Number.isFinite(value) || (field.min !== undefined && (value as number) < field.min) || (field.max !== undefined && (value as number) > field.max))) throw new Error(`Script parameter ${key} is outside its numeric range`);
        }
        Object.assign(candidate.params ||= {}, jsonCopy(op.params));
      }
    }
    let applied = false;
    const notify = (event: string, script: any) => Hooks.useDispatchSignal(event as any, object, script);
    return {
      execute() {
        applied = true;
        App.scripts[object.uuid] = list;
        if (op.type === 'script-add') { list.push(candidate); notify('scriptAdded', candidate); }
        else if (op.type === 'script-remove') { list.splice(index, 1); notify('scriptRemoved', existing); }
        else {
          Object.keys(existing).forEach(key => delete existing[key]);
          Object.assign(existing, jsonCopy(candidate));
          Hooks.useDispatchSignal('scriptChanged', op.source !== undefined ? 'source' : op.newName ? 'name' : 'params', object, existing, before?.name);
        }
      },
      undo() {
        if (!applied) return;
        if (op.type === 'script-add') { const current = list.indexOf(candidate); if (current !== -1) list.splice(current, 1); }
        else if (op.type === 'script-remove') { if (!list.includes(existing)) list.splice(index, 0, existing); }
        else { Object.keys(existing).forEach(key => delete existing[key]); Object.assign(existing, jsonCopy(before)); }
        if (!oldList) delete App.scripts[object.uuid];
        if (op.type === 'script-add') notify('scriptRemoved', candidate);
        else if (op.type === 'script-remove') notify('scriptAdded', existing);
        else Hooks.useDispatchSignal('scriptChanged', 'source', object, existing, candidate.name);
        applied = false;
      },
    };
  });
  return true;
}

export function agentScriptHelp() {
  return { language: 'javascript', context: CONTEXT, thisBinding: 'The owning THREE.Object3D', events: EVENTS,
    documentationUrl: new URL(`${import.meta.env.BASE_URL}docs/editor-script.md`, window.location.origin).href,
    parameters: 'Declare a /* script-params { ... } */ JSON block; read values from scriptParams.',
    operations: {
      'script-add': { target: '{uuid}|{ref}', name: 'unique script name on this object', source: 'complete JavaScript source', params: 'optional declared parameter values' },
      'script-update': { target: '{uuid}|{ref}', name: 'existing script name', newName: 'optional rename', source: 'optional full replacement source', params: 'optional declared parameter patch' },
      'script-remove': { target: '{uuid}|{ref}', name: 'existing script name' },
    },
    example: { type: 'script-add', target: { ref: 'rotor' }, name: 'spin', source: '/* script-params {"speed":{"type":"number","default":0.5,"min":0,"max":10}} */\nfunction beforeAnimation(delta){ this.rotation.y += delta * scriptParams.speed; render(); }', params: { speed: 0.8 } },
    editingExecutesCode: false, execution: 'Use play start/restart to run a snapshot of the current unsaved scene.',
    persistence: 'Runtime changes stay in the preview. Build persistent scene elements with scene operations/import.',
    cancellation: 'Synchronous scripts run on the browser main thread. Stop cannot interrupt a blocked JavaScript loop. Recover the saved authoring snapshot after reopening the editor.' };
}

export function applyGuiScriptEdit(object: import('three').Object3D, name: string, source: string) {
  const steps: AgentEditContext['steps'] = [];
  prepareScriptOperation({ type: 'script-update', target: { uuid: object.uuid }, name, source }, {
    resolve: () => object, register: () => { throw new Error('No object registration in script edit'); }, steps, cleanup: [],
  });
  App.execute(new AtomicBatchCommand(steps, 'Edit script source'));
}
