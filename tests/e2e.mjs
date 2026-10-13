import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const screenshotDirectory = 'work/screenshots';
const results = [];
const errors = [];
await mkdir(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });

async function check(name, run) {
  try { await run(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}

async function makePage(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  let searchMode = 'success';
  await context.route('https://*.basemaps.cartocdn.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await context.route('https://nominatim.openstreetmap.org/**', async route => {
    if (searchMode === 'failure') return route.fulfill({ status: 503, body: 'Unavailable' });
    if (searchMode === 'slow') await new Promise(resolve => setTimeout(resolve, 500));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ place_id: 123, name: 'Community Fitness', display_name: 'Community Fitness, Brighton, United Kingdom', lat: '50.8225', lon: '-0.1372' }]) });
  });
  await context.addInitScript(() => {
    const observers = new Map();
    let sequence = 0;
    let point = { latitude: 51.5102, longitude: -0.1364, accuracy: 5 };
    let failure = null;
    let offset = Number(sessionStorage.getItem('__test-clock-offset') ?? 0);
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + offset;
    const position = () => ({ coords: { ...point, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
    const emit = () => { for (const { success, error } of [...observers.values()]) failure ? error?.(failure) : success(position()); };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, error) { queueMicrotask(() => failure ? error?.(failure) : success(position())); },
      watchPosition(success, error) { const id = ++sequence; observers.set(id, { success, error }); queueMicrotask(() => { if (observers.has(id)) failure ? error?.(failure) : success(position()); }); return id; },
      clearWatch(id) { observers.delete(id); },
    } });
    window.__locationTest = {
      set(latitude, longitude, accuracy = 5) { point = { latitude, longitude, accuracy }; failure = null; emit(); },
      reject(code = 1) { failure = { code, message: 'Location unavailable' }; emit(); },
      advance(milliseconds) { offset += milliseconds; sessionStorage.setItem('__test-clock-offset', String(offset)); emit(); },
      fresh() { failure = null; emit(); },
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  await page.goto(baseURL);
  await page.locator('[data-action="onboard"]').waitFor();
  return { context, page, searchMode: mode => { searchMode = mode; } };
}

const action = (page, name) => page.locator(`[data-action="${name}"]`).first().click();
const tab = (page, name) => page.locator(`nav [data-tab="${name}"]`).click();
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('gymstake:v1')));
const active = state => state.sessions.find(session => session.endedAt === null);
const wallet = state => state.ledger.filter(entry => entry.userId === state.profile.id).reduce((sum, entry) => sum + entry.amountPence, 0);
async function onboard(page, { name = 'Taylor', target = 3, stake = '10' } = {}) {
  await action(page, 'onboard');
  await page.locator('#name').fill(name);
  await action(page, 'next-onboard');
  await action(page, 'next-onboard');
  await page.locator(`[data-target="${target}"]`).click();
  await page.locator('#stake').fill(stake);
  await action(page, 'finish-onboard');
  await page.locator('nav').waitFor();
}
async function openLab(page) { await tab(page, 'settings'); await action(page, 'lab'); await page.getByRole('dialog', { name: 'Prototype lab' }).waitFor(); }
async function assertNoOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Horizontal scrolling is present');
}

const mobile = await makePage();
await check('Mobile onboarding validates the name and stake, selects a gym and persists a commitment', async () => {
  const { page } = mobile;
  await assertNoOverflow(page);
  await action(page, 'onboard');
  await action(page, 'next-onboard');
  assert.match(await page.locator('.toast').innerText(), /Enter your name/);
  await page.locator('#name').fill('Taylor');
  await action(page, 'next-onboard');
  await page.getByLabel('Find your gym').fill('Tower Bridge');
  await page.locator('[data-results] button').click();
  assert.match(await page.locator('[data-selected-name]').innerText(), /Tower Bridge/);
  await action(page, 'next-onboard');
  await page.locator('#stake').fill('0');
  await action(page, 'finish-onboard');
  assert.match(await page.locator('.toast').innerText(), /£1 to £100/);
  assert.equal(await page.locator('nav').count(), 0);
  await page.locator('#stake').fill('10.25');
  await action(page, 'finish-onboard');
  await page.locator('nav').waitFor();
  const state = await stored(page);
  assert.equal(state.profile.name, 'Taylor');
  assert.equal(state.commitment.gym.id, 'third-space-tower-bridge');
  assert.equal(state.commitment.stakePence, 1025);
  assert.equal(wallet(state), 8975);
  assert.equal(state.ledger.filter(entry => entry.kind === 'stake_lock').length, 1);
  await page.reload();
  assert.equal((await stored(page)).commitment.id, state.commitment.id);
  await page.screenshot({ path: `${screenshotDirectory}/dashboard-mobile.png`, fullPage: true });
});

