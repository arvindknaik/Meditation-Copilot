// [library] Education challenges in Copilot: counting reads, catch-up and the suggested pace
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCopilot } from './_copilot.mjs';

function setup() {
  const MC = loadCopilot(['config.js', 'core.js', 'library.js']);
  MC.toast = () => {}; MC.track = () => {};
  return MC;
}
const ago = (MC, n) => MC.toISO(MC.addDays(MC.today(), -n));
const at = (MC, n) => MC.addDays(MC.today(), -n).getTime() + 12 * 3600000;

test('[library] a thought read later still counts for its own day (catch-up), not for days outside the challenge', () => {
  const MC = setup(), L = MC.library, reads = MC.collection('reads');
  const run = { material: 'quote', cadence: 'day', perPeriod: 1, target: 30, startOn: ago(MC, 5), endOn: MC.toISO(MC.addDays(MC.today(), 24)) };
  reads.add({ id: 'quote:' + ago(MC, 5), kind: 'quote', ref: ago(MC, 5), at: Date.now() });   // day 1, read today (catch-up)
  reads.add({ id: 'quote:' + ago(MC, 1), kind: 'quote', ref: ago(MC, 1), at: at(MC, 1) });
  reads.add({ id: 'quote:' + ago(MC, 9), kind: 'quote', ref: ago(MC, 9), at: at(MC, 9) });   // before the challenge
  assert.equal(L.countFor(run), 2);
  assert.equal(L.expectedBy(run, 30), 5, 'five whole days have passed');
  assert.equal(L.missedQuoteDays(run).length, 4, 'days 2–4 and today are still unread');
});

test('[library] weekly pace only counts weeks that are over; chapters count for the chosen book only', () => {
  const MC = setup(), L = MC.library, reads = MC.collection('reads');
  const wk = { material: 'video', cadence: 'week', perPeriod: 3, target: 12, startOn: ago(MC, 9), endOn: MC.toISO(MC.addDays(MC.today(), 18)) };
  assert.equal(L.expectedBy(wk, 12), 3);
  assert.equal(L.expectedBy({ ...wk, startOn: MC.toISO(MC.today()) }, 12), 0, 'nothing is behind on the first day');
  const bk = { material: 'book', bookId: 'b1', startOn: ago(MC, 3), endOn: MC.toISO(MC.addDays(MC.today(), 60)) };
  reads.add({ id: 'chapter:b1#1', kind: 'chapter', ref: 'b1#1', bookId: 'b1', at: at(MC, 2) });
  reads.add({ id: 'chapter:b2#1', kind: 'chapter', ref: 'b2#1', bookId: 'b2', at: at(MC, 2) });
  assert.equal(L.countFor(bk), 1);
});

test('[library] each item is counted once and earns its points', () => {
  const MC = setup(), L = MC.library;
  assert.ok(L.mark('article', 'learn-to-meditate'));
  assert.equal(L.mark('article', 'learn-to-meditate'), null, 'marking twice does nothing');
  assert.equal(L.all('article')[0].pts, 10);
  L.mark('video', 'v1'); assert.equal(L.all('video')[0].pts, 10);
});
