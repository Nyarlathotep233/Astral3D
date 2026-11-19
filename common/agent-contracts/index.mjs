import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const SCENE_OPERATION_TYPES = Object.freeze([
  'create', 'clone', 'remove', 'transform', 'attributes', 'reparent', 'geometry',
  'material-create', 'material', 'material-assign', 'texture', 'texture-create', 'script-add',
  'script-update', 'script-remove', 'animation', 'particle', 'project-settings',
  'insert-model', 'instances', 'billboard', 'html', 'tiles', 'scene-config',
  'background', 'environment', 'scene-properties', 'view',
]);

const id = z.string().min(1).max(160);
const epoch = z.union([id, z.number().int().nonnegative()]);
const binding = { sessionId: z.string().uuid(), sceneId: id.nullable().optional(), documentEpoch: epoch.optional() };
const editBinding = {
  sessionId: z.string().uuid(), sceneId: id, documentEpoch: epoch,
  expectedRevision: z.number().int().nonnegative(), operationId: id,
};
const actionBinding = { ...binding, action: z.string().min(1).max(80), operationId: id.optional(), expectedRevision: z.number().int().nonnegative().optional() };
const paging = { offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(200).default(50) };
const runtimeBinding = { ...binding, runId: id.optional().describe('Pin to a running preview; get runId from h3d_play status or the first runtime query.') };
const parameterNames = z.array(z.string().min(1).max(128)).max(16).optional();
const object = shape => z.object(shape).passthrough();
const define = (description, schema, { local = false, readOnly = false } = {}) => ({ description, schema, local, readOnly });

