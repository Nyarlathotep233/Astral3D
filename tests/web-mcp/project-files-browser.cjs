const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const scene = {id:'project-files-regression', sceneName:'Project files', sceneVersion:1, projectType:0, zip:'', coverPicture:'', hasDrawing:0};
const ok = result => ({code:200, success:true, result});

async function projectZipRoundTrip(page) {
  const expected = await page.evaluate(async () => {
    const source = await fetch('/src/utils/integration/agentObjects.ts').then(response => response.text());
    const moduleUrl = source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1];
    const {App, THREE} = await import(moduleUrl);
    const group = new THREE.Group();
    group.name = 'Saved group';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    group.add(mesh);
    App.addObject(group);
    return {group:group.uuid, mesh:mesh.uuid};
  });
  await page.getByRole('button', {name:'导出', exact:true}).click();
  await page.getByText('导出场景', {exact:true}).hover();
  const downloading = page.waitForEvent('download');
  await page.getByText('项目包 (.zip)', {exact:true}).click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.h3d-project\.zip$/);
  const bytes = [];
  for await (const chunk of await download.createReadStream()) bytes.push(chunk);
  await page.evaluate(id => { window.viewer.scene.getObjectByProperty('uuid', id).name = 'unsaved rename'; }, expected.group);
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', {name:'导入', exact:true}).click();
  await (await choosing).setFiles({name:download.suggestedFilename(), mimeType:'application/zip', buffer:Buffer.concat(bytes)});
  await page.getByRole('dialog').getByRole('button', {name:'确定', exact:true}).click();
  await page.waitForFunction(({group, mesh}) => {
    const restored = window.viewer.scene.getObjectByProperty('uuid', group);
    return restored?.name === 'Saved group' && restored.children.some(child => child.uuid === mesh && child.geometry);
  }, expected);
}

async function lostAssetResponse(page) {
  let visible = true, stored, deletions = 0;
  await page.route('**/api/common/upload', route => route.fulfill({json:ok('upload/agent-assets/fixture/file.bin')}));
  await page.route('**/api/assets/assetsInfo', route => {
    stored = {...route.request().postDataJSON(), id:42};
    return route.abort('connectionreset');
  });
  await page.route('**/api/assets/assetsInfo/list?*', route => {
    assert.equal(new URL(route.request().url()).searchParams.get('file'), stored.file);
    return route.fulfill({json:ok(visible ? [stored] : [])});
  });
  await page.route('**/api/common/deleteFile?*', route => { deletions++; return route.fulfill({json:ok(true)}); });
  const publish = () => page.evaluate(async () => {
    const {agentAssets} = await import('/src/utils/integration/agentAssets.ts');
    try {
      return await agentAssets({action:'publish', type:'Model', name:'Test asset', category:'fixture',
        source:{url:'data:application/octet-stream;base64,AA==', name:'file.bin'}});
    } catch (error) { return {outcome:error.outcome}; }
  });
  assert.equal((await publish()).id, 42);
  visible = false;
  assert.equal((await publish()).outcome, 'unknown');
  assert.equal(deletions, 0);
}

async function authoringRecovery(page) {
  const result = await page.evaluate(async sceneId => {
    const source = await fetch('/src/utils/integration/agentObjects.ts').then(response => response.text());
    const {App, THREE, HtmlPanel, HtmlSprite, HtmlPanelConverter} = await import(source.match(/from\s+["']([^"']*astral3d\.es\.js[^"']*)["']/)[1]);
    const runtime = await import('/src/utils/integration/agentRuntime.ts');
    const {agentState} = await import('/src/utils/integration/agentState.ts');
    const {saveSceneToService} = await import('/src/utils/common/saveSceneToService.ts');
    const group = new THREE.Group();
    const panelOptions = {isSingleHtml:true, isSprite:false, codes:[{name:'index.html', isIndex:true, content:'<p>panel</p>'}]};
    const spriteOptions = {isSingleHtml:false, isSprite:true, codes:[{name:'index.html', isIndex:true, content:'<p>sprite</p>'}]};
    const panel = new HtmlPanel(document.createElement('div'), panelOptions);
    const sprite = new HtmlSprite(document.createElement('div'), spriteOptions);
    App.addObject(panel);
    group.add(sprite);
    App.addObject(group);
    const snapshot = await runtime.packAuthoringSnapshot(crypto.randomUUID());
    await runtime.persistAgentRunSnapshot(sceneId, snapshot);
    const converter = HtmlPanelConverter.getInstance(), parse = converter.parseToCSS3D;
    converter.parseToCSS3D = () => { throw Error('Recovery mounted an active HTML panel'); };
    try { await runtime.restoreAgentRunRecovery(sceneId); } finally { converter.parseToCSS3D = parse; }
    const restored = [panel, sprite].map(original => {
      const object = App.scene.getObjectByProperty('uuid', original.uuid);
      return object?.type === original.type && object.element.childElementCount === 0 &&
        JSON.stringify(object.toJSON().object.options) === JSON.stringify(original.options);
    });
    const dirty = agentState.dirty;
    const incomplete = {...snapshot, packages:snapshot.packages.filter(item => item.name !== group.uuid + '.zip')};
    await runtime.persistAgentRunSnapshot(sceneId, incomplete);
    const failed = await runtime.restoreAgentRunRecovery(sceneId).then(() => false, () => true);
    const blocked = await saveSceneToService().then(() => false, () => true);
    return {restored, dirty, failed, blocked, state:agentState.sceneState};
  }, scene.id);
  assert.deepEqual(result, {restored:[true,true], dirty:true, failed:true, blocked:true, state:'failed'});
  assert.equal(await page.getByRole('button', {name:'保存', exact:true}).isDisabled(), true);
}

(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({ignoreHTTPSErrors:true, viewport:{width:1440, height:1000}});
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/editor3d/scenes/get/' + scene.id) return route.fulfill({json:ok(scene)});
      return route.request().method() === 'GET' ? route.continue() : route.abort();
    });
    await page.goto((process.env.EDITOR_URL || 'https://localhost:8090') + '/#/editor/' + scene.id);
    const state = await page.evaluateHandle(async () => (await import('/src/utils/integration/agentState.ts')).agentState);
    await page.waitForFunction(s => s.sceneState === 'ready', state);
    await state.dispose();
    await projectZipRoundTrip(page);
    await lostAssetResponse(page);
    await authoringRecovery(page);
    console.log('PASS: menu ZIP round trip; asset publication reconciliation; recovery preserves deferred HTML and blocks incomplete saves');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
