// [site] [challenges] [srm] [release] real browser at phone and desktop sizes, against a throw-away local server
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, run, serveStatic } from '../../tools/lib.mjs';
import { startServer } from '../api/_server.mjs';

const SITE = 'http://127.0.0.1:8800', ADMIN = 'http://127.0.0.1:8801';
const SHOTS = path.join(ROOT, 'reports/artifacts'); fs.mkdirSync(SHOTS, { recursive: true });
let srv, site, admin, browser;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const DESKTOP = { viewport: { width: 1366, height: 900 } };

before(async () => {
  srv = await startServer(8797, [SITE, ADMIN]);
  run(process.execPath, ['tools/build.mjs', 'local'], { capture: true });
  site = await serveStatic(path.join(ROOT, 'dist/site'), 8800);
  admin = await serveStatic(path.join(ROOT, 'dist/admin'), 8801, { spa: true });
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch(); }
});
after(async () => { if (browser) await browser.close(); site && site.close(); admin && admin.close(); srv && srv.stop(); });

async function page(opts, init = {}) {
  const ctx = await browser.newContext(opts);
  const seed = { 'meditation-copilot:api-override': srv.base, ...init };
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); sessionStorage.setItem('seeded', '1'); } }, seed);
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  return { p, ctx, errors };
}
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });

test('[site] home page shows upcoming events on a phone', async () => {
  const { p, ctx, errors } = await page(PHONE);
  await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const text = await p.textContent('body');
  assert.match(text, /Weekly Meditation Workshop|Satsang|Introduction to Meditation/);
  assert.match(text, /v0\.\d+/, 'footer shows the version');
  await shot(p, 'site-home-phone'); assert.deepEqual(errors, []); await ctx.close();
});

test('[challenges] a new Copilot user must choose a first challenge', async () => {
  const { p, ctx, errors } = await page(PHONE);
  await p.goto(SITE + '/copilot/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.click('#guestBtn'); await p.check('#guestAck'); await p.click('#guestGo'); await p.waitForTimeout(500);
  await p.click('#tyNo'); await p.waitForTimeout(1500);
  assert.ok(await p.evaluate(() => document.getElementById('firstDlg')?.open), 'the first-challenge step is open');
  assert.equal(await p.$('#fdLater'), null, 'a brand-new user cannot skip it');
  await p.click('#firstDlg .cp-opt[data-opt="c21-foundation"] [data-min="10"]');
  await p.click('#firstDlg .cp-opt[data-opt="c21-foundation"] [data-go]'); await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => MC.dailyTarget()), 10);
  assert.match(await p.textContent('#s-challenge'), /Day 1/);
  await shot(p, 'copilot-first-challenge-phone'); assert.deepEqual(errors, []); await ctx.close();
});

test('[srm] admin: local test sign-in, follow-ups and journey', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  try {
    await p.goto(ADMIN + '/', { waitUntil: 'networkidle' });
    await p.waitForSelector('#tEmail', { timeout: 15000 });
    await p.fill('#tEmail', 'owner@example.com'); await p.click('#tBtn');
    await p.waitForFunction(() => !document.getElementById('tEmail'), null, { timeout: 15000 }).catch(() => {});
    await p.goto(ADMIN + '/#followups');
    // wait for the list rather than a fixed time (slower computers)
    await p.waitForFunction(() => document.querySelectorAll('.fu-row').length >= 3, null, { timeout: 20000 }).catch(() => {});
    assert.ok((await p.$$('.fu-row')).length >= 3, 'follow-ups are listed');
    await shot(p, 'admin-followups-desktop');
    await p.goto(ADMIN + '/#journey');
    await p.waitForFunction(() => /Seeker · L3/.test(document.getElementById('app')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
    assert.match(await p.textContent('#app'), /Seeker · L3/);
    await shot(p, 'admin-journey-desktop'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-admin').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[release] What’s new pages open on the site and the admin site', async () => {
  const { p, ctx } = await page(DESKTOP);
  assert.equal((await p.goto(SITE + '/whats-new/')).status(), 200);
  assert.equal((await p.goto(ADMIN + '/whats-new.html')).status(), 200);
  await ctx.close();
});
