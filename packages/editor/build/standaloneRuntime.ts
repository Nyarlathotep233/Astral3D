import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin} from 'vite';

// Never publish the old checked-in UMD. Root editor:build builds this SDK first.
export function standaloneRuntime(): Plugin {
    const root = path.resolve(import.meta.dirname, '../../sdk/dist');
    async function files(dir = ''): Promise<string[]> {
        const entries = await readdir(path.join(root, dir), {withFileTypes: true});
        const result: string[] = [];
        for (const entry of entries) {
            const name = path.posix.join(dir, entry.name);
            if (entry.isDirectory() && ['libs', 'resource', 'static', 'assets'].includes(name.split('/')[0])) result.push(...await files(name));
            else if (entry.isFile() && (dir || name === 'astral3d.umd.js') && !name.endsWith('.gz')) result.push(name);
        }
        if (!dir && !result.includes('astral3d.umd.js')) throw new Error('Build the SDK before exporting standalone (pnpm sdk:build).');
        return result;
    }
    const prefix = '/standalone-runtime/';
    return {
        name: 'h3d-standalone-runtime',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = decodeURIComponent((req.url || '').split('?')[0]);
                if (!url.startsWith(prefix)) return next();
                try {
                    const name = url.slice(prefix.length);
                    const manifest = await files();
                    if (name === 'manifest.json') {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(manifest));
                    } else if (manifest.includes(name)) {
                        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
                        res.end(await readFile(path.join(root, name)));
                    } else { res.statusCode = 404; res.end('Runtime resource not found'); }
                } catch (error) { res.statusCode = 500; res.end(String(error)); }
            });
        },
        async generateBundle() {
            const manifest = await files();
            this.emitFile({type: 'asset', fileName: 'standalone-runtime/manifest.json', source: JSON.stringify(manifest)});
            for (const name of manifest) this.emitFile({type: 'asset', fileName: `standalone-runtime/${name}`, source: await readFile(path.join(root, name))});
        },
    };
}
