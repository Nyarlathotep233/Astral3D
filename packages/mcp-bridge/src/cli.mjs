import { startBridge } from './bridge.mjs';

const bridge = await startBridge({
  host: process.env.H3D_MCP_HOST || '127.0.0.1',
  port: Number(process.env.H3D_MCP_PORT || 8098),
  publicBaseUrl: process.env.H3D_MCP_PUBLIC_URL,
  allowedOrigins: (process.env.H3D_MCP_ALLOWED_ORIGINS || 'https://localhost:8090,https://127.0.0.1:8090').split(',').map(value => value.trim()).filter(Boolean),
  allowedHosts: process.env.H3D_MCP_ALLOWED_HOSTS?.split(',').map(value => value.trim()).filter(Boolean),
  uploadDirectory: process.env.H3D_MCP_UPLOAD_DIRECTORY,
  onError: error => console.error(`[H3D MCP] ${error.code || error.name}: ${error.message}`),
});
console.log(`[H3D MCP] Listening on ${bridge.url}; pair from an allowed editor page. Tokens are never printed.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void bridge.close().then(() => process.exit(0)); });
