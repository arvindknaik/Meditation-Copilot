#!/usr/bin/env node
/* One script from check-in to production.  (Windows: release.bat · Mac: release.command · or `npm run release -- <step>`)
 *
 *   release build  [-m "message"]   commit your changes, run all tests, number the build, save the test report, push to GitHub
 *   release test   [--yes]          (Arvind) apply database changes to TEST and deploy the current build there, then smoke-test it
 *   release prod   [--yes]          (Arvind) approve release notes, back up the real database, apply its changes, deploy everything,
 *                                    tag the GitHub release, publish "What's new", start the next version
 *   release setup-test              (Arvind, once) create the test database and server settings for test.sosmn.org
 *   release status                  what is built, what is on test, what is live
 *   release rollback test|prod      put the previous version of the server and sites back
 *
 * Builds accumulate until released. Production only accepts the build that passed tests and is on test.
 * Database rule: only ADD tables/columns in a release; remove old ones in a later release, so a rollback stays safe. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT, run, git, wrangler, readJSON, writeJSON, ask } from './lib.mjs';
import { seedSQL } from './seed.mjs';

const [step, ...rest] = process.argv.slice(2);
const YES = rest.includes('--yes') || process.env.CI === 'true';
const msgArg = rest.includes('-m') ? rest[rest.indexOf('-m') + 1] : null;
const DEP = 'reports/deployments.json';
const deployments = () => (fs.existsSync(path.join(ROOT, DEP)) ? readJSON(DEP) : {});
const label = (v) => `v${v.version.replace(/\.0$/, '')}-b${v.build}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });   // YYYY-MM-DD
const say = (s) => console.log('\n▶ ' + s);
const fail = (s) => { console.error('\n✖ ' + s); process.exit(1); };
async function confirm(q) { if (YES) return true; const a = await ask(`${q} Type yes to continue: `); return /^y(es)?$/i.test(a); }
const clean = () => git('status', '--porcelain') === '';
const branch = () => git('rev-parse', '--abbrev-ref', 'HEAD');

async function build() {
  if (branch() !== 'main') fail('Builds are made from main. Merge your pull request first (contributors: open a pull request; Arvind builds).');
  if (!clean()) {
    const m = msgArg || (YES ? 'Changes' : await ask('Describe these changes in one line (mention issues like "Fixes #12"): '));
    if (!m) fail('A description is needed.');
    say('Committing your changes'); run('git', ['add', '-A']); run('git', ['commit', '-q', '-m', m]);
  }
  say('Running all tests');
  const ok = run(process.execPath, ['tools/test.mjs'], { allowFail: true }) === 0;
  if (!ok) fail('Tests failed — nothing was numbered or pushed. See reports/latest.md, fix, and run `release build` again.');
  const v = readJSON('version.json'); v.build += 1; v.date = today(); writeJSON('version.json', v);
  const summary = readJSON('reports/artifacts/summary.json');
  const rep = fs.readFileSync(path.join(ROOT, 'reports/latest.md'), 'utf8').replace(/^# Test report — v[\w.-]+/, `# Test report — ${label(v)}`);
  fs.writeFileSync(path.join(ROOT, 'reports/latest.md'), rep);
  const log = path.join(ROOT, 'reports/BUILDS.md');
  if (!fs.existsSync(log)) fs.writeFileSync(log, '# Builds\n\nNewest first. Each build passed all tests before it was numbered.\n\n| Build | Date | Commit | Tests | Changes |\n|---|---|---|---|---|\n');
  const subj = git('log', '-1', '--pretty=%s').replace(/\|/g, '/');
  const lines = fs.readFileSync(log, 'utf8').split('\n'); const at = lines.findIndex((l) => l.startsWith('|---')) + 1;
  lines.splice(at, 0, `| ${label(v)} | ${v.date} | ${git('rev-parse', '--short', 'HEAD')} | ${summary.passed}/${summary.total} | ${subj} |`);
  fs.writeFileSync(log, lines.join('\n'));
  run('git', ['add', 'version.json', 'reports/latest.md', 'reports/BUILDS.md']); run('git', ['commit', '-q', '-m', `Build ${label(v)}`]);
  say('Pushing to GitHub'); run('git', ['push', 'origin', 'main']);
  console.log(`\n✔ Build ${label(v)} is ready. Next: release test`);
}

function deployAll(envName, v) {
  const e = envName === 'test' ? ['--env', 'test'] : [];
  const db = envName === 'test' ? 'meditation-copilot-test' : 'meditation-copilot';
  say(`Building the sites for ${envName.toUpperCase()}`); run(process.execPath, ['tools/build.mjs', envName]);
  say('Applying database changes'); wrangler(['d1', 'migrations', 'apply', db, '--remote', ...e], { cwd: path.join(ROOT, 'api'), input: 'y\n' });
  say('Deploying the events server'); wrangler(['deploy', ...e, '--var', `APP_VERSION:${label(v)}`], { cwd: path.join(ROOT, 'api') });
  say('Deploying sosmn.org'); wrangler(['deploy', ...e], { cwd: path.join(ROOT, 'deploy/site') });
  say('Deploying the admin site'); wrangler(['deploy', ...e], { cwd: path.join(ROOT, 'deploy/admin') });
}
async function smoke(envName, v) {
  const conf = readJSON(`deploy/env/${envName}.json`);
  say('Checking the deployed sites');
  const checks = [[conf.apiBase + '/api/health', (j) => j.ok], [conf.siteUrl + '/build-info.json', (j) => j.buildId === `${v.version}-b${v.build}`]];
  for (const [u, ok] of checks) {
    let good = false;
    for (let i = 0; i < 10 && !good; i++) { try { const r = await fetch(u, { cache: 'no-store' }); good = r.ok && ok(await r.json()); } catch { /* retry */ } if (!good) await new Promise((r) => setTimeout(r, 3000)); }
    console.log(`  ${good ? '✔' : '✖'} ${u}`);
    if (!good) fail(`${u} did not answer as expected. Check the Cloudflare dashboard; \`release rollback ${envName}\` restores the previous version.`);
  }
  for (const p of ['/', '/news/', '/copilot/', '/whats-new/']) { const r = await fetch(conf.siteUrl + p).catch(() => null); console.log(`  ${r && r.ok ? '✔' : '✖'} ${conf.siteUrl + p}`); }
}

