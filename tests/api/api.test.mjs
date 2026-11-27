// [srm] [challenges] [events] [admin] [library] events server with a throw-away database of made-up people
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
  assert.equal(JSON.stringify(r.challenges.map((x) => x.id)), JSON.stringify(['c21-foundation', 'c21-advance', 'c-attend6', 'e-quote30', 'e-article12', 'e-book', 'e-video4', 'e-quiz5']));
  assert.equal(r.challenges[0].signup, true); assert.equal(r.challenges[1].rampTo, 30);
});
test('[challenges] admins can change a challenge; others are refused', async () => {
  assert.equal((await c.call('PATCH', '/api/admin/challenges/c21-advance', seeker, { rampTo: 35 })).status, 403);
  const r = await c.call('PATCH', '/api/admin/challenges/c21-advance', owner, { rampTo: 35 }); assert.equal(r.status, 200);
  assert.equal((await c.call('GET', '/api/challenges')).challenges.find((x) => x.id === 'c21-advance').rampTo, 35);
});
test('[srm] stages and status for each person', async () => {
  const j = await c.call('GET', '/api/admin/journey', owner);
  const P = Object.fromEntries(j.people.map((p) => [p.email, p]));
  assert.equal(P['dev@example.com'].stage, 'potential'); assert.equal(P['sara@example.com'].stage, 'new');
  assert.equal(P['mark@example.com'].stage, 'seeker'); assert.equal(P['asha@example.com'].stage, 'satsangi'); assert.equal(P['kim@example.com'].stage, 'initiate');
  assert.equal(P['priya@example.com'].status, 'active'); assert.equal(P['omar@example.com'].status, 'drifted'); assert.equal(P['ravi@example.com'].status, 'dropped');
  assert.equal(P['dev@example.com'].status, null);
  assert.ok(P['mark@example.com'].orientationDone, 'Mark: 7 workshops and 2 shared challenges'); assert.equal(P['priya@example.com'].zip, '55421');
  assert.equal(j.statusCounts.dropped, 1);
});
test('[srm] follow-ups list the right people', async () => {
  const f = await c.call('GET', '/api/admin/followups', owner);
  const has = (kind, email) => f.items.some((i) => i.kind === kind && i.email === email);
  assert.ok(has('first_visit', 'priya@example.com')); assert.ok(has('no_show', 'sara@example.com'));
  assert.ok(has('orientation', 'mark@example.com')); assert.ok(has('satsangi', 'lena@example.com')); assert.ok(has('drifting', 'omar@example.com'));
  const it = f.items.find((i) => i.kind === 'first_visit');
  await c.call('POST', '/api/admin/followups', owner, { userId: it.userId, kind: it.kind, ref: it.ref, status: 'done' });
  assert.ok(!(await c.call('GET', '/api/admin/followups', owner)).items.some((i) => i.kind === 'first_visit' && i.userId === it.userId), 'done follow-ups drop off');
});
test('[admin] hosts cannot see journeys, notes or follow-ups', async () => {
  assert.equal((await c.call('GET', '/api/admin/journey', host)).status, 403);
  assert.equal((await c.call('GET', '/api/admin/followups', host)).status, 403);
});
test('[srm] notes, mentor, stage, Passive and Sevadar on a person', async () => {
  const j = await c.call('GET', '/api/admin/journey?q=lena', owner); const uid = j.people[0].userId, U = `/api/admin/users/${encodeURIComponent(uid)}/journey`;
  const kim = (await c.call('GET', '/api/admin/journey?q=kim', owner)).people[0].userId;
  const r = await c.call('PATCH', U, owner, { mentorId: kim, milestone: 'met_master', done: true, stage: 'satsangi', sevadar: true });
  assert.equal(r.journey.stage, 'satsangi'); assert.equal(r.journey.sevadar, true); assert.equal(r.journey.category, 'friend', 'Satsangi sees Community events');
  assert.equal((await c.call('PATCH', U, owner, { passive: true, passiveReason: 'Caring for family' })).journey.status, 'passive');
  assert.ok(!(await c.call('GET', '/api/admin/followups', owner)).items.some((i) => i.userId === uid && i.kind === 'drifting'));
  assert.equal((await c.call('POST', `/api/admin/users/${encodeURIComponent(uid)}/notes`, owner, { body: 'Interested in the kids program' })).status, 200);
  const p = await c.call('GET', U, owner);
  assert.equal(p.notes.length, 1); assert.equal(p.journey.mentorName, 'Kim Test'); assert.equal(p.journey.passiveReason, 'Caring for family'); assert.ok(p.timeline.length > 2);
});
test('[srm] profile: edited name, ZIP, no messages; challenges shared from Copilot', async () => {
  const r = await c.call('PUT', '/api/me/contact', seeker, { phone: '612-555-0100', smsOk: true, zip: '55421', name: 'Pri' });
  assert.equal(r.contact.zip, '55421'); assert.equal(r.contact.name, 'Pri'); assert.equal(r.contact.providerName, 'Priya Test');
  assert.equal((await c.call('PUT', '/api/me/contact', seeker, { zip: '554' })).status, 400);
  await c.call('POST', '/api/me/challenge-done', seeker, { ref: 'run-1', title: '21-Day Foundation', finishedOn: '2026-11-20' });
  let p = (await c.call('GET', '/api/admin/journey?q=priya', owner)).people[0];
  assert.equal(p.name, 'Pri'); assert.equal(p.providerName, 'Priya Test'); assert.equal(p.challenges, 1);
  const n = await c.call('PUT', '/api/me/contact', seeker, { phone: '612-555-0100', smsOk: true, noMessages: true });
  assert.equal(n.contact.smsOk, false, 'no messages also stops texts'); assert.equal(n.contact.noMessages, true);
  p = (await c.call('GET', '/api/admin/journey?q=priya', owner)).people[0]; assert.equal(p.status, 'declined');
  await c.call('PUT', '/api/me/contact', seeker, { phone: '612-555-0100', smsOk: true, noMessages: false, name: 'Priya Test' });
});
test('[events] new events keep their type, audience and children’s program', async () => {
  const st = Date.now() + 5 * 86400000;
  const r = await c.call('POST', '/api/admin/events', owner, { title: 'Test Festival', format: 'in_person', access: 'satsang', kind: 'festival', children: true, startsAt: st, endsAt: st + 3600000, timezone: 'America/Chicago' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r));
  const id = (r.events || [r.event])[0].id;
  const e = await c.call('GET', '/api/events/' + id, owner);
  assert.equal(e.event.kind, 'festival'); assert.equal(e.event.children, true); assert.equal(e.event.access, 'satsang');
  assert.equal((await c.call('GET', '/api/events/' + id, seeker)).status, 404, 'Community events are hidden from Seekers');
});

