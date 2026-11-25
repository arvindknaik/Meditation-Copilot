#!/usr/bin/env node
/* One-time set-up after cloning: `npm install` then `npm run setup`.
 * Creates api/.dev.vars (local-only settings), prepares the local database with made-up data, and checks for a browser for tests. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ensureDevVars } from './lib.mjs';
import { applyMigrations, applySeed } from './seed.mjs';
import { chromium } from 'playwright';

ensureDevVars();
console.log('✓ api/.dev.vars (local settings; never committed)');
applyMigrations(); applySeed();
console.log('✓ Local database with made-up people and events');
try {
  const b = await chromium.launch({ channel: 'chrome' }); await b.close();
  console.log('✓ Google Chrome found for browser tests');
} catch {
  try { const b = await chromium.launch(); await b.close(); console.log('✓ Test browser found'); }
  catch { console.log('! No browser for end-to-end tests. Install Google Chrome, or run: npx playwright install chromium'); }
}
console.log('\nNext: npm run dev   → http://localhost:8000 (site + /copilot/), http://localhost:8001 (admin), http://localhost:8787 (server)');
