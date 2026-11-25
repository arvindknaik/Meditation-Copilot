#!/usr/bin/env node
/* Runs the test suites and writes a short report.
 *   node tools/test.mjs            all suites (unit, api, e2e)
 *   node tools/test.mjs unit api   some suites
 * Report: reports/latest.md (+ reports/artifacts/ screenshots, not committed). Exit code 1 if anything failed. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run, readJSON, git } from './lib.mjs';

const ALL = ['unit', 'api', 'e2e'];
const suites = process.argv.slice(2).filter((a) => ALL.includes(a));
const pick = suites.length ? suites : ALL;
const OUT = path.join(ROOT, 'reports'); fs.mkdirSync(path.join(OUT, 'artifacts'), { recursive: true });

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const results = [];
for (const s of pick) {
  const xml = path.join(OUT, 'artifacts', `${s}.junit.xml`);
  const t0 = Date.now();
  run(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=junit', `--test-reporter-destination=${xml}`, `tests/${s}/*.test.mjs`], { allowFail: true });
  const x = fs.existsSync(xml) ? fs.readFileSync(xml, 'utf8') : '';
  const cases = [...x.matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => {
    const body = m[3] || '';
    const fail = /<failure/.test(body), skip = /<skipped/.test(body);
    const msg = fail ? unesc((body.match(/<failure[^>]*message="([^"]*)"/) || [])[1] || (body.match(/<failure[^>]*>([\s\S]*?)<\/failure>/) || [])[1] || 'failed').split('\n').slice(0, 6).join('\n') : '';
    return { suite: s, name: unesc(m[1]), status: fail ? 'fail' : skip ? 'skip' : 'pass', msg };
  }).filter((c) => /^\[|^/.test(c.name));
  if (!cases.length) cases.push({ suite: s, name: `${s} suite did not run`, status: 'fail', msg: 'No results: see the output above.' });
  results.push({ suite: s, cases, ms: Date.now() - t0 });
}

const ver = readJSON('version.json');
let commit = ''; try { commit = git('rev-parse', '--short', 'HEAD'); } catch { /* none */ }
const all = results.flatMap((r) => r.cases), failed = all.filter((c) => c.status === 'fail');
const features = {};
for (const c of all) { const f = (c.name.match(/^\[([\w-]+)\]/) || [])[1] || 'other'; (features[f] = features[f] || { pass: 0, fail: 0 })[c.status === 'fail' ? 'fail' : 'pass']++; }
const label = `v${ver.version.replace(/\.0$/, '')}-b${ver.build}`;
const md = [
  `# Test report — ${label}${failed.length ? ' — ❌ FAILED' : ' — ✅ passed'}`,
  '', `${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · commit ${commit || 'n/a'} · suites: ${pick.join(', ')}`, '',
  '| Suite | Passed | Failed | Time |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.suite} | ${r.cases.filter((c) => c.status === 'pass').length} | ${r.cases.filter((c) => c.status === 'fail').length} | ${(r.ms / 1000).toFixed(0)} s |`),
  '', '| Feature | Passed | Failed |', '|---|---|---|',
  ...Object.keys(features).sort().map((f) => `| ${f} | ${features[f].pass} | ${features[f].fail} |`),
  '', failed.length ? '## Failures' : '', ...failed.map((c) => `- **${c.name}** (${c.suite})\n\n  \`\`\`\n  ${c.msg.replace(/\n/g, '\n  ')}\n  \`\`\``),
  '', '<details><summary>All tests</summary>', '', ...all.map((c) => `- ${c.status === 'pass' ? '✅' : c.status === 'skip' ? '⏭' : '❌'} ${c.name} (${c.suite})`), '', '</details>',
  '', `Screenshots: reports/artifacts/ (${fs.readdirSync(path.join(OUT, 'artifacts')).filter((f) => f.endsWith('.png')).length} files, kept on this computer).`, ''
].join('\n');
fs.writeFileSync(path.join(OUT, 'latest.md'), md);
fs.writeFileSync(path.join(OUT, 'artifacts', 'summary.json'), JSON.stringify({ label, commit, passed: all.length - failed.length, failed: failed.length, total: all.length, suites: pick, at: new Date().toISOString() }));
console.log(`\n${failed.length ? '❌' : '✅'} ${all.length - failed.length} of ${all.length} tests passed · report: reports/latest.md`);
process.exit(failed.length ? 1 : 0);