test('[library] only approved items reach Copilot; admins add, approve and remove', async () => {
  assert.equal((await c.call('GET', '/api/admin/library', host)).status, 403, 'hosts cannot manage the library');
  const all = await c.call('GET', '/api/admin/library', owner);
  assert.ok(all.items.some((x) => x.kind === 'book' && x.status === 'draft'), 'starter books arrive as drafts');
  assert.ok(!(await c.call('GET', '/api/library')).items.some((x) => x.id === 'b-empowering-soul'), 'drafts are hidden');
  assert.equal((await c.call('PATCH', '/api/admin/library/b-empowering-soul', owner, { status: 'approved' })).status, 400, 'a book needs its chapters first');
  assert.equal((await c.call('PATCH', '/api/admin/library/b-empowering-soul', owner, { chapters: 12, status: 'approved' })).status, 200);
  const v = await c.call('POST', '/api/admin/library', owner, { kind: 'video', title: 'Test talk', url: 'https://youtu.be/dQw4w9WgXcQ', status: 'approved' });
  assert.equal(v.status, 201);
  const pub = (await c.call('GET', '/api/library')).items;
  assert.ok(pub.some((x) => x.id === 'b-empowering-soul' && x.chapters === 12)); assert.ok(pub.some((x) => x.title === 'Test talk'));
  assert.equal(pub[0].status, undefined);
  await c.call('DELETE', '/api/admin/library/' + v.item.id, owner);
  assert.ok(!(await c.call('GET', '/api/library')).items.some((x) => x.title === 'Test talk'));
});
test('[challenges] education challenges need something to read or watch', async () => {
  assert.equal((await c.call('POST', '/api/admin/challenges', owner, { title: 'Read', kind: 'education', days: 28, target: 4 })).status, 400);
  const r = await c.call('POST', '/api/admin/challenges', owner, { title: 'Read', kind: 'education', days: 28, target: 4, material: 'article', cadence: 'week', perPeriod: 1, itemPoints: 10 });
  assert.equal(r.status, 201); assert.equal(r.challenge.material, 'article'); assert.equal(r.challenge.perPeriod, 1);
  await c.call('DELETE', '/api/admin/challenges/' + r.challenge.id, owner);
});

test('[library] knowledge: Learn articles moved in, quizzes arrive as drafts, anonymous counts', async () => {
  let pub = (await c.call('GET', '/api/library')).items;
  const art = pub.find((x) => x.id === 'learn-to-meditate');
  assert.ok(art && art.kind === 'article' && art.body.length > 100, 'built-in Learn articles are now in the library, same id');
  assert.ok(!pub.some((x) => x.kind === 'quiz' && x.id !== 'q-center'), 'quizzes start as drafts (the made-up test data approves one)');
  const all = (await c.call('GET', '/api/admin/library', owner)).items, qz = all.filter((x) => x.kind === 'quiz');
  assert.equal(qz.length, 11); assert.ok(qz.every((x) => x.quiz.questions.length === 10));
  assert.equal((await c.call('PATCH', '/api/admin/library/q-benefits', owner, { status: 'approved', retryMinutes: 1 })).status, 200);
  pub = (await c.call('GET', '/api/library')).items;
  const q = pub.find((x) => x.id === 'q-benefits'); assert.equal(q.retryMinutes, 1); assert.equal(q.quiz.questions.length, 10); assert.equal(q.quiz.reviewNote, undefined);
  assert.equal((await c.call('PATCH', '/api/admin/library/q-tips', owner, { quiz: { questions: [{ q: 'x', options: ['a'], answer: 0 }] } })).status, 400, 'each question needs 2–4 options');
  await c.call('POST', '/api/library/hit', null, { id: 'q-benefits', action: 'pass' });
  await c.call('POST', '/api/library/hit', null, { id: 'q-benefits', action: 'open' });
  const st = (await c.call('GET', '/api/admin/library', owner)).items.find((x) => x.id === 'q-benefits').stats;
  assert.equal(st.pass, 1); assert.equal(st.open, 1);
});
