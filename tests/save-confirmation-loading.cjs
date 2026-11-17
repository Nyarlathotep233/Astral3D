const assert = require('node:assert/strict');
const path = require('node:path');
const {mkdir} = require('node:fs/promises');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

// Run against the dev server. All writes and the test scene are intercepted;
// this exercises the real editor/save UI without changing stored projects.
const baseURL = process.env.EDITOR_URL || 'https://localhost:8090';
const scene = {
  id: 'save-confirmation-regression', sceneName: 'Save confirmation regression',
  sceneVersion: 1, sceneType: '其他', sceneIntroduction: '', projectType: 0,
  sceneSource: 'INTERNAL', coverPicture: 'save-ui-test/cover.png', zip: '', hasDrawing: 0,
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hS8AAAAASUVORK5CYII=', 'base64');
const result = value => ({code: 200, success: true, result: value});

async function waitForUpload(started) {
  let timer;
  try {
    await Promise.race([started, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Upload was not reached')), 15000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true});
  const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let releaseUpload;
  let uploadStarted;
  let uploads = 0;
  let updates = 0;
  let failUpload = true;
  const armUpload = () => {
    const started = new Promise(resolve => { uploadStarted = resolve; });
    const release = new Promise(resolve => { releaseUpload = resolve; });
    return {started, release};
  };
  let gate = armUpload();

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === `/api/editor3d/scenes/get/${scene.id}`) {
      return route.fulfill({json: result(scene)});
    }
    if (request.method() === 'GET') return route.continue();
    if (url.pathname === '/api/common/upload') {
      uploads++;
      uploadStarted();
      await gate.release;
      return route.fulfill({json: failUpload
        ? {code: 500, success: false, message: 'Save regression: upload failed'}
        : result('save-ui-test/cover.png')});
    }
    if (url.pathname === `/api/editor3d/scenes/update/${scene.id}`) {
      updates++;
      Object.assign(scene, request.postDataJSON());
      return route.fulfill({json: result(scene)});
    }
    throw new Error(`Unexpected write blocked: ${request.method()} ${url.pathname}`);
  });
  await page.route('**/file/static/save-ui-test/cover.png', route => route.fulfill({contentType: 'image/png', body: png}));

  try {
    await page.goto(`${baseURL}/#/editor/${scene.id}`, {waitUntil: 'networkidle'});
    const save = page.getByRole('button', {name: '保存', exact: true});
    await save.waitFor();
    const dialog = page.getByRole('dialog');

    // Cancellation before saving must keep its normal behavior.
    await save.click();
    await dialog.getByRole('button', {name: '取消', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
    assert.equal(uploads, 0);

    await save.click();
    // Trigger both clicks in the same turn, before Vue can disable the button.
    await dialog.getByRole('button', {name: '确定', exact: true}).evaluate(button => {
      button.click();
      button.click();
    });
    await waitForUpload(gate.started);
    // Wait for Vue's rendering turn without relying on network duration.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog && getComputedStyle(dialog).opacity === '1' && !dialog.className.includes('enter-active');
    });
    const pending = await dialog.evaluate(element => {
      const buttons = [...element.querySelectorAll('button')].map(button => ({text: button.textContent.trim(), disabled: button.disabled}));
      const spinner = element.querySelector('.n-spin');
      const rect = spinner?.getBoundingClientRect();
      const hit = rect && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {buttons, progressVisible: !!spinner && !!rect?.width && !!hit && element.contains(hit), text: element.textContent};
    });
    console.log('Pending save UI:', JSON.stringify(pending));
    await mkdir(path.resolve('logs'), {recursive: true});
    await page.screenshot({path: path.resolve('logs/save-confirmation-pending.png')});
    assert.equal(pending.progressVisible, true, 'Save progress must be visible in front of the confirmation dialog');
    assert(pending.buttons.every(button => button.disabled), 'Every dialog action must be disabled during save');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true, 'Escape and mask clicks must not dismiss an active save');
    assert.equal(uploads, 1, 'Only one save may start while the first save is pending');

    releaseUpload();
    const confirm = dialog.getByRole('button', {name: '确定', exact: true});
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[role="dialog"] button')];
      return buttons.some(button => button.textContent.trim() === '确定' && !button.disabled);
    });
    assert.equal(await dialog.isVisible(), true, 'A failed save must allow retry');
    assert.equal(await dialog.getByRole('button', {name: '取消', exact: true}).isEnabled(), true);
    assert.equal(updates, 0, 'Failed upload must not update the scene');

    // Retry through the real packaging code with intercepted successful writes.
    gate = armUpload();
    failUpload = false;
    await confirm.click();
    await waitForUpload(gate.started);
    releaseUpload();
    await dialog.waitFor({state: 'hidden', timeout: 30000});
    assert.equal(updates, 1, 'Retry must complete a single scene update');
    assert.equal(scene.sceneVersion, 2, 'A failed attempt must not increment the saved version');
    console.log('PASS: pending progress, interaction lock, cancel, failure recovery and successful retry');
  } catch (error) {
    const directory = path.resolve('logs');
    await mkdir(directory, {recursive: true});
    await page.screenshot({path: path.join(directory, 'save-confirmation-failure.png')});
    throw error;
  } finally {
    releaseUpload?.();
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
