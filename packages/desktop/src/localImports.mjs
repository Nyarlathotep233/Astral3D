import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpath, open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pathToFileURL, fileURLToPath } from 'node:url';

const types = { '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.bin':'application/octet-stream', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ktx2':'image/ktx2' };
export const IMPORT_PREFIX = '/__imports/';

function absoluteFile(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') ||
      (process.platform === 'win32' && !/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/])/i.test(value))) {
    throw new Error('Provide the absolute model file path; the agent working directory is not known to Electron');
  }
  // NTFS alternate streams are not standalone model files.
  if (process.platform === 'win32' && value.replace(/^[a-z]:/i,'').includes(':')) throw new Error('Alternate file streams are not model files');
  return value;
}

/** No directory grant/whitelist. The private URL transports only model/dependency files, read-only. */
export function createLocalImportAccess() {
  const resourceRoot = `h3d://app${IMPORT_PREFIX}${randomUUID()}/`;
  return {
    async prepare(filePath, kind = 'model') {
      absoluteFile(filePath);
      if (kind === 'prefab') {
        if (!filePath.toLowerCase().endsWith('.h3dprefab.zip')) throw new Error('Prefab import requires an editor .h3dprefab.zip package');
      } else if (kind !== 'model' || !['.glb','.gltf'].includes(path.extname(filePath).toLowerCase())) throw new Error('Local model import currently supports .glb and .gltf');
      await realpath(filePath); // Report a missing file before starting a preparation job.
      // Preserve the supplied directory for relative glTF dependencies, including ../ and links.
      return { url: resourceRoot + pathToFileURL(filePath).href.slice('file://'.length), resourceRoot };
    },
    async respond(url, method = 'GET') {
      if (!['GET','HEAD'].includes(method)) return new Response('Method not allowed', { status: 405 });
      const parsed = new URL(url);
      if (parsed.search || parsed.hash || !parsed.href.startsWith(resourceRoot)) throw new Error('Invalid or expired model resource URL');
      const file = absoluteFile(fileURLToPath(`file://${parsed.href.slice(resourceRoot.length)}`));
      const type = file.toLowerCase().endsWith('.h3dprefab.zip') ? 'application/zip' : types[path.extname(file).toLowerCase()];
      if (!type) throw new Error('Unsupported model dependency file type');
      const handle = await open(await realpath(file), 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 512 * 1024 * 1024) throw new Error('Import requires a regular file no larger than 512 MiB');
        const headers = { 'Content-Type': type, 'Content-Length': String(info.size), 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
        if (method === 'HEAD') { await handle.close(); return new Response(null, { headers }); }
        return new Response(Readable.toWeb(handle.createReadStream()), { headers });
      } catch (error) { await handle.close(); throw error; }
    },
  };
}
