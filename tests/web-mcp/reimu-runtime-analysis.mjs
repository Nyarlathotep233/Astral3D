// Offline only: reads completed evidence files; never opens a browser or calls a service.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const vector = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finite);
const round = value => finite(value) ? Math.round(value * 1e6) / 1e6 : null;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const range = values => values.length ? { min: Math.min(...values), max: Math.max(...values), span: Math.max(...values) - Math.min(...values) } : { min: null, max: null, span: null };
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const distinct = values => new Set(values.map(canonical)).size;
function correlation(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const xMean = mean(xs), yMean = mean(ys);
  let covariance = 0, xx = 0, yy = 0;
  for (let index = 0; index < xs.length; index++) { const x = xs[index] - xMean, y = ys[index] - yMean; covariance += x * y; xx += x * x; yy += y * y; }
  return xx > 1e-12 && yy > 1e-12 ? covariance / Math.sqrt(xx * yy) : null;
}
function diameter(points, axes = [0, 1, 2]) {
  let largest = 0;
  for (let left = 0; left < points.length; left++) for (let right = left + 1; right < points.length; right++) largest = Math.max(largest, Math.hypot(...axes.map(axis => points[left][axis] - points[right][axis])));
  return largest;
}
function uvState(object) {
  // userData frame counters are intentionally excluded: they can advance without rendering a frame.
  return { uv: object.uv || [], materials: (object.materials || []).map(material => ({
    maps: (material.maps || []).map(map => ({ key: map.key, offset: map.offset, repeat: map.repeat, rotation: map.rotation })),
    frameUniforms: material.frameUniforms || {},
  })) };
}
function frameState(object) { return { frame: object.frame || {}, materials: (object.materials || []).map(material => ({ frame: material.frame || {}, maps: (material.maps || []).map(map => map.frame || {}) })) }; }

