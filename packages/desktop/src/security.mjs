import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export const APP_ORIGIN = 'h3d://app';

export function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'h3d:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}

export function validateSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid desktop settings');
  const service = new URL(value.serviceUrl);
  const socket = new URL(value.socketUrl);
  const local = url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (service.username || service.password || service.search || service.hash || service.pathname !== '/' ||
      !(service.protocol === 'https:' || (service.protocol === 'http:' && local(service)))) {
    throw new Error('serviceUrl must be an HTTPS origin (HTTP is allowed only on loopback)');
  }
  if (socket.username || socket.password || socket.hash ||
      !(socket.protocol === 'wss:' || (socket.protocol === 'ws:' && local(socket)))) {
    throw new Error('socketUrl must use WSS (WS is allowed only on loopback)');
  }
  if (!Number.isInteger(value.mcpPort) || value.mcpPort < 1024 || value.mcpPort > 65535) {
    throw new Error('mcpPort must be an integer between 1024 and 65535');
  }
  return { serviceUrl: service.origin, socketUrl: socket.href, mcpPort: value.mcpPort };
}

// No URL supplied by an MCP request can change the upstream or escape the static root.
export function resolveAppRequest(rawUrl, root, serviceUrl) {
  if (!isAppUrl(rawUrl)) throw new Error('Untrusted application URL');
  const url = new URL(rawUrl);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p.includes(':'))) {
    throw new Error('Invalid resource path');
  }
  let remotePath;
  if (pathname.startsWith('/api/')) remotePath = pathname;
  if (pathname.startsWith('/file/static/')) remotePath = `/api/common/static/${pathname.slice(13)}`;
  if (remotePath) {
    const target = new URL(serviceUrl);
    target.pathname = remotePath;
    target.search = url.search;
    return { kind: 'proxy', url: target.href };
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  const distance = path.relative(path.resolve(root), file);
  if (distance.startsWith('..') || path.isAbsolute(distance)) throw new Error('Resource outside application root');
  return { kind: 'file', path: file };
}

export function authorizeMcp(request, port, token) {
  if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return 403;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return 403;
  // Native agents omit Origin. Do not allow arbitrary websites (including null origins).
  if (request.headers.origin && request.headers.origin !== APP_ORIGIN) return 403;
  const received = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return 401;
  return 200;
}
