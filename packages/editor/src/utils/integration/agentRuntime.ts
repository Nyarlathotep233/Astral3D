import localforage from 'localforage';
import { App, Package, Hooks } from '@astral3d/engine';
import { PLAY_MESSAGE_TYPE, type PlayLoadMessage, type PlayPackageFile } from '../playMode';
import { agentState } from './agentState';
import { loadAuthoringPackage, replaceAuthoringScene } from '../common/loadAuthoringScene';
import { readAgentDiagnostics, recordAgentDiagnostic } from './agentDiagnostics';
import { queryObjects } from './agentReadModel';
import { sampleRuntimeSeries, type SampleOptions } from './agentRuntimeInspection';
export { agentScriptHelp } from './agentScripts';

export interface AgentPlayController {
  start(): Promise<void>;
  stop(): void;
  status(): { state: string; runId: string; error?: string; lastHeartbeat?: number };
  runtimeViewer(): typeof window.viewer | undefined;
}
let controller: AgentPlayController | undefined;
export function registerAgentPlayController(value: AgentPlayController) {
  controller = value;
  return () => { if (controller === value) controller = undefined; };
}

function runningPreview(expectedRunId?: string) {
  const status = controller?.status();
  if (expectedRunId && status?.runId !== expectedRunId) {
    throw Object.assign(new Error('The requested preview run has ended. Read the current Play status.'), { code: 'STALE_RUN' });
  }
  const viewer = controller?.runtimeViewer();
  if (status?.state !== 'running' || !viewer) {
    throw Object.assign(new Error(`Preview is ${status?.state ?? 'unavailable'}. Start Play and wait for running before inspecting it.`), { code: 'RUNTIME_NOT_RUNNING' });
  }
  return { runId: status.runId, scene: viewer.scene };
}

type RuntimeQuery = NonNullable<Parameters<typeof queryObjects>[1]> & { runId?: string; includeTransient?: boolean };
export function agentRuntimeQuery(args: RuntimeQuery) {
  const { scene, runId } = runningPreview(args.runId);
  return { runId, rootUuid: scene.uuid, timestampMs: performance.now(), ...queryObjects(scene, args, args.includeTransient) };
}

export async function agentRuntimeSample(args: SampleOptions, verifyBinding: () => void) {
  const { runId } = runningPreview(args.runId);
  const samples = await sampleRuntimeSeries(args, () => {
    verifyBinding();
    return runningPreview(runId).scene;
  });
  return { runId, samples };
}

export async function agentPlay(action: 'start' | 'stop' | 'restart' | 'status', _args: Record<string, any> = {}) {
  if (!controller) throw new Error('The editor play controller is not ready');
  if (action === 'stop') controller.stop();
  else if (action === 'restart') {
    if (controller.status().state === 'packing') throw new Error('Wait for snapshot packing to finish or cancel it first');
    controller.stop();
    await controller.start();
  } else if (action === 'start') {
    if (controller.status().state !== 'idle') throw new Error('Play is already active; use restart or stop');
    await controller.start();
  } else if (action !== 'status') throw new Error(`Unsupported play action: ${action}`);
  return { ...controller.status(), sceneId: String(App.project.getKey('sceneInfo.id') || ''),
    isolatedAuthoringScene: true, executionIsolation: 'same-origin iframe; synchronous infinite loops cannot be interrupted by stop',
    recovery: 'A local run-before snapshot is kept in IndexedDB; reopen the editor after a blocked browser tab.' };
}

export function agentDiagnostics(args: Parameters<typeof readAgentDiagnostics>[0] = {}) { return readAgentDiagnostics(args); }

export async function agentCapture(args: { target?: 'editor' | 'runtime'; format?: 'png' | 'jpeg'; quality?: number; width?: number; height?: number } = {}) {
  const target = args.target || 'editor';
  if (!['editor', 'runtime'].includes(target)) throw new Error('Capture target must be editor or runtime');
  const viewer = target === 'runtime' ? controller?.runtimeViewer() : window.viewer;
  if (!viewer || (target === 'runtime' && controller?.status().state !== 'running')) throw new Error('Requested viewport is not running');
  if (args.format && !['png', 'jpeg'].includes(args.format)) throw new Error('Capture format must be png or jpeg');
  for (const value of [args.width, args.height]) if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 4096)) throw new Error('Capture dimensions must be integers between 1 and 4096');
  if (args.quality !== undefined && (!Number.isFinite(args.quality) || args.quality < 0.1 || args.quality > 1)) throw new Error('Capture quality must be between 0.1 and 1');
  const canvas = viewer.renderer.domElement;
  viewer.render();
  const scale = Math.min(1, (args.width ?? 4096) / canvas.width, (args.height ?? 4096) / canvas.height);
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));
  output.getContext('2d')!.drawImage(canvas, 0, 0, output.width, output.height);
  const mimeType = args.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = output.toDataURL(mimeType, args.quality ?? 0.9);
  if (dataUrl.length > 16 * 1024 * 1024) throw new Error('Capture exceeds 16 MiB; reduce the viewport size');
  return { target, mimeType, data: dataUrl.substring(dataUrl.indexOf(',') + 1), width: output.width, height: output.height,
    runId: target === 'runtime' ? controller?.status().runId : undefined,
    sceneId: String(App.project.getKey('sceneInfo.id') || ''), capturedAt: new Date().toISOString() };
}

