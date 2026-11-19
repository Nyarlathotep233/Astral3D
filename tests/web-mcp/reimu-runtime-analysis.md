# Offline Reimu motion evidence

Run only after the final harness produces its completed `runtime-samples.json`. This script never connects to a live page or service and cannot change a scene.

```powershell
node tests/web-mcp/reimu-runtime-analysis.mjs .git/codex-runtime/reimu-shrine/runtime-samples.json
```

It writes `runtime-analysis.json` beside the input, keeping the input hash and every threshold. Exit codes are `0` for required assertions passing, `1` for a numeric/identity failure, and `2` for incomplete evidence or invalid input. The report separates required assertions, optional assertions, direct quantities and limitations.

Required evidence uses exact names `Reimu`, `ReimuSprite`, `ReimuShadow`, and independently tracked `FallingLeaf_*` UUIDs:

- At least eight strictly ordered samples spanning 15 seconds.
- Reimu moves at least 0.25 scene units horizontally in X/Z, not only vertically. A sampled rise followed by a return is at least 0.15 units high.
- Shadow Y range is at most 0.03 units. Its scale proxy increases with actor height (Pearson correlation at least 0.5 and high/low-height quartile increase at least 5%). Material slot 0 opacity decreases with height (correlation at most −0.5 and quartile decrease at least 0.03).
- ReimuSprite has at least two actual geometry UV, texture transform or shader frame-uniform states, or supplemental image hashes show actual texture pixels changing. A userData frame counter alone is insufficient, never grounds for claiming CanvasTexture animation is broken.
- At least two independently named leaves move 0.05 units or more. Horizontal and vertical displacement are reported separately; movement alone does not prove broom contact caused it.

The default thresholds are explicit acceptance choices, not inferred character sizes. The report gives the measured distances, height ranges, peak times, correlation values, opacity ranges and per-leaf tracks. Sparse samples cannot verify 6–8 fps or every intermediate frame. Shadow size is the product of its two largest absolute world-scale components, not a measured geometric projected area.

Constant shadow Y alone cannot establish ground contact. If the ground world height is known independently, pass `--ground-y <number>` or set `REIMU_GROUND_Y`. The required ground-height assertion then uses a 0.05-unit tolerance. Without it, absolute ground contact is explicitly `not_evaluated`; screenshots/geometry need separate inspection.

If the character redraws a CanvasTexture without changing UVs, supply independently captured real map pixel hashes:

```json
{
  "objectName": "ReimuSprite",
  "samples": [
    {"elapsedMs": 0, "sha256": "64 hexadecimal characters from actual texture image pixels"},
    {"elapsedMs": 180, "sha256": "another actual texture pixel hash"}
  ]
}
```

```powershell
node tests/web-mcp/reimu-runtime-analysis.mjs <runtime-samples.json> --pixel-evidence <sprite-pixels.json> --ground-y 0.8
```

The analysis accepts genuine changing shader frame uniforms as render-state evidence. Pixel-hash evidence is supplied by the caller; the report does not pretend it independently acquired those pixels or established their visual correctness.
