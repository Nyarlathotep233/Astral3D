import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopImportJobs } from '../../packages/editor/src/utils/integration/desktopImportJobs.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('detached preparation deduplicates, cancels late results, reports errors and consumes exactly once',async()=>{
 const requests=[],disposed=[];
 const jobs=new DesktopImportJobs((source,signal,phase)=>new Promise((resolve,reject)=>requests.push({source,signal,phase,resolve,reject})),v=>disposed.push(v));
 assert.equal(jobs.start('a',{path:'model.glb'}).state,'preparing');
 jobs.start('a',{path:'model.glb'});assert.equal(requests.length,1);
 assert.throws(()=>jobs.start('a',{path:'other.glb'}),/different/);
 requests[0].phase('parsing');assert.equal(jobs.status('a').phase,'parsing');
 jobs.cancel('a');assert.equal(requests[0].signal.aborted,true);
 requests[0].resolve({value:'cancelled result',summary:{objects:1}});await tick();
 assert.deepEqual(disposed,['cancelled result']);assert.equal(jobs.status('a').state,'cancelled');assert.throws(()=>jobs.ready('a'));
 jobs.start('b',{});requests[1].reject(Error('real parse error'));await tick();assert.equal(jobs.status('b').error,'real parse error');
 jobs.start('c',{});requests[2].resolve({value:'ready object',summary:{objects:3}});await tick();
 assert.equal(jobs.ready('c'),'ready object');assert.equal(jobs.status('c').objects,3);
 jobs.consume('c');assert.throws(()=>jobs.ready('c'));assert.throws(()=>jobs.cancel('c'),/history/);
 jobs.start('d',{});requests[3].resolve({value:'unused object',summary:{}});await tick();
 jobs.reset();assert.equal(jobs.status('c').state,'unknown');assert.ok(!disposed.includes('ready object'));assert.ok(disposed.includes('unused object'));
});
