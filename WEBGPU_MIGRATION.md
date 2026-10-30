# WebGPU rendering migration

Base: `dev` (`eddfcd4`). Branch: `refactor/webgpu-renderer`.

## Agreed contract

- Replace the legacy 3D render pipeline, not the Vue application or business APIs.
- Use the official default `WebGPURenderer`. Do not force WebGL, suppress its official fallback, or maintain a second application rendering path.
- Record the **actual rendering API** during verification. WebGL2 fallback is not evidence of a passing WebGPU test.
- Migrate all active 3D views, standard materials, built-in effects, shadows, postprocessing, screenshots and standalone exports.
- Remove the realistic/path-tracing mode. Do not import GIS/atmosphere feature branches, add GI effects, or add a TSL authoring UI.
- Business GLSL shaders are unsupported: preserve source and data, stop that scene's rendering with an actionable error. Never substitute materials or silently omit objects.
- Remove GLSL creation/editing; keep legacy source read-only. Ordinary JS scripts and standard material editing remain.
- 2D CAD/DXF is the explicit WebGL exception. Inactive Cesium and historical backup modules are not migration targets.
- Breaking changes are allowed on this branch. Core data must not be silently damaged. No production writes, deployment, or merge into dev.

## Implementation / verification checklist

- [ ] Fixed WebGL baseline (camera, lights, exposure, DPR and viewport)
- [ ] Renderer factory and asynchronous Viewer/Preview lifecycle
- [ ] Materials, shadows, clipping and helpers
- [ ] Built-in shader effects and serialization round trip
- [ ] Postprocessing and removal of path tracing
- [ ] All preview and screenshot entrypoints
- [ ] Current-build standalone runtime and isolated exported-package test
- [ ] Production build, types and automated WebGPU browser verification
- [ ] No legacy WebGL context requests in 3D tests on a WebGPU-capable device
- [ ] Failure paths, unsupported shaders and resource lifecycle
- [ ] Human visual / interaction acceptance (required before merging)

## Reproducible baseline

Serve the repository with the installed Vite CLI and open `/tests/rendering/baseline.html`.
The fixture fixes 960×640 pixels, DPR=1, camera, geometry, lighting and ACES exposure=1.
Generated evidence belongs in ignored `tests/rendering/results/`.
This reference page intentionally uses WebGL and is never imported by production code.

## Manual acceptance

Use test projects/copies only. Open the local editor, edit and transform objects, change
materials/shadows/effects, undo/redo, capture a cover, save and reload the test copy.
Check model/material previews, play mode, orthographic views, clipping and the minimap.
Export a standalone package and serve it at a separate localhost/HTTPS origin with the
editor server stopped. Compare the same scene/camera against the baseline. Check that
unsupported GLSL reports failure without losing the original object/material/script.
Record browser, GPU, actual rendering API and failures; do not infer GPU time from CPU
submission time. Automated checks alone do not constitute final acceptance.
