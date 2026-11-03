# Run through browser-harness in the existing Electron test tab, never as an Agent tool.
# H3D_PROBE_PHASE=arm before verify-registration-failure.mjs, then check afterwards.
import os, json, pathlib

expected = 'h3d://app/#/editor/db24d798905d186dfb61505f9396d5b8'
assert js('location.href') == expected, 'Only the authorized blue-box test scene'
phase = os.environ.get('H3D_PROBE_PHASE', 'check')
if phase == 'arm':
    # Inspect the actual page resource, not a guessed build hash.
    resources = js("[...document.querySelectorAll('link[rel=modulepreload]')].map(n=>n.href).filter(n=>n.includes('/astral3d-'))")
    assert len(resources) == 1
    expression = """import(SDK_URL).then(m=>{
      const a=Object.values(m).find(v=>v?.scene===window.viewer.scene);
      if(!a || window.__h3dRegistrationProbe)throw Error('Probe unavailable or already armed');
      const snapshot=()=>JSON.stringify({geometries:Object.keys(a.geometries).sort(),materials:Object.keys(a.materials).sort(),
        counts:[...a.materialsRefCounter].map(([m,n])=>[m.uuid,n]).sort(),helpers:Object.keys(a.helpers).sort(),
        cameras:Object.keys(a.cameras).sort(),mixers:[...a.animationManager.mixerMap.keys()].sort(),actions:[...a.animationManager.actionMap.keys()].sort()});
      const original=a.addMaterial;
      window.__h3dRegistrationProbe={snapshot,before:snapshot(),triggered:false,restore:()=>{a.addMaterial=original}};
      a.addMaterial=function(...args){a.addMaterial=original;original.apply(a,args);
        window.__h3dRegistrationProbe.triggered=true;throw Error('H3D injected resource registration failure')};
      return {armed:true,backend:window.viewer.renderer.backend.isWebGPUBackend};
    })""".replace('SDK_URL', json.dumps(resources[0]))
    result = cdp('Runtime.evaluate', expression=expression, awaitPromise=True, returnByValue=True)
    assert 'exceptionDetails' not in result, result
    print(result['result']['value'])
else:
    state = js("(()=>{const p=window.__h3dRegistrationProbe;p.restore();return {triggered:p.triggered,exactResourceStateRestored:p.before===p.snapshot(),backend:window.viewer.renderer.backend.isWebGPUBackend,scriptRuntime:window.viewer.enableScript}})()")
    print(state)
    assert state['triggered'] and state['exactResourceStateRestored'] and state['backend']
    js('delete window.__h3dRegistrationProbe')
