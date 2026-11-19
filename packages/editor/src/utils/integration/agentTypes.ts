import type { Object3D } from 'three';

/** Commands prepare detached resources first, then construct reversible steps at execution time. */
export type AgentOperation = Record<string, any> & { type: string };
export interface EditStep { execute(): void; undo(): void; }
export interface AgentTarget { uuid?: string; ref?: string; }
export interface AgentEditContext {
  resolve(target: AgentTarget): Object3D;
  register(ref: string, object: Object3D): void;
  steps: Array<() => EditStep>;
  /** Run only after a failed preparation/commit, never to dispose live or undoable resources. */
  cleanup: Array<() => void>;
}
