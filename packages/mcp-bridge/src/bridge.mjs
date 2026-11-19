import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TOOL_DEFINITIONS, PROTOCOL_VERSION, describeTools, toolHelp } from '@h3d/agent-contracts';
import { SessionRegistry, bridgeError, publicError } from './sessions.mjs';
import { ArtifactStore } from './artifacts.mjs';

const bearer = request => /^Bearer ([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization || '')?.[1];
function json(response, status, value) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value));
}
async function readJson(request, maximum) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw bridgeError('CONTENT_TYPE', 'Expected application/json', { httpStatus: 415 });
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw bridgeError('MESSAGE_TOO_LARGE', 'Request body exceeds the configured limit', { httpStatus: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw bridgeError('INVALID_JSON', 'Request body is not valid JSON', { httpStatus: 400 }); }
}
function toolResult(result) {
  const value = result === undefined ? null : result, text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw bridgeError('RESULT_TOO_LARGE', 'Result exceeds 2 MiB; request fewer objects or use an artifact');
  return { content: [{ type: 'text', text }], ...(value && typeof value === 'object' && !Array.isArray(value) ? { structuredContent: value } : {}) };
}

export async function startBridge(options = {}) {
  const host = options.host || '127.0.0.1';
  const origins = new Set(options.allowedOrigins || ['https://localhost:8090', 'https://127.0.0.1:8090']);
  for (const origin of origins) if (new URL(origin).origin !== origin || origin === 'null') throw new Error(`Invalid allowed page origin: ${origin}`);
  const publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, '');
  if (publicBaseUrl && !['http:', 'https:'].includes(new URL(publicBaseUrl).protocol)) throw new Error('publicBaseUrl must be HTTP(S)');
  const sessions = new SessionRegistry(options);
  const artifacts = new ArtifactStore({ directory: options.uploadDirectory || path.join(tmpdir(), 'h3d-mcp-artifacts'), ...options });
  const maxRequestBytes = options.maxRequestBytes || 1024 * 1024;
  const maxWebSocketBytes = options.maxWebSocketBytes || 24 * 1024 * 1024;
  const transports = new Set(), sockets = new Set(), createWindows = new Map();
  let port, activeRequests = 0, closed = false;
  const baseUrl = () => publicBaseUrl || `http://${host === '::1' ? '[::1]' : host}:${port}`;
  const validHost = request => {
    const allowed = new Set([`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, ...(options.allowedHosts || [])]);
    if (publicBaseUrl) allowed.add(new URL(publicBaseUrl).host);
    return allowed.has((request.headers.host || '').toLowerCase());
  };
  const requireSession = (request, kind) => {
    const entry = sessions.authorize(bearer(request), kind);
    if (!entry) throw bridgeError('UNAUTHORIZED', 'A valid paired-session Bearer token is required', { httpStatus: 401 });
    if (request.headers.origin && request.headers.origin !== entry.origin) throw bridgeError('ORIGIN_MISMATCH', 'Token belongs to a different page origin', { httpStatus: 403 });
    return entry;
  };
  const execute = async (entry, name, args, signal) => {
    if (name === 'h3d_sessions_list') return { sessions: sessions.list(entry) };
    if (name === 'h3d_capabilities') return { protocolVersion: PROTOCOL_VERSION, tools: describeTools(args.includeSchemas), editorCapabilities: entry.status.capabilities || [], editorConnected: entry.socket?.readyState === 1 };
    if (name === 'h3d_help') return {...toolHelp(args.tool),editor:entry.status.capabilities || null};
    if (name === 'h3d_upload_prepare') return artifacts.prepare(entry.sessionId, args, baseUrl());
    if (name === 'h3d_upload_complete') return artifacts.complete(entry.sessionId, args.uploadId, baseUrl());
    if (name === 'h3d_artifact_release') {
      const artifact=artifacts.get(args.artifactId);
      if(artifact.sessionId!==entry.sessionId)throw bridgeError('ARTIFACT_FORBIDDEN','Artifact belongs to another session');
      if(artifact.files.some(file=>file.state==='uploading'))throw bridgeError('UPLOAD_BUSY','Wait for the upload to finish before releasing it');
      await artifacts.remove(artifact);return {released:args.artifactId};
    }
    if (name === 'h3d_import_prepare' && args.source?.artifactId) {
      args = { ...args, source: { ...args.source, artifact: artifacts.complete(entry.sessionId, args.source.artifactId, baseUrl()) } };
    }
    return sessions.call(entry, name, args, signal);
  };
  const makeMcp = (entry, requestSignal) => {
    const mcp = new McpServer({ name: 'h3d-web-editor', version: '0.1.0' });
    for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) mcp.registerTool(name, {
      description: definition.description, inputSchema: definition.schema,
      annotations: { readOnlyHint: definition.readOnly, destructiveHint: !definition.readOnly, openWorldHint: name === 'h3d_assets' || name === 'h3d_project' },
    }, async (args, extra) => {
      try {
        const signal = extra.signal ? AbortSignal.any([requestSignal, extra.signal]) : requestSignal;
        const result = await execute(entry, name, args, signal);
        if (name === 'h3d_viewport_capture' && result?.data) {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(result.mimeType) || typeof result.data !== 'string' || result.data.length > 22 * 1024 * 1024) throw bridgeError('INVALID_IMAGE', 'Invalid or oversized viewport image');
          const { data, ...metadata } = result;
          return { content: [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', mimeType: result.mimeType, data }] };
        }
        return toolResult(result);
      } catch (error) { return { isError: true, ...toolResult({ error: publicError(error) }) }; }
    });
    return mcp;
  };

  const http = createServer(async (request, response) => {
    try {
      if (!validHost(request)) { json(response, 403, { error: 'Invalid Host' }); return; }
      const origin = request.headers.origin;
      if (origin && !origins.has(origin)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url, 'http://bridge.invalid');
      if (url.pathname === '/health' && request.method === 'GET') { json(response, 200, { status: 'ok', protocolVersion: PROTOCOL_VERSION }); return; }
      if (url.pathname === '/agent/sessions' && request.method === 'POST') {
        if (!origin) throw bridgeError('ORIGIN_REQUIRED', 'Create pairing from an allowed editor page', { httpStatus: 403 });
        const key = request.socket.remoteAddress || 'unknown', now = Date.now();
        let window = createWindows.get(key);
        if (!window || now - window.start >= 60_000) { window = { start: now, count: 0 }; createWindows.set(key, window); }
        if (++window.count > (options.maxPairingsPerMinute || 30)) throw bridgeError('PAIRING_RATE_LIMIT', 'Too many page pairings; retry later', { httpStatus: 429 });
        const initial = await readJson(request, 32 * 1024);
        if (!initial || typeof initial !== 'object' || Array.isArray(initial)) throw bridgeError('INVALID_SESSION', 'Expected a pairing object', { httpStatus: 400 });
        const created = sessions.create(initial, origin), entry = created.entry;
        json(response, 201, { sessionId: entry.sessionId, browserToken: created.browserToken, agentToken: created.agentToken, mcpUrl: `${baseUrl()}/mcp`, wsUrl: `${origin.replace(/^http/, 'ws')}/agent/connect`, expiresAt: new Date(entry.expiresAt).toISOString(), protocolVersion: PROTOCOL_VERSION }); return;
      }
      const sessionMatch = /^\/agent\/sessions\/([a-f0-9-]+)$/.exec(url.pathname);
      if (sessionMatch && ['GET', 'DELETE'].includes(request.method)) {
        const entry = requireSession(request);
        if (entry.sessionId !== sessionMatch[1]) throw bridgeError('SESSION_FORBIDDEN', 'Token does not authorize this session', { httpStatus: 403 });
        if (request.method === 'DELETE') { sessions.revoke(entry.sessionId); json(response, 200, { revoked: true }); }
        else json(response, 200, sessions.list(entry)[0]);
        return;
      }
      if (url.pathname === '/agent/uploads' && request.method === 'POST') {
        const entry = requireSession(request), body = TOOL_DEFINITIONS.h3d_upload_prepare.schema.parse(await readJson(request, 128 * 1024));
        const result = await artifacts.prepare(entry.sessionId, body, ''); json(response, 201, result); return;
      }
      const uploadMatch = /^\/agent\/uploads\/([a-f0-9-]+)\/(\d+)$/.exec(url.pathname);
      if (uploadMatch && request.method === 'PUT') {
        const record = artifacts.get(uploadMatch[1]);
        const uploadSession = sessions.sessions.get(record.sessionId);
        if (!uploadSession || uploadSession.expiresAt <= Date.now()) throw bridgeError('SESSION_REVOKED', 'Upload page pairing has expired or been revoked', { httpStatus: 401 });
        json(response, 200, await artifacts.receive(uploadMatch[1], Number(uploadMatch[2]), bearer(request), request)); return;
      }
      const completeMatch = /^\/agent\/uploads\/([a-f0-9-]+)\/complete$/.exec(url.pathname);
      if (completeMatch && request.method === 'POST') { const entry = requireSession(request); json(response, 200, artifacts.complete(entry.sessionId, completeMatch[1], baseUrl())); return; }
      const manifestMatch = /^\/agent\/artifacts\/([a-f0-9-]+)$/.exec(url.pathname);
      if (manifestMatch && request.method === 'GET') { const entry = requireSession(request); json(response, 200, artifacts.complete(entry.sessionId, manifestMatch[1], baseUrl())); return; }
      const artifactMatch = /^\/agent\/artifacts\/([a-f0-9-]+)\/files\/(.+)$/.exec(url.pathname);
      if (artifactMatch && request.method === 'GET') { const entry = requireSession(request); await artifacts.send(entry.sessionId, artifactMatch[1], decodeURIComponent(artifactMatch[2]), response); return; }
      if (url.pathname === '/mcp') {
        const entry = requireSession(request, 'agent');
        if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, { error: 'Use Streamable HTTP POST' }); return; }
        if (activeRequests >= (options.maxMcpRequests || 128)) throw bridgeError('REQUEST_LIMIT', 'Bridge request capacity reached', { httpStatus: 429 });
        activeRequests++;
        const controller = new AbortController();
        let server;
        try {
          const body = await readJson(request, maxRequestBytes);
          server = makeMcp(entry, controller.signal); transports.add(server);
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
          response.once('close', () => { controller.abort(); transports.delete(server); void server.close().catch(() => {}); });
          await server.connect(transport); await transport.handleRequest(request, response, body);
        } finally { activeRequests--; if (server && response.destroyed) { transports.delete(server); await server.close().catch(() => {}); } }
        return;
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      const status = error.httpStatus || (error.name === 'ZodError' || error instanceof URIError ? 400 : 500);
      if (response.headersSent) response.destroy(); else json(response, status, { error: publicError(error) });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxWebSocketBytes, perMessageDeflate: false });
  http.on('upgrade', (request, socket, head) => {
    const reject = () => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); };
    if (!validHost(request) || request.url !== '/agent/connect' || !origins.has(request.headers.origin)) { reject(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', (ws, request) => {
    sockets.add(ws); ws.alive = true; let entry;
    const authTimer = setTimeout(() => ws.close(1008, 'Authentication timeout'), options.authenticationTimeoutMs || 5000); authTimer.unref?.();
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, binary) => {
      try {
        if (binary) throw bridgeError('INVALID_MESSAGE', 'Bridge messages must be JSON text');
        const message = JSON.parse(data.toString());
        if (!entry) {
          if (message.type !== 'hello') throw bridgeError('AUTH_REQUIRED', 'Send hello before other messages');
          const authorized = sessions.authorize(message.browserToken, 'browser');
          if (!authorized || authorized.sessionId !== message.sessionId) throw bridgeError('UNAUTHORIZED', 'Invalid page pairing');
          sessions.connect(authorized, ws, request.headers.origin); entry = authorized; clearTimeout(authTimer);
          ws.send(JSON.stringify({ type: 'ready', sessionId: entry.sessionId, protocolVersion: PROTOCOL_VERSION })); return;
        }
        if (message.type === 'status') sessions.setStatus(entry, message.status);
        else if (message.type === 'result') sessions.result(entry, message);
        else if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        else throw bridgeError('INVALID_MESSAGE', 'Unsupported page message');
      } catch (error) { ws.close(1008, String(error.message).slice(0, 100)); }
    });
    ws.on('close', () => { clearTimeout(authTimer); sockets.delete(ws); if (entry) sessions.disconnect(entry, ws); });
    ws.on('error', () => { if (entry) sessions.disconnect(entry, ws); });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
    sessions.sweep(); void artifacts.sweep().catch(error => options.onError?.(error));
    for (const [key, value] of createWindows) if (Date.now() - value.start > 60_000) createWindows.delete(key);
  }, options.heartbeatIntervalMs || 25_000); heartbeat.unref?.();
  http.requestTimeout = options.httpRequestTimeoutMs || 120_000; http.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(options.port ?? 8098, host, resolve); });
  port = http.address().port;
  return {
    port, host, url: baseUrl(), sessions, artifacts,
    async close() {
      if (closed) return; closed = true; clearInterval(heartbeat); sessions.close();
      for (const socket of sockets) socket.terminate();
      await Promise.allSettled([...transports].map(server => server.close()));
      await new Promise(resolve => { http.close(resolve); http.closeAllConnections(); });
      await new Promise(resolve => wss.close(resolve)); await artifacts.close();
    },
  };
}