async function toTest() {
  if (!clean()) fail('You have uncommitted changes. Run `release build` first.');
  const v = readJSON('version.json');
  if (v.build < 1) fail('No build yet. Run `release build` first.');
  if (fs.readFileSync(path.join(ROOT, 'api', 'wrangler.toml'), 'utf8').includes('REPLACE-WITH-TEST-DATABASE-ID')) fail('The test environment is not set up yet. Choose 6 (First-time set-up of test.sosmn.org) first, then 2 again.');
  if (!(await confirm(`Deploy ${label(v)} to TEST (test.sosmn.org)?`))) fail('Stopped.');
  deployAll('test', v); await smoke('test', v);
  const d = deployments(); d.test = { build: label(v), commit: git('rev-parse', '--short', 'HEAD'), at: new Date().toISOString() }; writeJSON(DEP, d);
  run('git', ['add', DEP]); run('git', ['commit', '-q', '-m', `Deployed ${label(v)} to test`]); run('git', ['push', 'origin', 'main']);
  console.log(`\n✔ ${label(v)} is on https://test.sosmn.org — check it on your phone (acceptance checklists: tests/acceptance/). Next: release prod`);
}

function draftNotes(v) {
  let since = ''; try { since = git('describe', '--tags', '--abbrev=0', '--match', 'v*'); } catch { /* first release */ }
  const subjects = git('log', '--pretty=%s', since ? `${since}..HEAD` : 'HEAD').split('\n').filter((s) => s && !/^(Build|Deployed|Release|Start) v/.test(s));
  const short = v.version.replace(/\.0$/, '');
  return `# Release notes for v${short}
# Edit this file, save it, then come back and press Enter.
# Highlights: up to 3 short lines. Only these appear in the apps' "What's new".
# New / Improved / Fixed: the detailed notes, for the admin site and GitHub. Start a line with "admin:" for admin-only changes.
# Lines starting with # are ignored.
# Changes since ${since || 'the beginning'}:
${subjects.map((s) => '#   ' + s).join('\n')}

summary: 

## Highlights

## New

## Improved

## Fixed
`;
}
function parseNotes(txt, v) {
  const rel = { version: v.version, date: today(), summary: '', highlights: [], items: [] }; let type = null;
  for (const raw of txt.split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('# ')) continue;
    if (/^summary:/i.test(l)) { rel.summary = l.replace(/^summary:\s*/i, ''); continue; }
    // Headings: "## New", "New", "**New**" or "New:" (Notepad's Markdown view can drop the ## when it saves)
    const h = l.replace(/^#+\s*/, '').replace(/[*_:]/g, '').trim().match(/^(Highlights|New|Improved|Fixed)$/i); if (h) { type = h[1].toLowerCase(); continue; }
    if (!type || l.startsWith('#')) continue;
    const t = l.replace(/^([-*•]|\d+[.)])\s*/, ''); const admin = /^admin:/i.test(t);
    if (type === 'highlights') { if (rel.highlights.length < 3) rel.highlights.push(t); continue; }
    rel.items.push({ type, text: t.replace(/^admin:\s*/i, ''), audience: admin ? 'admin' : 'all' });
  }
  return rel;
}

