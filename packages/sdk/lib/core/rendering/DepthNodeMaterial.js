import {NodeMaterial, MeshDepthMaterial, BasicDepthPacking, RGBADepthPacking, RGBDepthPacking, RGDepthPacking} from 'three/webgpu';
import {depth, vec2, vec3, vec4, floor, fract, materialOpacity} from 'three/tsl';

// MeshDepthMaterial has no r186 standard-library mapping. Keep its actual depth
// packing semantics, alpha testing, skinning and displacement, not a white proxy.
export class DepthNodeMaterial extends NodeMaterial {
    static get type() { return 'H3DDepthNodeMaterial'; }
    constructor() {
        super();
        this.setDefaultValues(new MeshDepthMaterial());
        this.fog = false;
        this.toneMapped = false;
    }
    setupOutput() {
        const d = depth;
        if (this.depthPacking === BasicDepthPacking) return vec4(vec3(d.oneMinus()), materialOpacity);
        // Equivalent to r186 ShaderChunk/packing.glsl.js (positive depth => modf = fract).
        const bits = this.depthPacking === RGBADepthPacking ? 24 : this.depthPacking === RGBDepthPacking ? 16 : 8;
        let whole = floor(d.mul(2 ** bits));
        const channels = [fract(d.mul(2 ** bits))];
        for (let i = bits; i > 8; i -= 8) {
            channels.unshift(fract(whole.div(256)).mul(256 / 255));
            whole = floor(whole.div(256));
        }
        channels.unshift(whole.div(255));
        let packed;
        if (this.depthPacking === RGBADepthPacking) packed = vec4(...channels);
        else if (this.depthPacking === RGBDepthPacking) packed = vec4(vec3(...channels), 1);
        else if (this.depthPacking === RGDepthPacking) packed = vec4(vec2(...channels), 0, 1);
        else throw new Error(`Unsupported depth packing: ${this.depthPacking}`);
        const zero = this.depthPacking === RGBADepthPacking ? vec4(0) : vec4(0,0,0,1);
        const one = this.depthPacking === RGDepthPacking ? vec4(1,1,0,1) : vec4(1);
        return d.lessThanEqual(0).select(zero, d.greaterThanEqual(1).select(one, packed));
    }
}
