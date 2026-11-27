#!/usr/bin/env node
/* Made-up people and events for local development and tests. Never used for test or prod.
 *   node tools/seed.mjs [--persist <dir>]   (applies to the local database of `wrangler dev`)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, wrangler } from './lib.mjs';

export function seedSQL(now = Date.now()) {
  const DAY = 86400000, q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const sql = [];
  const people = [
    ['owner@example.com', 'Arvind Owner', 'initiate'], ['priya@example.com', 'Priya Test', 'seeker'], ['mark@example.com', 'Mark Test', 'seeker'],
    ['lena@example.com', 'Lena Test', 'seeker'], ['omar@example.com', 'Omar Test', 'seeker'], ['sara@example.com', 'Sara Test', 'seeker'],
    ['dev@example.com', 'Dev Test', 'seeker'], ['kim@example.com', 'Kim Test', 'initiate'], ['host@example.com', 'Host Test', 'seeker'],
    ['ravi@example.com', 'Ravi Test', 'seeker'], ['asha@example.com', 'Asha Test', 'friend']];
  const id = (e) => 'dev:' + e;
  for (const [e, n, c] of people) sql.push(`INSERT OR IGNORE INTO users (id, provider, email, name, created_at, last_seen_at, category, contact_ack_at) VALUES (${q(id(e))}, 'dev', ${q(e)}, ${q(n)}, ${now - 120 * DAY}, ${now - DAY}, ${q(c)}, ${now - 100 * DAY});`);
  sql.push(`INSERT OR IGNORE INTO staff (email, role, added_by, added_at) VALUES ('host@example.com', 'host', 'owner@example.com', ${now});`);
  let n = 0;
  const ev = (title, kind, daysAgo, level = 'all', hours = 2) => {
    const eid = 'seed-' + (++n), st = now - daysAgo * DAY;
    sql.push(`INSERT OR IGNORE INTO events (id, center_id, title, format, venue, starts_at, ends_at, timezone, access, status, checkin_code, created_by, created_at, updated_at, kind, level) VALUES (${q(eid)}, 'mpls', ${q(title)}, 'in_person', 'Meditation Center', ${st}, ${st + hours * 3600000}, 'America/Chicago', 'public', 'scheduled', '1234', ${q(id('owner@example.com'))}, ${now}, ${now}, ${q(kind)}, ${q(level)});`);
    return { eid, st };
  };
  const W = [84, 77, 70, 63, 56, 49, 42, 35, 28, 21, 14, 7, 3].map((d) => ev('Meditation Workshop', 'workshop', d, 'seeker'));
  const S = [80, 66, 52, 38, 24, 10, 4].map((d) => ev('Satsang', 'satsang', d));
  const I = [90, 30, 5].map((d) => ev('Introduction to Meditation', 'intro', d, 'new'));
  const D = [ev('Retreat with Darshan', 'darshan', 45)], OLD = ev('Introduction to Meditation', 'intro', 400, 'all');
  const F = [ev('Weekly Meditation Workshop', 'workshop', -3, 'seeker'), ev('Satsang', 'satsang', -6), ev('Introduction to Meditation', 'intro', -10, 'new')];
  const ci = (e, who, g = 0) => sql.push(`INSERT OR IGNORE INTO checkins (event_id, user_id, method, checked_in_at, guests) VALUES (${q(e.eid)}, ${q(id(who))}, 'code', ${e.st + 600000}, ${g});`);
  const rs = (e, who, st = 'going') => sql.push(`INSERT OR REPLACE INTO rsvps (event_id, user_id, status, updated_at, guests) VALUES (${q(e.eid)}, ${q(id(who))}, ${q(st)}, ${e.st - 2 * DAY}, 0);`);
  const vw = (e, who) => sql.push(`INSERT OR IGNORE INTO event_views (event_id, user_id, first_at, last_at, views) VALUES (${q(e.eid)}, ${q(id(who))}, ${e.st - 3 * DAY}, ${e.st - 3 * DAY}, 2);`);
  vw(I[2], 'priya@example.com'); rs(I[2], 'priya@example.com'); ci(I[2], 'priya@example.com', 1);       // first visit 5 days ago
  ci(I[0], 'mark@example.com'); W.slice(4, 11).forEach((w) => ci(w, 'mark@example.com'));                  // 7 workshops → L3
  S.slice(0, 6).forEach((s) => ci(s, 'lena@example.com')); W.slice(0, 6).forEach((w) => ci(w, 'lena@example.com'));   // 6 satsangs → L4
  W.slice(0, 3).forEach((w) => ci(w, 'omar@example.com'));                                                 // drifting
  rs(W[12], 'sara@example.com'); vw(W[12], 'sara@example.com');                                            // said Going, didn't come
  vw(I[2], 'dev@example.com');                                                                             // New
  S.slice(3).forEach((s) => ci(s, 'kim@example.com'));
  ci(OLD, 'ravi@example.com');                                                                             // last came 400 days ago → Dropped
  S.slice(1, 5).forEach((s) => ci(s, 'asha@example.com'));                                                 // Satsangi (flagged by an admin)
  // Mark shared two finished challenges from Copilot → orientation done (5+ workshops, 2 challenges)
  ['c1', 'c2'].forEach((r, i) => sql.push(`INSERT OR IGNORE INTO challenge_shares (user_id, ref, title, finished_on, at) VALUES (${q(id('mark@example.com'))}, ${q(r)}, '21-Day Foundation', NULL, ${now - (20 - i) * DAY});`));
  sql.push(`UPDATE users SET zip = '55421' WHERE id = ${q(id('priya@example.com'))};`);
  rs(F[0], 'priya@example.com'); rs(F[0], 'mark@example.com', 'maybe');
  // Library (v0.20): made-up approved items so Learn and the reading challenges have something to show
  const lib = (id, kind, title, url, extra = '') => sql.push(`INSERT OR IGNORE INTO library (id, kind, title, author, url, summary, chapters, status, priority, created_at, updated_at) VALUES (${q(id)}, ${q(kind)}, ${q(title)}, 'Test Author', ${q(url)}, ${q('Made-up item for testing. ' + extra)}, ${kind === 'book' ? 6 : 0}, 'approved', 10, ${now}, ${now});`);
  lib('t-book', 'book', 'A Test Book on Meditation', 'https://example.com/buy/test-book', 'Six short chapters.');
  lib('t-article', 'article', 'A Test Article', 'https://example.com/test-article');
  lib('t-video1', 'video', 'Test Talk One', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  lib('t-video2', 'video', 'Test Talk Two', 'https://www.youtube.com/watch?v=9bZkp7q19f0');
  // Made-up environment only: one quiz approved with no waiting, so Learn and the quiz can be tried locally
  sql.push(`UPDATE library SET status = 'approved', retry_minutes = 0 WHERE id = 'q-center';`);
  return sql.join('\n') + '\n';
}

export function applySeed(persistDir) {
  const f = path.join(os.tmpdir(), `mn-seed-${process.pid}.sql`);
  fs.writeFileSync(f, seedSQL());
  const extra = persistDir ? ['--persist-to', persistDir] : [];
  wrangler(['d1', 'execute', 'meditation-copilot', '--local', '--file', f, ...extra], { cwd: path.join(ROOT, 'api'), capture: true });
  fs.rmSync(f, { force: true });
}
export function applyMigrations(persistDir) {
  const extra = persistDir ? ['--persist-to', persistDir] : [];
  wrangler(['d1', 'migrations', 'apply', 'meditation-copilot', '--local', ...extra], { cwd: path.join(ROOT, 'api'), capture: true, input: 'y\n' });
}

if (process.argv[1] && process.argv[1].endsWith('seed.mjs')) {
  const i = process.argv.indexOf('--persist');
  const dir = i > 0 ? process.argv[i + 1] : undefined;
  applyMigrations(dir); applySeed(dir);
  console.log('Local database ready with made-up people and events.');
}
