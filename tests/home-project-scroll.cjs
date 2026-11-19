const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const projects = Array.from({length: 45}, (_, index) => ({
  id: String(index + 1),
  sceneName: 'Scroll test ' + (index + 1),
  projectType: 0,
  sceneSource: 'INTERNAL',
  sceneType: 'Web3D',
  coverPicture: ''
}));

async function checkCardSizes(page) {
  const layout = await page.locator('.project-cards-list').evaluate(grid => {
    const cards = [...grid.querySelectorAll('.project-card')];
    return {
      rows: new Set(cards.map(card => card.offsetTop)).size,
      clipped: cards.filter(card => card.clientHeight + 1 < card.scrollHeight).length,
      overflow: grid.scrollWidth - grid.clientWidth
    };
  });
  assert.ok(layout.rows > 1, 'The fixture must span multiple rows');
  assert.equal(layout.clipped, 0, 'Every card must show its cover and actions');
  assert.ok(layout.overflow <= 1, 'The grid must fit the viewport width');
}

async function run() {
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage({ignoreHTTPSErrors: true, viewport: {width: 1366, height: 768}});
    const offsets = [];
    await page.route('**/editor3d/scenes/getAll?**', route => {
      const params = new URL(route.request().url()).searchParams;
      const offset = Number(params.get('offset'));
      const limit = Number(params.get('limit'));
      offsets.push(offset);
      return route.fulfill({json: {code: 200, success: true, result: {
        items: projects.slice(offset, offset + limit), current: offset / limit + 1,
        pageSize: limit, pages: Math.ceil(projects.length / limit), total: projects.length
      }}});
    });
    await page.goto(process.env.APP_URL || 'https://localhost:8090/#/');
    const cards = page.locator('.project-card');
    await cards.nth(19).waitFor({state: 'attached'});
    await checkCardSizes(page);
    assert.equal(await page.locator('.project-board .n-pagination').count(), 0);
    assert.equal(await page.locator('.project-total-chip strong').innerText(), String(projects.length));

    await page.setViewportSize({width: 390, height: 700});
    await checkCardSizes(page);
    await page.mouse.move(190, 640);
    for (const expectedCount of [40, 45]) {
      await page.mouse.wheel(0, 30000);
      await cards.nth(expectedCount - 1).waitFor({state: 'attached'});
    }
    await page.mouse.wheel(0, 30000);
    await page.waitForFunction(() => {
      const action = document.querySelector('.project-card:last-of-type .n-card__action');
      if (!action) return false;
      const rect = action.getBoundingClientRect();
      return rect.bottom <= innerHeight && action.contains(document.elementFromPoint(rect.x + 5, rect.y + 5));
    });
    const titles = await cards.locator('h4').allTextContents();
    assert.deepEqual(titles.map(title => title.trim()), projects.map(project => project.sceneName));
    assert.deepEqual(offsets, [0, 20, 40]);
    console.log('Project cards remain fully sized and scroll through all 45 projects.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
