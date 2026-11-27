/* admin.sosmn.org — admin for the SOS Minneapolis Meditation Center events site.
 * Events (add, edit, cancel, remove, feature), RSVPs with guests, who opened an event, check-in (event day and the day after),
 * add people to an event, reminders, invitations, people, Meditation Copilot challenges, overview, team, activity.
 * The events server checks the person's role on every request; this page only decides what to show.
 */
(function () {
  'use strict';
  var S = window.SOS, esc = S.esc, TZ = 'America/Chicago', SITE = S.CFG.siteUrl, COPILOT = S.CFG.copilotUrl;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var FORMAT = { in_person: 'In person', online: 'Online', hybrid: 'In person & online' };
  var T = window.SOS_TYPES;                                   // event types and audiences (js/types.js, shared with sosmn.org)
  var ACCESS = T.AUDIENCE;                                     // public · satsang = Community (by invitation) · initiates
  var KIND = {}; T.order.forEach(function (k) { KIND[k] = T.label(k); });
  var CATEGORY = { seeker: 'Seeker', friend: 'Satsangi', initiate: 'Initiate' };
  // People: stage (only moves up) and status (see SOSMN-SRM.md)
  var LEVEL = { potential: 'Potential', 'new': 'New', seeker: 'Seeker', satsangi: 'Satsangi', initiate: 'Initiate' };
  var LEVEL_HINT = { potential: 'We have their details; announcements only if they agreed', 'new': 'Interested: signed up for an event, hasn’t come yet',
    seeker: 'Has come. Orientation: 5 workshops and 2 challenges', satsangi: 'Attends satsang regularly (set by an admin); sees Community events', initiate: 'Initiated (permanent): steady progress in meditation and seva' };
  var STATUS = { active: ['Active', 'came in the last 60 days'], drifted: ['Drifted', 'came in the last 12 months, not in 60 days'], dropped: ['Dropped', 'last came over 12 months ago'],
    passive: ['Passive', 'away for a known reason; staying gently in touch'], declined: ['Declined', 'asked for no messages'] };
  var MILESTONE = { challenge_done: 'Finished a challenge (told us in person)', questions_clear: 'No open questions on the teachings', met_master: 'Met Sant Rajinder Singh Ji in person' };
  function flyerThumb(e) { return e.flyerId ? S.CFG.apiBase + '/api/flyers/' + encodeURIComponent(e.flyerId) + '?size=thumb' : null; }
  function stTag(st) { return st ? '<span class="tag st st-' + esc(st) + '" title="' + esc(STATUS[st][1]) + '">' + esc(STATUS[st][0]) + '</span>' : ''; }
  var TABS = [['events', 'Events', 'host'], ['followups', 'Follow-ups', 'admin'], ['journey', 'Journey', 'admin'], ['people', 'People', 'admin'], ['invite', 'Invite', 'admin'], ['challenges', 'Challenges', 'admin'], ['library', 'Library', 'admin'],
    ['overview', 'Overview', 'admin'], ['team', 'Team', 'admin'], ['log', 'Activity', 'admin']];
  var ACTIONS = {
    sign_in: 'Signed in', checkin: 'Checked someone in', checkin_undo: 'Undid a check-in', event_create: 'Created an event', event_edit: 'Edited an event',
    event_cancel: 'Cancelled an event', event_restore: 'Restored an event', event_new_code: 'New check-in code', event_delete: 'Removed an event', hero_set: 'Featured an event', hero_clear: 'Unfeatured an event',
    rsvp_manual: 'Added a person to an event', person_view: 'Viewed a person', person_edit: 'Changed a person', settings: 'Changed settings', team_add: 'Added to team', team_remove: 'Removed from team',
    export_csv: 'Downloaded attendee CSV', contact_list: 'Opened a contact list', email_rsvps: 'Opened reminder email', copy_emails: 'Copied email addresses', whatsapp_demo: 'Opened WhatsApp reminder',
    invite_email: 'Opened invitation email', invite_copy: 'Copied invitation', journey_edit: 'Changed a journey', note_add: 'Added a note', note_delete: 'Removed a note',
    followup_done: 'Did a follow-up', followup_skipped: 'Skipped a follow-up', challenge_create: 'Created a challenge', challenge_edit: 'Changed a challenge', challenge_delete: 'Removed a challenge'
  };
  var me = null, role = null;

  /* ---------- helpers ---------- */
  function fmt(ms, o) { return new Date(ms).toLocaleString('en-US', Object.assign({ timeZone: TZ }, o)); }
  function whenText(e) { return fmt(e.startsAt, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' }) + '–' + fmt(e.endsAt, { hour: 'numeric', minute: '2-digit' }); }
  function when(ms) { return ms ? fmt(ms, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function day(ms) { return ms ? fmt(ms, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function n(x) { return (x || 0).toLocaleString(); }
  function people(k, g) { return k + (g ? ' + ' + g + (g === 1 ? ' guest' : ' guests') : ''); }
  function phone(p) { var d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : (p || ''); }
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 3200); }
  function sheet(html) { var d = $('sheet'); $('sheetBody').innerHTML = html; if (d.showModal && !d.open) d.showModal(); return $('sheetBody'); }
  function closeSheet() { if ($('sheet').open) $('sheet').close(); }
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet') || e.target.closest('[data-close]')) closeSheet(); });
  function copy(text, msg) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { window.prompt('Copy this:', text); }); }
  function report(action, target, detail) { S.api('POST', '/api/admin/log', { action: action, target: target, detail: detail }).catch(function () {}); }
  function fail(x) { app.innerHTML = '<div class="card"><p>' + esc(x.message || 'Something went wrong.') + '</p><a class="btn btn-ghost" href="#events">Back</a></div>'; }
  function loading() { app.innerHTML = '<div class="card skeleton"></div>'; }
  function qrSvg(text) { try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (x) { return ''; } }
  function eventLink(e, extra) { return SITE + '/event/?id=' + encodeURIComponent(e.id) + (extra || ''); }
  function isAdmin() { return role === 'owner' || role === 'admin'; }
  // Wall-clock time in Minneapolis → epoch ms (works whatever time zone this computer is in)
  function centerTime(y, mo, d, h, mi) {
    var guess = Date.UTC(y, mo, d, h, mi);
    function off(t) { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(t)).forEach(function (x) { p[x.type] = Number(x.value); }); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t; }
    var t = guess - off(guess); return guess - off(t);
  }
  function parts(ms) { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute }; }

  /* ---------- sign-in gate ---------- */
  function gate(msg) {
    $('admNav').hidden = true; $('admAcct').innerHTML = '';
    app.innerHTML = '<div class="card gate"><h1>Admin</h1><p>' + (msg || 'Sign in with the Google or Microsoft account your admin access is linked to.') + '</p>' +
      '<div class="signin-btns"><button class="btn btn-block prov" id="gBtn" type="button"><span class="g-logo" aria-hidden="true">G</span> Continue with Google</button>' +
      '<button class="btn btn-block prov" id="mBtn" type="button"><span class="m-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span> Continue with Microsoft</button></div>' +
      (S.isLocal ? '<p class="small" style="margin-top:14px"><b>Local test sign-in</b> (this computer only). The owner is the first email in ADMIN_EMAILS in api/.dev.vars (owner@example.com).<br><input class="input" id="tEmail" value="owner@example.com" style="margin:6px 0"><button class="btn btn-soft btn-sm" id="tBtn" type="button">Sign in as test user</button></p>' : '') +
      '<p class="error" id="gErr"></p></div>';
    S.prepareGoogle().catch(function () {});
    $('gBtn').onclick = function () { S.signInGoogle().then(start, function (x) { $('gErr').textContent = x.message; }); };
    $('mBtn').onclick = function () { S.signInMicrosoft(); };
    if ($('tBtn')) $('tBtn').onclick = function () { var e = $('tEmail').value.trim(); S.signInTest(e, e.split('@')[0]).then(start, function (x) { $('gErr').textContent = x.message; }); };
  }
  function start() {
    if (!S.valid()) return gate();
    loading();
    S.api('GET', '/api/me').then(function (j) {
      me = j.user || {};
      if (!(me.isStaff || me.isAdmin)) { S.signOut(); return gate('<b>' + esc(me.email || '') + '</b> isn’t an admin or host. Sign in with a different account, or ask the owner to add you in Team.'); }
      role = me.role || (me.isAdmin ? 'admin' : 'host');
      $('admAcct').innerHTML = '<span class="tag role">' + esc(role) + '</span> <button class="btn btn-ghost btn-sm" id="outBtn" type="button">Sign out</button>';
      $('outBtn').onclick = function () { S.signOut(); gate('Signed out.'); };
      var nav = $('admNav'); nav.hidden = false;
      nav.innerHTML = TABS.filter(function (t) { return t[2] === 'host' || isAdmin(); }).map(function (t) { return '<a href="#' + t[0] + '" data-nav="' + t[0] + '">' + t[1] + '</a>'; }).join('');
      route();
    }).catch(function (x) { if (x.status === 401) gate('Your sign-in expired. Please sign in again.'); else fail(x); });
  }

  /* ---------- router ---------- */
  function route() {
    if (!me) return;
    var h = (location.hash || '#events').slice(1), p = h.split('/');
    document.querySelectorAll('[data-nav]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.nav === p[0] || (p[0] === 'event' && a.dataset.nav === 'events') || (p[0] === 'person' && a.dataset.nav === 'journey') ? 'page' : 'false'); });
    if (!isAdmin() && p[0] !== 'events' && p[0] !== 'event') { location.hash = '#events'; return; }
    window.scrollTo(0, 0);
    ({ events: drawEvents, event: function () { drawEvent(decodeURIComponent(p[1] || ''), p[2]); }, people: drawPeople, person: function () { drawPerson(decodeURIComponent(p[1] || '')); },
      followups: drawFollowups, journey: function () { drawJourney(p[1] || ''); },
      invite: drawInvite, challenges: drawChallenges, library: drawLibrary, overview: drawOverview, team: drawTeam, log: drawLog }[p[0]] || drawEvents)();
  }
  window.addEventListener('hashchange', route);

  /* =====================================================================
   * Events
   * ===================================================================== */
  var evRange = 'upcoming', evCache = [];
  function drawEvents() {
    loading();
    var t = Date.now(), from = evRange === 'past' ? t - 90 * 86400000 : t - 12 * 3600000, to = evRange === 'past' ? t : t + 240 * 86400000;
    S.api('GET', '/api/events?from=' + from + '&to=' + to).then(function (j) {
      var list = j.events || [];
      if (evRange === 'past') list = list.filter(function (e) { return e.startsAt < t; }).reverse();
      evCache = list;
      var top = list.filter(function (e) { return evRange === 'upcoming' && e.status !== 'cancelled' && e.endsAt > t; }).slice(0, 3);
      var heroId = ((top.filter(function (e) { return e.hero; })[0]) || top[0] || {}).id;
      app.innerHTML = '<div class="sec-head page-head"><h1>Events</h1>' + (isAdmin() ? '<button class="btn btn-primary" id="newEv" type="button">+ New event</button>' : '') + '</div>' +
        '<div class="seg" role="group" aria-label="Show"><button type="button" data-r="upcoming" class="' + (evRange === 'upcoming' ? 'on' : '') + '">Upcoming</button><button type="button" data-r="past" class="' + (evRange === 'past' ? 'on' : '') + '">Past 90 days</button></div>' +
        (evRange === 'upcoming' && isAdmin() ? '<p class="small muted">The next three events appear on the sosmn.org home page. ★ chooses which one is shown large; otherwise the soonest is.</p>' : '') +
        '<div class="adm-list">' + (list.length ? list.map(function (e) {
          var cx = e.status === 'cancelled', onHome = top.indexOf(e) >= 0;
          return '<a class="card adm-ev' + (cx ? ' cx' : '') + '" href="#event/' + encodeURIComponent(e.id) + '">' +
            T.thumb(e, flyerThumb(e), 48) +
            '<span class="ev-body"><b class="ev-title">' + esc(e.title) + '</b><span class="small">' + esc(KIND[e.kind] || '') + ' · ' + esc(whenText(e)) + ' · ' + esc(FORMAT[e.format]) + (e.access !== 'public' ? ' · ' + esc(ACCESS[e.access]) : '') + (e.children ? ' · 👧 children’s program' : '') + '</span>' +
            '<span class="ev-foot"><span class="small"><b>' + n(e.headcount) + '</b> going' + (e.guests ? ' (incl. ' + e.guests + ' guests)' : '') + ' · <b>' + n(e.checkedIn + (e.checkedInGuests || 0)) + '</b> checked in · ' + n(e.views) + ' views</span>' +
            (cx ? '<span class="tag cx">Cancelled</span>' : '') + (onHome ? '<span class="tag' + (e.id === heroId ? ' gold' : '') + '">' + (e.id === heroId ? '★ Home page hero' : 'On home page') + '</span>' : '') +
            (e.repeats ? '<span class="tag">Repeats ' + esc(e.repeats) + '</span>' : '') + '</span></span></a>';
        }).join('') : '<div class="card empty"><p>No events.</p></div>') + '</div>';
      app.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { evRange = b.dataset.r; drawEvents(); }; });
      if ($('newEv')) $('newEv').onclick = function () { eventForm(null); };
    }).catch(fail);
  }

  var cur = null, rows = [], filter = 'all', sub = 'rsvps';
  function drawEvent(id, tab) {
    if (tab) sub = tab;
    loading();
    Promise.all([S.api('GET', '/api/events/' + encodeURIComponent(id)), S.api('GET', '/api/admin/events/' + encodeURIComponent(id) + '/attendees')]).then(function (r) {
      cur = r[0].event; rows = r[1].attendees || [];
      paintEvent();
    }).catch(fail);
  }
  function paintEvent() {
    var e = cur, cx = e.status === 'cancelled', admin = isAdmin();
    var going = rows.filter(function (x) { return x.rsvp === 'going'; }), maybe = rows.filter(function (x) { return x.rsvp === 'maybe'; });
    var inRows = rows.filter(function (x) { return x.checkedInAt; });
    var sum = function (l, k) { return l.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
    app.innerHTML = '<p class="crumbs"><a href="#events">‹ Events</a></p>' +
      '<div class="card adm-head-card"><div class="adm-head-main">' + (e.flyerId ? '<a class="adm-flyer" href="' + esc(S.CFG.apiBase + '/api/flyers/' + encodeURIComponent(e.flyerId)) + '" target="_blank" rel="noopener" title="Open the flyer"><img src="' + esc(flyerThumb(e)) + '" alt="Event flyer"></a>' : '') +
        '<div class="ev-type">' + T.icon(e.kind, 36) + '<p class="kicker">' + esc(KIND[e.kind] || '') + ' · ' + esc(FORMAT[e.format]) + ' · ' + esc(ACCESS[e.access]) + (e.children ? ' · 👧 Children’s program' : '') + (e.repeats ? ' · repeats ' + esc(e.repeats) : '') + '</p></div>' +
        '<h1>' + esc(e.title) + '</h1>' + (cx ? '<p class="notice warn"><b>Cancelled.</b> People can still see it, marked as cancelled.</p>' : '') +
        '<p><b>' + esc(day(e.startsAt)) + '</b> · ' + esc(fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' })) + '–' + esc(fmt(e.endsAt, { hour: 'numeric', minute: '2-digit' })) +
        (e.venue && e.format !== 'online' ? ' · ' + esc(e.venue) : '') + '</p>' +
        '<div class="kpis"><span><b>' + n(e.headcount) + '</b>going<small>' + people(going.length, sum(going, 'guests')) + '</small></span><span><b>' + n(maybe.length + sum(maybe, 'guests')) + '</b>maybe</span>' +
        '<span><b>' + n(inRows.length + sum(inRows, 'checkedInGuests')) + '</b>checked in<small>' + people(inRows.length, sum(inRows, 'checkedInGuests')) + '</small></span><span><b>' + n(e.views) + '</b>page views</span></div></div>' +
        '<div class="adm-actions">' +
          (admin ? '<button class="btn btn-ghost btn-sm" id="aEdit" type="button">✎ Edit</button>' : '') +
          (admin && !cx ? '<button class="btn btn-ghost btn-sm" id="aHero" type="button">' + (e.hero ? '★ Featured' : '☆ Feature on home') + '</button>' : '') +
          '<a class="btn btn-ghost btn-sm" href="' + esc(eventLink(e)) + '" target="_blank" rel="noopener">View on sosmn.org ↗</a>' +
          '<button class="btn btn-ghost btn-sm" id="aDoor" type="button">🔢 Door code &amp; QR</button>' +
          (admin ? '<button class="btn btn-ghost btn-sm" id="aCsv" type="button">⬇ CSV</button>' : '') +
          (admin ? (cx ? '<button class="btn btn-ghost btn-sm" id="aRestore" type="button">Restore</button>' : '<button class="btn btn-ghost btn-sm danger" id="aCancel" type="button">Cancel event</button>') : '') +
          (admin ? '<button class="btn btn-ghost btn-sm danger" id="aDelete" type="button">Remove</button>' : '') + '</div></div>' +
      '<div class="seg sub-tabs" role="tablist">' + [['rsvps', 'RSVPs'], ['checkin', 'Check-in'], ['add', 'Add a person'], ['views', 'Who opened it'], ['insight', 'Insight'], ['remind', 'Reminders']]
        .filter(function (t) { return admin || t[0] === 'checkin'; })
        .map(function (t) { return '<button type="button" data-sub="' + t[0] + '" class="' + (sub === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="subBody"></div>';
    if (!admin) sub = 'checkin';
    app.querySelectorAll('[data-sub]').forEach(function (b) { b.onclick = function () { sub = b.dataset.sub; history.replaceState(null, '', '#event/' + encodeURIComponent(e.id) + '/' + sub); paintEvent(); }; });
    if ($('aEdit')) $('aEdit').onclick = function () { eventForm(e); };
    if ($('aHero')) $('aHero').onclick = function () {
      S.api(e.hero ? 'DELETE' : 'POST', '/api/admin/events/' + encodeURIComponent(e.id) + '/hero').then(function () { toast(e.hero ? 'Not featured.' : '★ Featured on the home page (when it’s one of the next three).'); drawEvent(e.id); }).catch(function (x) { toast(x.message); });
    };
    $('aDoor').onclick = doorSheet;
    if ($('aCsv')) $('aCsv').onclick = downloadCsv;
    if ($('aCancel')) $('aCancel').onclick = function () { seriesAction('cancel'); };
    if ($('aRestore')) $('aRestore').onclick = function () { seriesAction('restore'); };
    if ($('aDelete')) $('aDelete').onclick = function () { seriesAction('delete'); };
    ({ rsvps: subRsvps, checkin: subCheckin, add: subAdd, views: subViews, insight: subInsight, remind: subRemind }[sub] || subRsvps)();
  }
  function seriesAction(kind) {
    var e = cur, label = { cancel: 'Cancel', restore: 'Restore', delete: 'Remove' }[kind];
    var b = sheet('<h2 class="sheet-title">' + label + ' “' + esc(e.title) + '”?</h2>' +
      (kind === 'delete' ? '<p class="small">Removing deletes the event completely. It only works if nobody has responded yet; otherwise cancel it, so people can see it isn’t happening.</p>' :
        kind === 'cancel' ? '<p class="small">People who RSVP’d will see it marked as cancelled. Consider emailing them from Reminders.</p>' : '') +
      (e.seriesId ? '<div class="radio-list"><label><input type="radio" name="sc" value="this" checked> This date only</label><label><input type="radio" name="sc" value="future"> This and later dates</label><label><input type="radio" name="sc" value="all"> Every date in the series</label></div>' : '') +
      '<p class="error" id="saErr"></p><div class="actions"><button class="btn btn-ghost" data-close type="button">Back</button><button class="btn btn-primary" id="saGo" type="button">' + label + '</button></div>');
    $('saGo').onclick = function () {
      var sc = (b.querySelector('input[name="sc"]:checked') || {}).value || 'this';
      var q = sc !== 'this' ? '?scope=' + sc : '';
      var req = kind === 'delete' ? S.api('DELETE', '/api/admin/events/' + encodeURIComponent(e.id) + q) : S.api('POST', '/api/admin/events/' + encodeURIComponent(e.id) + '/' + kind + q);
      req.then(function () { closeSheet(); toast(label + 'd.'); if (kind === 'delete') location.hash = '#events'; else drawEvent(e.id); }, function (x) { $('saErr').textContent = x.message; });
    };
  }
  function doorSheet() {
    var e = cur, link = eventLink(e, '&code=' + (e.checkinCode || ''));
    sheet('<h2 class="sheet-title">Door code &amp; QR</h2><p class="small muted">' + esc(e.title) + ' · ' + esc(whenText(e)) + '</p>' +
      '<div class="door"><div class="door-code">' + esc(e.checkinCode || '----') + '</div><div class="door-qr">' + qrSvg(link) + '</div>' +
      '<p class="small">Show this at the door. People scan it, or open the event on sosmn.org and type the code. Self check-in works from 1 hour before the start until the end of the day.</p></div>' +
      '<div class="actions"><button class="btn btn-ghost" id="dNew" type="button">New code</button><button class="btn btn-ghost" id="dPrint" type="button">🖨 Print</button><button class="btn btn-primary" data-close type="button">Done</button></div>');
    $('dNew').onclick = function () { S.api('POST', '/api/admin/events/' + encodeURIComponent(e.id) + '/new-code').then(function () { closeSheet(); toast('New code made.'); drawEvent(e.id); }).catch(function (x) { toast(x.message); }); };
    $('dPrint').onclick = function () { printPage('Check in: ' + e.title, '<h1>' + esc(e.title) + '</h1><p>' + esc(whenText(e)) + '</p><div class="qr">' + qrSvg(link) + '</div><p class="code">Code: <b>' + esc(e.checkinCode) + '</b></p><p class="small">' + esc(SITE.replace('https://', '')) + '/event</p>'); };
  }
  function printPage(title, inner) {
    var w = window.open('', '_blank'); if (!w) { toast('Please allow pop-ups to print.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font-family:Georgia,serif;text-align:center;color:#043a5b;padding:40px 24px}h1{font-size:40px;margin:8px 0}' +
      'p{font-family:system-ui,sans-serif;font-size:20px;color:#333}.qr{width:360px;height:360px;margin:20px auto}.qr svg{width:100%;height:100%}.code b{font-size:44px;letter-spacing:.2em}.small{font-size:14px;color:#777}@media print{button{display:none}}</style></head><body>' +
      inner + '<p class="small">Science of Spirituality Minneapolis Meditation Center</p><button onclick="window.print()" style="font-size:18px;padding:10px 24px">Print</button></body></html>');
    w.document.close();
  }
  function downloadCsv() {
    S.api('GET', '/api/admin/events/' + encodeURIComponent(cur.id) + '/attendees?format=csv', undefined, { raw: true }).then(function (r) {
      if (!r.ok) throw new Error('Could not download (' + r.status + ')');
      return r.blob();
    }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = cur.title.replace(/[^\w]+/g, '-').slice(0, 40) + '-attendees.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }).catch(function (x) { toast(x.message); });
  }

  function personLine(x, extra) {
    return '<span class="ag-main"><b>' + esc(x.name || x.email || '(no name)') + '</b>' + (x.provider === 'manual' ? ' <span class="tag">added by admin</span>' : '') +
      ' <span class="tag">' + esc(CATEGORY[x.category] || 'Seeker') + '</span><small>' + extra + (x.email ? '<br>' + esc(x.email) + (x.phone ? ' · ' + esc(phone(x.phone)) : '') : '') + '</small></span>';
  }
  function subRsvps() {
    var list = rows.filter(function (x) { return x.rsvp; });
    var order = { going: 0, maybe: 1, no: 2 };
    list.sort(function (a, b) { return (order[a.rsvp] - order[b.rsvp]) || (a.rsvpAt - b.rsvpAt); });
    $('subBody').innerHTML = '<div class="card">' + (list.length ? list.map(function (x) {
      return '<div class="ad-row">' + personLine(x, '<b>' + { going: 'Going', maybe: 'Maybe', no: 'Can’t go' }[x.rsvp] + '</b>' + (x.guests ? ' + ' + x.guests + (x.guests === 1 ? ' guest' : ' guests') : '') +
        ' · RSVP’d ' + esc(when(x.rsvpAt)) + (x.checkedInAt ? ' · ✓ checked in' : '')) + '<a class="btn btn-ghost btn-sm" href="#person/' + encodeURIComponent(x.userId) + '">Profile</a></div>';
    }).join('') : '<p class="muted">No RSVPs yet.</p>') + '</div>';
  }
  function subCheckin() {
    var e = cur, d0 = e.startsAt, open = canHostCheckin(e);
    var list = rows.filter(function (x) { return x.rsvp !== 'no' || x.checkedInAt; }).filter(function (x) {
      return filter === 'all' || (filter === 'in' ? x.checkedInAt : !x.checkedInAt);
    });
    $('subBody').innerHTML = '<div class="card">' +
      (open ? '' : '<p class="notice">Admins can check people in on the event day and the day after. ' + (Date.now() < d0 ? 'Check-in opens on ' + esc(day(d0)) + '.' : 'Check-in for this event has closed.') + '</p>') +
      '<div class="seg" role="group" aria-label="Show"><button type="button" data-f="all" class="' + (filter === 'all' ? 'on' : '') + '">All</button><button type="button" data-f="waiting" class="' + (filter === 'waiting' ? 'on' : '') + '">Not yet in</button><button type="button" data-f="in" class="' + (filter === 'in' ? 'on' : '') + '">Checked in</button></div>' +
      '<input type="search" class="input" id="ckFind" placeholder="Filter by name" style="margin:10px 0">' +
      '<div id="ckList">' + (list.length ? list.map(function (x) {
        var g = x.checkedInAt ? x.checkedInGuests : x.guests;
        return '<div class="ad-row" data-name="' + esc((x.name || '') + ' ' + (x.email || '')).toLowerCase() + '">' +
          personLine(x, (x.rsvp ? { going: 'Going', maybe: 'Maybe', no: 'Can’t go' }[x.rsvp] : 'No RSVP') + (x.checkedInAt ? ' · ✓ in at ' + esc(fmt(x.checkedInAt, { hour: 'numeric', minute: '2-digit' })) + ' (' + esc({ qr: 'QR', code: 'code', host: 'by admin', online: 'online' }[x.method] || x.method) + ')' : '')) +
          '<span class="ck-act"><span class="stepper sm" aria-label="Guests"><button type="button" class="step" data-gs="-1" data-u="' + esc(x.userId) + '">−</button><b data-gv="' + esc(x.userId) + '">' + (g || 0) + '</b><button type="button" class="step" data-gs="1" data-u="' + esc(x.userId) + '">+</button></span>' +
          (x.checkedInAt ? '<button class="btn btn-ghost btn-sm" data-undo="' + esc(x.userId) + '" type="button">Undo</button>' : '<button class="btn btn-primary btn-sm" data-ck="' + esc(x.userId) + '" type="button"' + (open ? '' : ' disabled') + '>Check in</button>') + '</span></div>';
      }).join('') : '<p class="muted">Nobody in this list.</p>') + '</div>' +
      '<p class="small muted">Guests: people who came with them (− / +). Walk-ins: use “Add a person”.</p></div>';
    $('subBody').querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filter = b.dataset.f; subCheckin(); }; });
    $('ckFind').oninput = function () { var q = this.value.toLowerCase(); $('ckList').querySelectorAll('.ad-row').forEach(function (r) { r.hidden = q && r.dataset.name.indexOf(q) < 0; }); };
    $('subBody').querySelectorAll('[data-gs]').forEach(function (b) {
      b.onclick = function () {
        var v = $('subBody').querySelector('[data-gv="' + CSS.escape(b.dataset.u) + '"]'); v.textContent = Math.max(0, Math.min(20, Number(v.textContent) + Number(b.dataset.gs)));
        var x = rows.filter(function (r) { return r.userId === b.dataset.u; })[0];
        if (x && x.checkedInAt) hostCheckin(b.dataset.u, Number(v.textContent), true);
      };
    });
    $('subBody').querySelectorAll('[data-ck]').forEach(function (b) { b.onclick = function () { hostCheckin(b.dataset.ck, Number($('subBody').querySelector('[data-gv="' + CSS.escape(b.dataset.ck) + '"]').textContent)); }; });
    $('subBody').querySelectorAll('[data-undo]').forEach(function (b) {
      b.onclick = function () { S.api('DELETE', '/api/admin/events/' + encodeURIComponent(cur.id) + '/checkin?user=' + encodeURIComponent(b.dataset.undo)).then(function () { toast('Check-in undone.'); drawEvent(cur.id); }).catch(function (x) { toast(x.message); }); };
    });
  }
  function canHostCheckin(e) {
    var p = parts(e.startsAt).date.split('-').map(Number), d = centerTime(p[0], p[1] - 1, p[2], 0, 0);
    return Date.now() >= d && Date.now() < d + 48 * 3600000;
  }
  function hostCheckin(uid, guests, quiet) {
    S.api('POST', '/api/admin/events/' + encodeURIComponent(cur.id) + '/checkin?user=' + encodeURIComponent(uid), { guests: guests }).then(function () {
      toast(quiet ? 'Guests updated.' : 'Checked in.'); drawEvent(cur.id);
    }).catch(function (x) { toast(x.message, 5000); });
  }
  function subAdd() {
    $('subBody').innerHTML = '<div class="card"><h2>Add a person to this event</h2><p class="small muted">For people who told you they’re coming, or walk-ins. Find someone who’s signed in before, or add them by email. If they sign in later with that email, it all joins their account.</p>' +
      '<input type="search" class="input" id="apFind" placeholder="Search name, email or phone"><div id="apFound"></div>' +
      '<form id="apForm" class="ap-form"><div class="grid2"><div><label class="field" for="apEmail">Email</label><input class="input" id="apEmail" type="email" required></div>' +
      '<div><label class="field" for="apName">Name</label><input class="input" id="apName" required></div>' +
      '<div><label class="field" for="apPhone">Phone <span class="muted">(optional)</span></label><input class="input" id="apPhone" type="tel"></div>' +
      '<div><label class="field" for="apGuests">Guests</label><input class="input" id="apGuests" type="number" min="0" max="20" value="0"></div></div>' +
      '<input type="hidden" id="apUser"><div class="radio-row"><label><input type="radio" name="apSt" value="going" checked> Going</label><label><input type="radio" name="apSt" value="maybe"> Maybe</label>' +
      '<label><input type="checkbox" id="apCk"> Check them in now</label></div>' +
      '<p class="error" id="apErr"></p><button class="btn btn-primary" type="submit">Add to event</button></form></div>';
    var t = null;
    $('apFind').oninput = function () {
      clearTimeout(t); var q = this.value.trim(); if (q.length < 2) { $('apFound').innerHTML = ''; return; }
      t = setTimeout(function () {
        S.api('GET', '/api/admin/users?q=' + encodeURIComponent(q)).then(function (j) {
          $('apFound').innerHTML = (j.users || []).slice(0, 8).map(function (u) {
            return '<button type="button" class="pick" data-u="' + esc(u.userId) + '" data-e="' + esc(u.email || '') + '" data-n="' + esc(u.name || '') + '" data-p="' + esc(u.phone || '') + '"><b>' + esc(u.name || '') + '</b> <span class="muted small">' + esc(u.email || '') + '</span></button>';
          }).join('') || '<p class="small muted">Nobody found. Fill in the form below.</p>';
          $('apFound').querySelectorAll('.pick').forEach(function (b) {
            b.onclick = function () { $('apUser').value = b.dataset.u; $('apEmail').value = b.dataset.e; $('apName').value = b.dataset.n; $('apPhone').value = phone(b.dataset.p); $('apFound').innerHTML = ''; $('apFind').value = ''; };
          });
        }).catch(function () {});
      }, 250);
    };
    ['apEmail', 'apName'].forEach(function (id) { $(id).oninput = function () { $('apUser').value = ''; }; });
    $('apForm').onsubmit = function (ev) {
      ev.preventDefault();
      var body = { status: (app.querySelector('input[name="apSt"]:checked') || {}).value, guests: Number($('apGuests').value) || 0 };
      if ($('apUser').value) body.userId = $('apUser').value; else { body.email = $('apEmail').value.trim(); body.name = $('apName').value.trim(); body.phone = $('apPhone').value.trim() || null; }
      S.api('PUT', '/api/admin/events/' + encodeURIComponent(cur.id) + '/rsvp', body).then(function (j) {
        if (!$('apCk').checked) return j;
        return S.api('POST', '/api/admin/events/' + encodeURIComponent(cur.id) + '/checkin?user=' + encodeURIComponent(j.userId), { guests: body.guests }).then(function () { return j; });
      }).then(function () { toast('Added.'); sub = $('apCk').checked ? 'checkin' : 'rsvps'; drawEvent(cur.id); }).catch(function (x) { $('apErr').textContent = x.message; });
    };
  }
  function subViews() {
    $('subBody').innerHTML = '<div class="card skeleton"></div>';
    S.api('GET', '/api/admin/events/' + encodeURIComponent(cur.id) + '/views').then(function (j) {
      $('subBody').innerHTML = '<div class="card"><p><b>' + n(j.total) + '</b> page views in total. Signed-in people who opened it:</p>' + ((j.viewers || []).length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>First opened</th><th>Last opened</th><th>Times</th><th>RSVP</th></tr></thead><tbody>' +
        j.viewers.map(function (v) {
          return '<tr><td><a href="#person/' + encodeURIComponent(v.userId) + '">' + esc(v.name || v.email) + '</a><br><small class="muted">' + esc(v.email || '') + '</small></td><td>' + esc(when(v.firstAt)) + '</td><td>' + esc(when(v.lastAt)) + '</td><td>' + v.views + '</td><td>' + esc({ going: 'Going', maybe: 'Maybe', no: 'Can’t go' }[v.rsvp] || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">Nobody signed in has opened it yet.</p>') +
        '<p class="small muted">Visitors who aren’t signed in are counted but not named. Opening an invitation email can’t be seen.</p></div>';
    }).catch(function (x) { $('subBody').innerHTML = '<div class="card"><p>' + esc(x.message) + '</p></div>'; });
  }
  function reminderText(e) {
    var place = e.format === 'online' ? 'online (the join link is on the event page once you RSVP)' : (e.venue || 'the Minneapolis Meditation Center') + (e.address ? ', ' + e.address : '') + (e.format === 'hybrid' ? ', or online' : '');
    return { subject: 'Reminder: ' + e.title + ' · ' + fmt(e.startsAt, { weekday: 'short', month: 'short', day: 'numeric' }),
      body: 'Namaste,\n\nA friendly reminder that you signed up for ' + e.title + ' on ' + whenText(e) + ', ' + place + '.\n\nDetails, changes and check-in: ' + eventLink(e) +
        '\n\nWe look forward to meditating with you.\n\nScience of Spirituality Minneapolis Meditation Center\nMinneapolisCenter@sos.org · WhatsApp: https://wa.me/16122164444' };
  }
  function subRemind() {
    var e = cur, t = reminderText(e);
    var list = rows.filter(function (x) { return x.rsvp === 'going' || x.rsvp === 'maybe'; });
    $('subBody').innerHTML = '<div class="grid2 top"><div class="card"><h2>✉️ Email</h2>' +
      '<div class="radio-row"><label><input type="checkbox" class="emWho" value="going" checked> Going (' + list.filter(function (x) { return x.rsvp === 'going'; }).length + ')</label><label><input type="checkbox" class="emWho" value="maybe"> Maybe (' + list.filter(function (x) { return x.rsvp === 'maybe'; }).length + ')</label></div>' +
      '<label class="field" for="emSubj">Subject</label><input class="input" id="emSubj" value="' + esc(t.subject) + '">' +
      '<label class="field" for="emBody">Message</label><textarea class="input" id="emBody" rows="10">' + esc(t.body) + '</textarea>' +
      '<p class="small muted" id="emCount"></p><div class="adm-actions"><button class="btn btn-primary" id="emOpen" type="button">Open in my email app</button><button class="btn btn-ghost" id="emCopy" type="button">Copy addresses</button></div>' +
      '<p class="small muted">Recipients go in Bcc, so nobody sees the others’ addresses. It’s sent from your own email account.</p></div>' +
      '<div class="card"><h2>💬 WhatsApp</h2><p class="small">No automatic sending yet. Copy the message, then send it one by one or to a broadcast list on the center’s phone.</p>' +
      '<div class="wa-preview"><div class="wa-bubble" id="waMsg"></div></div>' +
      '<div class="adm-actions"><button class="btn btn-ghost btn-sm" id="waCopy" type="button">Copy message</button><button class="btn btn-ghost btn-sm" id="waNums" type="button">Copy phone numbers</button></div>' +
      '<div id="waList"></div></div></div>';
    function picked() { var on = []; app.querySelectorAll('.emWho').forEach(function (i) { if (i.checked) on.push(i.value); }); return list.filter(function (x) { return on.indexOf(x.rsvp) >= 0; }); }
    function sync() {
      var p = picked(), emails = p.filter(function (x) { return x.email; });
      $('emCount').textContent = emails.length + (emails.length === 1 ? ' recipient' : ' recipients');
      var msg = '🙏 ' + $('emBody').value.replace(/^Namaste,\n\n/, 'Namaste! ');
      $('waMsg').innerHTML = esc(msg).replace(/\n/g, '<br>');
      var ok = p.filter(function (x) { return x.phone && x.smsOk; });
      $('waList').innerHTML = '<p class="small" style="margin-top:10px"><b>' + ok.length + '</b> of ' + p.length + ' allowed messages and gave a phone number.</p>' + ok.map(function (x) {
        return '<div class="ad-row"><span class="ag-main"><b>' + esc(x.name) + '</b><small>' + esc(phone(x.phone)) + '</small></span><a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + String(x.phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg) + '">Open chat</a></div>';
      }).join('');
      $('waNums').onclick = function () { copy(ok.map(function (x) { return x.phone; }).join('\n'), ok.length + ' numbers copied.'); report('whatsapp_demo', e.id, ok.length + ' numbers'); };
      $('waCopy').onclick = function () { copy(msg, 'Message copied.'); };
    }
    app.querySelectorAll('.emWho').forEach(function (i) { i.onchange = sync; });
    $('emBody').oninput = sync; sync();
    $('emCopy').onclick = function () { var em = picked().map(function (x) { return x.email; }).filter(Boolean); copy(em.join(', '), em.length + ' addresses copied.'); report('copy_emails', e.id, em.length + ' addresses'); };
    $('emOpen').onclick = function () {
      var em = picked().map(function (x) { return x.email; }).filter(Boolean);
      if (!em.length) { toast('Nobody to email.'); return; }
      var href = 'mailto:' + encodeURIComponent(me.email || 'MinneapolisCenter@sos.org') + '?bcc=' + encodeURIComponent(em.join(',')) + '&subject=' + encodeURIComponent($('emSubj').value) + '&body=' + encodeURIComponent($('emBody').value);
      if (href.length > 1900) toast('Long list: if your email app drops addresses, use “Copy addresses” and paste them into Bcc.', 6000);
      report('email_rsvps', e.id, em.length + ' recipients'); location.href = href;
    };
  }

  /* ---------- event form ---------- */
  function eventForm(e) {
    var st = e ? parts(e.startsAt) : null, en = e ? parts(e.endsAt) : null;
    var d0 = new Date(Date.now() + 86400000), defDate = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
    var b = sheet('<h2 class="sheet-title">' + (e ? 'Edit event' : 'New event') + '</h2><form id="ef">' +
      '<label class="field" for="fTitle">Title</label><input class="input" id="fTitle" required maxlength="120" value="' + esc(e ? e.title : '') + '">' +
      '<div class="grid2"><div><label class="field" for="fFormat">Format</label><select class="input" id="fFormat">' + Object.keys(FORMAT).map(function (k) { return '<option value="' + k + '"' + ((e ? e.format : 'in_person') === k ? ' selected' : '') + '>' + FORMAT[k] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="field" for="fKind">Type</label><select class="input" id="fKind">' + T.order.map(function (k) { return '<option value="' + k + '"' + ((e ? e.kind : 'workshop') === k ? ' selected' : '') + '>' + KIND[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grid2"><div><label class="field" for="fAccess">Audience</label><select class="input" id="fAccess">' + Object.keys(ACCESS).map(function (k) { return '<option value="' + k + '"' + ((e ? e.access : 'public') === k ? ' selected' : '') + '>' + ACCESS[k] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="field">&nbsp;</label><label class="check"><input type="checkbox" id="fKids"' + (e && e.children ? ' checked' : '') + '> 👧 Children’s program available</label></div></div>' +
      '<p class="small muted"><b>Public</b>: everyone. <b>Community</b>: people flagged Satsangi, and Initiates. <b>Initiates</b>: initiates only. Without a children’s program, the event page asks parents to keep children with them. Workshops and satsangs count toward each person’s stage.</p>' +
      '<div class="grid3"><div><label class="field" for="fDate">Date <span class="muted" id="fDateHint"></span></label><input class="input" id="fDate" type="date" required value="' + (st ? st.date : defDate) + '"></div>' +
      '<div><label class="field" for="fStart">Starts</label><input class="input" id="fStart" type="time" required value="' + (st ? st.time : '18:00') + '"></div>' +
      '<div><label class="field" for="fEnd">Ends</label><input class="input" id="fEnd" type="time" required value="' + (en ? en.time : '19:30') + '"></div></div>' +
      '<p class="small muted">Times are Minneapolis time.</p>' +
      '<div id="fPlace"><div class="grid2"><div><label class="field" for="fVenue">Place</label><input class="input" id="fVenue" value="' + esc(e ? e.venue || '' : 'Minneapolis Meditation Center') + '"></div>' +
      '<div><label class="field" for="fAddr">Address</label><input class="input" id="fAddr" value="' + esc(e ? e.address || '' : '4054 Van Buren St NE, Columbia Heights, MN 55421') + '"></div></div></div>' +
      '<div id="fOnline"><label class="field" for="fUrl">Online link (Zoom, Meet…)</label><input class="input" id="fUrl" type="url" placeholder="https://" value="' + esc(e ? e.onlineUrl || '' : '') + '"><p class="small muted">Shown only to signed-in people.</p></div>' +
      '<label class="field" for="fDesc">Description</label><textarea class="input" id="fDesc" rows="5" maxlength="4000">' + esc(e ? e.description || '' : '') + '</textarea>' +
      '<label class="field" for="fFlyer">Flyer image <span class="muted">(optional, JPG or PNG)</span></label><input class="input" id="fFlyer" type="file" accept="image/jpeg,image/png">' +
      '<div id="fFlyerPrev"' + (e && e.flyerId ? '' : ' hidden') + '><img id="fFlyerImg" alt="" src="' + (e && e.flyerId ? esc(S.CFG.apiBase + '/api/flyers/' + encodeURIComponent(e.flyerId) + '?size=thumb') : '') + '"><button type="button" class="btn btn-ghost btn-sm" id="fFlyerRm">Remove flyer</button></div>' +
      (e ? '' : '<label class="field" for="fRepeat">Repeats</label><select class="input" id="fRepeat"><option value="">Does not repeat</option><option value="weekly">Every week</option><option value="biweekly">Every other week</option><option value="monthly">Monthly (same weekday)</option></select>' +
        '<div id="fRepeatMore" hidden><label class="field" for="fUntil">Until</label><input class="input" id="fUntil" type="date"><p class="small" id="fRepSum"></p><div class="chips" id="fDates"></div></div>') +
      (e && e.seriesId ? '<label class="field">Apply changes to</label><div class="radio-row"><label><input type="radio" name="fScope" value="this" checked> This date</label><label><input type="radio" name="fScope" value="future"> This and later</label><label><input type="radio" name="fScope" value="all"> All dates</label></div>' : '') +
      '<p class="error" id="fErr"></p><div class="actions"><button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" type="submit">' + (e ? 'Save' : 'Create') + '</button></div></form>');
    function syncFormat() { var f = $('fFormat').value; $('fPlace').hidden = f === 'online'; $('fOnline').hidden = f === 'in_person'; }
    $('fFormat').onchange = syncFormat; syncFormat();
    var flyer = null, flyerRemove = false, skipped = {};
    $('fFlyer').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      $('fErr').textContent = 'Preparing image…';
      prepareFlyer(f).then(function (p) { flyer = p; flyerRemove = false; $('fFlyerImg').src = 'data:image/jpeg;base64,' + p.thumbData; $('fFlyerPrev').hidden = false; $('fErr').textContent = ''; },
        function (x) { $('fErr').textContent = x.message; });
    };
    $('fFlyerRm').onclick = function () { flyer = null; flyerRemove = true; $('fFlyer').value = ''; $('fFlyerPrev').hidden = true; };
    function ymd(s) { var p = s.split('-').map(Number); return { y: p[0], m: p[1] - 1, d: p[2] }; }
    function addDays(o, k) { var t = new Date(Date.UTC(o.y, o.m, o.d + k)); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
    function key(o) { return o.y + '-' + String(o.m + 1).padStart(2, '0') + '-' + String(o.d).padStart(2, '0'); }
    function dow(o) { return new Date(Date.UTC(o.y, o.m, o.d)).getUTCDay(); }
    function dates() {
      var freq = $('fRepeat') && $('fRepeat').value; if (!freq || !$('fUntil').value || !$('fDate').value) return [];
      var first = ymd($('fDate').value), until = key(ymd($('fUntil').value)), out = [];
      if (freq === 'monthly') {
        var wd = dow(first), nth = Math.floor((first.d - 1) / 7), last = addDays(first, 7).m !== first.m;
        for (var i = 0; out.length < 120 && i < 60; i++) {
          var m = first.m + i, y = first.y + Math.floor(m / 12); m = ((m % 12) + 12) % 12;
          var d;
          if (last) { var ld = new Date(Date.UTC(y, m + 1, 0)); while (ld.getUTCDay() !== wd) ld.setUTCDate(ld.getUTCDate() - 1); d = { y: y, m: m, d: ld.getUTCDate() }; }
          else { var fd = new Date(Date.UTC(y, m, 1)); while (fd.getUTCDay() !== wd) fd.setUTCDate(fd.getUTCDate() + 1); fd.setUTCDate(fd.getUTCDate() + 7 * nth); if (fd.getUTCMonth() !== m) continue; d = { y: y, m: m, d: fd.getUTCDate() }; }
          if (key(d) > until) break; out.push(d);
        }
      } else for (var o = first; key(o) <= until && out.length < 120; o = addDays(o, freq === 'weekly' ? 7 : 14)) out.push(o);
      return out;
    }
    function syncRepeat() {
      if (!$('fRepeat')) return;
      var on = !!$('fRepeat').value; $('fRepeatMore').hidden = !on; $('fDateHint').textContent = on ? '(first)' : '';
      if (!on) return;
      if (!$('fUntil').value) { var u = addDays(ymd($('fDate').value), 7 * 12); $('fUntil').value = key(u); }
      var ds = dates(), count = ds.filter(function (d) { return !skipped[key(d)]; }).length;
      $('fRepSum').textContent = count + (count === 1 ? ' event' : ' events') + '. Tap a date to skip it.';
      $('fDates').innerHTML = ds.map(function (d) { var k = key(d); return '<button type="button" class="chip' + (skipped[k] ? '' : ' on') + '" data-k="' + k + '">' + esc(new Date(Date.UTC(d.y, d.m, d.d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</button>'; }).join('');
    }
    if ($('fRepeat')) {
      $('fRepeat').onchange = syncRepeat; $('fUntil').onchange = syncRepeat; $('fDate').onchange = syncRepeat;
      $('fDates').onclick = function (ev) { var c = ev.target.closest('[data-k]'); if (c) { skipped[c.dataset.k] = !skipped[c.dataset.k]; syncRepeat(); } };
    }
    $('ef').onsubmit = function (ev) {
      ev.preventDefault();
      var d = ymd($('fDate').value), s = $('fStart').value.split(':').map(Number), z = $('fEnd').value.split(':').map(Number);
      var startsAt = centerTime(d.y, d.m, d.d, s[0], s[1]), endsAt = centerTime(d.y, d.m, d.d, z[0], z[1]);
      if (endsAt <= startsAt) endsAt += 86400000;
      var f = $('fFormat').value;
      var payload = { title: $('fTitle').value, format: f, access: $('fAccess').value, kind: $('fKind').value, children: $('fKids').checked, startsAt: startsAt, endsAt: endsAt, timezone: TZ,
        venue: f === 'online' ? '' : $('fVenue').value, address: f === 'online' ? '' : $('fAddr').value, onlineUrl: f === 'in_person' ? '' : $('fUrl').value, description: $('fDesc').value };
      var freq = !e && $('fRepeat') && $('fRepeat').value;
      if (freq) {
        var dur = endsAt - startsAt;
        payload.repeat = { freq: freq };
        payload.occurrences = dates().filter(function (o) { return !skipped[key(o)]; }).map(function (o) { var t = centerTime(o.y, o.m, o.d, s[0], s[1]); return { startsAt: t, endsAt: t + dur }; });
        if (!payload.occurrences.length) { $('fErr').textContent = 'Every date is skipped.'; return; }
        payload.startsAt = payload.occurrences[0].startsAt; payload.endsAt = payload.occurrences[0].endsAt;
      }
      var scopeEl = b.querySelector('input[name="fScope"]:checked'), scope = scopeEl && scopeEl.value !== 'this' ? '?scope=' + scopeEl.value : '';
      $('fErr').textContent = flyer ? 'Uploading flyer…' : 'Saving…';
      var up = flyer ? S.api('POST', '/api/admin/flyers', { mime: 'image/jpeg', full: flyer.full, thumb: flyer.thumb }).then(function (j) { return j.flyerId; }) : Promise.resolve(null);
      up.then(function (flyerId) {
        if (!e) { if (flyerId) payload.flyerId = flyerId; return S.api('POST', '/api/admin/events', payload); }
        return S.api('PATCH', '/api/admin/events/' + encodeURIComponent(e.id) + scope, payload).then(function (j) {
          var fl = flyerId ? S.api('PUT', '/api/admin/events/' + encodeURIComponent(e.id) + '/flyer' + scope, { flyerId: flyerId })
            : flyerRemove && e.flyerId ? S.api('DELETE', '/api/admin/events/' + encodeURIComponent(e.id) + '/flyer' + scope) : Promise.resolve();
          return fl.then(function () { return j; });
        });
      }).then(function (j) {
        closeSheet();
        toast(e ? 'Saved.' : (j.count > 1 ? j.count + ' events created.' : 'Event created.'));
        location.hash = '#event/' + encodeURIComponent((j.event && j.event.id) || e.id);
        if (e) drawEvent(e.id);
      }).catch(function (x) { $('fErr').textContent = x.message; });
    };
  }
  function prepareFlyer(file) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('That image is too large (over 25 MB).'));
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That file isn’t an image this browser can read. Use JPG or PNG.')); };
      img.src = url;
    }).then(function (img) {
      function scaled(max, q) {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', q).split(',')[1];
      }
      var full = scaled(1600, 0.82); if (full.length > 1100000) full = scaled(1200, 0.72);
      var thumb = scaled(320, 0.8);
      var b64u = function (s) { return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
      return { full: b64u(full), thumb: b64u(thumb), thumbData: thumb };
    });
  }

  /* =====================================================================
   * Invite
   * ===================================================================== */
  function drawInvite() {
    loading();
    S.api('GET', '/api/events?from=' + Date.now() + '&to=' + (Date.now() + 120 * 86400000)).then(function (j) {
      var list = (j.events || []).filter(function (e) { return e.status !== 'cancelled' && e.access === 'public'; });
      app.innerHTML = '<div class="sec-head page-head"><h1>Invite</h1></div><div class="grid2 top"><div class="card">' +
        '<p class="small">Invite seekers to sosmn.org, to a specific event, and optionally to Meditation Copilot. Invitation links open sosmn.org directly, even from outside Minnesota.</p>' +
        '<label class="field" for="ivEvent">Event <span class="muted">(optional)</span></label><select class="input" id="ivEvent"><option value="">No specific event: the events home page</option>' +
          list.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(fmt(e.startsAt, { month: 'short', day: 'numeric' }) + ' · ' + e.title) + '</option>'; }).join('') + '</select>' +
        '<label class="check"><input type="checkbox" id="ivCopilot"> Also invite them to try Meditation Copilot (prototype)</label>' +
        '<label class="field" for="ivNote">Personal note <span class="muted">(optional)</span></label><textarea class="input" id="ivNote" rows="2" placeholder="It was lovely to meet you at…"></textarea>' +
        '<label class="field" for="ivTo">Email addresses</label><textarea class="input" id="ivTo" rows="3" placeholder="one@example.com, two@example.com"></textarea><p class="small muted" id="ivCount"></p>' +
        '<label class="field" for="ivSubj">Subject</label><input class="input" id="ivSubj">' +
        '<label class="field" for="ivBody">Message</label><textarea class="input" id="ivBody" rows="11"></textarea>' +
        '<div class="adm-actions"><button class="btn btn-primary" id="ivEmail" type="button">Open in my email app</button><button class="btn btn-ghost" id="ivCopy" type="button">Copy message (WhatsApp, text)</button></div>' +
        '<p class="small muted">Addresses go in Bcc and the email is sent from your own account. Only invite people who are happy to hear from the center.</p></div>' +
        '<div class="card"><h2>Preview</h2><div class="wa-preview"><div class="wa-bubble" id="ivPrev"></div></div></div></div>';
      var byId = {}; list.forEach(function (e) { byId[e.id] = e; });
      var touched = false;
      function build() {
        var e = byId[$('ivEvent').value], cp = $('ivCopilot').checked, note = $('ivNote').value.trim();
        var link = e ? eventLink(e, '&ref=invite') : SITE + '/?ref=invite';
        var subj = e ? 'Invitation: ' + e.title + ' · ' + fmt(e.startsAt, { weekday: 'short', month: 'short', day: 'numeric' }) : 'An invitation to meditate with us in Minneapolis';
        var bodyTxt = 'Namaste,\n\n' + (note ? note + '\n\n' : '') +
          (e ? 'You’re warmly invited to ' + e.title + ' on ' + whenText(e) + (e.format !== 'online' ? ' at ' + (e.venue || 'the Minneapolis Meditation Center') : ' (online)') + '. It’s free and open to all.\n\nDetails and RSVP: ' + link
            : 'You’re warmly invited to the free meditation programs at the Science of Spirituality Minneapolis Meditation Center in Columbia Heights.\n\nSee upcoming events and RSVP: ' + link) +
          (cp ? '\n\nTo build a daily practice at home, you’re also welcome to try Meditation Copilot, a prototype app our volunteers are testing (not officially approved): ' + COPILOT : '') +
          '\n\nWith warm regards,\nScience of Spirituality Minneapolis Meditation Center\nMinneapolisCenter@sos.org · WhatsApp: https://wa.me/16122164444';
        if (!touched) { $('ivSubj').value = subj; $('ivBody').value = bodyTxt; }
        $('ivPrev').innerHTML = esc($('ivBody').value).replace(/\n/g, '<br>');
        var to = emails(); $('ivCount').textContent = to.length + (to.length === 1 ? ' address' : ' addresses');
      }
      function emails() { return ($('ivTo').value.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) || []).filter(function (x, i, a) { return a.indexOf(x) === i; }); }
      ['ivEvent', 'ivCopilot', 'ivNote'].forEach(function (id) { $(id).oninput = $(id).onchange = function () { touched = false; build(); }; });
      $('ivTo').oninput = build;
      $('ivBody').oninput = $('ivSubj').oninput = function () { touched = true; build(); };
      build();
      $('ivEmail').onclick = function () {
        var to = emails(); if (!to.length) { toast('Add at least one email address.'); return; }
        var href = 'mailto:' + encodeURIComponent(me.email || 'MinneapolisCenter@sos.org') + '?bcc=' + encodeURIComponent(to.join(',')) + '&subject=' + encodeURIComponent($('ivSubj').value) + '&body=' + encodeURIComponent($('ivBody').value);
        report('invite_email', $('ivEvent').value || 'site', to.length + ' addresses' + ($('ivCopilot').checked ? ' + Copilot' : ''));
        location.href = href;
      };
      $('ivCopy').onclick = function () { copy($('ivBody').value, 'Invitation copied. Paste it into WhatsApp or a text.'); report('invite_copy', $('ivEvent').value || 'site', $('ivCopilot').checked ? 'with Copilot' : ''); };
    }).catch(fail);
  }

  /* =====================================================================
   * People
   * ===================================================================== */
  var pq = '';
  function drawPeople() {
    app.innerHTML = '<div class="sec-head page-head"><h1>People</h1></div><div class="card"><input type="search" class="input" id="pFind" placeholder="Search by name, email or phone" value="' + esc(pq) + '" autocomplete="off"><div id="pList" style="margin-top:10px"></div></div>';
    var t = null;
    $('pFind').oninput = function () { clearTimeout(t); t = setTimeout(function () { pq = $('pFind').value.trim(); search(); }, 250); };
    search(); $('pFind').focus();
  }
  function search() {
    S.api('GET', '/api/admin/users?q=' + encodeURIComponent(pq)).then(function (j) {
      var u = j.users || [];
      $('pList').innerHTML = u.length ? u.map(function (x) {
        return '<a class="ad-row link-row" href="#person/' + encodeURIComponent(x.userId) + '"><span class="ag-main"><b>' + esc(x.name || '(no name)') + '</b> <span class="tag">' + esc(CATEGORY[x.category] || 'Seeker') + '</span>' +
          (x.blockedAt ? ' <span class="tag cx">Blocked</span>' : '') + '<small>' + esc(x.email || '') + ' · ' + x.visits + (x.visits === 1 ? ' check-in' : ' check-ins') + ' · last seen ' + esc(day(x.lastSeenAt)) + '</small></span><span class="muted">›</span></a>';
      }).join('') + (u.length >= 30 ? '<p class="small muted">Showing the first 30. Type more to narrow down.</p>' : '') : '<p class="muted">Nobody found.</p>';
    }).catch(function (x) { $('pList').innerHTML = '<p>' + esc(x.message) + '</p>'; });
  }
  /* =====================================================================
   * Seeker Relationship Management (admins only) — see SOSMN-SRM.md
   * ===================================================================== */
  function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'friend'; }
  function lvTag(lv) { return '<span class="tag lv lv-' + esc(lv) + '">' + esc(LEVEL[lv] || lv) + '</span>'; }
  function ago(ms) { if (!ms) return '—'; var d = Math.round((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? d + ' days ago' : Math.round(d / 30) + ' months ago'; }
  var SIGN = '\n\nWarm regards,\nScience of Spirituality Minneapolis Meditation Center\n';
  // Ready-to-send messages: the admin always reads and edits them in their own email or WhatsApp before sending
  function message(it) {
    var nm = first(it.name), ev = it.eventTitle || 'our program', up = SITE + '/';
    switch (it.kind) {
      case 'first_visit': return { subject: 'Thank you for coming to ' + ev, body: 'Hi ' + nm + ',\n\nThank you for joining us at ' + ev + '. It was lovely to have you at the center.\n\nIf you would like to go a little deeper, our weekly workshops are a good next step. You can see what’s coming up here: ' + up + '\n\nPlease feel free to reply with any questions about meditation.' + SIGN };
      case 'no_show': return { subject: 'We missed you at ' + ev, body: 'Hi ' + nm + ',\n\nWe missed you at ' + ev + ', and hope all is well. Here is what’s coming up next: ' + up + '\n\nHope to see you soon.' + SIGN };
      case 'drifting': return { subject: 'We’ve missed you at the center', body: 'Hi ' + nm + ',\n\nWe haven’t seen you at the center for a while and wanted to say hello. Here is what’s coming up: ' + up + '\n\nIf anything would make it easier to join us, or if you have questions about your meditation, just reply.' + SIGN };
      case 'orientation': return { subject: 'Congratulations, and a next step', body: 'Hi ' + nm + ',\n\nCongratulations on completing your workshops and challenges. It has been wonderful to see you at the center so regularly.\n\nYou may enjoy our regular satsangs (group meditation and talks) as a next step: ' + up + '\n\nPlease reply if you have any questions.' + SIGN };
      case 'satsangi': return { subject: 'Thank you for being part of our satsangs', body: 'Hi ' + nm + ',\n\nIt is wonderful to see you at satsang so regularly. We would love to keep you informed about community programs, seva at the center, and upcoming programs with Sant Rajinder Singh Ji Maharaj.' + SIGN };
      default: return null;
    }
  }
  var FU = { first_visit: ['First visit', 'Say thank you'], no_show: ['Said Going, didn’t come', 'Sorry we missed you'],
    orientation: ['Orientation done', '5+ workshops and 2 challenges: congratulate, suggest satsang'], satsangi: ['Ready to be Satsangi?', 'Comes to satsang regularly (6+ in 3 months). Flag them on their page if right'],
    mentor: ['No mentor yet', 'Comes regularly; pair them with a mentor'], drifting: ['Drifted', 'Came often, not seen in 60+ days (Passive and Declined people are left out)'] };

  function drawFollowups() {
    loading();
    S.api('GET', '/api/admin/followups').then(function (j) {
      var items = j.items || [];
      var groups = Object.keys(FU).map(function (k) {
        var list = items.filter(function (x) { return x.kind === k; }); if (!list.length) return '';
        return '<div class="card"><div class="sec-head"><h2>' + esc(FU[k][0]) + ' <span class="count">' + list.length + '</span></h2><span class="small muted">' + esc(FU[k][1]) + '</span></div>' + list.map(function (it, i) {
          var m = message(it), digits = String(it.phone || '').replace(/\D/g, ''); if (digits.length === 10) digits = '1' + digits;
          var detail = it.kind === 'first_visit' ? 'Came to ' + esc(it.eventTitle) + ' · ' + esc(day(it.at)) : it.kind === 'no_show' ? 'Said Going to ' + esc(it.eventTitle) + ' · ' + esc(day(it.at))
            : it.kind === 'orientation' ? it.workshops + ' workshops · ' + it.challenges + ' challenges' : it.kind === 'satsangi' ? it.satsangs90 + ' satsangs in 3 months'
            : it.visits + ' visits · last ' + esc(ago(it.lastVisitAt));
          return '<div class="ad-row fu-row" data-i="' + items.indexOf(it) + '"><span class="ag-main"><a href="#person/' + encodeURIComponent(it.userId) + '"><b>' + esc(it.name || '(no name)') + '</b></a> ' + lvTag(it.level) +
            '<small>' + detail + (it.mentorName ? ' · mentor ' + esc(it.mentorName) : '') + '</small></span><span class="fu-acts">' +
            (m && it.email ? '<a class="btn btn-ghost btn-sm" data-act="mail" href="mailto:' + esc(it.email) + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body) + '">✉ Email</a>' : '') +
            (m && digits ? '<a class="btn btn-ghost btn-sm" data-act="wa" target="_blank" rel="noopener" href="https://wa.me/' + digits + '?text=' + encodeURIComponent(m.body) + '">WhatsApp</a>' : '') +
            (m ? '<button class="btn btn-ghost btn-sm" type="button" data-act="copy">Copy</button>' : '') + (it.kind === 'mentor' || it.kind === 'satsangi' ? '<a class="btn btn-ghost btn-sm" href="#person/' + encodeURIComponent(it.userId) + '">' + (it.kind === 'mentor' ? 'Assign mentor ›' : 'Open their page ›') + '</a>' : '') +
            '<button class="btn btn-soft btn-sm" type="button" data-act="done">✓ Done</button><button class="btn btn-ghost btn-sm" type="button" data-act="skip" title="Not needed">Skip</button></span></div>';
        }).join('') + '</div>';
      }).join('');
      app.innerHTML = '<div class="sec-head page-head"><h1>Follow-ups</h1><span class="small muted">Admins only</span></div>' +
        '<p class="small muted page-intro">People to reach out to, worked out from what they did. Messages open in your own email or WhatsApp so you can make them personal before sending. Mark each one done (or skip it) and it drops off.</p>' +
        (groups || '<div class="card"><p class="muted">Nothing to follow up right now. 🙏</p></div>');
      app.querySelectorAll('.fu-row').forEach(function (row) {
        var it = items[Number(row.dataset.i)];
        var mark = function (st) { S.api('POST', '/api/admin/followups', { userId: it.userId, kind: it.kind, ref: it.ref, status: st }).then(function () {
          row.classList.add('gone'); toast(st === 'done' ? 'Marked done.' : 'Skipped.'); setTimeout(drawFollowups, 500); }).catch(function (x) { toast(x.message); }); };
        row.querySelectorAll('[data-act]').forEach(function (b) {
          b.addEventListener('click', function () {
            var act = b.dataset.act, m = message(it);
            if (act === 'copy') copy(m.body, 'Message copied.');
            if (act === 'done') mark('done');
            if (act === 'skip') mark('skipped');
          });
        });
      });
    }).catch(fail);
  }

  var jFilter = { level: '', status: '', sevadar: false, nomentor: false, q: '' };
  function drawJourney(lv) {
    if (lv !== undefined && lv !== '') jFilter.level = lv === 'all' ? '' : lv;
    loading();
    var qs = '?stage=' + encodeURIComponent(jFilter.level) + '&status=' + encodeURIComponent(jFilter.status) + (jFilter.sevadar ? '&sevadar=1' : '') + (jFilter.nomentor ? '&nomentor=1' : '') + (jFilter.q ? '&q=' + encodeURIComponent(jFilter.q) : '');
    S.api('GET', '/api/admin/journey' + qs).then(function (j) {
      var c = j.counts || {}, sc = j.statusCounts || {}, list = j.people || [];
      var lvTile = function (k) { return '<button type="button" class="kpi kpi-btn' + (jFilter.level === k ? ' on' : '') + '" data-lv="' + k + '"><small>' + esc(LEVEL[k]) + '</small><b>' + n(c[k]) + '</b><span>' + esc(LEVEL_HINT[k]) + '</span></button>'; };
      var stTile = function (k) { return '<button type="button" class="kpi kpi-btn st-' + k + (jFilter.status === k ? ' on' : '') + '" data-st="' + k + '"><small>' + esc(STATUS[k][0]) + '</small><b>' + n(sc[k]) + '</b><span>' + esc(STATUS[k][1]) + '</span></button>'; };
      app.innerHTML = '<div class="sec-head page-head"><h1>People’s journey</h1><span class="small muted">Admins only</span></div>' +
        '<div class="card"><h2 class="h-sm">Stage</h2><div class="kpi-grid kpi-5">' + Object.keys(LEVEL).map(lvTile).join('') + '</div>' +
        '<h2 class="h-sm" style="margin-top:14px">Status</h2><div class="kpi-grid kpi-5">' + Object.keys(STATUS).map(stTile).join('') + '</div>' +
        '<div class="kpi-grid" style="margin-top:12px">' + tile('First visits this month', n(j.firstVisitsThisMonth)) + tile('No mentor yet', n(j.noMentor), 'coming regularly') + tile('Sevadars', n(j.sevadars)) + tile('Everyone', n(j.total)) + '</div>' +
        '<details class="how"><summary>How stages and status are worked out</summary><ul class="small">' +
          '<li><b>Potential</b>: we have their details but they haven’t signed up for an event. <b>New</b>: signed up for an event, hasn’t come yet. <b>Seeker</b>: has come at least once; orientation = 5 workshops and 2 challenges (shared from Copilot or ticked here).</li>' +
          '<li><b>Satsangi</b>: set by an admin on the person’s page (Follow-ups suggests people with 6+ satsangs in 3 months); they see <b>Community</b> events. <b>Initiate</b>: permanent.</li>' +
          '<li>Stages only move up. <b>Status</b> follows the last visit: Active (60 days), Drifted (12 months), Dropped (longer). <b>Passive</b> is set by an admin with a reason; <b>Declined</b> means they asked for no messages (they chose it in their details, or an admin set it).</li></ul></details></div>' +
        '<div class="card"><div class="filters"><input type="search" class="input" id="jq" placeholder="Search name, email or ZIP" value="' + esc(jFilter.q) + '">' +
          '<label class="chk"><input type="checkbox" id="jSv"' + (jFilter.sevadar ? ' checked' : '') + '> Sevadars</label><label class="chk"><input type="checkbox" id="jNm"' + (jFilter.nomentor ? ' checked' : '') + '> No mentor</label>' +
          (jFilter.level || jFilter.status ? '<button class="btn btn-ghost btn-sm" id="jAll" type="button">Show everyone</button>' : '') + '</div>' +
          (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Stage · Status</th><th>Visits</th><th>Workshops · Satsangs</th><th>Last visit</th><th>Mentor</th></tr></thead><tbody>' + list.map(function (r) {
            return '<tr><td><a href="#person/' + encodeURIComponent(r.userId) + '"><b>' + esc(r.name || '(no name)') + '</b></a>' + (r.sevadar ? ' <span class="tag gold" title="Sevadar">Sevadar</span>' : '') + '<br><small class="muted">' + esc(r.email || '') + (r.zip ? ' · ' + esc(r.zip) : '') + '</small></td>' +
              '<td>' + lvTag(r.level) + (r.override ? ' <small class="muted" title="Set by hand">✎</small>' : '') + ' ' + stTag(r.status) + '</td>' +
              '<td>' + n(r.visits) + (r.guestsBrought ? '<br><small class="muted">+' + r.guestsBrought + ' guests</small>' : '') + '</td><td>' + n(r.workshops) + ' · ' + n(r.satsangs) + '</td><td>' + esc(r.lastVisitAt ? day(r.lastVisitAt) : '—') + '</td><td>' + esc(r.mentorName || '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' + (list.length >= 500 ? '<p class="small muted">Showing 500. Search or filter to narrow down.</p>' : '') : '<p class="muted">Nobody here.</p>') + '</div>';
      app.querySelectorAll('[data-lv]').forEach(function (b) { b.onclick = function () { jFilter.level = jFilter.level === b.dataset.lv ? '' : b.dataset.lv; drawJourney(); }; });
      app.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { jFilter.status = jFilter.status === b.dataset.st ? '' : b.dataset.st; drawJourney(); }; });
      var t; $('jq').oninput = function () { clearTimeout(t); t = setTimeout(function () { jFilter.q = $('jq').value.trim(); drawJourney(); }, 350); };
      $('jSv').onchange = function () { jFilter.sevadar = this.checked; drawJourney(); };
      $('jNm').onchange = function () { jFilter.nomentor = this.checked; drawJourney(); };
      if ($('jAll')) $('jAll').onclick = function () { jFilter.level = ''; jFilter.status = ''; drawJourney(); };
      if (jFilter.q) { var q = $('jq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }).catch(fail);
  }

  function nextSteps(J) {
    var ms = {}; (J.milestones || []).forEach(function (k) { ms[k] = true; });
    var ck = function (ok, txt) { return '<li class="' + (ok ? 'ok' : '') + '">' + (ok ? '✓ ' : '○ ') + txt + '</li>'; };
    var O = J.orientation || { workshops: 5, challenges: 2 };
    switch (J.level) {
      case 'potential': return ck(false, 'Sign up for a Public Intro');
      case 'new': return ck(J.visits > 0, 'First visit to the center');
      case 'seeker': return ck(J.workshops >= O.workshops, 'Orientation workshops: ' + J.workshops + ' of ' + O.workshops) + ck(J.challenges >= O.challenges, 'Challenges finished: ' + J.challenges + ' of ' + O.challenges + ' <small class="muted">(shared from Copilot, or ticked below)</small>') +
        ck(ms.questions_clear, MILESTONE.questions_clear) + ck(J.satsangs90 >= 6, 'Satsangs in the last 3 months: ' + J.satsangs90 + ' (regular attendance → Satsangi)');
      case 'satsangi': return ck(J.satsangs90 >= 6, 'Satsangs in the last 3 months: ' + J.satsangs90) + ck(ms.met_master, MILESTONE.met_master) + ck(J.darshans + J.retreats > 0, 'Darshan or retreat attended');
      default: return ck(J.satsangs90 > 0, 'Satsang in the last 3 months') + ck(J.sevadar, 'Sevadar: helps run the center') + ck(false, 'Steady progress in meditation time and quality (shared only through their Roadmap report)');
    }
  }
  var TL = { joined: 'Signed up', viewed: 'Opened', rsvp: 'RSVP', checkin: 'Came to', milestone: 'Milestone', challenge: 'Finished a challenge' };
  function drawPerson(uid) {
    loading();
    Promise.all([S.api('GET', '/api/admin/users/' + encodeURIComponent(uid)), S.api('GET', '/api/admin/users/' + encodeURIComponent(uid) + '/journey')]).then(function (r) {
      var p = r[0].person, J = r[1].journey, notes = r[1].notes || [], tl = r[1].timeline || [], digits = String(p.phone || '').replace(/\D/g, '');
      var auto = J.computed === 'satsangi' || J.computed === 'initiate' ? null : J.computed;
      var lvOpts = Object.keys(LEVEL).map(function (k) { var sel = J.override ? J.override === k : J.level === k;
        return '<option value="' + k + '"' + (sel ? ' selected' : '') + '>' + esc(LEVEL[k]) + (k === auto && !J.override ? ' (automatic)' : '') + '</option>'; }).join('');
      app.innerHTML = '<p class="crumbs"><a href="#journey">‹ Journey</a> · <a href="#people">People</a></p><div class="grid2 top"><div>' +
        '<div class="card"><h1 class="h-person">' + esc(p.name || '(no name)') + ' ' + lvTag(J.level) + ' ' + stTag(J.status) + (J.sevadar ? ' <span class="tag gold">Sevadar</span>' : '') + '</h1>' +
        (J.providerName ? '<p class="small muted" style="margin-top:-6px">Name from sign-in: ' + esc(J.providerName) + '</p>' : '') +
        (J.declined ? '<p class="small notice warn">Asked for <b>no messages</b> from the center. Don’t send announcements or reminders.</p>' : '') +
        '<div class="kv"><span>Email</span><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' +
        '<span>ZIP code</span><span>' + esc(J.zip || '—') + '</span>' +
        '<span>Phone</span><span>' + (p.phone ? '<a href="tel:' + esc(p.phone) + '">' + esc(phone(p.phone)) + '</a>' + (p.smsOk ? ' · <a href="https://wa.me/' + digits + '" target="_blank" rel="noopener">WhatsApp</a> <small class="muted">(allowed messages)</small>' : ' <small class="muted">(no messages)</small>') : '—') + '</span>' +

        '<span>Account</span><span>' + esc({ google: 'Google', microsoft: 'Microsoft', manual: 'Added by an admin (not signed in yet)' }[p.provider] || p.provider) + '</span>' +
        '<span>Joined</span><span>' + esc(day(p.createdAt)) + '</span><span>Last seen</span><span>' + esc(when(p.lastSeenAt)) + '</span>' +
        '<span>Copilot points</span><span>' + (p.points == null ? '—' : n(p.points) + (p.pointsLevel ? ' · ' + esc(p.pointsLevel) : '')) + '</span></div>' +
        '<div class="adm-actions"><button class="btn btn-ghost btn-sm' + (p.blockedAt ? '' : ' danger') + '" id="pBlock" type="button">' + (p.blockedAt ? 'Unblock' : 'Block from events') + '</button></div>' +
        (p.blockedAt ? '<p class="small notice warn">Blocked ' + esc(day(p.blockedAt)) + (p.blockReason ? ': ' + esc(p.blockReason) : '') + '</p>' : '') + '</div>' +
        '<div class="card"><h2>Journey</h2><p class="small muted">' + esc(LEVEL_HINT[J.level]) + (J.status ? ' · ' + esc(STATUS[J.status][0]) + ': ' + esc(STATUS[J.status][1]) : '') + (J.passiveReason ? ' (' + esc(J.passiveReason) + ')' : '') + '</p>' +
          '<div class="kpi-grid kpi-4">' + tile('Visits', n(J.visits), J.guestsBrought ? '+' + J.guestsBrought + ' guests brought' : '') + tile('Workshops', n(J.workshops), J.workshops90 + ' in 3 months') + tile('Satsangs', n(J.satsangs), J.satsangs90 + ' in 3 months') + tile('Last visit', J.lastVisitAt ? esc(ago(J.lastVisitAt)) : '—', J.firstVisitAt ? 'first ' + esc(day(J.firstVisitAt)) : '') + '</div>' +
          '<h3>Next steps</h3><ul class="steps">' + nextSteps(J) + '</ul>' +
          '<h3>Milestones <small class="muted">(ticked by an admin)</small></h3>' + Object.keys(MILESTONE).map(function (k) { return '<label class="chk block"><input type="checkbox" data-ms="' + k + '"' + (J.milestones.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(MILESTONE[k]) + '</label>'; }).join('') +
          '<div class="grid2" style="margin-top:12px"><div><label class="field" for="pLv">Stage</label><select class="input" id="pLv">' + lvOpts + '</select></div>' +
          '<div><label class="field">Mentor</label><div id="pMentor">' + (J.mentorId ? '<a href="#person/' + encodeURIComponent(J.mentorId) + '">' + esc(J.mentorName || 'Mentor') + '</a> <button class="btn btn-ghost btn-sm" id="mClear" type="button">Change</button>' : '<button class="btn btn-soft btn-sm" id="mPick" type="button">Assign a mentor</button>') + '</div></div></div>' +
          '<div class="flags"><label class="chk block"><input type="checkbox" id="pSev"' + (J.sevadar ? ' checked' : '') + '> <b>Sevadar</b>: contributes to running the center</label>' +
          '<label class="chk block"><input type="checkbox" id="pPas"' + (J.status === 'passive' ? ' checked' : '') + (J.declined ? ' disabled' : '') + '> <b>Passive</b>: away for a known reason, staying gently in touch (left out of “Drifted” follow-ups)</label>' +
          '<label class="chk block"><input type="checkbox" id="pDec"' + (J.declined ? ' checked' : '') + '> <b>Declined</b>: no messages at all (they can also choose this in their details)</label></div></div>' +
        '</div><div>' +
        '<div class="card"><h2>Notes <small class="muted">admins only</small></h2><form id="nForm" class="note-form"><textarea class="input" id="nBody" rows="2" maxlength="500" placeholder="Short and practical, e.g. “came with her sister; interested in the kids’ program”. No health, family or spiritual details."></textarea><button class="btn btn-primary btn-sm" type="submit">Add note</button></form>' +
          (notes.length ? notes.map(function (x) { return '<div class="note"><p>' + esc(x.body) + '</p><small class="muted">' + esc(x.byEmail || '') + ' · ' + esc(when(x.at)) + ' · <a href="#" data-del="' + esc(x.id) + '">remove</a></small></div>'; }).join('') : '<p class="small muted">No notes yet.</p>') + '</div>' +
        '<div class="card"><h2>Timeline</h2>' + (tl.length ? '<ul class="timeline">' + tl.map(function (x) {
          var what = x.type === 'joined' ? 'Signed up' : x.type === 'milestone' ? 'Milestone: ' + esc(MILESTONE[x.kind] || x.kind) : x.type === 'challenge' ? '🏅 Finished a challenge: ' + esc(x.title) :
            TL[x.type] + ' <a href="#event/' + encodeURIComponent(x.eventId) + '">' + esc(x.title) + '</a>' + (KIND[x.kind] ? ' <span class="tag">' + esc(KIND[x.kind]) + '</span>' : '') +
            (x.type === 'rsvp' ? ' · ' + esc({ going: 'Going', maybe: 'Maybe', no: 'Can’t go' }[x.status] || x.status) : '') + (x.guests ? ' · +' + x.guests + ' guests' : '') + (x.type === 'viewed' && x.views > 1 ? ' · ' + x.views + ' times' : '');
          return '<li class="tl-' + esc(x.type) + '"><span class="tl-when">' + esc(when(x.at)) + '</span><span>' + what + '</span></li>';
        }).join('') + '</ul>' : '<p class="muted">Nothing yet.</p>') + '</div></div></div>';
      var patch = function (body, msg) { return S.api('PATCH', '/api/admin/users/' + encodeURIComponent(uid) + '/journey', body).then(function () { toast(msg); drawPerson(uid); }).catch(function (x) { toast(x.message); }); };
      $('pLv').onchange = function () {
        var v = this.value, msg = v === 'satsangi' ? 'Flag ' + first(p.name) + ' as Satsangi? They will see Community events.' : v === 'initiate' ? 'Mark ' + first(p.name) + ' as Initiate? This is permanent.' : '';
        if (msg && !window.confirm(msg)) { this.value = J.level; return; }
        patch({ stage: v === auto ? null : v }, 'Stage updated.'); };
      $('pSev').onchange = function () { patch({ sevadar: this.checked }, this.checked ? 'Marked as Sevadar.' : 'Sevadar removed.'); };
      $('pPas').onchange = function () {
        if (!this.checked) { patch({ passive: false }, 'No longer Passive.'); return; }
        var r = window.prompt('Why is ' + first(p.name) + ' away? (short, admins only, no health or personal details)', '');
        if (r === null) { this.checked = false; return; }
        patch({ passive: true, passiveReason: r }, 'Marked Passive.'); };
      $('pDec').onchange = function () { if (this.checked && !window.confirm('Record that ' + first(p.name) + ' asked for no messages from the center?')) { this.checked = false; return; }
        patch({ declined: this.checked }, this.checked ? 'Recorded: no messages.' : 'Messages allowed again.'); };
      app.querySelectorAll('[data-ms]').forEach(function (c) { c.onchange = function () { patch({ milestone: c.dataset.ms, done: c.checked }, c.checked ? 'Milestone recorded.' : 'Milestone removed.'); }; });
      var pick = function () {
        var b = sheet('<h2 class="sheet-title">Assign a mentor for ' + esc(first(p.name)) + '</h2><p class="small muted">Usually an initiate who can welcome them, answer questions and check in now and then.</p>' +
          '<input type="search" class="input" id="mq" placeholder="Search by name or email" autocomplete="off"><div id="mList" style="margin-top:10px"></div>' + (J.mentorId ? '<p><button class="btn btn-ghost btn-sm" id="mNone" type="button">Remove mentor</button></p>' : '') +
          '<div class="actions"><button class="btn btn-ghost" data-close type="button">Cancel</button></div>');
        var go = function () { S.api('GET', '/api/admin/users?q=' + encodeURIComponent($('mq').value.trim())).then(function (j) {
          $('mList').innerHTML = (j.users || []).filter(function (u) { return u.userId !== uid; }).slice(0, 12).map(function (u) { return '<button type="button" class="ad-row link-row pick" data-u="' + esc(u.userId) + '"><span class="ag-main"><b>' + esc(u.name || '(no name)') + '</b> <span class="tag">' + esc(CATEGORY[u.category] || 'Seeker') + '</span><small>' + esc(u.email || '') + '</small></span></button>'; }).join('') || '<p class="muted small">Nobody found.</p>';
          b.querySelectorAll('[data-u]').forEach(function (x) { x.onclick = function () { closeSheet(); patch({ mentorId: x.dataset.u }, 'Mentor assigned.'); }; });
        }); };
        var t; $('mq').oninput = function () { clearTimeout(t); t = setTimeout(go, 250); }; go(); $('mq').focus();
        if ($('mNone')) $('mNone').onclick = function () { closeSheet(); patch({ mentorId: null }, 'Mentor removed.'); };
      };
      if ($('mPick')) $('mPick').onclick = pick;
      if ($('mClear')) $('mClear').onclick = pick;
      $('nForm').onsubmit = function (ev) { ev.preventDefault(); var v = $('nBody').value.trim(); if (!v) return;
        S.api('POST', '/api/admin/users/' + encodeURIComponent(uid) + '/notes', { body: v }).then(function () { toast('Note added.'); drawPerson(uid); }).catch(function (x) { toast(x.message); }); };
      app.querySelectorAll('[data-del]').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); if (!window.confirm('Remove this note?')) return;
        S.api('DELETE', '/api/admin/notes/' + encodeURIComponent(a.dataset.del)).then(function () { toast('Note removed.'); drawPerson(uid); }).catch(function (x) { toast(x.message); }); }; });
      $('pBlock').onclick = function () {
        var block = !p.blockedAt, reason = '';
        if (block) { reason = window.prompt('Block ' + (p.name || 'this person') + ' from center events? Optional reason (admins only):', ''); if (reason === null) return; }
        S.api('PATCH', '/api/admin/users?user=' + encodeURIComponent(p.userId), { blocked: block, reason: reason }).then(function () { toast(block ? 'Blocked.' : 'Unblocked.'); drawPerson(uid); }).catch(function (x) { toast(x.message); });
      };
    }).catch(fail);
  }

  // Event insight: how the event did, and who it reached
  function subInsight() {
    var box = $('subBody'); box.innerHTML = '<div class="card skeleton"></div>';
    S.api('GET', '/api/admin/events/' + encodeURIComponent(cur.id) + '/insight').then(function (j) {
      var x = j.insight, pct = function (a, b) { return b ? Math.round(100 * a / b) + '%' : '—'; };
      var bl = x.byLevel || {}, total = Object.keys(bl).reduce(function (a, k) { return a + bl[k]; }, 0);
      box.innerHTML = '<div class="card"><h2>From interest to attendance</h2><div class="funnel">' +
          '<div><b>' + n(x.viewers) + '</b><span>opened the page</span><small>' + n(x.views) + ' views</small></div><div><b>' + n(x.going) + '</b><span>said Going</span><small>' + n(x.maybe) + ' maybe · ' + n(x.cant) + ' can’t</small></div>' +
          '<div><b>' + n(x.came) + '</b><span>came</span><small>+' + n(x.guests) + ' guests</small></div></div>' +
        '<div class="kpi-grid" style="margin-top:14px">' + tile('First-timers', n(x.firstTimers), pct(x.firstTimers, x.came) + ' of those who came') +
          tile('Came back within 30 days', x.ended ? n(x.returned30) : '—', x.ended ? pct(x.returned30, x.came) + (x.returnWindowOpen ? ' so far (still counting)' : '') : 'after the event') +
          tile('Said Going, didn’t come', x.ended ? n(x.noShows) : '—', x.ended ? pct(x.noShows, x.going) + ' of Going' : 'after the event') + tile('Walk-ins', n(x.walkIns), 'came without an RSVP') + '</div></div>' +
        '<div class="card"><h2>Who came, by stage</h2>' + (total ? '<div class="lvbars">' + Object.keys(LEVEL).map(function (k) { var v = bl[k] || 0;
          return '<div class="bar-row"><span>' + esc(LEVEL[k]) + '</span><span class="lvbar"><i style="width:' + (total ? Math.round(100 * v / total) : 0) + '%"></i></span><b>' + v + '</b></div>'; }).join('') + '</div>' : '<p class="muted">No check-ins yet.</p>') +
          '<p class="small muted">Type: <b>' + esc(KIND[x.kind] || '') + '</b> · audience: <b>' + esc(ACCESS[x.access] || 'Public') + '</b>. Change these with ✎ Edit.</p></div>';
    }).catch(function (x2) { box.innerHTML = '<div class="card"><p>' + esc(x2.message) + '</p></div>'; });
  }

  /* =====================================================================
   * Challenges (Meditation Copilot)
   * ===================================================================== */
  function drawChallenges() {
    loading();
    S.api('GET', '/api/admin/challenges').then(function (j) {
      var list = j.challenges || [];
      app.innerHTML = '<div class="sec-head page-head"><h1>Challenges</h1><button class="btn btn-primary" id="chNew" type="button">+ New challenge</button></div>' +
        '<p class="small muted">Shown in Meditation Copilot. The first active challenge for a person’s path is recommended; use ↑ ↓ to set the order. “At sign-up” challenges are offered when someone starts using Copilot (they must choose at least one).</p>' +
        '<div class="card">' + (list.length ? list.map(function (c, i) {
          return '<div class="ad-row ch-row' + (c.active ? '' : ' off') + '"><span class="ag-main"><b>' + esc(c.title) + '</b>' + (c.active ? '' : ' <span class="tag">Paused</span>') +
            ' <span class="tag">' + esc({ all: 'Everyone', seeker: 'New seekers', initiate: 'Initiates' }[c.audience]) + '</span>' + (c.signup ? ' <span class="tag lv lv-new">At sign-up</span>' : '') +
            '<small>' + esc(chSummary(c)) + ' · ' + c.points + ' bonus points' + (c.nextOf ? ' · next step after ' + esc((list.filter(function (x) { return x.id === c.nextOf; })[0] || {}).title || 'another challenge') : '') + '</small></span>' +
            '<span class="ck-act"><button class="btn btn-ghost btn-sm" data-up="' + i + '" type="button" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button class="btn btn-ghost btn-sm" data-down="' + i + '" type="button" aria-label="Move down"' + (i < list.length - 1 ? '' : ' disabled') + '>↓</button>' +
            '<button class="btn btn-ghost btn-sm" data-edit="' + i + '" type="button">Edit</button></span></div>';
        }).join('') : '<p class="muted">No challenges yet.</p>') + '</div>';
      $('chNew').onclick = function () { chForm(null, list.length, list); };
      app.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { chForm(list[Number(b.dataset.edit)], 0, list); }; });
      function move(i, k) {
        var a = list[i], b = list[i + k]; if (!a || !b) return;
        var arr = list.slice(); arr[i] = b; arr[i + k] = a;
        Promise.all(arr.map(function (c, idx) { return c.priority === (idx + 1) * 10 ? null : S.api('PATCH', '/api/admin/challenges/' + c.id, { priority: (idx + 1) * 10 }); })).then(drawChallenges).catch(function (x) { toast(x.message); });
      }
      app.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { move(Number(b.dataset.up), -1); }; });
      app.querySelectorAll('[data-down]').forEach(function (b) { b.onclick = function () { move(Number(b.dataset.down), 1); }; });
    }).catch(fail);
  }
  function chSummary(c) {
    if (c.kind === 'daily_sitting') {
      var m = c.minutesChoices && c.minutesChoices.length ? c.minutesChoices.join('/') + ' min (their choice)' : c.minutes + ' min';
      return c.rampTo ? 'Grow from their minutes to ' + c.rampTo + ' min over ' + c.days + ' days' : 'Sit ' + m + ' a day for ' + c.days + ' days';
    }
    if (c.kind === 'checkins') return 'Attend ' + c.target + ' center programs within ' + c.days + ' days';
    var what = { quote: ['thought', 'thoughts'], article: ['article', 'articles'], book: ['chapter', 'chapters'], video: ['video', 'videos'], quiz: ['quiz', 'quizzes'] }[c.material] || ['item', 'items'];
    var per = c.perPeriod ? c.perPeriod + ' ' + what[c.perPeriod === 1 ? 0 : 1] + ' a ' + (c.cadence || 'week') : '';
    var total = c.material === 'book' && !c.target ? 'a whole book' : c.target + ' ' + what[1];
    return 'Read/watch ' + total + (per ? ' (' + per + ')' : '') + ' within ' + c.days + ' days · ' + (c.itemPoints || 0) + ' points each';
  }
  function chForm(c, count, list) {
    list = list || [];
    var nextOpts = '<option value="">— (not linked)</option>' + list.filter(function (x) { return !c || x.id !== c.id; }).map(function (x) { return '<option value="' + esc(x.id) + '"' + (c && c.nextOf === x.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('');
    sheet('<h2 class="sheet-title">' + (c ? 'Edit challenge' : 'New challenge') + '</h2><form id="cf">' +
      '<label class="field" for="cTitle">Title</label><input class="input" id="cTitle" required maxlength="100" value="' + esc(c ? c.title : '') + '">' +
      '<label class="field" for="cDesc">Description</label><textarea class="input" id="cDesc" rows="3" maxlength="600">' + esc(c ? c.description || '' : '') + '</textarea>' +
      '<div class="grid2"><div><label class="field" for="cKind">Type</label><select class="input" id="cKind"><option value="daily_sitting">Meditation (daily sitting)</option><option value="checkins">Attend center programs</option><option value="education">Education (read or watch)</option></select></div>' +
      '<div><label class="field" for="cAud">For</label><select class="input" id="cAud"><option value="all">Everyone</option><option value="seeker">New seekers</option><option value="initiate">Initiates</option></select></div>' +
      '<div><label class="field" for="cDays">Length (days)</label><input class="input" id="cDays" type="number" min="1" max="365" value="' + (c ? c.days : 21) + '"></div>' +
      '<div><label class="field" for="cPts">Bonus points when completed</label><input class="input" id="cPts" type="number" min="0" max="10000" value="' + (c ? c.points : 100) + '"></div></div>' +
      '<div id="cSitBox"><div class="grid2"><div><label class="field" for="cMin">Minutes a day (default)</label><input class="input" id="cMin" type="number" min="1" max="180" value="' + (c ? c.minutes || 15 : 15) + '"></div>' +
        '<div><label class="field" for="cChoices">Let them choose (optional)</label><input class="input" id="cChoices" placeholder="e.g. 10, 15, 20" value="' + esc(c && c.minutesChoices ? c.minutesChoices.join(', ') : '') + '"></div>' +
        '<div><label class="field" for="cRamp">Grow to (minutes, optional)</label><input class="input" id="cRamp" type="number" min="0" max="180" placeholder="e.g. 30" value="' + (c && c.rampTo ? c.rampTo : '') + '"></div></div>' +
        '<p class="small muted">With “grow to”, the daily target rises a little each day from their current minutes to this number by the last day (like 21-Day Advance). Missed days allowed: 1 for every 10 days.</p></div>' +
      '<div id="cTgtBox"><label class="field" for="cTgt">Programs to attend</label><input class="input" id="cTgt" type="number" min="1" max="100" value="' + (c ? c.target || 6 : 6) + '"><p class="small muted">Catch-up is allowed: any check-ins before the end date count.</p></div>' +
      '<div id="cEduBox"><div class="grid2"><div><label class="field" for="cMat">Read or watch</label><select class="input" id="cMat"><option value="quote">Thought for today (quotes)</option><option value="article">Articles</option><option value="book">A book (chapters)</option><option value="video">Videos</option><option value="quiz">Quizzes (passed)</option></select></div>' +
        '<div><label class="field" for="cCad">Pace</label><select class="input" id="cCad"><option value="day">per day</option><option value="week">per week</option><option value="month">per month</option></select></div>' +
        '<div><label class="field" for="cPer">How many each time</label><input class="input" id="cPer" type="number" min="1" max="50" value="' + (c && c.perPeriod ? c.perPeriod : 1) + '"></div>' +
        '<div><label class="field" for="cTot">Total to finish</label><input class="input" id="cTot" type="number" min="0" max="1000" value="' + (c && c.kind === 'education' ? c.target : 12) + '"></div>' +
        '<div><label class="field" for="cItemPts">Points for each one</label><input class="input" id="cItemPts" type="number" min="0" max="1000" value="' + (c && c.kind === 'education' ? c.itemPoints : 10) + '"></div></div>' +
        '<p class="small muted">Catch-up is allowed: anything read or watched before the end date counts, so there are no missed days. For a book, set the total to 0 to mean “the whole book” (its chapters come from the Library). Finishing a book always earns 100 points on top.</p></div>' +
      '<label class="field" for="cNext">Offer as the next step after</label><select class="input" id="cNext">' + nextOpts + '</select>' +
      '<label class="check"><input type="checkbox" id="cSignup"' + (c && c.signup ? ' checked' : '') + '> Offer at sign-up (“choose your first challenge”)</label>' +
      '<label class="check"><input type="checkbox" id="cAct"' + (!c || c.active ? ' checked' : '') + '> Active (shown in Copilot)</label>' +
      '<p class="error" id="cErr"></p><div class="actions">' + (c ? '<button class="btn btn-ghost danger" id="cDel" type="button">Remove</button>' : '') + '<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>');
    $('cKind').value = c ? c.kind : 'daily_sitting'; $('cAud').value = c ? c.audience : 'all';
    $('cMat').value = c && c.material ? c.material : 'article'; $('cCad').value = c && c.cadence ? c.cadence : 'week';
    function sync() { var k = $('cKind').value; $('cSitBox').hidden = k !== 'daily_sitting'; $('cTgtBox').hidden = k !== 'checkins'; $('cEduBox').hidden = k !== 'education'; }
    $('cKind').onchange = sync; sync();
    if ($('cDel')) $('cDel').onclick = function () { if (!window.confirm('Remove “' + c.title + '”? People who started it keep their points.')) return; S.api('DELETE', '/api/admin/challenges/' + c.id).then(function () { closeSheet(); drawChallenges(); }).catch(function (x) { $('cErr').textContent = x.message; }); };
    $('cf').onsubmit = function (ev) {
      ev.preventDefault();
      var sit = $('cKind').value === 'daily_sitting', edu = $('cKind').value === 'education';
      var body = { title: $('cTitle').value, description: $('cDesc').value, kind: $('cKind').value, audience: $('cAud').value, days: Number($('cDays').value),
        minutes: sit ? Number($('cMin').value) : 0, minutesChoices: sit ? $('cChoices').value : '', rampTo: sit ? Number($('cRamp').value || 0) : 0,
        material: edu ? $('cMat').value : '', cadence: edu ? $('cCad').value : '', perPeriod: edu ? Number($('cPer').value || 0) : 0, itemPoints: edu ? Number($('cItemPts').value || 0) : 0,
        target: sit ? 0 : edu ? Number($('cTot').value || 0) : Number($('cTgt').value), points: Number($('cPts').value), nextOf: $('cNext').value || null, signup: $('cSignup').checked, active: $('cAct').checked };
      if (!c) body.priority = (count + 1) * 10;
      S.api(c ? 'PATCH' : 'POST', '/api/admin/challenges' + (c ? '/' + c.id : ''), body).then(function () { closeSheet(); toast('Saved.'); drawChallenges(); }).catch(function (x) { $('cErr').textContent = x.message; });
    };
  }

  /* =====================================================================
   * Library (v0.20): the center's reading and watching list for Copilot
   * ===================================================================== */
  var libKind = 'article';
  var LIBK = { article: ['Articles', 'article', '📰'], video: ['Videos', 'video', '▶'], book: ['Books', 'book', '📖'], quiz: ['Quizzes', 'quiz', '🧩'] };
  var LTOPICS = {};
  function drawLibrary() {
    loading();
    S.api('GET', '/api/admin/library').then(function (j) {
      LTOPICS = j.topics || {};
      var all = j.items || [], list = all.filter(function (x) { return x.kind === libKind; });
      app.innerHTML = '<div class="sec-head page-head"><h1>Library</h1><button class="btn btn-primary" id="libNew" type="button">+ Add ' + LIBK[libKind][1] + '</button></div>' +
        '<p class="small muted">Everything in Copilot’s Learn: articles, talks, books by the Masters, and quizzes. Seekers only see items marked <b>Approved</b>. ' +
        '<b>Pinned</b> items always show in the top 5. Counts are anonymous (no names): opened · finished · passed.</p>' +
        '<div class="seg" role="group" aria-label="Show">' + Object.keys(LIBK).map(function (k) {
          var c = all.filter(function (x) { return x.kind === k; }), d = c.filter(function (x) { return x.status !== 'approved'; }).length;
          return '<button type="button" data-lk="' + k + '" class="' + (k === libKind ? 'on' : '') + '">' + LIBK[k][0] + ' (' + c.length + (d ? ', ' + d + ' draft' : '') + ')</button>'; }).join('') + '</div>' +
        '<div class="card" style="margin-top:12px">' + (list.length ? list.map(function (x, i) {
          var st = x.stats || {}, nq = x.quiz && x.quiz.questions ? x.quiz.questions.length : 0;
          return '<div class="ad-row lib-row"><span class="lib-pic">' + (x.image ? '<img src="' + esc(x.image) + '" alt="" loading="lazy">' : '<span aria-hidden="true">' + esc(x.icon || LIBK[x.kind][2]) + '</span>') + '</span>' +
            '<span class="ag-main"><b>' + esc(x.title) + '</b>' + (x.status === 'approved' ? ' <span class="tag gold">Approved</span>' : ' <span class="tag">Draft</span>') + (x.pinned ? ' <span class="tag">📌 Pinned</span>' : '') +
            '<small>' + esc([x.kind === 'quiz' ? nq + ' questions · pass ' + x.passMark + ' · retry after ' + x.retryMinutes + ' min' : x.author,
              x.kind === 'book' ? (x.chapters ? x.chapters + ' chapters' : 'chapters not set') : '', x.kind === 'article' ? (x.body ? 'full text' : x.url ? 'link' : 'no text or link') : '',
              (x.topics || []).map(function (t) { return LTOPICS[t]; }).join(', ')].filter(Boolean).join(' · ')) + '</small>' +
            '<small class="muted">👁 ' + n(st.open) + ' · ✓ ' + n(st.done) + (x.kind === 'quiz' ? ' · 🏅 ' + n(st.pass) : '') + '</small></span>' +
            '<span class="ck-act">' + (x.kind === 'quiz' ? '<button class="btn btn-soft btn-sm" data-lr="' + i + '" type="button">Review</button>' : '') + '<button class="btn btn-ghost btn-sm" data-le="' + i + '" type="button">Edit</button></span></div>';
        }).join('') : '<p class="muted">No ' + LIBK[libKind][0].toLowerCase() + ' yet.</p>') + '</div>';
      app.querySelectorAll('[data-lk]').forEach(function (b) { b.onclick = function () { libKind = b.dataset.lk; drawLibrary(); }; });
      $('libNew').onclick = function () { libForm(null, list.length); };
      app.querySelectorAll('[data-le]').forEach(function (b) { b.onclick = function () { libForm(list[Number(b.dataset.le)], 0); }; });
      app.querySelectorAll('[data-lr]').forEach(function (b) { b.onclick = function () { quizReview(list[Number(b.dataset.lr)]); }; });
    }).catch(fail);
  }
  // A quiz as reviewers see it: every question, the correct answer, the explanation and the source
  function quizReview(x) {
    var z = x.quiz || { questions: [] };
    sheet('<h2 class="sheet-title">' + esc(x.title) + '</h2><p class="small muted">' + (x.status === 'approved' ? 'Approved' : 'Draft') + ' · ' + z.questions.length + ' questions · pass with ' + x.passMark + '</p>' +
      (z.reviewNote ? '<p class="notice warn small">' + esc(z.reviewNote) + '</p>' : '') +
      '<ol class="q-rev">' + z.questions.map(function (q) {
        return '<li><b>' + esc(q.q) + '</b><ul>' + q.options.map(function (o, k) { return '<li class="' + (k === q.answer ? 'ok' : '') + '">' + (k === q.answer ? '✓ ' : '') + esc(o) + '</li>'; }).join('') + '</ul>' +
          (q.explain ? '<p class="small">' + esc(q.explain) + '</p>' : '') + (q.source ? '<p class="small muted">Source: ' + esc(q.source) + '</p>' : '') + '</li>';
      }).join('') + '</ol>' +
      '<div class="actions"><button class="btn btn-ghost" data-close type="button">Close</button><button class="btn btn-soft" id="qrEdit" type="button">Edit</button>' +
      (x.status !== 'approved' ? '<button class="btn btn-primary" id="qrOk" type="button">Approve</button>' : '') + '</div>');
    $('qrEdit').onclick = function () { closeSheet(); libForm(x, 0); };
    if ($('qrOk')) $('qrOk').onclick = function () {
      S.api('PATCH', '/api/admin/library/' + x.id, { status: 'approved' }).then(function () { closeSheet(); toast('Approved. It now shows in Copilot.'); drawLibrary(); }).catch(function (e) { toast(e.message); });
    };
  }
  function qRowHTML(q, i) {
    q = q || { q: '', options: ['', ''], answer: 0, explain: '', source: '' };
    var opts = q.options.concat(['', '', '', '']).slice(0, 4);
    return '<fieldset class="q-edit" data-qi="' + i + '"><legend>Question ' + (i + 1) + ' <button class="link small danger" type="button" data-qdel="' + i + '">Remove</button></legend>' +
      '<input class="input" data-f="q" maxlength="300" placeholder="Question" value="' + esc(q.q) + '">' +
      opts.map(function (o, k) { return '<label class="q-opt-row"><input type="radio" name="qa' + i + '" value="' + k + '"' + (q.answer === k ? ' checked' : '') + ' title="Correct answer"><input class="input" data-f="o' + k + '" maxlength="160" placeholder="Option ' + (k + 1) + (k > 1 ? ' (optional)' : '') + '" value="' + esc(o) + '"></label>'; }).join('') +
      '<input class="input" data-f="explain" maxlength="400" placeholder="Short explanation (shown with the answer)" value="' + esc(q.explain) + '">' +
      '<input class="input" data-f="source" maxlength="200" placeholder="Source (e.g. sos.org page)" value="' + esc(q.source) + '"></fieldset>';
  }
  function readQuestions() {
    return [].map.call(document.querySelectorAll('.q-edit'), function (f) {
      var g = function (k) { var el = f.querySelector('[data-f="' + k + '"]'); return el ? el.value.trim() : ''; };
      var opts = [g('o0'), g('o1'), g('o2'), g('o3')], keep = [], map = {};
      opts.forEach(function (o, k) { if (o) { map[k] = keep.length; keep.push(o); } });
      var a = f.querySelector('input[type=radio]:checked');
      return { q: g('q'), options: keep, answer: a && map[a.value] != null ? map[a.value] : -1, explain: g('explain'), source: g('source') };
    }).filter(function (q) { return q.q || q.options.length; });
  }
  function libForm(x, count) {
    var kind = x ? x.kind : libKind, book = kind === 'book', quiz = kind === 'quiz', art = kind === 'article';
    var v = function (k, d) { return esc(x && x[k] != null && x[k] !== 0 ? x[k] : (d == null ? '' : d)); };
    var topics = (x && x.topics) || [];
    sheet('<h2 class="sheet-title">' + (x ? 'Edit ' : 'Add ') + LIBK[kind][1] + '</h2><form id="lf">' +
      (quiz ? '' : '<label class="field" for="lUrl">' + (book ? 'Where to buy it (Amazon or any bookseller link)' : kind === 'video' ? 'Video link (YouTube or sos.org)' : 'Link (optional if you add the full text below)') + '</label>' +
        '<div class="row-inline"><input class="input" id="lUrl" type="url" placeholder="https://" value="' + v('url') + '">' + (book ? '<button class="btn btn-soft" id="lLook" type="button">Look up</button>' : '') + '</div>' +
        (book ? '<p class="small muted" id="lLookMsg">Paste the link (or type an ISBN or the title) and press Look up to fill in the title, author and cover. Always check them.</p>' : '')) +
      '<label class="field" for="lTitle">Title</label><input class="input" id="lTitle" required maxlength="200" value="' + v('title') + '">' +
      (quiz ? '' : '<label class="field" for="lAuthor">' + (kind === 'video' ? 'Speaker' : 'Author') + '</label><input class="input" id="lAuthor" maxlength="120" value="' + v('author') + '">') +
      '<label class="field" for="lSum">Short summary, in your own words</label><textarea class="input" id="lSum" rows="2" maxlength="800">' + v('summary') + '</textarea>' +
      (art ? '<label class="field" for="lBody">Full text <span class="muted">(optional)</span></label><textarea class="input mono" id="lBody" rows="10">' + v('body') + '</textarea>' +
        '<p class="small muted">Leave a blank line between paragraphs. <code>## Heading</code> · <code>- list item</code> · <code>**bold**</code> · <code>[link text](https://…)</code></p>' : '') +
      '<div id="lAbout"></div>' +
      '<label class="field">Topics <span class="muted">(up to 3)</span></label><div class="topic-chks">' + Object.keys(LTOPICS).map(function (t) {
        return '<label class="chk"><input type="checkbox" name="lTopic" value="' + t + '"' + (topics.indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(LTOPICS[t]) + '</label>'; }).join('') + '</div>' +
      '<div class="grid2">' + (book ? '<div><label class="field" for="lCh">Number of chapters</label><input class="input" id="lCh" type="number" min="0" max="300" value="' + v('chapters') + '"></div>' +
        '<div><label class="field" for="lIsbn">ISBN</label><input class="input" id="lIsbn" maxlength="17" value="' + v('isbn') + '"></div>' : '') +
        (quiz ? '<div><label class="field" for="lPass">Correct answers to pass</label><input class="input" id="lPass" type="number" min="1" max="20" value="' + (x ? x.passMark : 8) + '"></div>' +
          '<div><label class="field" for="lRetry">Minutes before trying again</label><input class="input" id="lRetry" type="number" min="0" max="1440" value="' + (x ? x.retryMinutes : 10) + '"></div>' :
          '<div><label class="field" for="lMin">' + (kind === 'video' ? 'Length (minutes)' : 'Reading time (minutes)') + '</label><input class="input" id="lMin" type="number" min="0" max="1000" value="' + v('minutes') + '"></div>') +
        (book || kind === 'video' ? '' : '<div><label class="field" for="lIcon">Icon (one emoji)</label><input class="input" id="lIcon" maxlength="8" value="' + v('icon', quiz ? '🧩' : '') + '"></div>') +
        '<div><label class="field" for="lPri">Order (lower shows first)</label><input class="input" id="lPri" type="number" min="0" max="10000" value="' + (x ? x.priority : (count + 1) * 10) + '"></div></div>' +
      (quiz ? '' : '<label class="field" for="lImg">Picture link (cover or thumbnail, optional)</label><input class="input" id="lImg" type="url" placeholder="https://" value="' + v('image') + '">') +
      (quiz ? '<h3 class="h-sm" style="margin-top:16px">Questions <span class="muted small">(10 recommended; 2–4 options each; tick the correct one. For yes/no, use “Yes” and “No”.)</span></h3>' +
        '<div id="qList">' + ((x && x.quiz && x.quiz.questions) || []).map(qRowHTML).join('') + '</div><button class="btn btn-soft btn-sm" id="qAdd" type="button">+ Add a question</button>' : '') +
      '<label class="check"><input type="checkbox" id="lPin"' + (x && x.pinned ? ' checked' : '') + '> 📌 Pin: always in the top 5 of ' + LIBK[kind][0].toLowerCase() + '</label>' +
      '<label class="check"><input type="checkbox" id="lApp"' + (x && x.status === 'approved' ? ' checked' : '') + '> Approved: show it in Copilot</label>' +
      '<p class="error" id="lErr"></p><div class="actions">' + (x ? '<button class="btn btn-ghost danger" id="lDel" type="button">Remove</button>' : '') +
      '<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>');
    if (quiz) {
      $('qAdd').onclick = function () { var l = $('qList'), n = l.querySelectorAll('.q-edit').length; l.insertAdjacentHTML('beforeend', qRowHTML(null, n)); };
      $('qList').addEventListener('click', function (e) { var d = e.target.closest('[data-qdel]'); if (d && window.confirm('Remove this question?')) d.closest('.q-edit').remove(); });
    }
    if ($('lLook')) $('lLook').onclick = function () {
      var q = $('lUrl').value.trim() || $('lIsbn').value.trim() || $('lTitle').value.trim();
      if (!q) { $('lLookMsg').textContent = 'Paste a link, an ISBN or a title first.'; return; }
      $('lLook').disabled = true; $('lLookMsg').textContent = 'Looking up…';
      S.api('POST', '/api/admin/library/lookup', { query: q }).then(function (r) {
        var f = r.found;
        if (!f) { $('lLookMsg').textContent = 'Nothing found' + (r.ref && r.ref.isbn ? ' for ISBN ' + r.ref.isbn : '') + '. Please type the details.'; if (r.ref && r.ref.isbn && !$('lIsbn').value) $('lIsbn').value = r.ref.isbn; return; }
        if (!$('lTitle').value) $('lTitle').value = f.title; if (!$('lAuthor').value) $('lAuthor').value = f.author;
        if (!$('lIsbn').value) $('lIsbn').value = f.isbn || (r.ref && r.ref.isbn) || ''; if (!$('lImg').value && f.image) $('lImg').value = f.image;
        $('lLookMsg').textContent = 'Found on ' + f.source + (f.pages ? ' · ' + f.pages + ' pages' : '') + '. Please check the details and add the number of chapters.';
        $('lAbout').innerHTML = (f.image ? '<img class="lib-cover" src="' + esc(f.image) + '" alt="Cover">' : '') +
          (f.about ? '<details class="small"><summary>Publisher’s description (for reference only)</summary><p>' + esc(f.about) + '</p></details>' : '');
      }).catch(function (e) { $('lLookMsg').textContent = e.message; }).then(function () { $('lLook').disabled = false; });
    };
    if ($('lDel')) $('lDel').onclick = function () { if (!window.confirm('Remove “' + x.title + '” from the library? People who read it keep their points.')) return; S.api('DELETE', '/api/admin/library/' + x.id).then(function () { closeSheet(); drawLibrary(); }).catch(function (e) { $('lErr').textContent = e.message; }); };
    $('lf').onsubmit = function (ev) {
      ev.preventDefault();
      var tp = [].map.call(document.querySelectorAll('input[name=lTopic]:checked'), function (c) { return c.value; });
      if (tp.length > 3) { $('lErr').textContent = 'Choose up to 3 topics.'; return; }
      var b = { kind: kind, title: $('lTitle').value, summary: $('lSum').value, topics: tp, pinned: $('lPin').checked, priority: Number($('lPri').value || 100), status: $('lApp').checked ? 'approved' : 'draft' };
      if (!quiz) { b.url = $('lUrl').value.trim(); b.author = $('lAuthor').value; b.image = $('lImg').value.trim(); b.minutes = Number($('lMin').value || 0); }
      if ($('lIcon')) b.icon = $('lIcon').value.trim();
      if (art) b.body = $('lBody').value;
      if (book) { b.chapters = Number($('lCh').value || 0); b.isbn = $('lIsbn').value; }
      if (quiz) {
        var qs = readQuestions(), badQ = qs.findIndex(function (q) { return q.answer < 0; });
        if (badQ >= 0) { $('lErr').textContent = 'Question ' + (badQ + 1) + ': tick the correct option.'; return; }
        b.quiz = { questions: qs, related: (x && x.quiz && x.quiz.related) || [], reviewNote: (x && x.quiz && x.quiz.reviewNote) || '' };
        b.passMark = Number($('lPass').value || 8); b.retryMinutes = Number($('lRetry').value || 0);
      }
      S.api(x ? 'PATCH' : 'POST', '/api/admin/library' + (x ? '/' + x.id : ''), b).then(function () { closeSheet(); toast('Saved.'); drawLibrary(); }).catch(function (e) { $('lErr').textContent = e.message; });
    };
  }

  /* =====================================================================
   * Overview, Team, Activity
   * ===================================================================== */
  function tile(k, v, s) { return '<div class="kpi"><small>' + k + '</small><b>' + v + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>'; }
  function drawOverview() {
    loading();
    S.api('GET', '/api/admin/stats').then(function (j) {
      var p = j.people || {}, a = j.activity || {}, max = Math.max.apply(null, (j.signups || [0]).concat([1]));
      app.innerHTML = '<div class="sec-head page-head"><h1>Overview</h1></div><div class="grid2 top">' +
        '<div class="card"><h2>People</h2><div class="kpi-grid">' + tile('Registered', n(p.total)) + tile('New · 7 days', n(p.new7), n(p.new30) + ' in 30 days') + tile('Active · 7 days', n(p.active7), n(p.active30) + ' in 30 days') +
          tile('Initiates', n(p.initiates), n(p.friends) + ' satsangis · ' + n(p.seekers) + ' seekers') + '</div>' +
          '<p class="small muted" style="margin:14px 0 4px">New sign-ups by week</p><div class="bars">' + (j.signups || []).map(function (v) { return '<span class="bar" style="height:' + Math.max(4, v / max * 100) + '%" title="' + v + '"><i>' + (v || '') + '</i></span>'; }).join('') + '</div>' +
          '<div class="small muted bars-x"><span>8 weeks ago</span><span>this week</span></div></div>' +
        '<div class="card"><h2>Events · last 30 days</h2><div class="kpi-grid">' + tile('Upcoming events', n(a.upcoming)) + tile('RSVPs (going)', n(a.rsvps30)) + tile('Check-ins', n(a.checkins30)) + tile('Can be messaged', n(p.messagesOk), n(p.withPhone) + ' gave a phone') + '</div></div></div>' +
        '<div class="card"><h2>Attendance at recent events</h2>' + ((j.recent || []).length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Event</th><th>Going</th><th>Checked in</th><th>Turnout</th></tr></thead><tbody>' +
          j.recent.map(function (e) { return '<tr><td>' + esc(day(e.startsAt)) + '</td><td><a href="#event/' + encodeURIComponent(e.id) + '">' + esc(e.title) + '</a></td><td>' + e.going + '</td><td>' + e.checkedIn + '</td><td>' + (e.going ? Math.round(e.checkedIn / e.going * 100) + '%' : '—') + '</td></tr>'; }).join('') +
          '</tbody></table></div><p class="small muted">People with accounts; guests are shown on each event.</p>' : '<p class="muted">No past events yet.</p>') + '</div>';
    }).catch(fail);
  }
  function drawTeam() {
    loading();
    S.api('GET', '/api/admin/staff').then(function (j) {
      app.innerHTML = '<div class="sec-head page-head"><h1>Team</h1></div><div class="grid2 top"><div class="card">' +
        j.owners.map(function (o) { return '<div class="ad-row"><span class="ag-main"><b>' + esc(o) + '</b><small>Owner · set on the server</small></span><span class="tag role">owner</span></div>'; }).join('') +
        (j.staff || []).map(function (s) {
          return '<div class="ad-row"><span class="ag-main"><b>' + esc(s.name || s.email) + '</b><small>' + esc(s.email) + ' · added ' + esc(day(s.addedAt)) + '</small></span><span class="tag role">' + esc(s.role) + '</span>' +
            (j.canEdit ? '<button class="btn btn-ghost btn-sm" data-rm="' + esc(s.email) + '" type="button">Remove</button>' : '') + '</div>';
        }).join('') +
        (j.canEdit ? '<form id="tm"><label class="field" for="tmE">Add a person (their Google or Microsoft sign-in email)</label><input class="input" id="tmE" type="email" required>' +
          '<div class="radio-row"><label><input type="radio" name="tmR" value="host" checked> Host: check-in only</label><label><input type="radio" name="tmR" value="admin"> Admin: everything except Team</label></div>' +
          '<p class="error" id="tmErr"></p><button class="btn btn-primary" type="submit">Add</button></form>' : '<p class="small muted">Only the owner can change the team.</p>') + '</div>' +
        '<div class="card"><h2>Protecting this site</h2><p class="small">admin.sosmn.org is linked from nowhere, and the events server refuses anyone who isn’t on this team. Cloudflare Access adds an email check before this page even loads: add new admins there too.</p></div></div>';
      app.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { if (window.confirm('Remove ' + b.dataset.rm + '?')) S.api('DELETE', '/api/admin/staff?email=' + encodeURIComponent(b.dataset.rm)).then(drawTeam).catch(function (x) { toast(x.message); }); }; });
      if ($('tm')) $('tm').onsubmit = function (ev) {
        ev.preventDefault();
        S.api('POST', '/api/admin/staff', { email: $('tmE').value.trim(), role: (app.querySelector('input[name="tmR"]:checked') || {}).value }).then(function () { toast('Added.'); drawTeam(); }).catch(function (x) { $('tmErr').textContent = x.message; });
      };
    }).catch(fail);
  }
  function drawLog() {
    loading();
    S.api('GET', '/api/admin/log').then(function (j) {
      var r = j.log || [];
      app.innerHTML = '<div class="sec-head page-head"><h1>Activity</h1></div><div class="card">' + (r.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' +
        r.map(function (x) { return '<tr><td>' + esc(when(x.at)) + '</td><td>' + esc(x.byEmail || '') + '</td><td>' + esc(ACTIONS[x.action] || x.action) + '</td><td class="small">' + esc([x.detail, x.target].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted">Nothing yet.</p>') + '</div>';
    }).catch(fail);
  }

  /* ---------- layout switch + start ---------- */
  function layoutSwitch() {
    var m = document.documentElement.getAttribute('data-layout'), btn = $('viewBtn'), p = null;
    try { p = localStorage.getItem('mc.layout'); } catch (x) {}
    if (!btn) return;
    btn.firstElementChild.textContent = m === 'desktop' ? '🖥️' : '📱';
    btn.onclick = function () {
      var opt = function (v, label) { return '<button type="button" class="btn btn-block ' + ((p || 'auto') === v ? 'btn-primary' : 'btn-ghost') + '" data-view="' + v + '" style="margin-top:8px">' + label + '</button>'; };
      sheet('<h2 class="sheet-title">Layout</h2>' + opt('auto', 'Auto (recommended)') + opt('mobile', '📱 Phone') + opt('desktop', '🖥️ Computer') +
        '<div class="actions"><button class="btn btn-ghost" data-close type="button">Close</button></div>');
      $('sheetBody').querySelectorAll('[data-view]').forEach(function (b) {
        b.onclick = function () { try { if (b.dataset.view === 'auto') localStorage.removeItem('mc.layout'); else localStorage.setItem('mc.layout', b.dataset.view); } catch (x) {} location.reload(); };
      });
    };
  }
  layoutSwitch();
  S.handleRedirect().catch(function (x) { toast(x.message, 5000); }).then(start);
})();