export function analyzeReimuRuntime(input, options = {}, pixelEvidence) {
  const thresholds = { minimumDurationMs: 15000, minimumSamples: 8, minimumHorizontalDistance: 0.25, minimumHopHeight: 0.15,
    maximumShadowYRange: 0.03, groundYTolerance: 0.05, minimumScaleRatio: 0.05, minimumOpacityChange: 0.03,
    minimumAbsoluteCorrelation: 0.5, minimumMovingLeaves: 2, minimumLeafDistance: 0.05, ...options };
  const samples = Array.isArray(input?.samples) ? input.samples : [];
  if (samples.length > 10000) throw new Error('Evidence contains more than 10000 samples');
  const report = { verdict: 'incomplete', requiredAssertions: [], optionalAssertions: [], thresholds, metrics: {}, limitations: [
    'Metrics describe sampled runtime values; they do not establish visual quality, obstacle avoidance, foot contact, or correct choreography.',
    'World units are scene units. Displacement thresholds are explicit acceptance thresholds, not an inferred character scale.',
    'Sparse samples cannot establish a 6–8 fps animation rate or guarantee every hop/apex was observed.',
    'Shadow scale uses the product of the two largest absolute world-scale components as a size proxy; this is not measured geometric projected area.',
    'Changing a frame uniform is direct render-state evidence, but shader/image appearance still requires visual assessment.',
  ] };
  const check = (name, condition, observed, requirement, required = true, inconclusive = false) => (required ? report.requiredAssertions : report.optionalAssertions).push({ name, status: inconclusive ? 'insufficient_evidence' : condition ? 'pass' : 'fail', observed, requirement });
  const validTimes = samples.length > 0 && samples.every((sample, index) => finite(sample.elapsedMs) && Array.isArray(sample.objects) && (index === 0 || sample.elapsedMs > samples[index - 1].elapsedMs));
  const durationMs = validTimes ? samples.at(-1).elapsedMs - samples[0].elapsedMs : null;
  check('sampling_window', validTimes && samples.length >= thresholds.minimumSamples && durationMs >= thresholds.minimumDurationMs,
    { samples: samples.length, durationMs }, { minimumSamples: thresholds.minimumSamples, minimumDurationMs: thresholds.minimumDurationMs, strictlyIncreasingTimes: true });
  report.metrics.sampling = { samples: samples.length, durationMs, runId: input?.runId ?? null };
  if (!validTimes) { report.verdict = 'fail'; return report; }

  function exactTrack(name) {
    const rows = [], invalidFrames = [], ids = new Set();
    samples.forEach((sample, index) => {
      const matches = sample.objects.filter(object => object.name === name);
      if (matches.length !== 1 || !vector(matches[0]?.worldPosition) || !matches[0]?.uuid) { invalidFrames.push(index); return; }
      ids.add(matches[0].uuid); rows.push({ index, elapsedMs: sample.elapsedMs, object: matches[0] });
    });
    check(`exact_object_${name}`, !invalidFrames.length && ids.size === 1, { samplesFound: rows.length, invalidFrames, uuidCount: ids.size }, 'Exactly one object of this exact name and stable UUID in every sample');
    return rows;
  }
  const actor = exactTrack('Reimu'), sprite = exactTrack('ReimuSprite'), shadow = exactTrack('ReimuShadow');
  const actorPositions = actor.map(row => row.object.worldPosition), heights = actorPositions.map(position => position[1]);
  const horizontalDistance = diameter(actorPositions, [0, 2]), vertical = range(heights);
  const excursions = [];
  for (let index = 1; index < heights.length - 1; index++) {
    if (heights[index] < heights[index - 1] || heights[index] <= heights[index + 1]) continue;
    const lowBefore = Math.min(...heights.slice(0, index)), lowAfter = Math.min(...heights.slice(index + 1));
    const riseAndReturnHeight = heights[index] - Math.max(lowBefore, lowAfter);
    if (riseAndReturnHeight >= thresholds.minimumHopHeight) excursions.push({ elapsedMs: actor[index].elapsedMs, peakWorldY: heights[index], riseAndReturnHeight });
  }
  report.metrics.actor = { exactName: 'Reimu', horizontalDiameterXZ: horizontalDistance, x: range(actorPositions.map(point => point[0])), z: range(actorPositions.map(point => point[2])), y: vertical,
    observedRiseAndReturnPeaks: excursions, note: 'Peak prominence uses sampled lower points before and after each local maximum; it is not a physics or state-machine assertion.' };
  check('actor_horizontal_relocation', horizontalDistance >= thresholds.minimumHorizontalDistance, horizontalDistance, { minimumXZDiameter: thresholds.minimumHorizontalDistance });
  check('actor_positive_hop_and_return', excursions.length > 0, { verticalRange: vertical.span, observedRiseAndReturnPeaks: excursions.length }, { minimumSampledRiseAndReturn: thresholds.minimumHopHeight });

  const byIndex = new Map(actor.map(row => [row.index, row.object.worldPosition[1]]));
  const paired = shadow.map(row => {
    const scale = row.object.worldScale, opacity = row.object.materials?.[0]?.opacity;
    if (!vector(scale) || !finite(opacity) || !byIndex.has(row.index)) return null;
    const largest = scale.slice(0, 3).map(Math.abs).sort((left, right) => right - left);
    return { actorY: byIndex.get(row.index), shadowY: row.object.worldPosition[1], scaleProxy: largest[0] * largest[1], opacity, elapsedMs: row.elapsedMs };
  }).filter(Boolean);
  check('shadow_numeric_samples', paired.length === samples.length, { paired: paired.length }, 'Each sample has actor height, shadow world scale and material slot 0 opacity');
  const shadowY = range(paired.map(row => row.shadowY)), scale = range(paired.map(row => row.scaleProxy)), opacity = range(paired.map(row => row.opacity));
  const scaleCorrelation = correlation(paired.map(row => row.actorY), paired.map(row => row.scaleProxy));
  const opacityCorrelation = correlation(paired.map(row => row.actorY), paired.map(row => row.opacity));
  const sorted = [...paired].sort((left, right) => left.actorY - right.actorY), quartileCount = Math.max(1, Math.floor(sorted.length / 4));
  const low = sorted.slice(0, quartileCount), high = sorted.slice(-quartileCount);
  const lowScale = mean(low.map(row => row.scaleProxy)), highScale = mean(high.map(row => row.scaleProxy));
  const lowOpacity = mean(low.map(row => row.opacity)), highOpacity = mean(high.map(row => row.opacity));
  const scaleRatio = lowScale > 0 ? highScale / lowScale - 1 : null, opacityDrop = finite(lowOpacity) && finite(highOpacity) ? lowOpacity - highOpacity : null;
  report.metrics.shadow = { exactName: 'ReimuShadow', y: shadowY, scaleProxy: scale, materialSlot0Opacity: opacity,
    pearsonActorHeightVsScale: scaleCorrelation, pearsonActorHeightVsOpacity: opacityCorrelation,
    heightQuartiles: { lowMeanActorY: mean(low.map(row => row.actorY)), highMeanActorY: mean(high.map(row => row.actorY)), lowMeanScaleProxy: lowScale, highMeanScaleProxy: highScale, relativeScaleIncrease: scaleRatio, lowMeanOpacity: lowOpacity, highMeanOpacity: highOpacity, opacityDecrease: opacityDrop },
  };
  check('shadow_world_y_stays_on_one_plane', finite(shadowY.span) && shadowY.span <= thresholds.maximumShadowYRange, shadowY, { maximumYRange: thresholds.maximumShadowYRange });
  check('shadow_grows_with_actor_height', finite(scaleCorrelation) && scaleCorrelation >= thresholds.minimumAbsoluteCorrelation && finite(scaleRatio) && scaleRatio >= thresholds.minimumScaleRatio,
    { correlation: scaleCorrelation, highVsLowHeightScaleIncrease: scaleRatio }, { minimumPositiveCorrelation: thresholds.minimumAbsoluteCorrelation, minimumRelativeScaleIncrease: thresholds.minimumScaleRatio });
  check('shadow_fades_with_actor_height', finite(opacityCorrelation) && opacityCorrelation <= -thresholds.minimumAbsoluteCorrelation && finite(opacityDrop) && opacityDrop >= thresholds.minimumOpacityChange,
    { correlation: opacityCorrelation, highVsLowHeightOpacityDecrease: opacityDrop }, { maximumNegativeCorrelation: -thresholds.minimumAbsoluteCorrelation, minimumOpacityDecrease: thresholds.minimumOpacityChange });
  if (finite(thresholds.groundY)) {
    const maximumGroundError = paired.length ? Math.max(...paired.map(row => Math.abs(row.shadowY - thresholds.groundY))) : null;
    check('shadow_matches_supplied_ground_y', finite(maximumGroundError) && maximumGroundError <= thresholds.groundYTolerance, { maximumGroundError }, { groundY: thresholds.groundY, tolerance: thresholds.groundYTolerance });
  } else report.optionalAssertions.push({ name: 'shadow_absolute_ground_contact', status: 'not_evaluated', observed: shadowY, reason: 'No ground geometry or known ground Y was supplied. Constant shadow Y does not prove contact with the actual ground.' });

  const renderStates = distinct(sprite.map(row => uvState(row.object))), reportedFrames = distinct(sprite.map(row => frameState(row.object)));
  const pixelSamples = pixelEvidence?.objectName === 'ReimuSprite' && Array.isArray(pixelEvidence.samples) ? pixelEvidence.samples.filter(sample => finite(sample.elapsedMs) && /^[a-f0-9]{64}$/i.test(sample.sha256 || '')) : [];
  const pixelHashes = new Set(pixelSamples.map(sample => sample.sha256.toLowerCase())).size;
  const renderAnimationProven = renderStates >= 2 || pixelHashes >= 2;
  report.metrics.sprite = { exactName: 'ReimuSprite', distinctActualUvMapOrFrameUniformStates: renderStates, distinctReportedFrameStates: reportedFrames,
    distinctSupplementalPixelHashes: pixelHashes, supplementalPixelSamples: pixelSamples.length,
    evidenceKind: renderStates >= 2 ? 'actual UV/map/frame uniform changes' : pixelHashes >= 2 ? 'supplemental actual map pixel hashes' : 'rendered frame evidence is insufficient',
    note: 'An unchanged UV state may be valid CanvasTexture pixel redrawing. A userData frame counter alone neither proves nor disproves rendered animation.' };
  check('sprite_rendered_frame_animation', renderAnimationProven, report.metrics.sprite, 'At least two actual UV/map/frame-uniform states OR two actual map pixel hashes for exact ReimuSprite', true, !renderAnimationProven);

  const leaves = new Map();
  for (const sample of samples) for (const object of sample.objects) if (/^FallingLeaf_/.test(object.name) && object.uuid && vector(object.worldPosition)) {
    if (!leaves.has(object.uuid)) leaves.set(object.uuid, { name: object.name, uuid: object.uuid, positions: [] });
    leaves.get(object.uuid).positions.push(object.worldPosition);
  }
  const leafMetrics = [...leaves.values()].map(leaf => {
    let descendingSteps = 0, descendingDistance = 0;
    for (let index = 1; index < leaf.positions.length; index++) { const drop = leaf.positions[index - 1][1] - leaf.positions[index][1]; if (drop > 0.0001) { descendingSteps++; descendingDistance += drop; } }
    return { name: leaf.name, uuid: leaf.uuid, samples: leaf.positions.length, worldDistanceDiameter: diameter(leaf.positions), horizontalDiameterXZ: diameter(leaf.positions, [0, 2]), y: range(leaf.positions.map(position => position[1])), descendingSteps, sampledDescendingDistance: descendingDistance };
  });
  const movingLeaves = leafMetrics.filter(leaf => leaf.samples >= thresholds.minimumSamples && leaf.worldDistanceDiameter >= thresholds.minimumLeafDistance);
  report.metrics.leaves = { namedCount: leafMetrics.length, movingCount: movingLeaves.length, tracks: leafMetrics,
    note: 'Motion is verified independently per leaf UUID. This does not prove a broom caused it; ground sweeping and falling are reported separately by horizontal and vertical metrics.' };
  check('multiple_falling_leaves_move', movingLeaves.length >= thresholds.minimumMovingLeaves, { namedLeaves: leafMetrics.length, movingLeaves: movingLeaves.length }, { minimumMovingLeaves: thresholds.minimumMovingLeaves, minimum3dDiameter: thresholds.minimumLeafDistance });
  report.verdict = report.requiredAssertions.some(item => item.status === 'fail') ? 'fail' : report.requiredAssertions.some(item => item.status === 'insufficient_evidence') ? 'incomplete' : 'pass';
  // Keep nulls rather than serializing NaN or inventing correlation for constant data.
  return JSON.parse(JSON.stringify(report, (_key, value) => typeof value === 'number' ? round(value) : value));
}