async function toProd() {
  // Release notes being written (releases/v*.md) are allowed; anything else must be built and tested first
  const pending = git('status', '--porcelain').split('\n').filter((l) => l.trim() && !/\sreleases\/v[\d.]+\.md$/.test(l));
  if (pending.length) fail('You have uncommitted changes. Run `release build` first.');
  const v = readJSON('version.json'), d = deployments();
  if (!d.test || d.test.build !== label(v)) fail(`${label(v)} has not been deployed to test yet. Run \`release test\` and check it first.`);
  const short = v.version.replace(/\.0$/, ''), notesFile = path.join(ROOT, 'releases', `v${short}.md`);
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  if (!fs.existsSync(notesFile)) fs.writeFileSync(notesFile, draftNotes(v));
  if (!YES) {
    say(`Release notes: ${path.relative(ROOT, notesFile)} — opening it for you to edit`);
    // Open the editor in its own window and carry on (don't wait for it to close)
    try { spawn(process.platform === 'win32' ? 'notepad.exe' : 'open', process.platform === 'win32' ? [notesFile] : ['-t', notesFile], { detached: true, stdio: 'ignore' }).unref(); }
    catch { console.log('  Open ' + notesFile + ' in any text editor.'); }
    await ask('Press Enter when the notes are saved… ');
  }
  const rel = parseNotes(fs.readFileSync(notesFile, 'utf8'), v);
  if (!rel.items.length) fail('The release notes have no items. Add at least one line under New, Improved or Fixed.');
  console.log(`\nv${short} — ${rel.summary}\n` + rel.items.map((i) => `  ${i.type.padEnd(8)} ${i.audience === 'admin' ? '[admin] ' : ''}${i.text}`).join('\n'));
  if (!(await confirm(`\nRelease v${short} (${label(v)}) to PRODUCTION (sosmn.org, admin.sosmn.org)?`))) fail('Stopped. Nothing changed.');
  // Publish notes in the build, then deploy
  const R = fs.existsSync(path.join(ROOT, 'releases.json')) ? readJSON('releases.json') : { releases: [] };
  R.releases = [rel, ...R.releases.filter((r) => r.version !== rel.version)]; writeJSON('releases.json', R);
  v.date = today(); writeJSON('version.json', v);
  say('Backing up the real database (kept on this computer in backups/, never committed)');
  fs.mkdirSync(path.join(ROOT, 'backups'), { recursive: true });
  wrangler(['d1', 'export', 'meditation-copilot', '--remote', '--output', path.join(ROOT, 'backups', `prod-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`)], { cwd: path.join(ROOT, 'api') });
  deployAll('prod', v); await smoke('prod', v);
  d.prod = { build: label(v), version: `v${short}`, commit: git('rev-parse', '--short', 'HEAD'), at: new Date().toISOString() }; writeJSON(DEP, d);
  run('git', ['add', '-A']); run('git', ['commit', '-q', '-m', `Release v${short}`]);
  run('git', ['tag', '-a', `v${short}`, '-m', `v${short}: ${rel.summary}`]);
  // Next version starts here
  const [maj, min] = v.version.split('.').map(Number); writeJSON('version.json', { version: `${maj}.${min + 1}.0`, build: 0, date: today() });
  run('git', ['add', 'version.json']); run('git', ['commit', '-q', '-m', `Start v${maj}.${min + 1}`]);
  run('git', ['push', 'origin', 'main', '--follow-tags']);
  const body = (rel.highlights.length ? '**Highlights**\n' + rel.highlights.map((x) => '- ' + x).join('\n') + '\n\n' : '') + rel.items.map((i) => `- **${i.type}**${i.audience === 'admin' ? ' (admin)' : ''}: ${i.text}`).join('\n') + `\n\nTests: see reports/latest.md at ${d.prod.commit}.`;
  if (run('gh', ['--version'], { capture: true, allowFail: true })) {
    run('gh', ['release', 'create', `v${short}`, '--title', `v${short} · ${rel.date}`, '--notes', body], { allowFail: true });
  } else console.log(`\n(GitHub release: install the GitHub CLI "gh" to create it automatically, or add it on github.com → Releases → Draft from tag v${short}.)`);
  console.log(`\n✔ v${short} is live on https://sosmn.org. "What's new" is updated. The next version is v${maj}.${min + 1}.`);
}