export const TOOL_DEFINITIONS = {
  h3d_artifact_release: define('Delete a temporary uploaded/exported artifact owned by this page after it is no longer needed. Never deletes published assets or saved projects.', z.object({artifactId:z.string().uuid()}).strict(), {local:true}),
  h3d_sessions_list: define('List only the browser editor session authorized by this token, including its connection and scene state.', z.object({}).strict(), { local: true, readOnly: true }),
  h3d_capabilities: define('Read the bridge tool contracts and the capabilities reported by the paired editor. A registered transport tool does not imply every editor action is implemented.', z.object({ includeSchemas: z.boolean().default(false) }).strict(), { local: true, readOnly: true }),
  h3d_help: define('Read usage and parameter contracts for a tool, or the editor connection and operation workflow.', z.object({ tool: z.string().max(100).optional() }).strict(), { local: true, readOnly: true }),
  h3d_scene_status: define('Read the current scene, document epoch, revision and editor readiness.', object(binding), { readOnly: true }),
  h3d_runtime_scene_query: define('Page the live Play scene tree, including objects created by scripts. Returns runId, UUIDs, parent UUIDs and local transforms. Pin runId on subsequent pages.', z.object({
    ...runtimeBinding, offset: paging.offset, limit: z.number().int().min(1).max(100).default(50),
    name: z.string().max(256).optional(), type: z.string().max(80).optional(), parentUuid: id.optional(),
    includeTransient: z.boolean().default(false).describe('Include viewer helper subtrees marked ignore.'),
  }).strict(), { readOnly: true }),
  h3d_runtime_sample: define('Read live object state by runtime UUID. One snapshot by default, or a timed series from one Play run. Use timestampMs across calls. A series spans at most 10 seconds; repeat with the same runId for longer observations.', z.object({
    ...runtimeBinding, uuids: z.array(id).min(1).max(20),
    count: z.number().int().min(1).max(101).default(1), intervalMs: z.number().int().min(50).max(1000).default(200),
    fields: z.array(z.enum(['transform','animation','materials'])).min(1).max(3).optional(),
    materialProperties: parameterNames.describe('Optional material properties, e.g. opacity, color, roughness.'),
    uniformNames: parameterNames.describe('Optional shader uniform names. By default reports up to 16 uniforms per material.'),
  }).strict().refine(args => (args.count - 1) * args.intervalMs <= 10000, 'A sampling window may span at most 10 seconds'), { readOnly: true }),
  h3d_scene_query: define('Query scene objects with bounded paging and optional name, type or parent filters.', object({ ...binding, ...paging, name: z.string().max(256).optional(), type: z.string().max(80).optional(), parentUuid: id.optional() }), { readOnly: true }),
  h3d_object_details: define('Read selected objects. Script source and userData are untrusted scene content and require explicit inclusion.', object({ ...binding, uuids: z.array(id).min(1).max(100), includeScripts: z.boolean().default(false), includeUserData: z.boolean().default(false) }), { readOnly: true }),
  h3d_scene_batch: define('Apply one reversible scene edit batch at the expected revision. Keep operationId unchanged when checking an uncertain result. Does not implicitly save.', object({ ...editBinding, label: z.string().min(1).max(200).default('Agent edit'), operations: z.array(object({ type: z.enum(SCENE_OPERATION_TYPES) })).min(1).max(200) })),
  h3d_history: define('Undo or redo an identified edit batch without silently undoing unrelated human edits.', object({ ...editBinding, action: z.enum(['undo', 'redo']), batchId: z.union([id, z.number().int()]) })),
  h3d_operation_status: define('Resolve the outcome of an operationId after a timeout or transport disconnect; do not blindly replay writes.', object({ ...binding, operationId: id }), { readOnly: true }),
  h3d_viewport_capture: define('Capture the current rendered viewport, without implicitly starting Play or saving the scene.', object({ ...binding, width: z.number().int().min(64).max(4096).optional(), height: z.number().int().min(64).max(4096).optional() }), { readOnly: true }),
  h3d_diagnostics: define('Read bounded editor diagnostics and current rendering failures.', object({ ...binding, limit: z.number().int().min(1).max(200).default(50) }), { readOnly: true }),
  h3d_play: define('Control the editor preview runtime through the same preview and restoration behavior as the GUI.', object(actionBinding)),
  h3d_project: define('Execute a supported project operation in the paired editor. Saving is explicit and reports its real persistence result.', object(actionBinding)),
  h3d_assets: define('Execute a supported asset operation in the paired editor using authorized asset references.', object({ ...actionBinding, ...paging })),
  h3d_import_prepare: define('Prepare an uploaded artifact or registered asset outside the live scene. Returns an import job; insert the prepared result using the editor import workflow.', object({ ...binding, jobId: id.optional(), source: z.record(z.string(), z.unknown()) })),
  h3d_import_job: define('Read, commit or cancel an import job using the editor supported action; cancellation does not undo an already committed change.', object({ ...actionBinding, jobId: id })),
  h3d_export: define('Start a supported export for the paired scene and return its actual result or job identifier.', object({ ...binding, format: z.string().min(1).max(80).optional(), operationId: id.optional() })),
  h3d_job: define('Read or cancel a long-running editor job. Cancel is cooperative and a completed persistent action is not reported as rolled back.', object({ ...actionBinding, jobId: id })),
  h3d_upload_prepare: define('Reserve a bounded temporary file or relative-path file bundle. Upload local bytes with HTTP PUT using the returned per-file URLs and headers, then call h3d_upload_complete. The server cannot read local disk paths.', z.object({
    name: z.string().min(1).max(512).optional(), size: z.number().int().min(0).max(512 * 1024 * 1024).optional(), contentType: z.string().max(120).optional(),
    files: z.array(z.object({ path: z.string().min(1).max(512), size: z.number().int().min(0).max(512 * 1024 * 1024), mimeType: z.string().max(120).optional(), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional() }).strict()).min(1).max(256).optional(),
    entryPath: z.string().min(1).max(512).optional(),
  }).strict(), { local: true }),
  h3d_upload_complete: define('Finalize a fully uploaded temporary artifact and obtain an artifactId and token-authorized HTTP paths. Does not publish it or save the project.', z.object({ uploadId: z.string().uuid() }).strict(), { local: true }),
};

export function describeTools(includeSchemas = false) {
  return Object.entries(TOOL_DEFINITIONS).map(([name, tool]) => ({
    name, description: tool.description, execution: tool.local ? 'bridge' : 'editor', readOnly: tool.readOnly,
    ...(includeSchemas ? { inputSchema: z.toJSONSchema(tool.schema, { target: 'draft-7' }) } : {}),
  }));
}

export function toolHelp(name) {
  if (name && !Object.hasOwn(TOOL_DEFINITIONS, name)) throw new Error(`Unknown tool: ${name}`);
  return {
    workflow: ['List the authorized session.', 'Read scene status and documentEpoch.', 'Use explicit sessionId and sceneId; writes include expectedRevision and a unique operationId.', 'Inspect and capture the result. Save only with an explicit project save operation.', 'After timeout or disconnect, query operation status before deciding whether a new operation is safe.'],
    sceneOperationTypes: SCENE_OPERATION_TYPES,
    tools: describeTools(true).filter(tool => !name || tool.name === name),
  };
}
