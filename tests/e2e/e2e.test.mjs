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
// v0.23: Copilot needs sign-in; locally there is a test sign-in (no Google/Microsoft)
async function signInCopilot(p, email) {
  await p.goto(SITE + '/copilot/', { waitUntil: 'networkidle' }); await p.waitForSelector('#welcome:not([hidden]) [data-test-email]', { timeout: 15000 });
  assert.equal(await p.$('#guestBtn'), null, 'no guest option any more');
  await p.fill('[data-test-email]', email); await p.click('[data-provider="test"]');
  // v0.24: no questions at sign-in; new users land on Today with "Getting started"
  await p.waitForSelector('#gettingStarted .gs-card', { timeout: 15000 });
  assert.ok(!(await p.evaluate(() => document.querySelector('dialog[open]'))), 'no dialog at sign-in');
}

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

test('[start] a new user lands on Today: Getting started, the tour, a sitting time and a first challenge', async () => {
  const { p, ctx, errors } = await page(PHONE);
  try {
    await signInCopilot(p, 'first-challenge@example.com');
    assert.equal((await p.$$('#gettingStarted .gs-row')).length, 7, 'seven first steps');
    assert.match(await p.textContent('#thought'), /Quote of the day/);
    assert.match(await p.textContent('footer'), /Back to sosmn.org/); assert.doesNotMatch(await p.textContent('footer'), /Center news|About the center/);
    await shot(p, 'copilot-getting-started-phone');
    // the tour: 5 cards
    await p.click('[data-gs="tour"]'); await p.waitForSelector('#tourDlg[open]');
    for (let i = 0; i < 4; i++) await p.click('#tourNext');
    assert.match(await p.textContent('#tourDlg'), /Learn/); await p.click('#tourNext');
    await p.waitForFunction(() => /✓/.test(document.querySelector('[data-gs="tour"]')?.textContent || ''));
    // set a daily sitting time: the form opens directly, then Today offers "Start timer"
    await p.click('[data-gs="sit"]'); await p.waitForSelector('#schedDlg[open]');
    await p.fill('#scTime', '23:59'); await p.click('#scForm [type="submit"]'); await p.waitForTimeout(400);
    await p.goto(SITE + '/copilot/#home'); await p.waitForSelector('#nextSitting [data-start]');
    // a first challenge from the Roadmap (no forced dialog)
    await p.click('[data-gs="challenge"]'); await p.waitForSelector('#s-challenge.active');
    assert.match(await p.textContent('#s-challenge'), /I’ve been initiated/);
    // one list, sections in order, and the same sign-up sheet for every challenge
    const secs = await p.$$eval('#goalsCard .ch-sec', (l) => l.map((x) => x.textContent));
    assert.deepEqual(secs, ['Your challenges', 'Meditation', 'Attend the center', 'Read & learn', 'Create your own'], 'sections: ' + secs);
    await p.click('[data-cc="c21-foundation"]'); await p.waitForSelector('#startDlg[open]');
    await p.click('#startDlg [data-min="10"]'); await p.click('#stGo'); await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => MC.dailyTarget()), 10);
    assert.match(await p.textContent('#s-challenge'), /Day 1/);
    await shot(p, 'copilot-first-challenge-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-start').catch(() => {}); throw e; } finally { await ctx.close(); }
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

