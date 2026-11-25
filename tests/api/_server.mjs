// Starts a throw-away local events server with its own database (made-up data) for API and end-to-end tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, start, stop, waitFor, ensureDevVars } from '../../tools/lib.mjs';
import { applyMigrations, applySeed } from '../../tools/seed.mjs';

export async function startServer(port = 8797, origins = []) {
  ensureDevVars();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-test-db-'));
  applyMigrations(dir); applySeed(dir);
  const child = start(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(port), '--ip', '127.0.0.1',
    '--persist-to', dir, '--inspector-port', String(port + 1000),
    ...(origins.length ? ['--var', 'ALLOWED_ORIGINS:' + ['http://localhost:8001', ...origins].join(',')] : [])], { cwd: path.join(ROOT, 'api'), quiet: true });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base + '/api/health', 90000);
  return { base, stop: () => { stop(child); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* in use */ } } };
}

export function client(base) {
  const call = async (method, p, token, body) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8001', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    return { status: r.status, ...(j || {}) };
  };
  const login = async (email, name) => (await call('POST', '/api/session', null, { provider: 'dev', email, name: name || email.split('@')[0] })).token;
  return { call, login };
}
