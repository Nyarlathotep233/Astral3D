type Prepared<T> = { value: T; summary: Record<string, unknown> };
type Job<T> = { id:string; request:string; scope?:string; state:'preparing'|'ready'|'failed'|'cancelled'|'consumed'; phase:string; controller:AbortController; prepared?:Prepared<T>; error?:string };

/** Preparation never mutates the scene. Only the synchronous batch can consume a ready result. */
export class AgentImportJobs<T> {
  private jobs = new Map<string, Job<T>>();
  private load:(source:any, signal:AbortSignal, phase:(name:string)=>void)=>Promise<Prepared<T>>;
  private dispose:(value:T)=>void;
  constructor(load:(source:any, signal:AbortSignal, phase:(name:string)=>void)=>Promise<Prepared<T>>, dispose:(value:T)=>void, private timeoutMs=120000, private getScope?:()=>string) { this.load=load;this.dispose=dispose; }
  private current(job:Job<T>) {
    if (!this.getScope || job.scope === this.getScope()) return true;
    if (job.state !== 'consumed') {
      job.state='cancelled';job.phase='stale';job.error='Model job belongs to a previous editor document or pairing';job.controller.abort();
      if(job.prepared){this.dispose(job.prepared.value);job.prepared=undefined;}
    }
    return false;
  }
  private report(job:Job<T>) { return { jobId:job.id, state:job.state, phase:job.phase, ...job.prepared?.summary, ...(job.error ? {error:job.error} : {}) }; }
  start(id:string, source:any) {
    for(const job of this.jobs.values())this.current(job);
    const request = JSON.stringify(source), previous = this.jobs.get(id);
    if (previous) {
      if (previous.request !== request) throw new Error('jobId already belongs to a different model request');
      return this.report(previous);
    }
    if (this.jobs.size >= 1000 || [...this.jobs.values()].filter(j=>j.state==='preparing'||j.state==='ready').length >= 16) throw new Error('Model preparation capacity reached; consume or cancel pending models');
    const job:Job<T> = { id, request, scope:this.getScope?.(), state:'preparing', phase:'loading', controller:new AbortController() };
    this.jobs.set(id, job);
    const deadline=setTimeout(()=>{if(job.state==='preparing'){job.state='failed';job.phase='timeout';job.error='Model preparation timed out';job.controller.abort();}},this.timeoutMs);
    void this.load(source, job.controller.signal, phase=>{ if(this.current(job)&&job.state==='preparing')job.phase=phase; }).then(prepared => {
      if (!this.current(job) || job.state !== 'preparing' || this.jobs.get(id) !== job) { this.dispose(prepared.value); return; }
      job.prepared=prepared; job.state='ready'; job.phase='ready';
    }).catch(error=>{ if(this.current(job)&&job.state==='preparing') { job.state='failed'; job.phase='failed'; job.error=error instanceof Error?error.message:String(error); } }).finally(()=>clearTimeout(deadline));
    return this.report(job);
  }
  status(id:string) { const job=this.jobs.get(id); if(job)this.current(job);return job ? this.report(job) : {jobId:id,state:'unknown'}; }
  cancel(id:string) {
    const job=this.jobs.get(id);
    if(job&&!this.current(job))return this.report(job);
    if (!job) throw new Error('Unknown model job');
    if (job.state==='consumed') throw new Error('Model was inserted; use its batch history instead');
    job.state='cancelled'; job.phase='cancelled'; job.controller.abort();
    if(job.prepared) { this.dispose(job.prepared.value); job.prepared=undefined; }
    return this.report(job);
  }
  ready(id:string) {
    const job=this.jobs.get(id);
    if(job&&!this.current(job))throw new Error('Model job belongs to a previous editor document or pairing');
    if(!job || job.state!=='ready' || !job.prepared) throw new Error(`Model job is not ready: ${id}`);
    return job.prepared.value;
  }
  consume(id:string) { const job=this.jobs.get(id)!; this.ready(id); job.state='consumed'; job.phase='inserted'; }
  invalidateScope() { for(const job of this.jobs.values())this.current(job); }
  reset() {
    for(const job of this.jobs.values()) if(job.state!=='consumed') this.cancel(job.id);
    this.jobs.clear();
  }
}
