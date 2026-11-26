// [site] [challenges] [srm] [release] [library] real browser at phone and desktop sizes, against a throw-away local server
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
  assert.match(text, /All our programs are free/); assert.ok(await p.$('#upcoming .type-ico'), 'events show their type icon');
  await shot(p, 'site-home-phone'); assert.deepEqual(errors, []); await ctx.close();
});

test('[site] the header stays in the same place on every page', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  const pos = [];
  for (const u of ['/', '/calendar/', '/news/', '/about/', '/guidelines/', '/whats-new/']) {
    await p.goto(SITE + u, { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    pos.push(await p.evaluate(() => ['.org', '.main-nav', '#viewBtn'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)].join(','); }).join(' | ')));
  }
  assert.equal(new Set(pos).size, 1, 'logo, menu and layout button line up on every page: ' + pos.join(' / '));
  await p.goto(SITE + '/news/', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  assert.ok((await p.$$('#list .card:not([hidden]), .cards .card:not([hidden])')).length > 5, 'news articles are listed');
  assert.ok((await p.$$eval('.year-h', (h) => new Set(h.map((x) => x.textContent)).size)) > 3, 'each year heading shows its own year');
  assert.match(await p.textContent('footer.site'), /Visitor guidelines/);
  await shot(p, 'site-guidelines-desktop'); assert.deepEqual(errors, []); await ctx.close();
});

test('[site] event page says FREE and explains children and guidelines', async () => {
  const { p, ctx, errors } = await page(PHONE);
  await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('#upcoming a.card');
  await p.click('#upcoming a.card'); await p.waitForSelector('.ev-page');
  const t = await p.textContent('.ev-page');
  assert.match(t, /FREE/); assert.match(t, /children/i); assert.match(t, /visitor guidelines/i);
  await shot(p, 'site-event-phone'); assert.deepEqual(errors, []); await ctx.close();
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
    await p.waitForFunction(() => /Drifted/.test(document.getElementById('app')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
    assert.match(await p.textContent('#app'), /Drifted/);
    await shot(p, 'admin-journey-desktop'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-admin').catch(() => {}); throw e; } finally { await ctx.close(); }
});

async function newGuest(p) {   // a new Copilot guest (seeker) who has chosen the 21-Day Foundation
  await p.goto(SITE + '/copilot/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.click('#guestBtn'); await p.check('#guestAck'); await p.click('#guestGo'); await p.waitForTimeout(500);
  await p.click('#tyNo'); await p.waitForSelector('#firstDlg[open]', { timeout: 10000 });
  await p.click('#firstDlg .cp-opt[data-opt="c21-foundation"] [data-go]'); await p.waitForTimeout(800);
}
test('[library] Daily Thought: read today’s thought and it counts toward the challenge', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await newGuest(p);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-cc="e-quote30"]', { timeout: 15000 });
    await p.click('[data-cc="e-quote30"]'); await p.waitForTimeout(500);
    assert.match(await p.textContent('#goalsCard'), /0 of 30 thoughts/);
    await p.goto(SITE + '/copilot/#home'); await p.waitForSelector('#thought [data-quote]');
    await p.click('#thought [data-quote]'); await p.waitForTimeout(300);
    assert.match(await p.textContent('#thought'), /✓ Read/);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForFunction(() => /1 of 30 thoughts/.test(document.getElementById('goalsCard')?.textContent || ''), null, { timeout: 10000 });
    await shot(p, 'copilot-daily-thought-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-daily-thought').catch(() => {}); throw e; } finally { await ctx.close(); }
});
test('[library] books: choose a book, tick chapters, finish it; mark an article as read', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await newGuest(p);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-cc="e-book"]', { timeout: 15000 });
    await p.click('[data-cc="e-book"]'); await p.waitForSelector('#bkDlg[open] [data-pick="t-book"]');
    await p.click('#bkDlg [data-pick="t-book"]'); await p.waitForTimeout(500);
    assert.match(await p.textContent('#goalsCard'), /A Test Book on Meditation/);
    await p.goto(SITE + '/copilot/#learn?b=t-book'); await p.waitForSelector('#bkStart');
    await p.click('#bkStart');
    for (let i = 1; i <= 6; i++) { await p.click(`[data-ch="${i}"]`); await p.waitForTimeout(100); }
    await p.click('#bkFinish'); await p.waitForTimeout(300);
    assert.match(await p.textContent('#learnArticle'), /Finished/);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForTimeout(800);
    assert.match(await p.textContent('#goalsCard'), /Completed/);
    await p.goto(SITE + '/copilot/#learn?a=learn-to-meditate'); await p.waitForSelector('#artRead');
    await p.locator('#artEnd').scrollIntoViewIfNeeded(); await p.waitForFunction(() => !document.getElementById('artRead').disabled);
    await p.click('#artRead'); assert.match(await p.textContent('#artEnd'), /✓ Read/);
    await p.goto(SITE + '/copilot/#learn'); await p.waitForSelector('.reading-card');
    assert.match(await p.textContent('.reading-card'), /6\s*chapters/);
    await shot(p, 'copilot-learn-library-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-books').catch(() => {}); throw e; } finally { await ctx.close(); }
});
test('[library] admin: Library tab lists books and opens the form', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  try {
    await p.goto(ADMIN + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('#tEmail', { timeout: 15000 });
    await p.fill('#tEmail', 'owner@example.com'); await p.click('#tBtn'); await p.waitForTimeout(800);
    await p.goto(ADMIN + '/#library'); await p.waitForSelector('.lib-row', { timeout: 15000 });
    const t = await p.textContent('#app');
    assert.match(t, /Empowering Your Soul through Meditation/); assert.match(t, /Draft/); assert.match(t, /Approved/);
    await p.click('.lib-row [data-le]'); await p.waitForSelector('#lf'); assert.ok(await p.$('#lLook'), 'books have Look up');
    await shot(p, 'admin-library-desktop'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-admin-library').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[release] What’s new pages open on the site and the admin site', async () => {
  const { p, ctx } = await page(DESKTOP);
  assert.equal((await p.goto(SITE + '/whats-new/')).status(), 200);
  assert.equal((await p.goto(ADMIN + '/whats-new.html')).status(), 200);
  await ctx.close();
});