async function setupTest() {
  const api = path.join(ROOT, 'api'), tomlPath = path.join(api, 'wrangler.toml');
  say('Checking your Cloudflare sign-in');
  const who = (() => { try { return run(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'whoami'], { capture: true, allowFail: true }) || ''; } catch { return ''; } })();
  if (!/associated with the email|You are logged in/i.test(who)) { say('Opening the browser to sign in to Cloudflare'); wrangler(['login']); }
  let toml = fs.readFileSync(tomlPath, 'utf8');
  if (toml.includes('REPLACE-WITH-TEST-DATABASE-ID')) {
    say('Creating the test database (meditation-copilot-test)');
    let id = '';
    const out = run(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'create', 'meditation-copilot-test'], { cwd: api, capture: true, allowFail: true });
    id = (out.match(/database_id"?\s*[=:]\s*"?([0-9a-f-]{36})/i) || [])[1] || '';
    if (!id) {   // already exists: look it up
      const list = run(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'list', '--json'], { cwd: api, capture: true, allowFail: true });
      try { id = (JSON.parse(list).find((d) => d.name === 'meditation-copilot-test') || {}).uuid || ''; } catch { /* not JSON */ }
    }
    if (!id) fail('Could not create or find the test database. Run `npx wrangler d1 create meditation-copilot-test` in the api folder and paste its database_id into api/wrangler.toml.');
    toml = toml.replace('REPLACE-WITH-TEST-DATABASE-ID', id); fs.writeFileSync(tomlPath, toml);
    console.log('  ✔ test database ' + id);
  } else console.log('  ✔ test database already set in api/wrangler.toml');
  say('Creating the test tables');
  wrangler(['d1', 'migrations', 'apply', 'meditation-copilot-test', '--remote', '--env', 'test'], { cwd: api, input: 'y\n' });
  say('Saving the test server secrets in Cloudflare (never in files)');
  wrangler(['secret', 'put', 'SESSION_SECRET', '--env', 'test'], { cwd: api, input: crypto.randomBytes(32).toString('hex') });
  const admins = (YES ? '' : await ask('Admin emails for TEST, comma-separated [arvind.k.naik@gmail.com]: ')) || 'arvind.k.naik@gmail.com';
  wrangler(['secret', 'put', 'ADMIN_EMAILS', '--env', 'test'], { cwd: api, input: admins });
  if (YES || /^y/i.test(await ask('Add made-up people and events to TEST so the admin pages have something to show? [y/N]: '))) {
    const f = path.join(ROOT, 'reports', 'test-seed.sql'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, seedSQL());
    wrangler(['d1', 'execute', 'meditation-copilot-test', '--remote', '--env', 'test', '--file', f, '-y'], { cwd: api }); fs.rmSync(f);
  }
  if (!clean()) { run('git', ['add', 'api/wrangler.toml']); run('git', ['commit', '-q', '-m', 'Test environment: test database id']); }
  console.log(`
✔ Test server settings are ready. Three things only you can do in a browser (one time):
  1. Google Cloud → APIs & Services → Credentials → your OAuth client → Authorized JavaScript origins:
       add https://test.sosmn.org and https://test-admin.sosmn.org
  2. Microsoft Entra → App registrations → your app → Authentication → Redirect URIs (Single-page application):
       add https://test.sosmn.org/  https://test.sosmn.org/copilot/  https://test-admin.sosmn.org/
  3. Cloudflare Zero Trust → Access → Applications → Admins → add the hostname test-admin.sosmn.org
Then: release build → release test.`);
}

function status() {
  const v = readJSON('version.json'), d = deployments();
  console.log(`Current build:   ${label(v)}${v.build ? '' : ' (no build yet)'}\nOn test:         ${d.test ? `${d.test.build} (${d.test.at.slice(0, 16).replace('T', ' ')})` : '—'}\nLive (prod):     ${d.prod ? `${d.prod.version} = ${d.prod.build} (${d.prod.at.slice(0, 16).replace('T', ' ')})` : '— (v0.16 baseline, before this process)'}\nUncommitted:     ${clean() ? 'none' : 'yes — run release build'}`);
}
async function rollback(envName) {
  if (!['test', 'prod'].includes(envName)) fail('Use: release rollback test   or   release rollback prod');
  if (!(await confirm(`Put the PREVIOUS version of the server and both sites back on ${envName.toUpperCase()}? (The database is not changed.)`))) fail('Stopped.');
  const e = envName === 'test' ? ['--env', 'test'] : [];
  for (const dir of ['api', 'deploy/site', 'deploy/admin']) wrangler(['rollback', ...e, '--message', 'release rollback', '-y'], { cwd: path.join(ROOT, dir) });
  console.log(`\n✔ Rolled back on ${envName}. Database changes stay (they only add things). To restore data, use a file in backups/ or Cloudflare D1 Time Travel.`);
}

const steps = { 'setup-test': setupTest, build, test: toTest, prod: toProd, status, rollback: () => rollback(rest[0]) };
if (!steps[step]) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\s?/, '').replace(/^ \* ?/gm, '')); process.exit(step ? 1 : 0); }
await steps[step]();