await check('Settings search success/failure, map tap and drag, and coordinate validation work', async () => {
  const { page } = mobile;
  await tab(page, 'settings');
  await page.getByLabel('Find your gym').fill('Community Fitness');
  await page.locator('[data-search]').click();
  await page.locator('[data-results] button').waitFor();
  await page.locator('[data-results] button').click();
  assert.equal(await page.getByLabel('Latitude', { exact: true }).inputValue(), '50.822500');
  await page.getByRole('region', { name: 'Choose your gym on the map' }).locator('.leaflet-pane').first().waitFor({ state: 'attached' });
  const beforeTap = await page.getByLabel('Latitude', { exact: true }).inputValue();
  await page.getByRole('region', { name: 'Choose your gym on the map' }).click({ position: { x: 80, y: 70 } });
  assert.notEqual(await page.getByLabel('Latitude', { exact: true }).inputValue(), beforeTap);
  const pin = page.locator('.gym-map-pin');
  await page.waitForTimeout(400);
  await pin.evaluate(node => node.closest('[data-map]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => {
    const marker = document.querySelector('.gym-map-pin');
    const rectangle = marker.getBoundingClientRect();
    return Boolean(document.elementFromPoint(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2)?.closest('.gym-map-pin'));
  });
  const box = await pin.boundingBox();
  const beforeDrag = await page.getByLabel('Longitude', { exact: true }).inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(await page.getByLabel('Longitude', { exact: true }).inputValue(), beforeDrag);
  await page.getByLabel('Latitude', { exact: true }).fill('91');
  await page.locator('[data-coordinate-save]').click();
  assert.match(await page.locator('[data-notice]').innerText(), /valid latitude/);
  assert.equal(await page.getByLabel('Latitude', { exact: true }).getAttribute('aria-invalid'), 'true');
  mobile.searchMode('failure');
  await page.getByLabel('Find your gym').fill('Gym unavailable');
  await page.locator('[data-search]').click();
  await page.waitForFunction(() => document.querySelector('[data-notice]').textContent.includes('unavailable'));
  assert.equal(await page.locator('[data-search]').isEnabled(), true);
  mobile.searchMode('slow');
  await page.getByLabel('Find your gym').fill('Pending search');
  await page.locator('[data-search]').click();
  await page.getByLabel('Find your gym').fill('Gymbox');
  await page.waitForTimeout(700);
  assert.match(await page.locator('[data-results]').innerText(), /Gymbox/);
  assert.doesNotMatch(await page.locator('[data-results]').innerText(), /Community Fitness/);
  mobile.searchMode('success');
  await page.getByLabel('Latitude', { exact: true }).fill('51.52');
  await page.getByLabel('Longitude', { exact: true }).fill('-0.11');
  await page.getByLabel('Gym name', { exact: true }).fill('Next Gym');
  await page.locator('[data-coordinate-save]').click();
  await page.locator('[data-target="2"]').click();
  await page.locator('#stake').fill('20');
  await action(page, 'save-settings');
  const state = await stored(page);
  assert.equal(state.profile.pendingPreferences.gym.name, 'Next Gym');
  assert.equal(state.profile.pendingPreferences.target, 2);
  assert.equal(state.profile.pendingPreferences.stakePence, 2000);
  assert.equal(state.commitment.target, 3);
  assert.equal(state.commitment.stakePence, 1025);
  await page.reload();
  assert.equal((await stored(page)).profile.pendingPreferences.gym.name, 'Next Gym');
});

await check('Live check-in rejects denied permission, outside positions and poor accuracy', async () => {
  const { page } = mobile;
  await tab(page, 'checkin');
  await page.evaluate(() => window.__locationTest.reject(1));
  await action(page, 'start');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /permission is off/);
  assert.equal(active(await stored(page)), undefined);
  await page.evaluate(() => window.__locationTest.set(50, -0.13));
  await action(page, 'start');
  assert.match(await page.getByRole('alert').innerText(), /Move within 150m/);
  await page.evaluate(() => window.__locationTest.set(51.5045, -0.0794, 101));
  await action(page, 'start');
  assert.match(await page.getByRole('alert').innerText(), /100m or better/);
  assert.equal(active(await stored(page)), undefined);
});

