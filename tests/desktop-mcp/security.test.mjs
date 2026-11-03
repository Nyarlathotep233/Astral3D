import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { authorizeMcp, isAppUrl, resolveAppRequest, validateSettings } from '../../packages/desktop/src/security.mjs';

test('desktop settings allow loopback HTTP, require HTTPS elsewhere, reject embedded credentials', () => {
  const valid = { serviceUrl: 'http://127.0.0.1:8080', socketUrl: 'ws://127.0.0.1:8080/api/sys/ws', mcpPort: 8098 };
  assert.equal(validateSettings(valid).mcpPort, 8098);
  for (const serviceUrl of ['http://example.com', 'file:///tmp/data', 'https://user:password@example.com', 'https://example.com/api']) {
    assert.throws(() => validateSettings({ ...valid, serviceUrl }));
  }
  assert.throws(() => validateSettings({ ...valid, mcpPort: 80 }));
  assert.throws(() => validateSettings({ ...valid, socketUrl: 'ws://example.com' }));
});

test('resource routing keeps exact API/static mapping and cannot escape root or upstream', () => {
  const root = path.resolve('fixture/editor');
  const service = 'http://127.0.0.1:8080';
  assert.equal(resolveAppRequest('h3d://app/', root, service).path, path.join(root, 'index.html'));
  assert.equal(resolveAppRequest('h3d://app/file/static/upload/test.zip?v=1', root, service).url, `${service}/api/common/static/upload/test.zip?v=1`);
  assert.equal(resolveAppRequest('h3d://app/api/editor3d/scenes/getAll?limit=2', root, service).url, `${service}/api/editor3d/scenes/getAll?limit=2`);
  for (const url of ['h3d://evil/api/a', 'h3d://app.evil/api/a', 'h3d://user@app/api/a', 'h3d://app/%2e%2e%2fsecret', 'h3d://app/C%3a/secret', 'h3d://app/%5csecret', 'h3d://app/%00secret']) {
    assert.throws(() => resolveAppRequest(url, root, service), url);
  }
  assert.equal(isAppUrl('https://app/'), false);
});

test('MCP checks address, Host, Origin and bearer token independently', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:8098', authorization: 'Bearer abc' } };
  assert.equal(authorizeMcp(request, 8098, 'abc'), 200);
  for (const origin of ['null', 'https://evil.example', 'http://127.0.0.1:8098']) {
    assert.equal(authorizeMcp({ ...request, headers: { ...request.headers, origin } }, 8098, 'abc'), 403);
  }
  assert.equal(authorizeMcp({ ...request, headers: { ...request.headers, host: 'evil.example:8098' } }, 8098, 'abc'), 403);
  assert.equal(authorizeMcp({ ...request, headers: { ...request.headers, authorization: 'Bearer wrong' } }, 8098, 'abc'), 401);
  assert.equal(authorizeMcp({ ...request, socket: { remoteAddress: '192.168.1.2' } }, 8098, 'abc'), 403);
});
