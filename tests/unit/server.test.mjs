// [srm] [challenges] [events] server rules that don't need a database
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcJourney, validateChallenge, validateEvent, challengeOut } from '../../api/src/index.js';

test('[srm] journey levels follow check-ins by event type', () => {
  assert.equal(calcJourney({ visits: 0 }), 'new');
  assert.equal(calcJourney({ visits: 1, workshops: 1 }), 'l2');
  assert.equal(calcJourney({ visits: 6, workshops: 6 }), 'l3');
  assert.equal(calcJourney({ visits: 2, satsangs: 2 }), 'l3');
  assert.equal(calcJourney({ visits: 6, satsangs: 6 }), 'l4');
  assert.equal(calcJourney({ visits: 1, darshans: 1 }), 'l4');
  assert.equal(calcJourney({ visits: 1, milestones: 'met_master' }), 'l4');
  assert.equal(calcJourney({ visits: 0, category: 'initiate' }), 'initiate');
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

test('[events] event type and audience are validated', () => {
  const ok = validateEvent({ kind: 'workshop', level: 'seeker' }, true);
  assert.equal(ok.kind, 'workshop'); assert.equal(ok.level, 'seeker');
  assert.throws(() => validateEvent({ kind: 'party' }, true));
  assert.throws(() => validateEvent({ level: 'everyone' }, true));
});
