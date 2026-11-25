// [challenges] 21-day meditation path (Challenge Program step 1) — Copilot engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCopilot } from './_copilot.mjs';

function setup(run, minutesPerDay) {
  const MC = loadCopilot();
  MC.profile = { userType: 'seeker', challenges: [run] };
  MC.saveProfile = () => {}; MC.emit = () => {};
  MC.byDay = () => minutesPerDay(MC);
  return MC;
}
const daysAgo = (MC, n) => MC.toISO(MC.addDays(MC.today(), -n));

test('[challenges] Foundation: day 1 target is the chosen minutes', () => {
  const MC = setup({ startedOn: null, plan: 1, title: '21-Day Foundation', days: 21, base: 10, rampTo: 0, points: 100 }, () => ({}));
  MC.profile.challenges[0].startedOn = MC.toISO(MC.today());
  const c = MC.challenge.current();
  assert.equal(c.plan, true); assert.equal(c.dayNum, 1); assert.equal(c.todayTarget, 10); assert.equal(c.allow, 2);
});

test('[challenges] Foundation completes after 21 days with no more than 2 misses', () => {
  const MC = setup({ plan: 1, title: 'F', days: 21, base: 15, rampTo: 0, points: 100 }, (MC) => {
    const m = {}; for (let i = 1; i <= 22; i++) if (i !== 5 && i !== 9) m[daysAgo(MC, i)] = { minutes: 15 }; return m; });
  MC.profile.challenges[0].startedOn = daysAgo(MC, 22);
  const c = MC.challenge.current();
  assert.equal(c.done, true); assert.equal(c.misses, 2); assert.equal(c.count, 19);
});

test('[challenges] a third miss ends the 21-day challenge', () => {
  const MC = setup({ plan: 1, title: 'F', days: 21, base: 15, rampTo: 0, points: 100 }, () => ({}));
  MC.profile.challenges[0].startedOn = daysAgo(MC, 5);
  const c = MC.challenge.current();
  assert.equal(c.failed, true); assert.equal(c.ended, true); assert.equal(c.done, false);
});

test('[challenges] Advance grows from the base to 30 minutes by day 21', () => {
  const MC = setup({ plan: 1, title: 'A', days: 21, base: 15, rampTo: 30, points: 150 }, () => ({}));
  MC.profile.challenges[0].startedOn = MC.toISO(MC.today());
  assert.equal(MC.challenge.current().todayTarget, 15);
  MC.profile.challenges[0].startedOn = daysAgo(MC, 20);
  const m = {}; for (let i = 1; i <= 20; i++) m[daysAgo(MC, i)] = { minutes: 40 }; MC.byDay = () => m;
  assert.equal(MC.challenge.current().todayTarget, 30);
});

test('[challenges] the original 42-day challenge keeps its rules', () => {
  const MC = setup({ startedOn: null }, () => ({}));
  MC.profile.challenges[0].startedOn = MC.toISO(MC.today());
  const c = MC.challenge.current();
  assert.ok(!c.plan); assert.equal(c.phase, 1); assert.equal(c.count, 0);
});

test('[challenges] starter program has Foundation and Attendance at sign-up, Advance after Foundation', () => {
  const MC = loadCopilot();
  const d = MC.challenge.defaults();
  assert.equal(JSON.stringify(d.filter((x) => x.signup).map((x) => x.id)), JSON.stringify(['c21-foundation', 'c-attend6']));
  assert.equal(d.find((x) => x.id === 'c21-advance').nextOf, 'c21-foundation');
});
