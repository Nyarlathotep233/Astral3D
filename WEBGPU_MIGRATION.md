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

- [x] Default WebGPURenderer factory, async Viewer/Preview, explicit errors, no application fallback
- [x] Main scene, helpers, clipping, CSMShadowNode, depth material mapping
- [x] Six registered built-in node materials and rain/snow
- [x] Eight postprocessing effects and removal of path tracing
- [x] Remaining preview/minimap/lightweight/texture rendering entrypoints
- [x] Built-in clone/JSON and local split-package save/reload checks
- [x] Current-build standalone runtime, independent localhost smoke test
- [x] SDK/editor TypeScript and Vue SFC checks (see pinned checker below)
- [x] WebGPU-capable source integration: zero WebGL contexts, visible scene pixels, no runtime errors
- [x] Isolated service-backed save/reload and production-editor core interaction checks
- [x] Matched r176 baseline visual differences accepted by the user (2026-10-31)
- [x] Representative-scene GPU/resource measurements (completed 30-minute run; future default 15 minutes)
- [ ] Developer manual acceptance (required before merge)

Implementation checks are not a declaration of final migration acceptance.

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

## Checkpoint: 2026-10-31 — implementation and integration verification

### Implemented

- Main Viewer uses one renderer and one canvas. Scene/effects/helpers render to one
  linear offscreen target, followed by exactly one final display transform. This is
  a render target, not the rejected dual-renderer/overlaid-canvas design.
- Fixed a browser-only defect: rendering helper objects directly after RenderPipeline
  replaced the main screen output without a console error. Added pixel-presence checks,
  composed helpers before final output, and adapted the gizmo's offscreen viewport/scissor.
- Node pipeline: Outline, FXAA, Bloom, Bokeh (41-sample port), Pixelate, Halftone,
  LUT3D and Afterimage, including combined operation. Pixelation supplies the base
  scene pass so it no longer discards earlier effects. No effect is silently disabled.
- Halftone saved rotations retain shader radians; the degree sliders convert only at
  the UI boundary. Legacy files that had already saved degrees under these fields
  are not guessed/reinterpreted; adjust those values explicitly if encountered.
- Standard materials retain their serialized type. MeshDepthMaterial has an explicit
  depth-packing node implementation; it is not replaced by an unrelated material.
- Six built-in effects and weather shaders are fixed TSL graphs. Registry serialization
  retains UUIDs, parameters and texture references. Only exact known r176 built-in GLSL
  sources are recognized. Modified/custom GLSL is rejected, with its source retained.
- GLSL creation/editing removed; existing source is read-only. Ordinary JS remains editable.
- CSM uses official shadow nodes, marks its transient cascade objects ignored before
  insertion, and disposes shadow resources. Tile fading retains the existing simulation
  but replaces the active plugin's material adapter with node masks.
- Clipping uses temporary render-only ClippingGroups and restores children in finally;
  logical parent pointers, UUIDs and serialized hierarchy do not change.
- Async ready/disposal propagated to preview, minimap, lightweight scene, texture thumbnail,
  Vue viewport and project-preview consumers. Renderer replacement refreshes frame resources.
- Split packages preserve shared material/texture instances and saved sibling order.
  Loading errors stop rendering and call onError; completion waits for renderer/effects.
  Unsupported material validation runs before the packer's first upload callback.
- Standalone serves current SDK output through a build manifest, not the checked-in old
  UMD. Runtime decoders/LUTs/assets keep their SDK-relative paths under runtime/.
- SDK/editor build targets ES2022 and bypasses only their legacy top-level-await
  transform: that transform miscompiled Three r186 static class blocks and caused a
  production-only startup exception. Other consumers keep the previous build default.
  SDK-relative resources are also copied beside production chunks.
- Type fixes are limited to reported errors: imports, narrowing, component/option types,
  template attributes, unused bindings and existing RequestError.msg access. No API fields
  or business data sources were added. The inactive Cesium component only received a
  type/import correction; no new entry references it.

### Automated/visual evidence

Run the source fixture server from the repository root as above, then:

```powershell
Get-Content tests/rendering/verify-runtime.py -Raw | browser-harness
Get-Content tests/rendering/verify-factory.py -Raw | browser-harness
```

The runtime suite exercises the actual Viewer and modules, captures images and checks
that scene pixels remain present (not merely that shaders compile). It covers built-in
JSON/clone/legacy registration, depth packing, clipping identity and pixels, eight effects,
combined effects, CSM, weather, tile-node adapter, minimap, three preview disposal cycles,
pending-init cancellation and renderer recreation with exactly one canvas.
The local package suite writes only test ZIP files: multi-material meshes in separate
packages retain shared materials/textures, parameters, UUIDs, sibling order and JS scripts.
Simulation is deliberately frozen while comparing time uniforms; animation is not
mistaken for serialization corruption.

