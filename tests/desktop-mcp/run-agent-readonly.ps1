param([Parameter(Mandatory=$true)][ValidateSet('codex','dsh')][string]$Client)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
try { $config=(Get-Clipboard -Raw | ConvertFrom-Json -ErrorAction Stop).mcpServers.h3d }
catch { throw 'Copy the native MCP configuration first. Clipboard contents are not logged.' }
if (-not $config -or $config.url -ne 'http://127.0.0.1:8098/mcp' -or -not $config.headers.Authorization.StartsWith('Bearer ')) {
    throw 'Expected the existing local test MCP configuration.'
}
$previous=@{}
foreach($name in @('H3D_MCP_URL','H3D_MCP_AUTH','H3D_MCP_TOKEN')) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$output=Join-Path $root ".codex-logs/desktop-mcp/$Client-readonly.jsonl"
$task=Get-Content (Join-Path $PSScriptRoot 'agent-readonly-task.txt') -Raw -Encoding utf8
Push-Location $root
try {
    $env:H3D_MCP_URL=$config.url
    $env:H3D_MCP_AUTH=$config.headers.Authorization
    $env:H3D_MCP_TOKEN=$config.headers.Authorization.Substring(7)
    if ($Client -eq 'dsh') {
        $dsh='C:\Users\80967\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
        if (-not (Test-Path -LiteralPath $dsh)) { throw 'DSH CLI not installed at the verified local path.' }
        $task | & $dsh --profile headless --patch (Join-Path $PSScriptRoot 'dsh-mcp.patch.yml') --json - > $output 2>&1
    } else {
        $task | & codex exec --ephemeral --json --sandbox read-only -c 'mcp_servers.h3d.url="http://127.0.0.1:8098/mcp"' -c 'mcp_servers.h3d.bearer_token_env_var="H3D_MCP_TOKEN"' - > $output 2>&1
    }
    $exitCode=$LASTEXITCODE
    Write-Output "$Client exit=$exitCode; evidence=$output (review actual calls, not just exit code)"
} finally {
    foreach($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    $config=$null
    Pop-Location
}
exit $exitCode
