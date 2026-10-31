# Run after Vite tests/rendering/vite.config.mjs is listening on 8093.
# Local fixture ZIPs only: no business APIs, uploads or production scene writes.
import json, time, base64
from pathlib import Path
root=Path.cwd()
results=root/'.codex-logs'
results.mkdir(exist_ok=True)
def poll(expr,timeout=180):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        result=js(expr)
        if result:return result
        time.sleep(1)
    raise AssertionError('Browser verification timed out: '+expr)
def start(expr):
    js(expr+".catch(e=>window.__testFailure=e.stack);'started'")
new_tab('http://127.0.0.1:8093/tests/rendering/editor-runtime.html')
wait_for_load()
poll('window.__editorRuntime?.ready')
start("import('/tests/rendering/verify-editor.mjs').then(m=>m.run(viewer))")
poll('window.__suite?.done || window.__testFailure')
assert not js('window.__testFailure'),js('window.__testFailure')
r=js('JSON.stringify({...__suite,snapshots:__suite.snapshots.map(x=>x.name)})')
(results/'webgpu-editor-report.json').write_text(r,encoding='utf8')
print(r)
cdp('Page.reload');wait_for_load();poll('window.__editorRuntime?.ready')
start("import('/tests/rendering/verify-package.mjs').then(m=>m.prepare(viewer)).then(r=>window.__prepared=r)")
poll('window.__prepared || window.__testFailure')
assert not js('window.__testFailure'),js('window.__testFailure')
folder=results/'package-test';folder.mkdir(exist_ok=True)
for i in range(js('__packageFiles.length')):
    result=cdp('Runtime.evaluate',expression=f'''(async()=>{{const f=__packageFiles[{i}];const bytes=new Uint8Array(await f.arrayBuffer());return {{name:f.name,data:btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''))}};}})()''',awaitPromise=True,returnByValue=True)['result']['value']
    (folder/result['name']).write_bytes(base64.b64decode(result['data']))
start("import('/tests/rendering/verify-package.mjs').then(m=>m.reload(viewer,'/.codex-logs/package-test/')).then(r=>window.__reloaded=r)")
poll('window.__reloaded || window.__testFailure')
assert not js('window.__testFailure'),js('window.__testFailure')
r=js('JSON.stringify({checks:__reloaded,errors:__renderErrors})')
(results/'webgpu-package-report.json').write_text(r,encoding='utf8');print(r)
