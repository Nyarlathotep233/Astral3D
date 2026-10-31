import legacyBuiltins from './legacyBuiltins.json';
import {UniformsUtils, type IUniform} from 'three';
import {NodeMaterial, Material, ShaderMaterial, MaterialLoader, Texture, DataTexture,
    RGBAFormat, JSONMeta, type NodeBuilder, type Node} from 'three/webgpu';
import {uv, normalView, positionLocal, reference, sin, float, varying, vec4, texture, output} from 'three/tsl';
import circle from './nodes/CircleGrid.js';
import checker from './nodes/DynamicCheckerboard.js';
import flicker from './nodes/Flicker.js';
import smoke from './nodes/SlowSmoke.js';
import snowing from './nodes/Snowing.js';
import streamer from './nodes/StreamerWall.js';
import rain from './nodes/Rain.js';
import snow from './nodes/Snow.js';

const factories = {CircleGrid: circle, DynamicCheckerboard: checker, Flicker: flicker,
    SlowSmoke: smoke, Snowing: snowing, StreamerWall: streamer, Rain: rain, Snow: snow};
export type BuiltinKind = keyof typeof factories;

// Explicit equivalent of WebGL's unbound (black) sampler, not substitute scene data.
const unboundTexture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
unboundTexture.needsUpdate = true;

export class BuiltinMaterial extends NodeMaterial {
    static get type() { return 'H3DBuiltinMaterial'; }
    readonly isH3DBuiltinMaterial = true;
    kind: BuiltinKind | null;
    legacySource?: {vertexShader: string; fragmentShader: string};
    get vertexShader() { return this.legacySource?.vertexShader; }
    get fragmentShader() { return this.legacySource?.fragmentShader; }
    uniforms: Record<string, IUniform> = {};

    constructor(kind: BuiltinKind | null = null, parameters: any = {}) {
        super();
        this.kind = kind;
        this.fog = false;
        const {uniforms = {}, ...settings} = parameters;
        this.uniforms = uniforms;
        this.setValues(settings);
        if (kind) this.rebuild();
    }

    rebuild() {
        if (!this.kind || !factories[this.kind]) throw new Error(`Unknown built-in material: ${this.kind}`);
        const uniforms = {...this.uniforms};
        const textures: Record<string, any> = {};
        // Reference getters continue tracking async texture loads without changing saved uniforms.
        for (const name of ['uTexture', 'uNoiseMap', 'uFlowTexture', 'uBgTexture']) {
            if (uniforms[name]) {
                const source = uniforms[name];
                uniforms[name] = {get value() { return source.value ?? unboundTexture; }};
                textures[name] = texture(source.value ?? unboundTexture).onObjectUpdate(() => source.value ?? unboundTexture);
            }
        }
        const inputs: any = {vUv: uv(), vNormal: normalView, textures};
        if (this.kind === 'Flicker') {
            const time = reference('value', 'float', this.uniforms.uTime);
            const height = reference('value', 'float', this.uniforms.uHeight);
            inputs.vOpacity = varying(float(1).sub(positionLocal.y.div(height)).mul(sin(time).mul(.5).add(1)));
        }
        this.fragmentNode = factories[this.kind](uniforms, inputs).main();
        if (this.kind === 'Rain' || this.kind === 'Snow') this.vertexNode = vec4(positionLocal, 1);
        this.needsUpdate = true;
    }

    setupOutput(builder: NodeBuilder, fragment: Node): Node {
        const result = super.setupOutput(builder, fragment);
        // r186 skips MRT composition for fragmentNode materials. Keep the effect's
        // RGBA intact while supplying the pass outputs (e.g. pixelation normals).
        const mrt = builder.renderer.getRenderTarget() ? builder.renderer.getMRT() : null;
        if (!mrt) return result;
        output.assign(result);
        return this.mrtNode ? mrt.merge(this.mrtNode) : mrt;
    }

    copy(source: this): this {
        super.copy(source);
        this.kind = source.kind;
        this.legacySource = source.legacySource ? {...source.legacySource} : undefined;
        this.uniforms = UniformsUtils.clone(source.uniforms);
        this.rebuild();
        return this;
    }

    toJSON(meta?: JSONMeta): any {
        // Use Three's uniform/texture encoding, but never serialize JS/TSL functions.
        const dataMaterial = new ShaderMaterial();
        Material.prototype.copy.call(dataMaterial, this);
        (dataMaterial as {uuid: string}).uuid = this.uuid;
        dataMaterial.uniforms = this.uniforms;
        const data = dataMaterial.toJSON(meta);
        data.type = 'H3DBuiltinMaterial';
        (data as any).builtin = this.kind;
        if (this.legacySource) (data as any).legacySource = {...this.legacySource};
        delete (data as any).vertexShader;
        delete (data as any).fragmentShader;
        return data;
    }
}

export function parseBuiltinMaterial(data: any, textures: Record<string, Texture>): BuiltinMaterial {
    if (!Object.prototype.hasOwnProperty.call(factories, data.builtin)) throw new Error(`Unknown built-in material: ${data.builtin}`);
    const saved = new MaterialLoader().setTextures(textures).parse({...data, type: 'ShaderMaterial'}) as ShaderMaterial;
    const material = new BuiltinMaterial();
    Material.prototype.copy.call(material, saved);
    (material as {uuid: string}).uuid = data.uuid;
    material.kind = data.builtin;
    material.legacySource = data.legacySource;
    material.uniforms = saved.uniforms;
    material.rebuild();
    return material;
}

/** Only exact, checked-in eddfcd4/r176 built-ins are recognized. No custom GLSL conversion. */
export function recognizeLegacyBuiltin(data: any) {
    if (data.type !== 'ShaderMaterial' || Object.keys(data.defines || {}).length || data.glslVersion) return null;
    const normalize = (source: string) => source?.replace(/\r\n/g, '\n');
    for (const [kind, source] of Object.entries(legacyBuiltins)) {
        if (normalize(data.vertexShader) === normalize(source.vertexShader) &&
            normalize(data.fragmentShader) === normalize(source.fragmentShader)) {
            return {...data, type: 'H3DBuiltinMaterial', builtin: kind,
                legacySource: {vertexShader: data.vertexShader, fragmentShader: data.fragmentShader}};
        }
    }
    return null;
}
