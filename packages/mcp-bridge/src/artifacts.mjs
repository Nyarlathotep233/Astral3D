import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { bridgeError, secret } from './sessions.mjs';

const tokenHash = value => createHash('sha256').update(value).digest('hex');
export function relativeFilePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[a-z]:/i.test(value)) throw bridgeError('INVALID_FILE_PATH', 'Use a safe relative file path');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[:<>"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw bridgeError('INVALID_FILE_PATH', 'File path contains unsafe segments');
  return parts.join('/');
}
export class ArtifactStore {
  constructor({ directory, ttlMs = 60 * 60_000, maxUploadBytes = 512 * 1024 * 1024, maxUploadsPerSession = 64, maxStoredBytes = 2 * 1024 * 1024 * 1024 } = {}) {
    this.directory = path.resolve(directory); Object.assign(this, { ttlMs, maxUploadBytes, maxUploadsPerSession, maxStoredBytes }); this.records = new Map(); this.reservedBytes = 0;
  }
  async prepare(sessionId, input, baseUrl) {
    await this.sweep();
    const declaredFiles = input.files || [{ path: input.name, size: input.size, mimeType: input.contentType }];
    if (!declaredFiles.length || declaredFiles.length > 256 || declaredFiles.some(file => !Number.isSafeInteger(file.size) || file.size < 0 || file.size > this.maxUploadBytes)) throw bridgeError('INVALID_UPLOAD', 'Declare name and size, or a bounded files manifest');
    if ([...this.records.values()].filter(record => record.sessionId === sessionId).length >= this.maxUploadsPerSession) throw bridgeError('UPLOAD_LIMIT', 'Too many temporary uploads for this page');
    const seen = new Set();
    const files = declaredFiles.map(file => {
      const filePath = relativeFilePath(file.path), normalized = filePath.toLowerCase();
      if (seen.has(normalized)) throw bridgeError('DUPLICATE_FILE', 'Bundle paths must be unique');
      seen.add(normalized); return { ...file, path: filePath, state: 'pending' };
    });
    for (const file of files) if (files.some(other => other !== file && other.path.toLowerCase().startsWith(`${file.path.toLowerCase()}/`))) throw bridgeError('INVALID_BUNDLE', 'A file cannot also be a directory');
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > this.maxUploadBytes || this.reservedBytes + total > this.maxStoredBytes) throw bridgeError('UPLOAD_SIZE_LIMIT', 'Temporary artifact capacity exceeded');
    const entryPath = relativeFilePath(input.entryPath || files[0].path);
    if (!files.some(file => file.path === entryPath)) throw bridgeError('INVALID_ENTRY', 'entryPath must identify a declared file');
    const uploadId = randomUUID(), uploadToken = secret(), dir = this.resolve(uploadId);
    const record = { uploadId, artifactId: uploadId, sessionId, entryPath, files, total, expiresAt: Date.now() + this.ttlMs, tokenHash: tokenHash(uploadToken), state: 'preparing' };
    // Count the reservation before yielding to filesystem work. Otherwise parallel
    // preparations can all pass both limits while no record has been registered.
    this.records.set(uploadId, record); this.reservedBytes += total;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, '.h3d-upload'), '', { mode: 0o600 });
      record.state = 'uploading';
    } catch (error) {
      if (this.records.get(uploadId) === record) { this.records.delete(uploadId); this.reservedBytes -= total; }
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    const targets = files.map((file, index) => ({ path: file.path, size: file.size, url: `${baseUrl}/agent/uploads/${uploadId}/${index}`, method: 'PUT', headers: { Authorization: `Bearer ${uploadToken}`, 'Content-Type': file.mimeType || 'application/octet-stream' } }));
    return { uploadId, entryPath, expiresAt: new Date(record.expiresAt).toISOString(), files: targets, ...(targets.length === 1 ? { uploadUrl: targets[0].url, headers: targets[0].headers, name: entryPath } : {}) };
  }
  resolve(...segments) {
    const target = path.resolve(this.directory, ...segments);
    if (target === this.directory || !target.startsWith(this.directory + path.sep)) throw bridgeError('INVALID_FILE_PATH', 'Artifact path escapes its storage directory');
    return target;
  }
  get(id) {
    const record = this.records.get(id);
    if (!record || record.expiresAt <= Date.now()) throw bridgeError('ARTIFACT_NOT_FOUND', 'Temporary artifact is absent or expired', { httpStatus: 404 });
    return record;
  }
  async receive(id, index, token, request) {
    const record = this.get(id), file = record.files[index];
    if (!token || tokenHash(token) !== record.tokenHash) throw bridgeError('UNAUTHORIZED', 'Invalid upload token', { httpStatus: 401 });
    if (record.state !== 'uploading' || !file || file.state === 'uploading') throw bridgeError('UPLOAD_CONFLICT', 'File is unavailable or already uploading', { httpStatus: 409 });
    const destination = this.resolve(id, String(index)), temp = `${destination}.partial`;
    const expectedLength = request.headers['content-length'];
    if (expectedLength && Number(expectedLength) !== file.size) throw bridgeError('UPLOAD_SIZE_MISMATCH', 'Content-Length differs from reserved file size', { httpStatus: 400 });
    file.state = 'uploading'; let received = 0; const digest = createHash('sha256');
    try {
      const meter = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > file.size) { callback(bridgeError('UPLOAD_TOO_LARGE', 'File exceeds its reserved size', { httpStatus: 413 })); return; }
        digest.update(chunk); callback(null, chunk);
      } });
      await pipeline(request, meter, createWriteStream(temp, { flags: 'w', mode: 0o600 }));
      const actualHash = digest.digest('hex');
      if (received !== file.size || (file.sha256 && file.sha256.toLowerCase() !== actualHash)) throw bridgeError('UPLOAD_INTEGRITY', 'Uploaded file size or SHA-256 does not match', { httpStatus: 400 });
      // Keep one numbered file per manifest entry: untrusted names never become disk paths.
      const { rename } = await import('node:fs/promises'); await rename(temp, destination);
      file.state = 'uploaded'; file.actualSha256 = actualHash;
      return { uploadId: id, path: file.path, size: received, sha256: actualHash };
    } catch (error) { file.state = 'pending'; await rm(temp, { force: true }).catch(() => {}); throw error; }
  }
  complete(sessionId, id, baseUrl) {
    const record = this.get(id);
    if (record.sessionId !== sessionId) throw bridgeError('ARTIFACT_FORBIDDEN', 'Artifact belongs to another page session', { httpStatus: 403 });
    if (!record.files.every(file => file.state === 'uploaded')) throw bridgeError('UPLOAD_INCOMPLETE', 'Upload every declared file before completing the artifact');
    record.state = 'ready';
    const base = `/agent/artifacts/${id}/files/`;
    const encode = value => value.split('/').map(encodeURIComponent).join('/');
    return { artifactId: id, name: record.entryPath, entryPath: record.entryPath, baseUrl: base, url: base + encode(record.entryPath), absoluteUrl: baseUrl + base + encode(record.entryPath), expiresAt: new Date(record.expiresAt).toISOString(), files: record.files.map(file => ({ path: file.path, size: file.size, mimeType: file.mimeType || 'application/octet-stream', sha256: file.actualSha256, url: base + encode(file.path) })), authorization: 'Use the paired browserToken or agentToken as Authorization: Bearer for all artifact requests.' };
  }
  async send(sessionId, id, relativePath, response) {
    const record = this.get(id);
    if (record.sessionId !== sessionId || record.state !== 'ready') throw bridgeError('ARTIFACT_FORBIDDEN', 'Artifact is not available to this page', { httpStatus: 403 });
    const index = record.files.findIndex(file => file.path === relativeFilePath(relativePath));
    if (index < 0) throw bridgeError('FILE_NOT_FOUND', 'File not in artifact manifest', { httpStatus: 404 });
    const file = record.files[index];
    response.writeHead(200, { 'Content-Type': file.mimeType || 'application/octet-stream', 'Content-Length': file.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    await pipeline(createReadStream(this.resolve(id, String(index))), response);
  }
  async remove(record) {
    if (this.records.get(record.uploadId) !== record || record.state === 'preparing' || record.files.some(file => file.state === 'uploading')) return;
    this.records.delete(record.uploadId); this.reservedBytes -= record.total;
    await rm(this.resolve(record.uploadId), { recursive: true, force: true });
  }
  async sweep() {
    const now = Date.now();
    for (const record of [...this.records.values()]) if (record.expiresAt <= now) await this.remove(record);
    if (this.lastDiskSweep && now - this.lastDiskSweep < 30_000) return;
    this.lastDiskSweep = now;
    // A crash may leave files with no in-memory token record. Only our marked UUID
    // directories are eligible for removal, and every target stays inside the root.
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(entry.name) || this.records.has(entry.name)) continue;
      const directory = this.resolve(entry.name);
      const marker = await stat(path.join(directory, '.h3d-upload')).catch(() => null);
      if (marker && now - marker.mtimeMs > this.ttlMs) await rm(directory, { recursive: true, force: true });
    }
  }
  async close() { for (const record of [...this.records.values()]) await this.remove(record); }
}
