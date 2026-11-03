import { z } from 'zod';

const binding = { sessionId: z.string().uuid(), sceneId: z.string().min(1).max(128) };
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const target = z.union([z.object({ uuid: z.string().uuid() }).strict(), z.object({ ref: z.string().min(1).max(80) }).strict()]);
const transform = { position: vector.optional(), rotation: vector.optional(), rotationOrder: z.enum(['XYZ','YXZ','ZXY','ZYX','YZX','XZY']).optional(), scale: vector.optional() };
const operation = z.discriminatedUnion('type', [
  z.object({ type:z.literal('insert-model'), jobId:z.string().uuid(), ref:z.string().min(1).max(80), name:z.string().max(256).optional(), parent:target.optional(), ...transform }).strict(),
  z.object({ type: z.literal('material'), target, slot: z.number().int().nonnegative(), scope: z.enum(['shared','object']), values: z.object({ color:z.string().regex(/^#[0-9a-f]{6}$/i).optional(), emissive:z.string().regex(/^#[0-9a-f]{6}$/i).optional(), roughness:z.number().min(0).max(1).optional(), metalness:z.number().min(0).max(1).optional(), opacity:z.number().min(0).max(1).optional(), transparent:z.boolean().optional(), wireframe:z.boolean().optional(), depthWrite:z.boolean().optional(), side:z.union([z.literal(0),z.literal(1),z.literal(2)]).optional() }).strict() }).strict(),
  z.object({ type:z.literal('script-add'), target, script:z.object({name:z.string().max(256),source:z.string().max(100000),params:z.record(z.string(),z.json()).optional()}).strict() }).strict(),
  z.object({ type:z.literal('script-update'), target, index:z.number().int().nonnegative(), values:z.object({name:z.string().max(256).optional(),source:z.string().max(100000).optional(),params:z.record(z.string(),z.json()).optional()}).strict() }).strict(),
  z.object({ type:z.literal('script-remove'), target, index:z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('create'), ref: z.string().min(1).max(80), kind: z.enum(['group','box','sphere','plane']), name: z.string().max(256), parent: target.optional(), ...transform }).strict(),
  z.object({ type: z.literal('transform'), target, space: z.literal('local'), ...transform }).strict(),
  z.object({ type: z.literal('attributes'), target, name: z.string().max(256).optional(), visible: z.boolean().optional(), castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('remove'), target }).strict(),
]);
const mutation = { ...binding, expectedRevision: z.number().int().nonnegative(), operationId: z.string().uuid() };
export const WRITE_TOOLS = {
  h3d_model_prepare: {
    description: 'Prepare a local GLB/glTF outside the scene. filePath must be an absolute local file path. No directory grant or workspace restriction; Downloads, templates and other folders are allowed. Does not add, upload or save. Poll h3d_model_job; insert a ready job once with a scene batch. Retry the same jobId and path for status, not a new job.',
    schema:z.object({ ...binding, jobId:z.string().uuid(), filePath:z.string().min(1).max(2048) }).strict(),
  },
  h3d_model_job: {
    description: 'Read or cancel a detached model preparation. Cancellation discards the result even if a decoder cannot stop immediately. Consumed jobs belong to scene history and cannot be cancelled or inserted twice.',
    schema:z.object({ ...binding, jobId:z.string().uuid(), action:z.enum(['status','cancel']) }).strict(),
  },
  h3d_scene_batch: {
    description: 'Apply one atomic, undoable in-memory batch. Does not save. Primitive dimensions are one scene unit (sphere radius 0.5); transforms are local, Euler radians. New objects use explicit local refs. Material slot is zero-based; scope shared edits every user of that material, object clones only that slot preserving texture references. Script operations edit ordinary JS source/params without executing; GLSL is unsupported. Read sceneRevision first; retry the exact same operationId to retrieve its result, never silently replay with a new ID.',
    schema: z.object({ ...mutation, label: z.string().min(1).max(120), operations: z.array(operation).min(1).max(1000) }).strict(),
  },
  h3d_history: {
    description: 'Undo/redo only the explicitly named H3D batch at the history tip; never unwinds unrelated human edits. Session-local history, not persisted.',
    schema: z.object({ ...mutation, action: z.enum(['undo','redo']), batchId: z.number().int().positive() }).strict(),
  },
  h3d_operation_status: {
    description: 'Read a previously submitted operation result in this window session; unknown means do not assume a write occurred.',
    schema: z.object({ ...binding, operationId: z.string().uuid() }).strict(),
  },
};
