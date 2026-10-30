# Run with browser-harness after starting tests/rendering/vite.config.mjs on 8093.
# These are factory/fixture checks, NOT editor or standalone acceptance.
import json
import time

def evaluate(expression):
    result = cdp('Runtime.evaluate', expression=expression, awaitPromise=True, returnByValue=True)
    assert 'exceptionDetails' not in result, result
    return result['result'].get('value')

def ready():
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        state = evaluate('({ready:!!window.__renderFixture, errors:window.__renderErrors})')
        assert not state.get('errors'), state
        if state.get('ready'):
            return
        time.sleep(0.2)
    raise AssertionError('Renderer did not become ready')

results = []
for failure in ['', 'adapter', 'device']:
    new_tab('http://127.0.0.1:8093/tests/rendering/webgpu.html?failure=' + failure)
    try:
        wait_for_load()
        ready()
        state = evaluate('({api:__renderFixture.api, revision:__renderFixture.revision, requests:__contextRequests, errors:__renderFixture.errors})')
        assert not state['errors'], state
        if not failure:
            assert state['api'] == 'webgpu', state
            assert not set(state['requests']) & {'webgl', 'webgl2', 'experimental-webgl'}, state
            unsupported = evaluate('__renderFixture.testUnsupported()')
            assert unsupported['preserved'] and 'unsupported-test' in unsupported['message'], unsupported
            screenshot = evaluate('__renderFixture.testCapture()')
            assert (screenshot['width'], screenshot['height']) == (960, 640), screenshot
            assert screenshot['reusableSource'], screenshot
            assert screenshot['center'][3] == 255 and len(set(screenshot['center'][:3])) > 1, screenshot
            transparent = evaluate('__renderFixture.testCapture(true)')
            assert transparent['corner'][3] == 0, transparent
            lifecycle = evaluate('__renderFixture.testLifecycle()')
            assert lifecycle == {'canvases': 1, 'errors': []}, lifecycle
            requests = evaluate('__contextRequests')
            assert not set(requests) & {'webgl', 'webgl2', 'experimental-webgl'}, requests
            lost = evaluate('__renderFixture.testDeviceLoss()')
            assert len(lost['errors']) == 1 and 'Injected device loss' in lost['errors'][0], lost
            state.update(capture=screenshot, transparent=transparent, lifecycle=lifecycle,
                         unsupported=unsupported, simulatedLoss=lost)
        else:
            assert state['api'] == 'webgl2' and 'webgl2' in state['requests'], state
        assert not evaluate('__renderErrors'), evaluate('__renderErrors')
        results.append({'failure': failure or 'none', **state})
    finally:
        evaluate('window.__renderFixture?.dispose()')
        close_tab(current_tab())
print(json.dumps(results, ensure_ascii=False, indent=2))
