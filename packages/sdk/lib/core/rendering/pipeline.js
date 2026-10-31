import {Color, RenderPipeline} from 'three/webgpu';
import {pass, uniform, vec4, texture, texture3D, convertToTexture, uv, orthographicDepthToViewZ, perspectiveDepthToViewZ} from 'three/tsl';
import {outline} from 'three/addons/tsl/display/OutlineNode.js';
import {fxaa} from 'three/addons/tsl/display/FXAANode.js';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {pixelationPass} from 'three/addons/tsl/display/PixelationPassNode.js';
import {afterImage} from 'three/addons/tsl/display/AfterImageNode.js';
import {lut3D} from 'three/addons/tsl/display/Lut3DNode.js';
import {bokeh} from './nodes/Bokeh.js';
import halftone from './nodes/Halftone.js';

// r186 keys render contexts by MRT identity. Rebuilding the same pixelation
// output layout with a fresh MRT retains another set of scene draw bindings.
// Reuse its fixed layout per renderer; pass targets still have normal disposal.
const pixelationLayouts = new WeakMap();

export function createEffectPipeline(renderer, scene, camera, config, lut = null) {
    const resources = new Set();
    const own = node => { resources.add(node); return node; };
    const base = own(config.Pixelate.enabled
        ? pixelationPass(scene, camera, config.Pixelate.pixelSize, config.Pixelate.normalEdgeStrength, config.Pixelate.depthEdgeStrength)
        : pass(scene, camera));
    if (config.Pixelate.enabled) {
        if (!pixelationLayouts.has(renderer)) pixelationLayouts.set(renderer, base.getMRT());
        base.setMRT(pixelationLayouts.get(renderer));
    }
    let output = base;
    const selection = {selectedObjects: []};
    let outlineNode;
    const pulse = uniform(1);
    if (config.Outline.enabled) {
        const options = config.Outline;
        outlineNode = own(outline(scene, camera, {selectedObjects: [],
            edgeGlow: options.edgeGlow, edgeThickness: options.edgeThickness}));
        // An empty selection samples the 1x1 output without initializing its target;
        // target disposal alone then has no renderer listener to free that texture.
        own(outlineNode.getTextureNode().value);
        let edges = outlineNode.visibleEdge.mul(new Color(options.visibleEdgeColor))
            .add(outlineNode.hiddenEdge.mul(new Color(options.hiddenEdgeColor))).mul(options.edgeStrength).mul(pulse);
        if (options.usePatternTexture) {
            // The legacy UI has no pattern texture input (unbound sampler = black).
            // r186's pinned mask target supplies the identical interior/visibility mask.
            const mask = texture(outlineNode._renderTargetMaskBuffer.texture);
            edges = edges.add(mask.g.lessThan(1).select(1, .5).mul(mask.r.oneMinus()));
        }
        output = vec4(output.rgb.add(edges), output.a);
    }
    // Own implicit RTT inputs too: effect-node disposal does not dispose its input.
    if (config.FXAA.enabled) output = own(fxaa(own(convertToTexture(output))));
    if (config.UnrealBloom.enabled) {
        const o = config.UnrealBloom;
        const glow = own(bloom(output, o.strength, o.radius, o.threshold));
        output = vec4(output.rgb.add(glow.rgb), output.a);
    }
    if (config.Bokeh.enabled) {
        const depth = base.getTextureNode('depth');
        const z = camera.isOrthographicCamera ? orthographicDepthToViewZ(depth, camera.near, camera.far)
            : perspectiveDepthToViewZ(depth, camera.near, camera.far);
        const input = own(convertToTexture(output));
        output = bokeh(input, z, camera, config.Bokeh);
    }
    let halfUniforms;
    if (config.Halftone.enabled) {
        halfUniforms = Object.fromEntries(Object.entries({...config.Halftone, width: 1, height: 1, disable: false})
            .map(([key, value]) => [key, {value}]));
        const input = own(convertToTexture(output));
        output = halftone(halfUniforms, {vUV: uv(), texture: input}).main();
    }
    if (config.LUT.enabled) {
        if (!lut) throw new Error(`LUT has not loaded: ${config.LUT.lut}`);
        output = lut3D(output, texture3D(lut.texture3D), lut.size, config.LUT.intensity);
    }
    if (config.Afterimage.enabled) {
        output = own(afterImage(own(convertToTexture(output)), config.Afterimage.damp));
        // Pinned r186: on the first frame the history texture is sampled before
        // its target is initialized. Closing immediately must also release it.
        own(output._oldRT.texture);
        own(output.getTextureNode().value);
    }
    const pipeline = new RenderPipeline(renderer, output);
    // Viewer composites helpers before the one final display conversion.
    pipeline.outputColorTransform = false;
    return {
        pipeline, selection,
        render() {
            if (outlineNode) {
                outlineNode.selectedObjects = selection.selectedObjects;
                const period = config.Outline.pulsePeriod;
                pulse.value = period > 0 ? .625 + Math.cos(performance.now() * .01 / period) * .375 : 1;
            }
            if (halfUniforms) {
                halfUniforms.width.value = renderer.domElement.width;
                halfUniforms.height.value = renderer.domElement.height;
            }
            pipeline.render();
        },
        dispose() { pipeline.dispose(); for (const node of resources) node.dispose?.(); },
    };
}
