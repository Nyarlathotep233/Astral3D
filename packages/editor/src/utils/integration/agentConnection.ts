import { reactive } from 'vue';
import { agentState, agentStatus, onAgentStateChanged } from './agentState';
import { setAgentFileToken } from './agentFiles';

export const agentPairing = reactive({mcpUrl:'', agentToken:'', expiresAt:''});
let browserToken = '', socket:WebSocket|null = null, reconnect:ReturnType<typeof setTimeout>|undefined;
let generation = 0, attempts = 0;
let capabilities:any;
onAgentStateChanged(() => { if(socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'status',status:{...agentStatus(),capabilities}})); });

export async function enableAgentConnection() {
  if (agentState.connection !== 'disabled' && agentState.connection !== 'error') return;
  agentState.connection = 'connecting'; agentState.error = '';
  const current = ++generation;
  try {
    const response = await fetch('/agent/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sceneId:agentState.sceneId || null,documentEpoch:agentState.documentEpoch,title:agentState.title,status:agentStatus()})});
    if (!response.ok) throw new Error(`连接服务不可用 (${response.status})`);
    const pairing = await response.json();
    if(current !== generation) return;
    agentState.sessionId = pairing.sessionId; browserToken = pairing.browserToken;
    setAgentFileToken(browserToken);
    Object.assign(agentPairing,{mcpUrl:pairing.mcpUrl,agentToken:pairing.agentToken,expiresAt:pairing.expiresAt});
    attempts = 0; connect(pairing.wsUrl, current);
  } catch(error) { if(current===generation){agentState.connection = 'error'; agentState.error = error instanceof Error ? error.message : String(error);} }
}

function connect(url:string, current:number) {
  if(current !== generation) return;
  socket = new WebSocket(url); const active = socket;
  active.onopen = () => active.send(JSON.stringify({type:'hello',sessionId:agentState.sessionId,browserToken}));
  active.onmessage = async event => {
    if(current!==generation||active!==socket)return;
    try {
      const message = JSON.parse(event.data);
      if(message.type === 'ready') {
        attempts = 0;
        const {agentCapabilities} = await import('./agentEditor');
        if(current!==generation||active!==socket)return;
        capabilities = agentCapabilities();
        agentState.connection = 'connected';
        active.send(JSON.stringify({type:'status',status:{...agentStatus(),capabilities}}));
        return;
      }
      if(message.type !== 'request' || current !== generation) return;
      const {executeAgentRequest} = await import('./agentEditor');
      const result = await executeAgentRequest(message.method,message.args);
      if(active.readyState === WebSocket.OPEN && current === generation) active.send(JSON.stringify({type:'result',id:message.id,ok:true,result}));
    } catch(error:any) {
      let id; try {id = JSON.parse(event.data).id;} catch {}
      if(id && active.readyState === WebSocket.OPEN && current===generation) active.send(JSON.stringify({type:'result',id,ok:false,error:{code:error.code || 'EDITOR_ERROR',message:error.message || String(error),recoveryFailed:!!error.recoveryFailed,outcome:error.outcome}}));
    }
  };
  active.onerror = () => {if(current===generation)agentState.error = '连接暂时中断，正在重连';};
  active.onclose = event => {
    if(current !== generation) return;
    if([4001,4003,1008].includes(event.code)) {agentState.connection = 'error';agentState.error = '连接已失效，请重新授权';return;}
    agentState.connection = 'reconnecting';
    reconnect = setTimeout(()=>connect(url,current),Math.min(30000,1000 * 2 ** attempts++) + Math.random()*500);
  };
}
export async function disableAgentConnection() {
  generation++; clearTimeout(reconnect); socket?.close(1000,'User revoked'); socket = null;
  const sessionId = agentState.sessionId, token = browserToken;
  agentState.connection = 'disabled'; agentState.sessionId = ''; browserToken = ''; setAgentFileToken('');
  Object.assign(agentPairing,{mcpUrl:'',agentToken:'',expiresAt:''});
  if(sessionId) {
    const response = await fetch(`/agent/sessions/${sessionId}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok && response.status !== 404) throw new Error(`页面连接已关闭，但服务端撤销未确认 (${response.status})`);
  }
}
