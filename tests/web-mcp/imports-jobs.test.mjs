import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from '../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
const output=await build({entryPoints:[path.resolve(import.meta.dirname,'../../packages/editor/src/utils/integration/agentImportJobs.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {AgentImportJobs}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('changing document invalidates ready jobs and releases only detached resources',async()=>{
  let scope='session:document-a';const disposed=[];
  const jobs=new AgentImportJobs(async source=>({value:source.name,summary:{name:source.name}}),value=>disposed.push(value),100,()=>scope);
  jobs.start('ready',{name:'detached'});jobs.start('consumed',{name:'live'});await tick();jobs.consume('consumed');
  scope='session:document-b';jobs.invalidateScope();
  assert.equal(jobs.status('ready').phase,'stale');assert.throws(()=>jobs.ready('ready'),/previous editor document/);
  assert.deepEqual(disposed,['detached']);assert.equal(jobs.status('consumed').state,'consumed');jobs.reset();assert.deepEqual(disposed,['detached']);
});
test('a late loader result cannot revive a cancelled or previous-document job',async()=>{
  let scope='document-a',finish;const disposed=[];
  const jobs=new AgentImportJobs(()=>new Promise(resolve=>{finish=resolve}),value=>disposed.push(value),100,()=>scope);
  jobs.start('pending',{});scope='document-b';jobs.invalidateScope();
  finish({value:'late-resource',summary:{}});await tick();
  assert.equal(jobs.status('pending').phase,'stale');assert.deepEqual(disposed,['late-resource']);assert.throws(()=>jobs.ready('pending'),/previous editor document/);
});
test('cancellation is idempotent and never disposes resources already inserted in the scene',async()=>{
  const disposed=[];const jobs=new AgentImportJobs(async()=>({value:'geometry',summary:{meshes:1}}),value=>disposed.push(value),100);
  jobs.start('cancel',{});await tick();jobs.cancel('cancel');jobs.cancel('cancel');assert.deepEqual(disposed,['geometry']);
  jobs.start('inserted',{});await tick();jobs.consume('inserted');assert.throws(()=>jobs.cancel('inserted'),/inserted/);jobs.reset();assert.deepEqual(disposed,['geometry']);
});
test('job IDs cannot silently switch source after failure or document changes',async()=>{
  const jobs=new AgentImportJobs(async()=>{throw Error('invalid geometry')},()=>{},100);
  jobs.start('same',{url:'a'});await tick();assert.equal(jobs.status('same').state,'failed');
  assert.throws(()=>jobs.start('same',{url:'b'}),/different model request/);assert.equal(jobs.start('same',{url:'a'}).error,'invalid geometry');
});
