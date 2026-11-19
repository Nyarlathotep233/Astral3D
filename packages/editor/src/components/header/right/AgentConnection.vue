<script setup lang="ts">
import { computed, ref } from 'vue';
import { agentState } from '@/utils/integration/agentState';
import { agentPairing, enableAgentConnection, disableAgentConnection } from '@/utils/integration/agentConnection';
const visible = ref(false), reveal = ref(false);
const connected = computed(()=>agentState.connection === 'connected');
const label = computed(()=>({connected:'Agent 已连接',connecting:'连接中',reconnecting:'重连中',disabled:'连接 Agent',error:'连接异常'}[agentState.connection]));
const config = computed(()=>JSON.stringify({mcpServers:{h3d:{url:agentPairing.mcpUrl,headers:{Authorization:'Bearer <此处填写连接令牌>'}}}},null,2));
async function copy(value:string) { await navigator.clipboard.writeText(value); window.$message?.success('已复制'); }
async function revoke() { try {await disableAgentConnection();} catch(e:any){window.$message?.error(e.message);} }
</script>
<template>
  <n-button class="mr-2" :type="connected ? 'primary' : 'default'" @click="visible=true">{{ label }}</n-button>
  <n-modal v-model:show="visible" preset="card" title="连接本地 Agent" style="width:680px;max-width:94vw">
    <p>授权后，本地 Agent 可以编辑当前页面的场景、运行脚本、导入资源，并按指令保存项目。你可以随时断开连接。</p>
    <n-alert v-if="agentState.error" type="warning" class="mb-3">{{agentState.error}}</n-alert>
    <template v-if="agentPairing.agentToken">
      <n-descriptions :column="1" bordered label-placement="left">
        <n-descriptions-item label="当前项目">{{agentState.title || '项目列表'}} · {{label}}</n-descriptions-item>
        <n-descriptions-item label="MCP 地址"><code>{{agentPairing.mcpUrl}}</code> <n-button text @click="copy(agentPairing.mcpUrl)">复制</n-button></n-descriptions-item>
        <n-descriptions-item label="连接令牌"><code>{{reveal ? agentPairing.agentToken : '••••••••••••••••'}}</code> <n-button text @click="reveal=!reveal">{{reveal?'隐藏':'显示'}}</n-button> <n-button text @click="copy(agentPairing.agentToken)">复制</n-button></n-descriptions-item>
      </n-descriptions>
      <p>在 Agent 的 MCP 设置中添加上述地址，使用 Bearer 令牌认证。刷新页面后需要重新连接。</p>
      <n-collapse><n-collapse-item title="通用配置示例"><pre style="white-space:pre-wrap">{{config}}</pre><p>Codex CLI：</p><pre style="white-space:pre-wrap">codex mcp add h3d --url {{agentPairing.mcpUrl}} --bearer-token-env-var H3D_AGENT_TOKEN</pre><p>将令牌放入启动 Agent 的环境变量 H3D_AGENT_TOKEN。</p></n-collapse-item></n-collapse>
      <p>场景版本：{{agentState.revision}} · {{agentState.dirty?'有未保存更改':'已同步'}}</p>
      <n-button type="error" @click="revoke">断开并撤销授权</n-button>
    </template>
    <n-button v-else type="primary" :loading="agentState.connection==='connecting'" @click="enableAgentConnection">授权连接此页面</n-button>
  </n-modal>
</template>
