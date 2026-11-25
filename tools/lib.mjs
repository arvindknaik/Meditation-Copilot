// Shared helpers for the dev, test and release tools (Node 20+, Windows and Mac).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const IS_WIN = process.platform === 'win32';
export const bin = (name) => path.join(ROOT, 'node_modules', '.bin', IS_WIN ? name + '.cmd' : name);
export const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
export const writeJSON = (p, v) => fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows: run programs directly (no shell), so paths with spaces such as "C:\\Program Files\\nodejs" work.
// Only .cmd/.bat files need cmd.exe; for those we quote every part ourselves.
const WRANGLER_JS = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
function prep(cmd, args) {
  if (!IS_WIN || !/\.(cmd|bat)$/i.test(cmd) && !['npm', 'npx'].includes(cmd)) return [cmd, args, false];
  const q = (a) => (/^[\w.:\\/=-]+$/.test(a) ? a : '"' + String(a).replace(/"/g, '""') + '"');
  return [[cmd, ...args].map(q).join(' '), [], true];
}

// Run a command and stream its output; throws on failure.
export function run(cmd, args, opts = {}) {
  const [c, a, shell] = prep(cmd, args);
  const out = opts.capture ? 'pipe' : 'inherit';
  const r = spawnSync(c, a, { cwd: opts.cwd || ROOT, stdio: [opts.input != null ? 'pipe' : 'inherit', out, out], shell, windowsHide: true, env: { ...process.env, ...(opts.env || {}) }, input: opts.input });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`Failed: ${cmd} ${args.join(' ')}${opts.capture ? '\n' + (r.stderr || '') : ''}`);
  return opts.capture ? String(r.stdout || '').trim() : r.status;
}
export const git = (...a) => run('git', a, { capture: true });
export const wrangler = (args, opts = {}) => run(process.execPath, [WRANGLER_JS, ...args], opts);

// Start a long-running process (servers). Returns the child; kill with stop().
export function start(cmd, args, opts = {}) {
  const [c, a, shell] = prep(cmd, args);
  const child = spawn(c, a, { cwd: opts.cwd || ROOT, shell, windowsHide: true, env: { ...process.env, ...(opts.env || {}) }, stdio: opts.quiet ? 'ignore' : 'inherit', detached: !IS_WIN });
  return child;
}
export function stop(child) {
  if (!child || child.killed) return;
  try { if (IS_WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
}
export async function waitFor(url, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Timed out waiting for ' + url);
}

// Tiny static server for built sites (dist/site, dist/admin): folder index.html, 404 page or single-page fallback.
export function serveStatic(dir, port, { spa = false } = {}) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(dir, p);
    if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      f = path.join(f, 'index.html');
    }
    if (!fs.existsSync(f)) {
      if (spa) f = path.join(dir, 'index.html');
      else { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return res.end(fs.existsSync(path.join(dir, '404.html')) ? fs.readFileSync(path.join(dir, '404.html')) : 'Not found'); }
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}

export function ask(q) {
  process.stdout.write(q);
  return new Promise((r) => { process.stdin.resume(); process.stdin.once('data', (d) => { process.stdin.pause(); r(String(d).trim()); }); });
}
export function ensureDevVars() {
  const p = path.join(ROOT, 'api', '.dev.vars');
  if (!fs.existsSync(p)) fs.copyFileSync(path.join(ROOT, 'api', '.dev.vars.example'), p);
}
