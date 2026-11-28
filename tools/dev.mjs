#!/usr/bin/env node
/* Run everything locally: events server (8787), sosmn.org + Copilot (8000), admin site (8001).
 * Rebuilds the sites when files in apps/ or content/ change (refresh the browser to see changes).
 * Sign in with "Local test sign-in" (any email). The owner/admin test account is owner@example.com. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, start, stop, run, waitFor, serveStatic, ensureDevVars } from './lib.mjs';
import { applyMigrations } from './seed.mjs';

ensureDevVars();
// Tests and releases rebuild dist/ too: they check this file and ask you to stop the dev server first
const LOCK = path.join(ROOT, '.dev-running');
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { fs.rmSync(LOCK, { force: true }); } catch { /* ignore */ } });
applyMigrations();
const build = () => { try { run(process.execPath, ['tools/build.mjs', 'local'], { capture: true }); console.log(`[${new Date().toLocaleTimeString()}] rebuilt`); } catch (e) { console.error(e.message); } };
build();
const api = start(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', '8787', '--ip', '127.0.0.1', '--inspector-port', '9329'], { cwd: path.join(ROOT, 'api'), quiet: true });
const site = await serveStatic(path.join(ROOT, 'dist/site'), 8000);
const admin = await serveStatic(path.join(ROOT, 'dist/admin'), 8001, { spa: true });
await waitFor('http://127.0.0.1:8787/api/health');
console.log('\nRunning locally (Ctrl+C to stop):\n  sosmn.org + Copilot  http://localhost:8000   (Copilot: /copilot/)\n  Admin                http://localhost:8001   (Local test sign-in: owner@example.com)\n  Events server        http://localhost:8787\n');
let timer;
for (const dir of ['apps', 'content', 'centers']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(build, 300); });
}
const quit = () => { try { fs.rmSync(LOCK, { force: true }); } catch { /* ignore */ } stop(api); site.close(); admin.close(); process.exit(0); };
process.on('SIGINT', quit); process.on('SIGTERM', quit);