The real Vue editor was opened using an in-memory test scene. Verified selection,
transform attachment, move/undo/redo, material undo, box clipping, cover screenshot,
DataTexture thumbnail and lightweight-scene disposal. No WebGL contexts or JS runtime
errors were observed in those checks. The local business service at 127.0.0.1:8080 was
unavailable: its actual errors were retained. A test-only browser change opened the existing
layout; no fake API response, login bypass, application loading-gate change or remote save
was used. This does **not** validate service-backed loading/saving.

Negative fixture: unknown ShaderMaterial retained object/material/source, stopped rendering
and invoked the pack upload callback zero times. Factory failure injection confirmed the
permitted official WebGL2 fallback for absent adapter/device creation failure. These
fallback cases are not counted as WebGPU acceptance. Device-loss notification was simulated,
not a physical GPU loss.

### Type and build commands

```powershell
node packages/sdk/node_modules/typescript/bin/tsc -p packages/sdk/tsconfig.json
node packages/editor/node_modules/typescript/bin/tsc -p packages/editor/tsconfig.json
npm exec --yes --package=typescript@5.8.3 --package=vue-tsc@3.3.14 -- vue-tsc --noEmit -p packages/editor/tsconfig.json
Push-Location packages/sdk; node scripts/build.mjs; Pop-Location
Push-Location packages/editor; node node_modules/vite/bin/vite.js build; Pop-Location
```

The transitive vue-tsc 2.0.19 swallows its own incompatibility exception with TS 5.8;
its silent exit is **not** valid verification. The pinned checker above was run independently,
without changing application dependencies or weakening compiler settings.

Production renderer verification imports the actual editor build chunk (not the source
fixture), loads the local split packages, and enables LUT:

```powershell
node tests/rendering/prepare-production.mjs
python -m http.server 8095 --bind 127.0.0.1 --directory packages/editor/dist
# Open http://127.0.0.1:8095/verify-rendering.html
```

The rebuilt production chunk passed: actual WebGPU, visible scene, shared material identity,
LUT loaded from the emitted hashed asset, zero WebGL context requests and no runtime errors.
This is a renderer integration fixture, not the full business editor UI.

For isolated standalone verification, first run the package suite and build the SDK:

```powershell
node tests/rendering/prepare-standalone.mjs
python -m http.server 8094 --bind 127.0.0.1 --directory .codex-logs/standalone
```

This uses the exact exported HTML template, locally packed data and current UMD/resources.
Check http://127.0.0.1:8094/ with context monitoring installed before reload. Local testing
confirmed WebGPU, restored objects, and LUT fetched from runtime/resource/luts/ on that
origin without editor-service dependencies. Binary artifacts and screenshots remain ignored
under .codex-logs/ and tests/rendering/results/; they are not source deliverables.
The SDK UMD, emitted standalone runtime and isolated exported runtime have matching SHA-256
hashes. The final standalone check also exercised Bloom and verified visible scene pixels.

Final real-editor recheck passed move/undo/redo, transform attachment, box clipping,
Bloom, one main canvas and cover capture. Monaco's actual options confirmed GLSL read-only
and JS editable. Switching languages initially exposed unhandled `Canceled` promises from
Monaco's WordHighlighter disposal. Updating the existing model language/editor options
instead of rebuilding the editor fixed this: three JS/GLSL switches retained the editor,
correct read-only state and produced no runtime errors. No exception filter was added.
The final editor checks remained WebGPU with zero WebGL context requests.

### Remaining at the preceding checkpoint (superseded by the follow-up below)

- Developer approval of same-camera r176/WebGPU visual differences; the original darker
  solid-background difference is not resolved by changing exposure or resolution.
- Full service-backed test-copy save/reload and production-editor UI interactions, broader
  skinned/instanced/particle/environment/asset corpus, real tile content, and prolonged
  preview/scene switching with GPU resource/performance measurements.
- No GPU performance improvement is claimed; the editor's CPU submission counter is not
  GPU time. No production project was written, and nothing was merged, deployed or pushed.

## Follow-up: 2026-10-31 — service-backed acceptance

### Service isolation and data integrity

