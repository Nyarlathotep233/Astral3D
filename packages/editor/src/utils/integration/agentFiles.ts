/** Page credentials stay out of asset URLs and are sent only to this site's bridge. */
let browserToken = '';
export function setAgentFileToken(token: string) { browserToken = token; }
export async function fetchAgentFile(url: string, init: RequestInit = {}) {
  const resolved = new URL(url, location.href);
  const headers = new Headers(init.headers);
  if (resolved.origin === location.origin && resolved.pathname.startsWith('/agent/')) {
    if (!browserToken) throw new Error('Agent connection is not authorized');
    if(!headers.has('Authorization')) headers.set('Authorization', `Bearer ${browserToken}`);
  }
  const response = await fetch(resolved, { ...init, headers });
  if (!response.ok) throw new Error(`Resource request failed: HTTP ${response.status}`);
  return response;
}
export async function agentSourceFile(source:any):Promise<File> {
  if(source?.artifactId && !source.artifact) source={...source,artifact:await fetchAgentFile(`/agent/artifacts/${encodeURIComponent(source.artifactId)}`).then(r=>r.json())};
  const url=source?.artifact?.url || source?.url;
  if(!url)throw new Error('Provide an uploaded artifactId or a resource URL');
  const response=await fetchAgentFile(url);
  return new File([await response.blob()],source.name || source.artifact?.name || new URL(url,location.href).pathname.split('/').pop() || 'resource',{type:response.headers.get('Content-Type')||''});
}
export async function publishAgentFile(file: File) {
  const prepared = await fetchAgentFile('/agent/uploads', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  }).then(r => r.json());
  await fetchAgentFile(prepared.uploadUrl, {method:'PUT', body:file, headers:prepared.headers});
  return fetchAgentFile(`/agent/uploads/${prepared.uploadId}/complete`, {method:'POST'}).then(r => r.json());
}
