import { App } from '@astral3d/engine';
import { fetchGetAssetsList } from '@/http/api/assetsInfo';
import { BUILTIN_PREFAB_RESOURCES } from '@/views/editor/components/extraPane/resource/builtin/prefabRegistry';
import { inspectObjects, queryObjects } from './desktopReadModel';

declare global {
  interface Window {
    h3dDesktop?: {
      readonly socketUrl: string;
      installReadHandler(callback: (method: string, args: Record<string, any>) => Promise<unknown>): void;
    };
  }
}

let loadState: 'inactive' | 'loading' | 'ready' | 'failed' = 'inactive';
let loadError: string | null = null;
let generation = 0;

export function setDesktopSceneState(state: typeof loadState, error?: unknown) {
  if (!window.h3dDesktop) return;
  loadState = state;
  loadError = error ? (error instanceof Error ? error.message : String(error)) : null;
  generation++;
}

function status() {
  const route = window.location.hash.match(/^#\/editor\/([^?/#]+)/);
  const sceneId = App.project.getKey('sceneInfo.id');
  const viewer = window.viewer;
  const stale = route && decodeURIComponent(route[1]) !== sceneId;
  const backend = viewer?.renderer?.backend as { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } | undefined;
  return {
    sceneId: route && loadState !== 'inactive' ? sceneId : null,
    sceneName: route && loadState !== 'inactive' ? App.project.getKey('sceneInfo.sceneName') : null,
    state: !route ? 'inactive' : stale ? 'stale-route' : viewer?.renderError ? 'failed' : loadState,
    error: loadError || viewer?.renderError?.message || null,
    renderingAPI: backend?.isWebGPUBackend ? 'webgpu' : backend?.isWebGLBackend ? 'webgl2' : null,
    sceneUuid: route && loadState === 'ready' ? App.scene.uuid : null,
    capabilities: ['scene-query', 'object-details', 'assets-list', 'prefabs-list', 'viewport-capture'],
    writable: false,
  };
}

function assertScene(args: Record<string, any>) {
  const current = status();
  if (typeof args.sceneId !== 'string' || args.sceneId !== current.sceneId) throw new Error('Scene changed; list sessions again');
  if (current.state !== 'ready') throw new Error(current.error || `Scene is not ready: ${current.state}`);
  window.viewer.assertRenderable();
}

export function installDesktopBridge() {
  window.h3dDesktop?.installReadHandler(async (method, args) => {
    if (method === 'status') return status();
    if (method === 'h3d_scene_status') {
      const current = status();
      if (args.sceneId !== current.sceneId) throw new Error('Scene changed; list sessions again');
      return current;
    }
    assertScene(args);
    const started = generation;
    let result: unknown;
    switch (method) {
      case 'h3d_scene_query': result = queryObjects(App.scene, args); break;
      case 'h3d_object_details': result = { objects: inspectObjects(App.scene, App.scripts, args as any) }; break;
      case 'h3d_prefabs_list': result = { items: BUILTIN_PREFAB_RESOURCES }; break;
      case 'h3d_assets_list': {
        const response = await fetchGetAssetsList({ offset: args.offset, limit: args.limit, query: args.query, search: args.search, sortby: 'updateTime', order: 'desc' });
        if (response.error || !response.data) throw new Error(response.error?.msg || 'Asset service returned no data');
        result = response.data;
        break;
      }
      case 'h3d_viewport_capture': {
        const viewer = window.viewer;
        const image = await viewer.getViewportImage();
        try {
          const blob = await fetch(image.src).then(response => response.blob());
          if (blob.size > 16 * 1024 * 1024) throw new Error('Viewport capture exceeds 16 MiB');
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Capture encoding failed'));
            reader.readAsDataURL(blob);
          });
          result = { data, mimeType: 'image/png', width: image.naturalWidth, height: image.naturalHeight, capture: 'render-canvas', sceneId: args.sceneId, renderingAPI: status().renderingAPI };
        } finally { if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src); }
        break;
      }
      default: throw new Error('Unsupported desktop read request');
    }
    if (generation !== started) throw new Error('Scene changed during request; query again');
    assertScene(args);
    return result;
  });
}