Port 8080 had no listener/Java process. MySQL was available; development paths referred to
an old drive. Redis was absent but no active startup path required it. The current backend
was built and started on loopback with **command-line overrides only**, using database
`astral_webgpu_acceptance_20261031` and the copied asset root under ignored
`.codex-logs/service-acceptance-20261031/static`. No backend source/configuration was changed;
the user's existing application-dev.yml edit was retained. No schema migration was applied.
The unrelated Revit WebSocket at 8081 remained unavailable; no conversion job was triggered.

The copied scene `9600ea7d95189faa4acfa697c0a93d68` was renamed
`WebGPU验收副本-20261031`. Actual editor Save/confirmation uploaded ZIPs and a captured cover:
V3→V4, then V4→V5 after the identity fix below. Reloading V5 yielded zero differences across
323 persistent objects (including Scene), hierarchy/order, UUIDs, transforms, material
parameters/references, textures, scripts, effect/renderer settings, background/environment
identities and rotations. Shared built-in/standard-material texture references remain shared.
Animation time is excluded from live snapshots; the separate frozen package fixture checks
exact time values. Scripts were retained but not enabled; no external business action ran.

Read-only re-dump/hash checks confirm original database `astral3d_new` and all 383 original
asset files are unchanged. The test copy is retained. `tests/rendering/service-roundtrip.mjs`
provides snapshot/comparison helpers: verify **both** database and asset-directory isolation
before using them, not merely a scene ID.

### Defects exposed and fixed

1. **HDR background black across renderers/recreation.** r186 CubeMapNode caches GPU-only
   conversions by texture identity across renderers. The factory now owns an equirectangular
   input identity per renderer and restores the source after rendering. Nested passes do not
   release textures in use. Source UUID/data, serialization and exposure are unchanged.
   Six checks cover two renderers, disposal, replacement, visible pixels and source identity.
2. **Background/environment UUID drift.** Scene.copy/clone creates fresh texture UUIDs.
   App.setScene and Package's shallow serialization shell retain original references;
   actual V5 save/reload checks these identities, not just material textures.
3. **Particle preview listener leak.** Module-global bound callbacks were overwritten by
   other instances and two signals were never removed. Callbacks are now instance-owned;
   all registered listeners are removed. Particle simulation is unchanged.
4. **Pixelation rebuild resource growth.** Fresh MRT identities retained additional r186
   render contexts/draw bindings. The initial prolonged run exposed this and was rejected.
   Reuse the identical output layout per renderer through public getMRT/setMRT APIs; retain
   normal pass-target disposal. No scene-resource flush or private renderer API in app code.
   A 24-rebuild regression stays at 58 uniform buffers / 22,764,441 tracked bytes after warm-up.
5. **Built-in effects plus pixelation failed GPU validation.** r186's fragmentNode path skips
   MRT composition. BuiltinMaterial now preserves its RGBA and supplies the pass's additional
   outputs through setupOutput. All six built-ins are tested with pixelation, and the final
   soak includes an animated StreamerWall material as well as standard materials.
6. **Combined-effect intermediates were not all owned.** FXAA/Afterimage's implicit RTT
   inputs are now explicitly registered for disposal. Outline's uninitialized empty-selection
   output and Afterimage's first-frame history texture are also released (target disposal
   alone had no listener in those cases; the latter uses the pinned r186 target member).
   Repeated single and combined pipelines are checked separately, including empty selection.
7. **Editor Play Mode transport no longer matched Package's response contract.** Its local
   ZIP adapter returned only a blob method, without Response.ok/status. It now returns an
   actual Response for the in-memory ZIP; this is not a substituted business API response.
   Package errors also reject the startup promise immediately instead of waiting 180 seconds.

### Browser and build evidence

- SDK/editor TypeScript, pinned Vue SFC checker, SDK ESM/UMD and production editor builds pass.
- Source suite: 56 checks; split-package roundtrip: 10; HDR: 6; pipeline lifecycle: 72 rebuilds plus
  six built-in material combinations.
  Factory failure injection retains permitted official WebGL2 fallback. Hardware WebGPU
  success cases request zero WebGL contexts; fallback cases are not counted as WebGPU passes.
- Production renderer fixture uses the built chunk, restores shared materials and LUT,
  and has 10,118 visible bright pixels. Independent standalone uses current UMD/resources,
  requests nothing from the editor origin and reports WebGPU without runtime errors.
- Full built editor runs on Vite **preview**, not source dev, at
  `https://localhost:8096/#/editor/9600ea7d95189faa4acfa697c0a93d68` with a test-only proxy to
  the isolated 8080 service. The unrelated remote WebSocket is blocked in the test browser.
  V5 loads; UI selection, transform attachment, move/undo/redo, material edit/undo, box
  clipping identity, Bloom and 2052×960 cover capture pass. One main canvas, actual WebGPU,
  no WebGL contexts/runtime errors. Production interaction changes were not saved over V5.
