// Loads Meditation Copilot's browser code into a sandbox so its logic can be unit-tested without a browser.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/lib.mjs';

export function loadCopilot(files = ['config.js', 'core.js', 'challenge.js']) {
  const store = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} });
  const ctx = {
    console, Date, Math, JSON, Intl, setTimeout, clearTimeout,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: { userAgent: 'node' }, location: { hostname: 'localhost', pathname: '/copilot/', search: '', hash: '' },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: el(), createElement: el, body: el() },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} })
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps/copilot/js', f), 'utf8'), ctx, { filename: f });
  return ctx.MC;
}