async function main() {
  const args = process.argv.slice(2), inputPath = path.resolve(args[0] || path.join('.git/codex-runtime', process.env.CODEX_SCENE_CASE || 'reimu-shrine', 'runtime-samples.json'));
  const option = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const raw = await readFile(inputPath, 'utf8'); // Missing file is a clear error, never a poll or a live-browser fallback.
  const pixelPath = option('--pixel-evidence'), ground = option('--ground-y') ?? process.env.REIMU_GROUND_Y;
  const options = {};
  if (ground !== undefined) { options.groundY = Number(ground); if (!finite(options.groundY)) throw new Error('Ground Y must be a finite number'); }
  const supplemental = pixelPath ? JSON.parse(await readFile(path.resolve(pixelPath), 'utf8')) : undefined;
  const report = analyzeReimuRuntime(JSON.parse(raw), options, supplemental);
  report.input = inputPath; report.inputSha256 = createHash('sha256').update(raw).digest('hex'); report.analyzedAt = new Date().toISOString();
  if (pixelPath) report.pixelEvidence = path.resolve(pixelPath);
  const reportPath = path.resolve(option('--output') || path.join(path.dirname(inputPath), 'runtime-analysis.json'));
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, report: reportPath, required: report.requiredAssertions.map(({ name, status }) => ({ name, status })), actor: report.metrics.actor, shadow: report.metrics.shadow, sprite: report.metrics.sprite, leaves: { named: report.metrics.leaves?.namedCount, moving: report.metrics.leaves?.movingCount } }, null, 2));
  process.exitCode = report.verdict === 'pass' ? 0 : report.verdict === 'incomplete' ? 2 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 2; });