let seq = 0;
async function newGuest(p) {   // a new Copilot user (seeker, local test sign-in) who has chosen the 21-Day Foundation
  await signInCopilot(p, 'seeker' + (++seq) + '@example.com');
  await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-cc="c21-foundation"]', { timeout: 10000 });
  await p.click('[data-cc="c21-foundation"]'); await p.waitForSelector('#startDlg[open]'); await p.click('#stGo'); await p.waitForTimeout(800);
}
test('[library] Daily Quote: read the quote of the day and it counts toward the challenge', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await newGuest(p);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-cc="e-quote30"]', { timeout: 15000 });
    await p.click('[data-cc="e-quote30"]'); await p.waitForSelector('#startDlg[open]'); await p.click('#stGo'); await p.waitForTimeout(500);
    assert.match(await p.textContent('#goalsCard'), /0 of 30 quotes/);
    await p.goto(SITE + '/copilot/#home'); await p.waitForSelector('#thought [data-quote]');
    await p.click('#thought [data-quote]'); await p.waitForTimeout(300);
    assert.match(await p.textContent('#thought'), /✓ Read/);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForFunction(() => /1 of 30 quotes/.test(document.getElementById('goalsCard')?.textContent || ''), null, { timeout: 10000 });
    await shot(p, 'copilot-daily-thought-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-daily-thought').catch(() => {}); throw e; } finally { await ctx.close(); }
});
test('[library] books: choose a book, tick chapters, finish it; mark an article as read', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  // signed in: Copilot asks whether to let the center know about a finished challenge; answer "No, thanks" whenever it shows
  await p.addInitScript(() => setInterval(() => { const d = document.getElementById('shareDlg'); if (d && d.open) document.getElementById('shNo').click(); }, 150));
  try {
    await newGuest(p);
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-cc="e-book"]', { timeout: 15000 });
    await p.click('[data-cc="e-book"]'); await p.waitForSelector('#startDlg[open] #stBook'); await p.click('#stBook');
    await p.waitForSelector('#bkDlg[open] [data-pick="t-book"]'); await p.click('#bkDlg [data-pick="t-book"]');
    await p.waitForSelector('#startDlg[open] #stGo:not([disabled])'); await p.click('#stGo'); await p.waitForTimeout(500);
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
    await p.$eval('#artRead', (b) => b.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await p.$eval('#artRead', (b) => b.click());   // the fixed tab bar can cover it mid-scroll on slower computers
    await p.waitForFunction(() => /✓ Read/.test(document.getElementById('artEnd')?.textContent || ''), null, { timeout: 10000 });
    await p.goto(SITE + '/copilot/#learn'); await p.waitForSelector('.reading-card');
    assert.match(await p.textContent('.reading-card'), /6\s*chapters/);
    await shot(p, 'copilot-learn-library-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-books').catch(() => {}); throw e; } finally { await ctx.close(); }
});
test('[library] Learn hub: top 5 of each type, search with quotes, Saved, and a quiz', async () => {
  const QZ = JSON.parse((await import('node:fs')).readFileSync(new URL('../../content/quizzes.json', import.meta.url), 'utf8')).quizzes.find((q) => q.id === 'q-center');
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await newGuest(p);
    await p.goto(SITE + '/copilot/#learn'); await p.waitForFunction(() => /Quizzes/.test(document.getElementById('learnBrowse')?.textContent || ''), null, { timeout: 15000 });
    const t = await p.textContent('#learnBrowse');
    for (const h of ['Articles', 'Talks & videos', 'Books', 'Quizzes']) assert.ok(t.includes(h), h + ' section');
    assert.ok((await p.$$('#learnBrowse .k-list')).length >= 4);
    await shot(p, 'copilot-learn-hub-phone');
    // search: grouped results including quotes; narrowing by type
    await p.fill('#learnQ', 'meditation'); await p.waitForSelector('#learnResults .k-chips');
    const r = await p.textContent('#learnResults'); assert.match(r, /Articles/); assert.match(r, /Quotes/);
    await p.click('#learnResults [data-type="article"]'); await p.waitForTimeout(200);
    assert.ok(!(await p.textContent('#learnResults')).includes('Quotes'), 'narrowing hides quotes');
    await p.click('#clearSearch');
    // save an article, then find it under Saved
    await p.goto(SITE + '/copilot/#learn?a=benefits'); await p.waitForSelector('#learnArticle [data-save]');
    await p.click('#learnArticle [data-save]'); await p.goto(SITE + '/copilot/#learn?list=saved'); await p.waitForTimeout(300);
    assert.match(await p.textContent('#learnList'), /Benefits of Meditation/);
    // quiz: answer everything correctly and pass
    await p.goto(SITE + '/copilot/#learn?q=q-center'); await p.waitForSelector('#qStart'); await p.click('#qStart');
    for (let i = 0; i < 10; i++) {
      const qtext = (await p.textContent('.q-q')).trim(), z = QZ.questions.find((x) => x.q === qtext);
      await p.click(`.q-opt:text-is("${z.options[z.answer].replace(/"/g, '\\"')}")`);
      await p.click('#qNext');
    }
    await p.waitForSelector('.q-result.ok'); assert.match(await p.textContent('.q-result'), /10/); assert.match(await p.textContent('.q-result'), /\+30 points/);
    await shot(p, 'copilot-quiz-passed-phone');
    await p.goto(SITE + '/copilot/#learn?list=quiz'); await p.waitForTimeout(300); assert.ok(await p.$('#learnList .mk.done'), 'passed quiz shows ✓');
    assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-learn').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[library] admin: Library tab lists books and opens the form', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  try {
    await p.goto(ADMIN + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('#tEmail', { timeout: 15000 });
    await p.fill('#tEmail', 'owner@example.com'); await p.click('#tBtn'); await p.waitForTimeout(800);
    await p.goto(ADMIN + '/#library'); await p.waitForSelector('.lib-row', { timeout: 15000 });
    assert.match(await p.textContent('#app'), /Learn to Meditate/, 'Learn articles are in the library');
    await p.click('[data-lk="quiz"]'); await p.waitForSelector('[data-lr]');
    await p.click('[data-lr]'); await p.waitForSelector('.q-rev'); assert.ok((await p.$$('.q-rev > li')).length === 10, 'quiz review lists 10 questions');
    await shot(p, 'admin-quiz-review-desktop'); await p.click('[data-close]');
    await p.click('[data-lk="book"]'); await p.waitForSelector('.lib-row');
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

test('[site] calendar: Upcoming (yesterday + 30 days), Recent with Show earlier, Month; home upcoming and recent', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  try {
    await p.goto(SITE + '/calendar/', { waitUntil: 'networkidle' }); await p.waitForSelector('.cal-dayh');
    assert.ok(await p.$('[data-cv="up"].on'), 'Upcoming is selected'); assert.ok(await p.$eval('#calMonth', (e) => e.hidden), 'month grid hidden');
    assert.ok(await p.$eval('.cal-bar', (e) => e.hidden), 'no month arrows in lists');
    const heads = await p.$$eval('.cal-dayh', (l) => l.map((h) => h.textContent));
    assert.ok(heads.includes('Today') || heads.includes('Tomorrow') || heads.length > 0, 'grouped by day: ' + heads.slice(0, 3));
    if (await p.$('#calMoreBtn')) { await p.click('#calMoreBtn'); await p.waitForTimeout(600); assert.match(p.url(), /to=\d{4}-\d{2}-\d{2}/, 'the address keeps how far you loaded'); }
    await p.click('[data-cv="recent"]'); await p.waitForSelector('.cal-dayh');
    assert.match(p.url(), /view=recent/);
    const firstRecent = await p.$eval('.cal-list .ev-card', (a) => a.getAttribute('href'));
    assert.ok(firstRecent, 'recent events listed');
    await p.click('[data-cv="month"]'); await p.waitForTimeout(500); assert.ok(!(await p.$eval('#calMonth', (e) => e.hidden)), 'Month works');
    await p.goto(SITE + '/calendar/', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    assert.ok(await p.$('[data-cv="up"].on'), 'back to Upcoming on the next visit (not remembered)');
    await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    assert.ok((await p.$$('#upcoming a.card')).length <= 4, 'at most 4 upcoming');
    if (!(await p.$eval('#recentSec', (e) => e.hidden))) { assert.ok((await p.$$('#recent a.card')).length <= 2, 'at most 2 recent'); assert.ok(await p.$('#recentSec a[href="/calendar/?view=recent"]')); }
    await shot(p, 'site-home-recent-desktop'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-site-lists').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[copilot] an initiate begins the 10,000-hour journey (target year, recommended daily time)', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await signInCopilot(p, 'initiate@example.com');
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('#jIni'); await p.click('#jIni');
    await p.waitForSelector('#typeDlg[open]'); await p.fill('#tyDate', '2015-06-14'); await p.selectOption('#tyBy', 'Sant Rajinder Singh Ji Maharaj');
    await p.click('#tyForm [type="submit"]'); await p.waitForTimeout(800);
    if (await p.evaluate(() => document.getElementById('firstDlg')?.open)) { await p.click('#firstDlg .cp-opt [data-go]'); await p.waitForTimeout(600); }
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('#jStart', { timeout: 10000 });
    await p.click('#jStart'); await p.click('#s-welcome [data-next]');
    assert.equal(await p.inputValue('#start'), '2015-06-14', 'initiation date carried over');
    await p.click('#s-q2 [data-next]');
    await p.fill('#minutes', '60'); await p.click('#s-q3 [data-next]');
    await p.click('#s-q4 [data-next]');
    await p.fill('#goalYear', String(new Date().getFullYear() + 20)); await p.click('#s-q5 [data-next]');
    await p.waitForSelector('#s-results.active');
    const t = await p.textContent('#s-results'); assert.match(t, /Recommended/); assert.match(t, /Goal Year/); assert.doesNotMatch(t, /Age/);
    await p.click('#tabs [href="#home"], a[href="#home"]').catch(() => {}); await p.goto(SITE + '/copilot/#home'); await p.waitForTimeout(500);
    assert.match(await p.textContent('#journeyCard'), /10,000-hour journey/);
    // Account: no old admin, no events status, no "Your practice"
    await p.click('#accountBtn'); await p.waitForTimeout(300);
    const a = await p.textContent('#accountBody'); assert.doesNotMatch(a, /Open Admin|Events status|Your practice/); assert.match(a, /Contact details/); assert.match(a, /Send a suggestion/);
    await shot(p, 'copilot-journey-account-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-journey').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[admin] visitor log, suggestions and settings tabs', async () => {
  const { p, ctx, errors } = await page(DESKTOP);
  try {
    await p.goto(ADMIN + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('#tEmail', { timeout: 15000 });
    await p.fill('#tEmail', 'owner@example.com'); await p.click('#tBtn'); await p.waitForTimeout(800);
    await p.goto(ADMIN + '/#visitors'); await p.waitForFunction(() => /Visitor log/.test(document.getElementById('app')?.textContent || ''), null, { timeout: 15000 });
    await p.click('[data-vs=""]'); await p.waitForFunction(() => document.querySelectorAll('.vl-note').length > 0, null, { timeout: 15000 });
    await shot(p, 'admin-visitor-log-desktop');
    await p.goto(ADMIN + '/#suggestions'); await p.waitForFunction(() => /Suggestions/.test(document.getElementById('app')?.textContent || ''), null, { timeout: 15000 });
    await p.goto(ADMIN + '/#settings'); await p.waitForSelector('#fvForm', { timeout: 15000 }); assert.ok(await p.$('#posterBtn'));
    await shot(p, 'admin-settings-desktop'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-admin-visitors').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[site] after checking in: a private note for the center, and ☆ favourites', async () => {
  const { p, ctx, errors } = await page(PHONE);
  p.on('dialog', (d) => d.accept());
  try {
    await p.goto(SITE + '/event/?id=seed-23', { waitUntil: 'networkidle' });
    await p.click('#favSign'); await p.waitForSelector('#tEmail'); await p.fill('#tEmail', 'priya@example.com'); await p.click('#tBtn');
    await p.waitForSelector('#noteBody', { timeout: 15000 });
    assert.match(await p.inputValue('#noteBody'), /first visit/, 'her note is there to edit');
    await p.fill('#noteBody', 'Thank you, see you next week. (made-up)'); await p.click('#noteSave');
    await p.waitForFunction(() => /Sent/.test(document.getElementById('noteCard')?.textContent || ''));
    await p.click('#favEv'); await p.waitForFunction(() => /★ Favourite/.test(document.getElementById('favEv')?.textContent || ''));
    await p.goto(SITE + '/calendar/?fav=1', { waitUntil: 'networkidle' }); await p.waitForFunction(() => /Your favourites/.test(document.getElementById('calList')?.textContent || ''));
    assert.match(await p.textContent('#calList'), /Introduction to Meditation/);
    await shot(p, 'site-favourites-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-site-note').catch(() => {}); throw e; } finally { await ctx.close(); }
});

test('[challenges] "Create your own" uses the same kind of sheet (Amrit Vela)', async () => {
  const { p, ctx, errors } = await page(PHONE);
  try {
    await signInCopilot(p, 'own@example.com');
    await p.goto(SITE + '/copilot/#roadmap'); await p.waitForSelector('[data-own="amrit"]');
    await p.click('[data-own="amrit"]'); await p.waitForSelector('#goalDlg[open]');
    assert.match(await p.textContent('#gHead'), /Amrit Vela/); assert.ok(await p.$eval('#gTypes', (e) => e.hidden), 'no type picker');
    await p.fill('#gDays', '14'); await p.click('#gForm [type="submit"]'); await p.waitForTimeout(500);
    assert.match(await p.textContent('#goalsCard'), /Amrit Vela Challenge[\s\S]*In progress|In progress[\s\S]*Amrit/);
    await shot(p, 'copilot-challenges-list-phone'); assert.deepEqual(errors, []);
  } catch (e) { await shot(p, 'FAILED-own').catch(() => {}); throw e; } finally { await ctx.close(); }
});
