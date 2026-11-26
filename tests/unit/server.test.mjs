// [srm] [challenges] [events] server rules that don't need a database
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcStage, calcStatus, validateChallenge, validateEvent, challengeOut } from '../../api/src/index.js';

test('[srm] stages: Potential, New, Seeker, Satsangi, Initiate', () => {
  assert.equal(calcStage({ visits: 0, rsvps: 0 }), 'potential');
  assert.equal(calcStage({ visits: 0, rsvps: 1 }), 'new');
  assert.equal(calcStage({ visits: 1, workshops: 1 }), 'seeker');
  assert.equal(calcStage({ visits: 9, satsangs: 9 }), 'seeker', 'Satsangi is set by an admin, not by counting');
  assert.equal(calcStage({ visits: 1, category: 'friend' }), 'satsangi');
  assert.equal(calcStage({ visits: 0, category: 'initiate' }), 'initiate');
});
test('[srm] status: Active, Drifted, Dropped, Passive, Declined', () => {
  const t = Date.now(), D = 86400000;
  assert.equal(calcStatus({ lastVisitAt: t - 10 * D }, t), 'active');
  assert.equal(calcStatus({ lastVisitAt: t - 61 * D }, t), 'drifted');
  assert.equal(calcStatus({ lastVisitAt: t - 400 * D }, t), 'dropped');
  assert.equal(calcStatus({ lastVisitAt: t - 400 * D, passiveAt: t }, t), 'passive');
  assert.equal(calcStatus({ lastVisitAt: t, passiveAt: t, declinedAt: t }, t), 'declined');
  assert.equal(calcStatus({}, t), null, 'no status before the first visit');
});

test('[challenges] minute choices are cleaned and sorted', () => {
  const o = validateChallenge({ title: 'X', kind: 'daily_sitting', days: 21, minutes: 15, minutesChoices: '20, 10,15,10', points: 100 });
  assert.equal(o.minutes_choices, '10,15,20');
});

test('[challenges] bad values are refused', () => {
  assert.throws(() => validateChallenge({ title: 'X', kind: 'reading' }));
  assert.throws(() => validateChallenge({ title: 'X', kind: 'daily_sitting', minutesChoices: '10, 500' }));
  assert.throws(() => validateChallenge({ title: 'X', kind: 'education', material: 'podcast' }));
});

test('[challenges] output shape used by Copilot', () => {
  const c = challengeOut({ id: 'a', title: 'T', kind: 'daily_sitting', days: 21, minutes: 15, minutes_choices: '10,15', ramp_to: 30, target: 0, audience: 'all', points: 150, priority: 20, signup: 0, next_of: 'f', active: 1 });
  assert.deepEqual(c.minutesChoices, [10, 15]); assert.equal(c.rampTo, 30); assert.equal(c.nextOf, 'f'); assert.equal(c.signup, false);
});

test('[events] event type, audience and children’s program are validated', () => {
  const ok = validateEvent({ kind: 'festival', access: 'satsang', children: true }, true);
  assert.equal(ok.kind, 'festival'); assert.equal(ok.access, 'satsang'); assert.equal(ok.children, 1);
  for (const k of ['intro', 'workshop', 'satsang', 'retreat', 'darshan', 'festival', 'celebration']) assert.equal(validateEvent({ kind: k }, true).kind, k);
  assert.throws(() => validateEvent({ kind: 'seva' }, true)); assert.throws(() => validateEvent({ kind: 'other' }, true));
  assert.throws(() => validateEvent({ access: 'everyone' }, true));
});