await check('A valid live session rejects short checkout and ends automatically on leaving', async () => {
  const { page } = mobile;
  await page.evaluate(() => window.__locationTest.set(51.5045, -0.0794));
  await action(page, 'start');
  await page.locator('[data-session-time]').waitFor();
  assert.equal(active(await stored(page)).mode, 'location');
  await page.evaluate(() => window.__locationTest.advance(60_000));
  await action(page, 'checkout');
  await page.locator('[data-action="start"]').waitFor();
  let state = await stored(page);
  assert.equal(state.commitment.completed, 0);
  assert.equal(state.sessions.at(-1).status, 'too_short');
  await action(page, 'start');
  await page.locator('[data-session-time]').waitFor();
  await page.evaluate(() => window.__locationTest.advance(60_000));
  await page.evaluate(() => window.__locationTest.set(50, -0.0794));
  await page.locator('[data-action="start"]').waitFor();
  state = await stored(page);
  assert.equal(active(state), undefined);
  assert.equal(state.sessions.at(-1).endReason, 'left_gym');
  assert.equal(state.commitment.completed, 0);
});

await check('Live verification requires 30 monitored minutes and credits exactly one daily visit', async () => {
  const { page } = mobile;
  await page.evaluate(() => window.__locationTest.set(51.5045, -0.0794));
  await action(page, 'start');
  await page.locator('[data-session-time]').waitFor();
  await page.evaluate(() => { for (let minute = 0; minute < 29; minute++) window.__locationTest.advance(60_000); });
  let state = await stored(page);
  assert.equal(state.commitment.completed, 0);
  assert(active(state).verifiedMs < 1_800_000);
  await page.evaluate(() => window.__locationTest.advance(60_000));
  await action(page, 'checkout');
  await page.locator('[data-action="start"]').waitFor();
  state = await stored(page);
  assert.equal(state.commitment.completed, 1);
  assert.equal(state.sessions.at(-1).counted, true);
  assert.equal(state.sessions.at(-1).mode, 'location');
  await action(page, 'start');
  assert.match(await page.getByRole('alert').innerText(), /already counted a visit today/);
  assert.equal(active(await stored(page)), undefined);
  await page.reload();
  assert.equal((await stored(page)).commitment.completed, 1);
});

await check('Simulated successful settlement preserves payouts, applies queued settings and persists on reload', async () => {
  const { page } = mobile;
  await openLab(page);
  await action(page, 'demo-visit');
  await action(page, 'demo-visit');
  let before = await stored(page);
  assert.equal(before.commitment.completed, 3);
  assert.equal(before.sessions.filter(session => session.mode === 'demo' && session.counted).length, 2);
  await action(page, 'demo-settle');
  await page.getByRole('dialog', { name: 'You kept your word.' }).waitFor();
  const state = await stored(page);
  assert.equal(state.settlements.length, 1);
  assert(state.settlements[0].winnerIds.includes(state.profile.id));
  const reward = state.settlements[0].rewards[state.profile.id];
  assert.equal(wallet(state), wallet(before) + before.commitment.stakePence + reward - 2000);
  assert.equal(state.commitment.target, 2);
  assert.equal(state.commitment.stakePence, 2000);
  assert.equal(state.commitment.gym.name, 'Next Gym');
  assert.equal(state.profile.pendingPreferences, null);
  assert.equal(state.profile.streak, 1);
  await action(page, 'close-modal');
  await tab(page, 'leaderboard');
  assert.match(await page.locator('.page').innerText(), /Last week’s winners/);
  assert.equal(await page.locator('.rank-row').count(), 23);
  await page.locator('[data-rank="streak"]').click();
  assert.match(await page.locator('.rank-list').innerText(), /weeks/);
  await page.reload();
  assert.equal((await stored(page)).settlements.length, 1);
  assert.equal(wallet(await stored(page)), wallet(state));
});

await check('A simulated missed week forfeits only its locked stake, resets streak and allows a play-money top-up', async () => {
  const { page } = mobile;
  const before = await stored(page);
  await openLab(page);
  await action(page, 'demo-settle');
  await page.getByRole('dialog', { name: 'A fresh week. A fresh promise.' }).waitFor();
  const missed = await stored(page);
  assert.equal(missed.settlements.length, 2);
  assert.equal(missed.profile.streak, 0);
  assert(missed.settlements.at(-1).loserIds.includes(missed.profile.id));
  assert.equal(wallet(missed), wallet(before) - missed.commitment.stakePence);
  await action(page, 'close-modal');
  await openLab(page);
  await action(page, 'topup');
  assert.equal(wallet(await stored(page)), wallet(missed) + 5000);
  await action(page, 'close-modal');
  await action(page, 'wallet');
  assert.match(await page.getByRole('dialog').innerText(), /Play-money top-up/);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
});

