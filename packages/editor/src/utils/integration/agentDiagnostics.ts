export interface AgentDiagnostic {
  id: number;
  time: string;
  severity: 'info' | 'warning' | 'error';
  kind: 'script' | 'shader' | 'runtime' | 'resource' | 'recovery';
  message: string;
  sceneId?: string;
  runId?: string;
  objectUuid?: string;
  scriptName?: string;
  materialUuid?: string;
  phase?: string;
  stack?: string;
}

const entries: AgentDiagnostic[] = [];
let sequence = 0;

export function recordAgentDiagnostic(value: Omit<AgentDiagnostic, 'id' | 'time'>) {
  const item = { ...value, message: String(value.message).slice(0, 16000),
    ...(value.stack ? { stack: value.stack.slice(0, 16000) } : {}), id: ++sequence, time: new Date().toISOString() };
  entries.push(item);
  if (entries.length > 500) entries.splice(0, entries.length - 500);
  return item;
}

export function readAgentDiagnostics(args: { after?: number; limit?: number; runId?: string; severity?: string } = {}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(args.limit || 50)));
  const items = entries.filter(item => item.id > (args.after || 0)
    && (!args.runId || item.runId === args.runId) && (!args.severity || item.severity === args.severity)).slice(0, limit);
  return { items, nextCursor: items.at(-1)?.id ?? args.after ?? 0, latestCursor: sequence,
    truncatedBefore: entries[0]?.id ?? 0 };
}
