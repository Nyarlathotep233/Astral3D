import fs from 'node:fs/promises';
import path from 'node:path';
// Build a test export using the exact production HTML template and current SDK artifacts.
const root=process.cwd(), out=path.join(root,'.codex-logs/standalone');
await fs.mkdir(out,{recursive:true});
const source=await fs.readFile('packages/editor/src/components/header/navigation/ImportExport.vue','utf8');
const start=source.indexOf('function buildStandalonePreviewHtml(');
const end=source.indexOf('\nasync function ',start);
const block=source.slice(start,end).replace('sceneName: string','sceneName');
const build=new Function(`${block};return buildStandalonePreviewHtml;`)();
await fs.writeFile(path.join(out,'index.html'),build('H3D WebGPU standalone verification'));
await fs.cp('packages/sdk/dist',path.join(out,'runtime'),{recursive:true,filter:p=>!p.includes('\\types')&&!p.endsWith('.gz')});
await fs.cp('.codex-logs/package-test',path.join(out,'packages'),{recursive:true});
await fs.writeFile(path.join(out,'project.json'),JSON.stringify({firstPackageName:'webgpu-test.zip'}));
console.log(out);
