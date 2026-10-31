// Actual r186 GPU resources, not a mocked pipeline or shader-only check.
import {App} from '/packages/sdk/lib/index.ts';
import {createEffectPipeline} from '/packages/sdk/lib/core/rendering/pipeline.js';

export async function run(viewer) {
    await viewer.ready;
    viewer.renderer.setAnimationLoop(null);
    const config = structuredClone(App.project.getKey('effect'));
    for (const value of Object.values(config)) if (value && typeof value === 'object') value.enabled = false;
    const combinations = [['Pixelate'], ['Pixelate', 'Outline', 'FXAA'],
        ['Pixelate', 'Outline', 'FXAA', 'UnrealBloom', 'Bokeh', 'Halftone', 'Afterimage']];
    const samples = window.__pipelineSamples = [];
    for (const combination of combinations) {
        for (const [key, value] of Object.entries(config)) if (value && typeof value === 'object') value.enabled = combination.includes(key);
        const series = [];
        samples.push({combination, series});
        for (let i = 0; i < 24; i++) {
            const pipeline = createEffectPipeline(viewer.renderer, viewer.scene, viewer.camera, config);
            pipeline.render();
            await viewer.renderer.backend.device.queue.onSubmittedWorkDone();
            pipeline.dispose();
            series.push({...viewer.renderer.info.memory});
        }
        const baseline = series[1];
        for (const sample of series.slice(2)) {
            for (const key of ['uniformBuffers', 'textures', 'geometries', 'renderTargets', 'total']) {
                if (sample[key] !== baseline[key]) throw Error(`${combination.join('+')} rebuild leaks ${key}: ${baseline[key]} -> ${sample[key]}`);
            }
        }
    }
    const mesh = App.scene.getObjectByName('fixture-0'), original = mesh.material;
    const builtins = [];
    for (const kind of ['CircleGrid', 'DynamicCheckerboard', 'Flicker', 'SlowSmoke', 'Snowing', 'StreamerWall']) {
        const module = await import(`/packages/sdk/lib/core/shaderMaterial/modules/${kind}ShaderMaterial.ts`);
        mesh.material = module[`${kind}ShaderMaterial`].PreviewMaterial;
        await new Promise(resolve => setTimeout(resolve, 150));
        const pipeline = createEffectPipeline(viewer.renderer, viewer.scene, viewer.camera, config);
        pipeline.render();
        await viewer.renderer.backend.device.queue.onSubmittedWorkDone();
        await new Promise(resolve => setTimeout(resolve, 50));
        viewer.assertRenderable();
        pipeline.dispose();
        builtins.push(kind);
    }
    mesh.material = original;
    if (window.__renderErrors.length) throw Error(window.__renderErrors.join('\n'));
    return {cycles: combinations.length * 24, samples, builtins, errors: window.__renderErrors};
}
