import {LUTCubeLoader} from 'three/addons/loaders/LUTCubeLoader.js';
import {LUT3dlLoader} from 'three/addons/loaders/LUT3dlLoader.js';
import {LUTImageLoader} from 'three/addons/loaders/LUTImageLoader.js';
import {useAddSignal, useRemoveSignal} from '@/hooks';
import {createEffectPipeline} from '../../rendering/pipeline.js';
import Viewer from '../Viewer';
import App from '@/core/app/App';

export const LUTEffectMap = Object.fromEntries(['Bourbon 64.CUBE','Chemical 168.CUBE','Clayton 33.CUBE',
    'Cubicle 99.CUBE','Remy 24.CUBE','Presetpro-Cinematic.3dl','NeutralLUT.png','B&WLUT.png','NightLUT.png'].map(name => [name, null]));

export class Effect {
    private viewer: Viewer;
    private current: ReturnType<typeof createEffectPipeline> | null = null;
    private generation = 0;
    private camera: unknown;
    private lut: {texture3D: {dispose(): void}} | null = null;
    private selected: any[] = [];
    private listener = this.handlePassConfigChange.bind(this);
    ready: Promise<void> = Promise.resolve();
    constructor(viewer: Viewer) {
        this.viewer = viewer;
        useAddSignal('effectPassConfigChange', this.listener);
    }
    get enabled() { return App.project.getKey('effect.enabled'); }
    get outlinePass() { return this.current?.selection; }
    createPipeline() {
        const generation = ++this.generation;
        const config = structuredClone(App.project.getKey('effect'));
        const camera = this.camera = App.viewportCamera;
        this.selected = this.current?.selection.selectedObjects || this.selected;
        this.current?.dispose();
        this.current = null;
        this.lut?.texture3D.dispose();
        this.lut = null;
        const build = (lut = null) => {
            if (generation !== this.generation) { (lut as any)?.texture3D.dispose(); return; }
            const selected = this.selected.length ? this.selected : (App.selected ? [App.selected] : []);
            this.lut = lut;
            this.current = createEffectPipeline(this.viewer.renderer, this.viewer.scene, camera, config, lut);
            this.current.selection.selectedObjects = selected;
            this.camera = camera;
        };
        if (config.LUT.enabled) {
            const name = config.LUT.lut;
            const loader = /\.cube$/i.test(name) ? new LUTCubeLoader() : /\.png$/i.test(name) ? new LUTImageLoader() : new LUT3dlLoader();
            this.ready = loader.loadAsync(new URL(`${import.meta.env.BASE_URL}resource/luts/${name}`, import.meta.url).href)
                .then(lut => { build(lut as any); if (generation === this.generation) this.viewer.render(); });
        } else {
            build();
            this.ready = Promise.resolve();
        }
        void this.ready.catch(error => { if (generation === this.generation) this.viewer.failRendering(error); });
        return this.ready;
    }
    handlePassConfigChange() { void this.createPipeline(); this.viewer.render(); }
    render(_delta: number) {
        if (!this.enabled) return;
        if (this.camera !== App.viewportCamera) void this.createPipeline();
        this.current?.render();
    }
    clear() { ++this.generation; this.current?.dispose(); this.current = null; this.lut?.texture3D.dispose(); this.lut = null; this.camera = undefined; }
    dispose() { this.clear(); useRemoveSignal('effectPassConfigChange', this.listener); }
}