const recoveryStore = localforage.createInstance({ name: 'h3d-editor', storeName: 'run_recovery' });
export interface AgentRunRecovery { sceneId: string; runId: string; createdAt: string; state: 'active' | 'stopped'; snapshot: PlayLoadMessage }
export async function persistAgentRunSnapshot(sceneId: string, snapshot: PlayLoadMessage) {
  // Await the IndexedDB write before transferring these ArrayBuffers to the preview.
  await recoveryStore.setItem<AgentRunRecovery>(sceneId, {
    sceneId, runId: snapshot.sessionId, createdAt: new Date().toISOString(), state: 'active', snapshot,
  });
}
export async function getAgentRunRecovery(sceneId: string) { return recoveryStore.getItem<AgentRunRecovery>(sceneId); }
export async function dismissAgentRunRecovery(sceneId: string, runId?: string) {
  const saved = await getAgentRunRecovery(sceneId);
  if (saved && (!runId || saved.runId === runId)) { saved.state = 'stopped'; await recoveryStore.setItem(sceneId, saved); }
}

export async function packAuthoringSnapshot(sessionId: string, options: { isCurrent?: () => boolean; onProgress?: (progress: number) => void } = {}): Promise<PlayLoadMessage> {
  const pack = new Package(window.viewer);
  const packages: PlayPackageFile[] = [];
  // Package.pack currently changes these project metadata fields while serializing.
  const info = App.project.getKey('sceneInfo');
  const previous = { zip: info.zip, hasDrawing: info.hasDrawing };
  try {
    const result = await pack.pack({ name: `play-${sessionId}`, layer: 2,
      zipUploadFun: async (file: File) => {
        if (options.isCurrent?.() === false) throw new Error('play mode packing cancelled');
        const buffer = await file.arrayBuffer();
        if (options.isCurrent?.() === false) throw new Error('play mode packing cancelled');
        packages.push({ name: file.name, mimeType: file.type || 'application/zip', buffer });
        return file.name;
      }, onProgress: options.onProgress,
    });
    const firstPackageName = String(result.firstUploadResult || '');
    if (!firstPackageName || !packages.some(file => file.name === firstPackageName)) throw new Error('Snapshot first package is missing');
    return { type: PLAY_MESSAGE_TYPE.load, sessionId, firstPackageName, packages };
  } finally { Object.assign(info, previous); pack.dispose(); }
}

export async function restoreAgentRunRecovery(sceneId: string) {
  if (controller && controller.status().state !== 'idle') throw new Error('Stop the preview before restoring the authoring scene');
  if (window.viewer.enableScript || sceneId !== agentState.sceneId || agentState.sceneState !== 'ready') {
    throw new Error('Recovery requires a fully loaded authoring document');
  }
  const epoch = agentState.documentEpoch, revision = agentState.revision;
  const isCurrent = () => agentState.documentEpoch === epoch && agentState.revision === revision;
  const saved = await getAgentRunRecovery(sceneId);
  if (!saved || !isCurrent()) throw new Error('The document changed or its recovery snapshot is unavailable');
  const backup = await packAuthoringSnapshot(crypto.randomUUID(), {isCurrent});
  await recoveryStore.setItem(`${sceneId}:before-restore`, {sceneId, createdAt:new Date().toISOString(), snapshot:backup});
  if (!isCurrent()) throw new Error('Document changed while backing up the current scene');
  const files = new Map(saved.snapshot.packages.map(file => [file.name, new Blob([file.buffer], {type:file.mimeType})]));
  try {
    await replaceAuthoringScene(sceneId, epoch, async signal => {
      await loadAuthoringPackage({
        url:saved.snapshot.firstPackageName, files, deferHtmlPanels:true,
        onSceneLoad: json => {
          if (json.sceneInfo && json.sceneInfo.id !== sceneId) throw new Error('Recovery snapshot belongs to a different scene');
          if (json.sceneInfo) App.project.setKey('sceneInfo', json.sceneInfo);
          Hooks.useDispatchSignal('sceneResize');
        },
      }, signal);
      Hooks.useDispatchSignal('sceneGraphChanged');
      return true;
    });
    await dismissAgentRunRecovery(sceneId, saved.runId);
    recordAgentDiagnostic({kind:'recovery', severity:'info', sceneId, runId:saved.runId, message:'Authoring scene restored; scripts and active HTML remain deferred.'});
  } catch (error) {
    recordAgentDiagnostic({kind:'recovery', severity:'error', sceneId, runId:saved.runId, message:`Recovery failed; both snapshots are retained: ${String(error)}`});
    throw error;
  }
}
