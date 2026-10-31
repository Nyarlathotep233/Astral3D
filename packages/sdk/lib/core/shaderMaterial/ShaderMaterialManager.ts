import {BuiltinMaterial} from '../rendering/BuiltinMaterial';
import {useAddSignal, useRemoveSignal} from '@/hooks';
import App from '@/core/app/App';

export class ShaderMaterialManager {
    classMap: Record<string, string> = {};
    private animated = new Set<BuiltinMaterial>();
    private instantiate = (sm: {Name: string; _ShaderMaterial: BuiltinMaterial}) => {
        this.classMap[sm.Name] = sm._ShaderMaterial.uuid;
        App.metadata._ShaderMaterialClassMap = this.classMap;
    };
    private resize = (width: number, height: number) => {
        this.collect();
        this.animated.forEach(material => material.uniforms.uResolution?.value.set(width, height));
    };
    constructor() {
        useAddSignal('instantiateShaderMaterial', this.instantiate);
        useAddSignal('sceneResize', this.resize);
    }
    private collect() {
        this.animated.clear();
        App.scene.traverse(object => {
            // Snow accumulation is advanced by Weather at its original speed.
            if ((object as any).metaData?.material) return;
            const value = (object as any).material;
            for (const material of Array.isArray(value) ? value : value ? [value] : []) {
                if (material.isH3DBuiltinMaterial && material.kind !== 'Rain' && material.kind !== 'Snow') this.animated.add(material);
            }
        });
    }
    get needRender() { return this.animated.size > 0; }
    init() { this.classMap = App.metadata._ShaderMaterialClassMap || {}; this.collect(); }
    update() {
        this.collect();
        this.animated.forEach(material => { material.uniforms.uTime.value += material.kind === 'Flicker' ? .02 : .01; });
    }
    dispose() {
        useRemoveSignal('instantiateShaderMaterial', this.instantiate);
        useRemoveSignal('sceneResize', this.resize);
        this.animated.clear();
    }
}
