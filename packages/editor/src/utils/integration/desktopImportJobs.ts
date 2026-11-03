type Prepared<T> = { value: T; summary: Record<string, unknown> };
type Job<T> = { id:string; request:string; state:'preparing'|'ready'|'failed'|'cancelled'|'consumed'; phase:string; controller:AbortController; prepared?:Prepared<T>; error?:string };

/** Preparation never mutates the scene. Only the synchronous batch can consume a ready result. */
export class DesktopImportJobs<T> {
  private jobs = new Map<string, Job<T>>();
  private load:(source:any, signal:AbortSignal, phase:(name:string)=>void)=>Promise<Prepared<T>>;
  private dispose:(value:T)=>void;
  constructor(load:(source:any, signal:AbortSignal, phase:(name:string)=>void)=>Promise<Prepared<T>>, dispose:(value:T)=>void) { this.load=load;this.dispose=dispose; }
  private report(job:Job<T>) { return { jobId:job.id, state:job.state, phase:job.phase, ...job.prepared?.summary, ...(job.error ? {error:job.error} : {}) }; }
  start(id:string, source:any) {
    const request = JSON.stringify(source), previous = this.jobs.get(id);
    if (previous) {
      if (previous.request !== request) throw new Error('jobId already belongs to a different model request');
      return this.report(previous);
    }
    if (this.jobs.size >= 1000 || [...this.jobs.values()].filter(j=>j.state==='preparing'||j.state==='ready').length >= 16) throw new Error('Model preparation capacity reached; consume or cancel pending models');
    const job:Job<T> = { id, request, state:'preparing', phase:'loading', controller:new AbortController() };
    this.jobs.set(id, job);
    void this.load(source, job.controller.signal, phase=>{ if(job.state==='preparing')job.phase=phase; }).then(prepared => {
      if (job.state !== 'preparing' || this.jobs.get(id) !== job) { this.dispose(prepared.value); return; }
      job.prepared=prepared; job.state='ready'; job.phase='ready';
    }).catch(error=>{ if(job.state==='preparing') { job.state='failed'; job.phase='failed'; job.error=error instanceof Error?error.message:String(error); } });
    return this.report(job);
  }
  status(id:string) { const job=this.jobs.get(id); return job ? this.report(job) : {jobId:id,state:'unknown'}; }
  cancel(id:string) {
    const job=this.jobs.get(id);
    if (!job) throw new Error('Unknown model job');
    if (job.state==='consumed') throw new Error('Model was inserted; use its batch history instead');
    job.state='cancelled'; job.phase='cancelled'; job.controller.abort();
    if(job.prepared) { this.dispose(job.prepared.value); job.prepared=undefined; }
    return this.report(job);
  }
  ready(id:string) {
    const job=this.jobs.get(id);
    if(!job || job.state!=='ready' || !job.prepared) throw new Error(`Model job is not ready: ${id}`);
    return job.prepared.value;
  }
  consume(id:string) { const job=this.jobs.get(id)!; this.ready(id); job.state='consumed'; job.phase='inserted'; }
  reset() {
    for(const job of this.jobs.values()) if(job.state!=='consumed') this.cancel(job.id);
    this.jobs.clear();
  }
}
