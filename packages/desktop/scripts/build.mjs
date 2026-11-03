import { build } from 'esbuild';
import { copyFile, mkdir, access } from 'node:fs/promises';

await access('../editor/dist/index.html');
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/main.mjs'], outfile: 'dist/main.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node24', external: ['electron'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
await copyFile('src/preload.cjs', 'dist/preload.cjs');
