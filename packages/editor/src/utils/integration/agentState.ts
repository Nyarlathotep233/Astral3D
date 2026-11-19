import { reactive } from 'vue';
import { App, Hooks } from '@astral3d/engine';

export const agentState = reactive({
  sessionId: '', documentEpoch: crypto.randomUUID(), sceneId: '', revision: 0,
  sceneState: 'inactive', connection: 'disabled', error: '', title: '',
  dirty: false, busy: false, recoveryRequired: false,
});
let installed = false;
let documentController = new AbortController();
export function currentDocumentSignal() { return documentController.signal; }
let changed = () => {};
export function onAgentStateChanged(callback:()=>void) { changed = callback; }
export function announceAgentState() { changed(); }
export function agentStatus() {
  return { ...agentState, sceneId: agentState.sceneId || null,
    sceneVersion: agentState.sceneState === 'ready' ? App.project.getKey('sceneInfo.sceneVersion') : null,
    history: {undo: App.history.undos.slice(-20).map(c=>({batchId:c.id,label:c.name})), redo:App.history.redos.slice(-20).map(c=>({batchId:c.id,label:c.name}))},
  };
}
export function setAgentSceneState(state:string, sceneId?:string) {
  if (!installed) {
    installed = true;
    for (const name of ['historyChanged', 'objectChanged', 'materialChanged', 'scriptChanged', 'sceneGraphChanged',
      'sceneBackgroundChanged','sceneEnvironmentChanged','rendererUpdated','effectEnabledChange','effectPassConfigChange',
      'sceneFogSettingsChanged','sceneRainSettingsChanged','sceneSnowSettingsChanged']) {
      Hooks.useAddSignal(name as any, () => {
        if (!agentState.busy && agentState.sceneState === 'ready') {
          agentState.revision++; agentState.dirty = true; changed();
        }
      });
    }
  }
  if (state === 'loading' || state === 'inactive') {
    documentController.abort();
    documentController = new AbortController();
    agentState.documentEpoch = crypto.randomUUID(); agentState.revision = 0;
    agentState.dirty = false; agentState.recoveryRequired = false;
  }
  agentState.sceneState = state;
  if (sceneId !== undefined) agentState.sceneId = sceneId;
  if (state === 'inactive') agentState.sceneId = '';
  if (state === 'ready') agentState.title = App.project.getKey('sceneInfo.sceneName');
  changed();
}