- Ten clear/load cycles retain one canvas, 7 geometries, 36 uniform buffers and 21,042,827
  tracked resource bytes on every cycle.
- Copied real 3D Tiles content loads 7 models, 2 active visible tiles, zero failed loads,
  node-material rendering and no runtime/WebGL errors. Not an audit of all external formats.
- Short follow-up checks: orthographic rendering/shadows, Bokeh+Pixelate and 960×640 capture;
  actual resource-center sphere and StreamerWall preview dialogs (825×775), their WebGPU
  implementations and disposal, all without runtime errors or WebGL requests.
- Actual editor Run/Stop passes in development and production, including two production
  starts. A controlled local JS script receives Three r186 and the WebGPU renderer, animates
  only the preview copy, and leaves the editor object's transform unchanged. Existing business
  scripts were temporarily replaced **in memory only** for this test, then restored; no external
  actions or saves were performed. Closing Play Mode removes its iframe and leaves one main canvas.
- `prepare-production.mjs` also emits `verify-play.html`, exercising the real built preview
  route and message protocol with fixture ZIPs. The normal case reports started (~300 ms);
  `?missing=1` intentionally omits child ZIPs and reports the exact missing-file error (~65 ms),
  rather than false success or a 180-second hang. These timings are fixture observations.

### Visual approval and measurement scope

Matched r176-WebGL / r186-WebGL / r186-WebGPU captures use 960×640, DPR 1, ACES exposure 1
and identical geometry/camera/lights. The user explicitly accepted solid background RGB
39→21 and small transparency/shadow-edge differences on 2026-10-31, deferring unified quality
tuning. No exposure compensation, omitted objects or reduced quality was introduced.

On NVIDIA Lovelace (`isFallbackAdapter=false`), a fresh renderer measured 36.3 ms initialization,
51.5 ms compileAsync, and 12.1 ms first submission plus queue completion for the fixed fixture.
These are wall-clock API measurements, not cold-driver benchmarks or pure GPU timings.

The 30-minute soak includes real particles, 300 instances, skeletal animation, HDR background/
environment, shadows, clipping, eight effects, alternating viewport sizes and preview/minimap
disposal cycles. CDP focus emulation keeps animation active. CPU submission, frame intervals
and hardware timestamp queries are recorded separately. Other acceptance tabs/builds share
the machine: this is a stability/resource test, not an isolated performance comparison.
The completed post-fix run lasted 1,800.03 seconds: 74,715 visible render calls, 120 preview
and 120 minimap cycles, zero runtime errors, zero WebGL requests, unchanged signal-listener
counts and one canvas. After warm-up, render contexts stay at 21 and geometries at 37.
The same 960×640 combined-effect phase measures 84.169 MB at 1,341 s and 84.173 MB at
1,612 s; the particle pool rises slightly from 2,243 to 2,279. Tracked resource bytes vary
with effect/size (24.94–90.18 MB in the final ten minutes), rather than growing per rebuild.
This is not a proof that no untested workload can leak.

Measured p50/p95: CPU submission 13.7/21.9 ms; render-call interval 17.1/30.9 ms;
hardware timestamp-query result 2.03/4.19 ms. These are separate quantities. The r186 query
reports the last resolved renderer frame, not end-to-end application latency. Recompiles,
view creation and concurrent verification affect timing; no speed improvement is claimed.

Per the user's subsequent instruction, **future soak runs default to 15 minutes**.
The completed 30-minute evidence is retained; no additional prolonged run is requested now.

## Manual acceptance

For the shared WebGL/WebGPU local service, persistent scene-version labels and the inventory
of existing copies/backups, see [LOCAL_WEBGPU_ENVIRONMENT.md](LOCAL_WEBGPU_ENVIRONMENT.md).

Use test projects/copies only. Open the local editor, edit and transform objects, change
materials/shadows/effects, undo/redo, capture a cover, save and reload the test copy.
Check model/material previews, play mode, orthographic views, clipping and the minimap.
Export a standalone package and serve it at a separate localhost/HTTPS origin with the
editor server stopped. Compare the same scene/camera against the baseline. Check that
unsupported GLSL reports failure without losing the original object/material/script.
Record browser, GPU, actual rendering API and failures; do not infer GPU time from CPU
submission time. Automated checks alone do not constitute final acceptance.
