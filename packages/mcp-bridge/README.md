# H3D Web MCP bridge

Server-side MCP transport for the browser editor. It runs alongside the Java API;
end users only need their browser and an MCP client. It does not launch Electron,
read paths on the agent's machine, or execute scene operations on the server.

## Run

From the repository root, install the workspace dependencies and run:

```powershell
pnpm --filter @h3d/mcp-bridge start
```

The default listener is `127.0.0.1:8098`. The editor development proxy must route
`/agent/*` to this listener, with WebSocket upgrade enabled. A page on
`https://localhost:8090` or `https://127.0.0.1:8090` can create a pairing. Configure
the agent with the returned `/mcp` URL and `Authorization: Bearer <agentToken>`.
Tokens are not written to logs or to disk.

Configuration:

| Environment variable | Default |
| --- | --- |
| `H3D_MCP_HOST` | `127.0.0.1` |
| `H3D_MCP_PORT` | `8098` |
| `H3D_MCP_ALLOWED_ORIGINS` | The two HTTPS editor origins above, comma-separated |
| `H3D_MCP_PUBLIC_URL` | Direct loopback HTTP URL; set to the public HTTPS origin when proxied |
| `H3D_MCP_ALLOWED_HOSTS` | Extra exact Host values accepted through a reverse proxy |
| `H3D_MCP_UPLOAD_DIRECTORY` | OS temporary directory + `h3d-mcp-artifacts` |

This release targets a trusted team deployment. Origin checks and a per-page
pairing token authorize an agent connection; they do not add user accounts or
private-project access control to the existing Java application. Keep the
listener private and place the editor, bridge and existing business API behind
the deployment's team access control before exposing them beyond localhost.

## Browser protocol

1. `POST /agent/sessions` from an allowed Origin with JSON
   `{sceneId, documentEpoch, title, status?}` returns
   `{sessionId, browserToken, agentToken, mcpUrl, wsUrl, expiresAt}`.
2. Connect to the returned WebSocket URL and, within five seconds, send
   `{type:"hello",sessionId,browserToken}`. The server replies
   `{type:"ready",sessionId,protocolVersion:1}`.
3. The server forwards `{type:"request",id,method,args}`. The page returns
   `{type:"result",id,ok:true,result}` or
   `{type:"result",id,ok:false,error:{code,message,outcome?}}`.
4. The page sends `{type:"status",status}` on scene/readiness/revision changes.
   Include sceneId, documentEpoch, sceneRevision and actual capability state.
5. `DELETE /agent/sessions/:sessionId` with either paired token revokes both
   tokens and closes the connection. Reloading the page creates a new pairing.

Each agent token only lists and operates its paired page. The editor remains
responsible for checking the exact scene, document epoch and edit revision and
for maintaining its operation ledger and undo history. A transient socket
reconnect can reuse a pairing within a two-minute grace period, but in-flight
calls fail with `outcome:"unknown"` and are never automatically replayed. The
client must query operation status before deciding how to recover.

The bridge exposes only registered tool names from `@h3d/agent-contracts` and
validates their schemas. `h3d_capabilities` distinguishes transport tool contracts
from the capabilities reported by the connected editor. A transport registration
is not a claim that every action in that tool is implemented by the page.

## Temporary artifacts

For a single file use `POST /agent/uploads` with the browser or agent token and
`{name,size,contentType}`. It returns `{uploadId,uploadUrl,headers}`. PUT the bytes
to `uploadUrl` with the returned upload headers, then call
`POST /agent/uploads/:uploadId/complete` with the paired token.

For a bundle use `{files:[{path,size,mimeType?,sha256?}],entryPath}`. Each manifest
file gets a separate PUT URL. Relative paths are preserved in the manifest;
untrusted names never become disk paths. Absolute paths, traversal, duplicate
paths and path/file collisions are rejected.

The MCP equivalents are `h3d_upload_prepare` and `h3d_upload_complete`. MCP PUT
URLs are absolute so a local agent can upload using its own file/HTTP tools.
HTTP preparation URLs are relative for the browser proxy. Completing returns
`artifactId`, relative `url`, `absoluteUrl`, `baseUrl`, `entryPath`, and `files`.
GET requests for any artifact file require the owning page's browser or agent
Bearer token. Another page's token is rejected. Pass `source.artifactId` to
`h3d_import_prepare`; the bridge checks ownership and includes the manifest in
`source.artifact`, without passing the agent token to the page.

Artifacts are temporary (one-hour TTL), limited to 512 MiB per bundle and 2 GiB
reserved storage per bridge process. They are not published assets. Editor save
must copy required data into the ordinary persistent asset workflow. The same
HTTP upload flow allows the browser to return export artifacts to the agent.

## Verification

```powershell
pnpm --filter @h3d/mcp-bridge test
pnpm --filter @h3d/mcp-bridge test:load -- --sessions 50 --rounds 10
```

The integration tests use the real MCP SDK client and WebSocket peers, covering
origin/auth rejection, session isolation, out-of-order replies, disconnect
uncertainty, bounded queues, temporary uploads and revocation. The load script
measures the relay with simulated page handlers in the same process; it does not
measure WebGL, real scene editing, Java APIs or production network capacity.

For end-to-end manual verification, open the editor, pair an agent, query a
scene, make a reversible edit, capture it, undo it, and explicitly save/reopen.
Confirm that disconnecting during a write produces an uncertain outcome rather
than a duplicate edit, and that a second page token cannot access the first.
