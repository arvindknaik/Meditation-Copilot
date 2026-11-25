// [release] the site build for each environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, run } from '../../tools/lib.mjs';

for (const env of ['local', 'test', 'prod']) {
  test(`[release] ${env} build: pages, settings and version`, () => {
    run(process.execPath, ['tools/build.mjs', env], { capture: true });
    const S = (p) => fs.readFileSync(path.join(ROOT, 'dist/site', p), 'utf8');
    const conf = JSON.parse(fs.readFileSync(path.join(ROOT, `deploy/env/${env}.json`), 'utf8'));
    for (const p of ['index.html', 'calendar/index.html', 'event/index.html', 'news/index.html', 'about/index.html', 'whats-new/index.html', 'copilot/index.html', '404.html', '_redirects'])
      assert.ok(fs.existsSync(path.join(ROOT, 'dist/site', p)), p + ' exists');
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/admin/index.html')));
    for (const p of ['index.html', 'news/index.html', 'about/index.html']) assert.ok(!/\{\{[\w.]+\}\}/.test(S(p)), 'no leftover {{tokens}} in ' + p);
    assert.match(S('copilot/js/config.js'), new RegExp(`apiBase: '${conf.apiBase.replace(/[/.]/g, '\\$&')}'`));
    assert.match(fs.readFileSync(path.join(ROOT, 'dist/admin/js/auth.js'), 'utf8'), new RegExp(conf.apiBase.replace(/[/.]/g, '\\$&')));
    const info = JSON.parse(S('build-info.json'));
    assert.equal(info.env, env);
    if (env !== 'prod') { assert.match(S('robots.txt'), /Disallow: \//); assert.match(S('copilot/js/config.js'), /analyticsEndpoint: ''/); }
    const rules = S('_redirects').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]);
    assert.equal(new Set(rules).size, rules.length, 'no duplicate redirect rules (Cloudflare rejects them)');
  });
}
