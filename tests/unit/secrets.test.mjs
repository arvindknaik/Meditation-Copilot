// [release] nothing secret may be committed (the repository is public)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, git } from '../../tools/lib.mjs';

const PATTERNS = [
  [/GOCSPX-[\w-]{10,}/, 'Google OAuth client secret'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API secret key'],
  [/(?:client_secret|CLOUDFLARE_API_TOKEN|SESSION_SECRET)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/, 'secret value'],
];
const SKIP = /(^|\/)(node_modules|dist|reports\/artifacts|backups)\/|\.(png|jpe?g|gif|webp|pdf|ico|zip)$/i;

test('[release] no passwords, keys or secrets in tracked or new files', () => {
  let files = [];
  try { files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean); } catch { return; }
  const found = [];
  for (const f of files) {
    if (SKIP.test(f) || f === 'api/.dev.vars.example' || f.startsWith('tests/unit/secrets.test')) continue;
    const p = path.join(ROOT, f); if (!fs.existsSync(p) || fs.statSync(p).size > 2e6) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const [re, what] of PATTERNS) if (re.test(s)) found.push(`${f}: ${what}`);
  }
  assert.deepEqual(found, [], 'Remove these before committing:\n' + found.join('\n'));
});
