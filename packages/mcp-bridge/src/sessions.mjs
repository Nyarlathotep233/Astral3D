import { randomBytes, randomUUID, createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function bridgeError(code, message, details = {}) { return Object.assign(new Error(message), { code, ...details }); }
export function publicError(error) {
  const outcome = typeof error?.outcome === 'string' ? error.outcome : error?.recoveryFailed === true ? 'unknown' : undefined;
  return {
    code: typeof error?.code === 'string' ? error.code : 'BRIDGE_ERROR',
    message: typeof error === 'string' ? error : error?.message || 'Bridge operation failed',
    ...(outcome ? { outcome } : {}),
    ...(typeof error?.operationId === 'string' ? { operationId: error.operationId } : {}),
    ...(typeof error?.recoveryFailed === 'boolean' ? { recoveryFailed: error.recoveryFailed } : {}),
  };
}

export class SessionRegistry {
  constructor({ sessionTtlMs = 8 * 60 * 60_000, disconnectGraceMs = 2 * 60_000, requestTimeoutMs = 30_000, maxSessions = 1000, maxPendingPerSession = 8, maxPending = 512, maxBufferedBytes = 8 * 1024 * 1024 } = {}) {
    Object.assign(this, { sessionTtlMs, disconnectGraceMs, requestTimeoutMs, maxSessions, maxPendingPerSession, maxPending, maxBufferedBytes });
    this.sessions = new Map(); this.tokens = new Map(); this.pendingCount = 0;
  }
  create(initial = {}, origin) {
    this.sweep();
    if (this.sessions.size >= this.maxSessions) throw bridgeError('SESSION_LIMIT', 'Editor session capacity reached', { httpStatus: 429 });
    const sessionId = randomUUID(), browserToken = secret(), agentToken = secret(), now = Date.now();
    const entry = { sessionId, origin, createdAt: now, expiresAt: now + this.sessionTtlMs, disconnectedAt: now, status: {}, socket: null, pending: new Map(), tokens: [hash(browserToken), hash(agentToken)] };
    this.setStatus(entry, initial.status || { sceneId: initial.sceneId ?? null, documentEpoch: initial.documentEpoch ?? null, title: initial.title || '', state: 'waiting-for-page' });
    this.sessions.set(sessionId, entry);
    this.tokens.set(entry.tokens[0], { entry, kind: 'browser' }); this.tokens.set(entry.tokens[1], { entry, kind: 'agent' });
    return { entry, browserToken, agentToken };
  }
  authorize(token, kind) {
    if (typeof token !== 'string' || token.length > 256) return null;
    const found = this.tokens.get(hash(token));
    if (!found || (kind && found.kind !== kind)) return null;
    if (found.entry.expiresAt <= Date.now()) { this.revoke(found.entry.sessionId, 'Session expired'); return null; }
    return found.entry;
  }
  connect(entry, socket, origin) {
    if (entry.origin !== origin) throw bridgeError('ORIGIN_MISMATCH', 'This page session belongs to a different origin');
    if (entry.socket?.readyState === 1) throw bridgeError('SESSION_ALREADY_CONNECTED', 'This page session already has a live connection');
    entry.socket = socket; entry.disconnectedAt = null;
  }
  setStatus(entry, status) {
    if (!status || typeof status !== 'object' || Array.isArray(status)) throw bridgeError('INVALID_STATUS', 'Editor status must be an object of at most 32 KiB');
    const merged = { ...entry.status, ...status };
    if (Buffer.byteLength(JSON.stringify(merged)) > 32 * 1024) throw bridgeError('INVALID_STATUS', 'Editor status must be an object of at most 32 KiB');
    entry.status = merged;
  }
  list(entry) { return [{ ...entry.status, sessionId: entry.sessionId, connected: entry.socket?.readyState === 1, expiresAt: new Date(entry.expiresAt).toISOString() }]; }
  disconnect(entry, socket, reason = 'Editor connection lost') {
    if (entry.socket !== socket) return;
    entry.socket = null; entry.disconnectedAt = Date.now();
    for (const request of [...entry.pending.values()]) request.reject(bridgeError('EDITOR_DISCONNECTED', reason, { outcome: 'unknown', operationId: request.operationId }));
  }
  call(entry, method, args, signal) {
    if (args.sessionId !== entry.sessionId) return Promise.reject(bridgeError('SESSION_FORBIDDEN', 'Token does not authorize this editor session'));
    if (entry.expiresAt <= Date.now()) return Promise.reject(bridgeError('SESSION_EXPIRED', 'Editor session expired'));
    if (!entry.socket || entry.socket.readyState !== 1) return Promise.reject(bridgeError('EDITOR_OFFLINE', 'Open and connect the authorized editor page', { outcome: 'not_started' }));
    if (entry.pending.size >= this.maxPendingPerSession || this.pendingCount >= this.maxPending || entry.socket.bufferedAmount > this.maxBufferedBytes) return Promise.reject(bridgeError('BUSY', 'Editor request queue is full; wait for in-flight work', { outcome: 'not_started' }));
    if (signal?.aborted) return Promise.reject(bridgeError('CANCELLED', 'Request cancelled before dispatch', { outcome: 'not_started' }));
    return new Promise((resolve, reject) => {
      const id = randomUUID(), socket = entry.socket;
      let timer;
      const finish = (callback, value) => {
        if (!entry.pending.delete(id)) return;
        this.pendingCount--; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); callback(value);
      };
      const onAbort = () => finish(reject, bridgeError('REQUEST_CANCELLED', 'Transport request cancelled; query the operation or job before retrying', { outcome: 'unknown', operationId: args.operationId }));
      entry.pending.set(id, { resolve: result => finish(resolve, result), reject: error => finish(reject, error), operationId: args.operationId });
      this.pendingCount++;
      timer = setTimeout(() => finish(reject, bridgeError('EDITOR_TIMEOUT', 'Editor response timed out; query operation status before retrying', { outcome: 'unknown', operationId: args.operationId })), this.requestTimeoutMs);
      timer.unref?.(); signal?.addEventListener('abort', onAbort, { once: true });
      socket.send(JSON.stringify({ type: 'request', id, method, args }), error => {
        if (error) finish(reject, bridgeError('SEND_FAILED', 'Could not deliver editor request; outcome is unknown', { outcome: 'unknown', operationId: args.operationId }));
      });
    });
  }
  result(entry, message) {
    const request = entry.pending.get(message.id);
    if (!request) return; // A late response must never become a new request or complete another call.
    if (message.ok === true) request.resolve(message.result);
    else {
      const details = publicError(message.error);
      if (typeof message.error?.code !== 'string') details.code = 'EDITOR_ERROR';
      request.reject(bridgeError(details.code, details.message, { ...details, operationId: request.operationId ?? details.operationId }));
    }
  }
  revoke(sessionId, reason = 'Page pairing revoked') {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId); for (const key of entry.tokens) this.tokens.delete(key);
    const socket = entry.socket;
    if (socket) { this.disconnect(entry, socket, reason); socket.close(1008, reason.slice(0, 100)); }
    return true;
  }
  sweep() {
    const now = Date.now();
    for (const entry of this.sessions.values()) if (entry.expiresAt <= now || (entry.disconnectedAt !== null && now - entry.disconnectedAt > this.disconnectGraceMs)) this.revoke(entry.sessionId, 'Editor session expired');
  }
  close() { for (const id of [...this.sessions.keys()]) this.revoke(id, 'Bridge stopped'); }
}
