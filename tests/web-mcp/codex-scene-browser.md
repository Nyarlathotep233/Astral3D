# Real Codex scene acceptance harness

`codex-scene-browser.mjs` is an explicit, live acceptance run. Do not run the final Reimu case until the preceding validation tasks have passed.

Prerequisites: editor at `https://localhost:8090`, bridge at `127.0.0.1:8098`, Java API at `http://127.0.0.1:8080/api`, installed Chrome, Playwright and Codex. It creates a dedicated empty project unless `SCENE_ID` identifies an existing **dedicated acceptance project** to refine. Projects remain available for review; pairings and temporary screenshot artifacts are cleaned up. The script never edits global Codex configuration or uses a browser download.

Prepare an authorized scene prompt in a UTF-8 text file. Example PowerShell invocation, **to run only when the final case is authorized to start**:

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:/Users/ZZC/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'
$env:CODEX_BINARY = '<absolute path to codex.exe>'
$env:CODEX_SCENE_PROMPT = '<absolute path to scene prompt.txt>'
# Optional visual reference supplied to Codex alongside the text prompt:
$env:CODEX_SCENE_REFERENCE_IMAGE = '<absolute path to reference image.png>'
$env:CODEX_SCENE_CASE = 'reimu-shrine'
$env:CODEX_SCENE_MIN_OBJECTS = '50'
$env:CODEX_RUNTIME_REQUIRED_MOTION = 'Reimu,FallingLeaf'
$env:CODEX_RUNTIME_REQUIRED_UV = 'ReimuSprite'
$env:CODEX_RUNTIME_REQUIRED_SHADOW = 'ReimuShadow'
node tests/web-mcp/codex-scene-browser.mjs
```

The prompt is read from the file and sent on the child's stdin. The child uses `--ignore-user-config --ephemeral --skip-git-repo-check --json --approve-for-me` with only the paired H3D MCP server configured by the harness. The generated instruction restricts authoring to H3D MCP tools, the specified project and explicit saves. Observed completed shell/file/web/other-server operations fail the tool-scope assertion. A successful process exit alone does not pass acceptance.

The harness independently checks saved version growth, object count, scripts and custom GLSL shaders. It captures the authored viewport, reloads and pairs again, then checks exact object UUIDs and hashes of complete script data and shader sources/uniforms. It starts the actual preview iframe, waits for `running`, captures three runtime views, observes the runtime for at least 15 seconds, checks runtime diagnostics, and stops preview.

| Environment variable | Meaning / default |
| --- | --- |
| `SCENE_ID` | Optional existing dedicated project ID. A new empty project is the default. |
| `CODEX_SCENE_REFERENCE_IMAGE` | Optional local reference image passed to Codex with `--image`. It provides visual guidance; scene creation still uses only the paired H3D MCP tools. |
| `CODEX_SCENE_CASE` | Simple output directory name, default `codex-scene`. Use a distinct name per acceptance case. |
| `CODEX_SCENE_MIN_OBJECTS` | Required final object count, default `10`. |
| `CODEX_SCENE_MIN_ADDED` | Required growth over initial count, default `10` for new scenes or `0` for refinement. |
| `CODEX_SCENE_MIN_SCRIPTS` | Minimum persisted script assignments, default `1`. |
| `CODEX_SCENE_MIN_SHADERS` | Minimum persisted ShaderMaterial/RawShaderMaterial assignments, default `1`. |
| `CODEX_SCENE_TIMEOUT_MS` | Child authoring deadline, default one hour. |
| `CODEX_RUNTIME_SAMPLE_MS` | Sampling duration, default `16000`; minimum `15000`. |
| `CODEX_RUNTIME_SAMPLE_INTERVAL_MS` | Sampling interval, default `500`. |
| `CODEX_RUNTIME_NAME_PATTERN` | Case-insensitive regex selecting objects. Default matches Reimu, falling leaves, leaves, shadows, sprites, 灵梦 and 落叶. Maximum 200 matched objects per sample. |
| `CODEX_RUNTIME_REQUIRED_MOTION` | Comma-separated case-sensitive name fragments. Each requires a matched object whose world position changes across samples. |
| `CODEX_RUNTIME_REQUIRED_UV` | Same matching rule; each requires changed geometry UVs, texture offset/repeat/rotation, or reported frame data/uniforms. |
| `CODEX_RUNTIME_REQUIRED_SHADOW` | Same matching rule; each requires an object with changes to **both** world scale and material opacity. |
| `CODEX_RUNTIME_SAMPLE_JS` | Optional UTF-8 file containing a synchronous, read-only function expression. Its JSON result augments each built-in sample. |
| `EDITOR_URL`, `API_URL` | Override the editor and API defaults above. |

The prompt must explicitly require the named runtime objects if the motion assertions are enabled. For the Reimu case, use names such as `Reimu`, `ReimuSprite`, `ReimuShadow` and `FallingLeaf_01`. A missing object or stationary/unchanging object fails the corresponding assertion. Multiple objects matching a name fragment are satisfied by at least one changing object; inspect the full tracks for per-leaf coverage.

An optional custom sampler is test instrumentation, not authoring code. For example, a file containing this function expression records a directly exposed sprite frame:

```js
({ scene, elapsedMs }) => ({
  elapsedMs,
  frame: scene.getObjectByName('ReimuSprite')?.userData?.currentFrame ?? null,
})
```

Built-in samples always include local/world positions and scales, rotation, geometry UVs, material opacity, map/alphaMap offset/repeat/rotation, primitive frame state, and frame-related uniforms. They read the actual iframe scene. This numerical evidence detects change; authoring/runtime screenshots still need visual assessment for artistic quality and correct appearance.

Evidence is under `.git/codex-runtime/<case>`: compact `result.json`, `prompt.txt`, `codex-events.compact.jsonl`, bounded stderr, before/after persistence hashes, authoring screenshots, three runtime captures and `runtime-samples.json`. Image/base64 tool results and long event bodies are omitted or shortened in child logs. Tokens are omitted; the full image result stream is never printed. Failure paths retain available motion samples and a browser screenshot.

`authoring-journal.jsonl` separately preserves complete arguments/results/errors for completed H3D `scene_batch`, `history` and `project` calls, including script, shader and authored pixel data. It omits paired tokens and contains no viewport image tool output. `authoring-snapshot.json` records the in-memory scene JSON, scripts and scene metadata through read-only inspection before persistence assertions, so authored data remains available if a later save/reload check fails. These files support inspection and recovery; the independent save/reload comparison remains the persistence acceptance check. Snapshot collection failures are recorded as `snapshotError` in `result.json`.
