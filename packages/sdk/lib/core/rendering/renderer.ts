import {DepthNodeMaterial} from './DepthNodeMaterial.js';
import { Material, Object3D, WebGPURenderer } from 'three/webgpu';

export type RenderingAPI = 'webgpu' | 'webgl2';

/** One official renderer for every 3D entrypoint. Its built-in fallback is intentional. */
export function createRenderer(options: ConstructorParameters<typeof WebGPURenderer>[0] = {}) {
    const renderer = new WebGPURenderer(options);
    renderer.library.addMaterial(DepthNodeMaterial, 'MeshDepthMaterial');
    return renderer;
}

export function getRenderingAPI(renderer: WebGPURenderer): RenderingAPI {
    const backend = renderer.backend;
    if ('isWebGPUBackend' in backend && backend.isWebGPUBackend === true) return 'webgpu';
    if ('isWebGLBackend' in backend && backend.isWebGLBackend === true) return 'webgl2';
    throw new Error('Unknown rendering API');
}

export async function initializeRenderer(renderer: WebGPURenderer, onLost: (error: Error) => void) {
    const defaultDeviceLost = renderer.onDeviceLost.bind(renderer);
    renderer.onDeviceLost = info => {
        // Keep Three's own lost-device state and diagnostics intact.
        defaultDeviceLost(info);
        renderer.setAnimationLoop(null);
        onLost(new Error(`${info.api} device lost: ${info.message}`));
    };
    const defaultError = renderer.onError.bind(renderer);
    renderer.onError = info => {
        defaultError(info);
        renderer.setAnimationLoop(null);
        // r186.1 passes an object here; @types/three@0.186.0 still declares string.
        const message = typeof info === 'string' ? info : (info as {message: string}).message;
        onLost(new Error(message));
    };
    await renderer.init();
    // A class name does not prove which rendering API was selected by Three.
    console.info('[H3D] Rendering API:', getRenderingAPI(renderer));
}

/** Never let Three silently skip an unsupported material and present an incomplete scene. */
export function assertSupportedMaterials(scene: Object3D) {
    scene.traverse(object => {
        const renderable = object as Object3D & {
            material?: Material | Material[];
            customDepthMaterial?: Material;
            customDistanceMaterial?: Material;
            overrideMaterial?: Material | null;
        };
        const value = renderable.material;
        const materials = [
            ...(Array.isArray(value) ? value : value ? [value] : []),
            renderable.overrideMaterial, renderable.customDepthMaterial, renderable.customDistanceMaterial,
        ].filter((material): material is Material => !!material);
        for (const material of materials) {
            if ((material as any).isShaderMaterial || (material as any).isRawShaderMaterial ||
                material.onBeforeCompile !== Material.prototype.onBeforeCompile) {
                throw new Error(`不支持的 GLSL 材质：${object.name || object.uuid} / ${material.name || material.uuid}。原始数据已保留。`);
            }
        }
    });
}

/** Snapshot immediately after a complete frame, without WebGL preserveDrawingBuffer hacks. */
export async function captureViewport(renderer: WebGPURenderer, render: () => void): Promise<HTMLImageElement> {
    await renderer.init();
    render();
    const blob = await new Promise<Blob>((resolve, reject) => {
        renderer.domElement.toBlob(value => value ? resolve(value) : reject(new Error('Screenshots fail')), 'image/png');
    });
    const image = new Image();
    const url = URL.createObjectURL(blob);
    try {
        // decode() can remain pending in a background editor/preview tab. The load
        // event also guarantees a drawable image and does not require a paint tick.
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Screenshot image failed to load'));
            image.src = url;
        });
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
    // Existing callers retain image.src as the cover and fetch it during upload.
    // Ownership of the successful blob URL therefore transfers to the caller.
    return image;
}