await check('Reset requires a concrete choice and clears local prototype data', async () => {
  const { page } = mobile;
  await action(page, 'reset');
  await action(page, 'close-modal');
  assert(await stored(page));
  await action(page, 'reset');
  await action(page, 'confirm-reset');
  await page.locator('[data-action="onboard"]').waitFor();
  assert.equal(await stored(page), null);
});
await mobile.context.close();

await check('Reopening an active session pauses evidence before receiving fresh monitored fixes', async () => {
  const { context, page } = await makePage();
  try {
    await onboard(page);
    await tab(page, 'checkin');
    await action(page, 'start');
    await page.locator('[data-session-time]').waitFor();
    await page.evaluate(() => window.__locationTest.advance(60_000));
    const before = active(await stored(page)).verifiedMs;
    await page.evaluate(() => sessionStorage.setItem('__test-clock-offset', String(Number(sessionStorage.getItem('__test-clock-offset')) + 60_000)));
    await page.reload();
    await page.locator('nav').waitFor();
    const after = active(await stored(page)).verifiedMs;
    assert.equal(after, before, 'Reload credited an unmonitored gap');
    await tab(page, 'checkin');
    await page.evaluate(() => window.__locationTest.advance(60_000));
    assert(active(await stored(page)).verifiedMs > before);
  } finally { await context.close(); }
});

await check('Hidden pages and watch errors pause time and re-anchor without crediting the gap', async () => {
  const { context, page } = await makePage();
  try {
    await onboard(page);
    await tab(page, 'checkin');
    await action(page, 'start');
    await page.locator('[data-session-time]').waitFor();
    await page.evaluate(() => window.__locationTest.advance(60_000));
    const before = active(await stored(page)).verifiedMs;
    await page.evaluate(() => {
      window.__testHidden = true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__testHidden ? 'hidden' : 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.__locationTest.advance(60_000);
    });
    assert.equal(active(await stored(page)).verifiedMs, before);
    assert.equal(active(await stored(page)).evidencePaused, true);
    await page.evaluate(() => { window.__testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(50);
    assert.equal(active(await stored(page)).verifiedMs, before);
    await page.evaluate(() => window.__locationTest.advance(60_000));
    const resumed = active(await stored(page)).verifiedMs;
    assert(resumed > before);
    await page.evaluate(() => { window.__locationTest.reject(2); window.__locationTest.advance(60_000); });
    assert.equal(active(await stored(page)).verifiedMs, resumed);
    await page.evaluate(() => window.__locationTest.fresh());
    assert.equal(active(await stored(page)).verifiedMs, resumed);
    await page.evaluate(() => window.__locationTest.advance(60_000));
    assert(active(await stored(page)).verifiedMs > resumed);
  } finally { await context.close(); }
});

for (const viewport of [{ width: 320, height: 740 }, { width: 768, height: 1024 }, { width: 1440, height: 960 }]) {
  await check(`${viewport.width}px layout remains usable across all four tabs`, async () => {
    const { context, page } = await makePage(viewport);
    try {
      await action(page, 'demo');
      for (const name of ['home', 'checkin', 'leaderboard', 'settings']) {
        await tab(page, name);
        await assertNoOverflow(page);
        assert(await page.locator('nav').isVisible());
        if (viewport.width === 1440 && name === 'home') await page.screenshot({ path: `${screenshotDirectory}/dashboard-desktop.png`, fullPage: true });
      }
    } finally { await context.close(); }
  });
}

if (process.env.CHECK_PWA === '1') {
  await check('Production manifest, icons, service worker and cached offline shell work', async () => {
    const { context, page } = await makePage();
    try {
      const manifest = await (await page.request.get(`${baseURL}/manifest.webmanifest`)).json();
      assert.equal(manifest.name, 'GymStake');
      assert.equal(manifest.display, 'standalone');
      for (const icon of manifest.icons) assert.equal((await page.request.get(new URL(icon.src, baseURL).href)).status(), 200);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 10_000 });
      await action(page, 'demo');
      const before = await stored(page);
      await page.waitForTimeout(300);
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('nav').waitFor();
      assert.equal((await stored(page)).commitment.id, before.commitment.id);
      assert.match(await page.locator('.page').innerText(), /Back yourself/);
    } finally { await context.close(); }
  });
}

await check('No uncaught application exceptions occurred during browser checks', async () => assert.deepEqual(errors, []));
await browser.close();
await writeFile('work/e2e-results.json', JSON.stringify({ baseURL, results }, null, 2));
const failed = results.filter(result => result.status === 'failed');
console.log(`${results.length - failed.length}/${results.length} browser checks passed`);
if (failed.length) process.exitCode = 1;
