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

- [x] Fixed WebGL baseline (camera, lights, exposure, DPR and viewport)
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

Serve the repository with the installed Vite CLI:

```powershell
node packages/editor/node_modules/vite/bin/vite.js --config tests/rendering/vite.config.mjs --host 127.0.0.1 --port 8093 --strictPort
```

Open `/tests/rendering/baseline.html` for the WebGL reference, or
`/tests/rendering/webgpu.html` for the new renderer factory fixture.
The fixture fixes 960×640 pixels, DPR=1, camera, geometry, lighting and ACES exposure=1.
Generated evidence belongs in ignored `tests/rendering/results/`.
This reference page intentionally uses WebGL and is never imported by production code.
The original `dev` baseline was captured **before the dependency upgrade**, using
Three r176, as `results/webgl-baseline.png`. Running the reference page on the migration
branch now uses r186; it must not overwrite or be confused with that original evidence.

## Checkpoint: 2026-10-30 — in progress, NOT migration acceptance

Implemented in this checkpoint:

- Pinned Three 0.186.1 and types 0.186.0; introduced the default renderer factory.
- API identification uses the initialized renderer's actual implementation flags.
- Official lost-device/error callbacks remain intact and notify the owning view.
- Async screenshot returns a decoded image and a reusable blob URL for existing cover uploads.
- Started Viewer/Preview `ready` integration, disposal guards and caller updates.
- Removed the path-tracer runtime/entry and dependency; explicit `realistic` requests error.
- Separated SDK ESM (external Three) and UMD (bundled Three) build configurations.

Automated browser factory checks:

```powershell
Get-Content tests/rendering/verify-factory.py -Raw | browser-harness
```

- Normal path: actual `webgpu`; zero WebGL context requests, no reported runtime errors.
- 960×640 first-frame screenshot has rendered pixels; transparent corner alpha is zero;
  `image.src` remains fetchable for upload.
- Unsupported shader check reports the object, preserves its material and serialized data.
- Three temporary renderer create/render/dispose cycles leave one original canvas.
- Injected adapter unavailability and device-creation failure both use the official WebGL2
  fallback. These are fallback tests, **not WebGPU success evidence**.
- Simulated lost-device notification reaches the owner. This is not a physical device-loss test.
- Focused renderer-factory TypeScript check passes.

Evidence: ignored `tests/rendering/results/factory-verification.json` and
`webgpu-first-frame.png`. Visual inspection found a darker solid background than the
r176 baseline (tone-mapping behavior); this is an **open visual difference**, not accepted
by changing exposure or suppressing the comparison.

Outstanding before the editor can be accepted:

- Full SDK typecheck currently fails: legacy EffectComposer/clipping integration and
  Loader/Billboard typing/API changes remain. The application build is NOT passing.
- EffectComposer must be replaced before the real Viewer initialization is runnable;
  factory tests do not establish that the editor is working.
- CSM, built-in TSL materials and serialization, weather, all postprocessing, clipping,
  remaining preview entrypoints and current-build standalone export are not finished.
- Actual editor UI (including the removed mode selector), full Viewer/Preview lifecycle,
  production build, isolated standalone, save/reload and manual acceptance are NOT verified.
- No business backend changes, production scene writes, dev merge, deployment or push.

## Manual acceptance

Use test projects/copies only. Open the local editor, edit and transform objects, change
materials/shadows/effects, undo/redo, capture a cover, save and reload the test copy.
Check model/material previews, play mode, orthographic views, clipping and the minimap.
Export a standalone package and serve it at a separate localhost/HTTPS origin with the
editor server stopped. Compare the same scene/camera against the baseline. Check that
unsupported GLSL reports failure without losing the original object/material/script.
Record browser, GPU, actual rendering API and failures; do not infer GPU time from CPU
submission time. Automated checks alone do not constitute final acceptance.
