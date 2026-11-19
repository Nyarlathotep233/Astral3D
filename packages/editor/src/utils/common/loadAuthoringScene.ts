import {Package} from '@astral3d/engine';
import {agentState, currentDocumentSignal, setAgentSceneState} from '@/utils/integration/agentState';

/** A document replacement owns this epoch until completion, failure or route teardown. */
export async function replaceAuthoringScene(sceneId: string, epoch: string, load: (signal: AbortSignal) => Promise<boolean>) {
  if (agentState.sceneId !== sceneId || agentState.documentEpoch !== epoch || agentState.sceneState === 'loading') {
    throw new Error('当前项目已切换或仍在加载');
  }
  setAgentSceneState('loading', sceneId);
  const signal = currentDocumentSignal();
  try {
    const dirty = await load(signal);
    signal.throwIfAborted();
    agentState.dirty = dirty;
    setAgentSceneState('ready');
  } catch (error) {
    if (!signal.aborted) setAgentSceneState('failed');
    throw error;
  }
}

export async function loadAuthoringPackage(options: Parameters<Package['unpack']>[0], signal: AbortSignal) {
  signal.throwIfAborted();
  const loader = new Package(window.viewer);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      cancel = () => { loader.dispose(); reject(signal.reason); };
      signal.addEventListener('abort', cancel, {once:true});
      timer = setTimeout(() => reject(new Error('场景加载超时')), 180_000);
      loader.unpack({...options, onComplete:resolve, onError:reject});
    });
    signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
    if (cancel) signal.removeEventListener('abort', cancel);
    loader.dispose();
  }
}
