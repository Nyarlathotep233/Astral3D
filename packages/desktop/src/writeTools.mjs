import { z } from 'zod';

const binding = { sessionId: z.string().uuid(), sceneId: z.string().min(1).max(128) };
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const target = z.union([z.object({ uuid: z.string().uuid() }).strict(), z.object({ ref: z.string().min(1).max(80) }).strict()]);
const transform = { position: vector.optional(), rotation: vector.optional(), rotationOrder: z.enum(['XYZ','YXZ','ZXY','ZYX','YZX','XZY']).optional(), scale: vector.optional() };
const operation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), ref: z.string().min(1).max(80), kind: z.enum(['group','box','sphere','plane']), name: z.string().max(256), parent: target.optional(), ...transform }).strict(),
  z.object({ type: z.literal('transform'), target, space: z.literal('local'), ...transform }).strict(),
  z.object({ type: z.literal('attributes'), target, name: z.string().max(256).optional(), visible: z.boolean().optional(), castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('remove'), target }).strict(),
]);
const mutation = { ...binding, expectedRevision: z.number().int().nonnegative(), operationId: z.string().uuid() };
export const WRITE_TOOLS = {
  h3d_scene_batch: {
    description: 'Apply one atomic, undoable in-memory batch. Does not save. Primitive dimensions are one scene unit (sphere radius 0.5); transforms are local, Euler radians. New objects use explicit local refs. Read sceneRevision first; retry the exact same operationId to retrieve its result, never silently replay with a new ID.',
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
