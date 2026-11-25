// [srm] [challenges] [events] [admin] events server with a throw-away database of made-up people
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from './_server.mjs';

let srv, c, owner, host, seeker;
before(async () => {
  srv = await startServer(); c = client(srv.base);
  owner = await c.login('owner@example.com', 'Arvind Owner'); host = await c.login('host@example.com', 'Host Test'); seeker = await c.login('priya@example.com', 'Priya Test');
});
after(() => srv && srv.stop());

test('[release] health check answers with a version', async () => {
  const r = await c.call('GET', '/api/health'); assert.equal(r.ok, true); assert.ok(r.version);
});
test('[challenges] starter program is listed in priority order', async () => {
  const r = await c.call('GET', '/api/challenges');
  assert.equal(JSON.stringify(r.challenges.map((x) => x.id)), JSON.stringify(['c21-foundation', 'c21-advance', 'c-attend6']));
  assert.equal(r.challenges[0].signup, true); assert.equal(r.challenges[1].rampTo, 30);
});
test('[challenges] admins can change a challenge; others are refused', async () => {
  assert.equal((await c.call('PATCH', '/api/admin/challenges/c21-advance', seeker, { rampTo: 35 })).status, 403);
  const r = await c.call('PATCH', '/api/admin/challenges/c21-advance', owner, { rampTo: 35 }); assert.equal(r.status, 200);
  assert.equal((await c.call('GET', '/api/challenges')).challenges.find((x) => x.id === 'c21-advance').rampTo, 35);
});
test('[srm] journey levels and counts', async () => {
  const j = await c.call('GET', '/api/admin/journey', owner);
  const lv = Object.fromEntries(j.people.map((p) => [p.email, p.level]));
  assert.equal(lv['mark@example.com'], 'l3'); assert.equal(lv['lena@example.com'], 'l4'); assert.equal(lv['dev@example.com'], 'new');
  assert.equal(lv['kim@example.com'], 'initiate'); assert.ok(j.people.find((p) => p.email === 'omar@example.com').drifting);
});
test('[srm] follow-ups list the right people', async () => {
  const f = await c.call('GET', '/api/admin/followups', owner);
  const has = (kind, email) => f.items.some((i) => i.kind === kind && i.email === email);
  assert.ok(has('first_visit', 'priya@example.com')); assert.ok(has('no_show', 'sara@example.com')); assert.ok(has('level_up', 'mark@example.com'));
  const it = f.items.find((i) => i.kind === 'first_visit');
  await c.call('POST', '/api/admin/followups', owner, { userId: it.userId, kind: it.kind, ref: it.ref, status: 'done' });
  assert.ok(!(await c.call('GET', '/api/admin/followups', owner)).items.some((i) => i.kind === 'first_visit' && i.userId === it.userId), 'done follow-ups drop off');
});
test('[admin] hosts cannot see journeys, notes or follow-ups', async () => {
  assert.equal((await c.call('GET', '/api/admin/journey', host)).status, 403);
  assert.equal((await c.call('GET', '/api/admin/followups', host)).status, 403);
});
test('[srm] notes, mentor and milestones on a person', async () => {
  const j = await c.call('GET', '/api/admin/journey?q=priya', owner); const uid = j.people[0].userId;
  const kim = (await c.call('GET', '/api/admin/journey?q=kim', owner)).people[0].userId;
  assert.equal((await c.call('PATCH', `/api/admin/users/${encodeURIComponent(uid)}/journey`, owner, { mentorId: kim, milestone: 'met_master', done: true })).journey.level, 'l4');
  assert.equal((await c.call('POST', `/api/admin/users/${encodeURIComponent(uid)}/notes`, owner, { body: 'Interested in the kids program' })).status, 200);
  const p = await c.call('GET', `/api/admin/users/${encodeURIComponent(uid)}/journey`, owner);
  assert.equal(p.notes.length, 1); assert.equal(p.journey.mentorName, 'Kim Test'); assert.ok(p.timeline.length > 2);
});
test('[events] new events keep their type and audience', async () => {
  const st = Date.now() + 5 * 86400000;
  const r = await c.call('POST', '/api/admin/events', owner, { title: 'Test Workshop', format: 'in_person', access: 'public', kind: 'workshop', level: 'seeker', startsAt: st, endsAt: st + 3600000, timezone: 'America/Chicago' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r));
  const id = (r.events || [r.event])[0].id;
  const e = await c.call('GET', '/api/events/' + id, owner);
  assert.equal(e.event.kind, 'workshop'); assert.equal(e.event.level, 'seeker');
});
