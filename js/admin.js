/* Meditation Copilot — Admin area (#admin), SOS edition only (v0.15)
 *  Overview (analytics) · Events (RSVPs, check-in, reminders) · People · Today screen (hero event + article) · Team · Activity
 *  Roles: owner (ADMIN_EMAILS secret) > admin > host. The events server checks the role on every request;
 *  this screen only decides what to show. Hosts see Events (check-in) only, without contact details.
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var TABS = [
    ['overview', '📊 Overview', 'admin'], ['events', '📅 Events', 'staff'], ['people', '👥 People', 'admin'],
    ['home', '🏠 Today screen', 'admin'], ['team', '🛡 Team', 'admin'], ['log', '🧾 Activity', 'admin']
  ];
  var ACTIONS = {
    sign_in: 'Signed in', checkin: 'Checked someone in', checkin_undo: 'Undid a check-in', event_create: 'Created an event', event_edit: 'Edited an event',
    event_cancel: 'Cancelled an event', event_restore: 'Restored an event', event_new_code: 'New check-in code', hero_set: 'Featured an event', hero_clear: 'Unfeatured an event',
    person_view: 'Viewed a person', person_edit: 'Changed a person', settings: 'Changed Today screen', team_add: 'Added to team', team_remove: 'Removed from team',
    export_csv: 'Downloaded attendee CSV', contact_list: 'Opened a contact list', email_rsvps: 'Opened reminder email', copy_emails: 'Copied email addresses', whatsapp_demo: 'Opened WhatsApp demo'
  };
  var tab = 'overview';

  function ev() { return MC.events; }
  function H() { return ev().helpers; }
  function api(m, p, b) { return ev().api(m, p, b); }
  function param(name) {
    var m = (location.hash.split('?')[1] || '').match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function when(ms) { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function day(ms) { return ms ? new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'; }
  function n(x) { return (x || 0).toLocaleString(); }
  function view() { return $('v-admin'); }
  function report(action, target, detail) { api('POST', '/api/admin/log', { action: action, target: target, detail: detail }).catch(function () {}); }

  /* ---------- Entry: check the role, then draw the tabs ---------- */
  function show() {
    var el = view();
    if (!ev() || !ev().enabled()) { el.innerHTML = '<div class="card"><p>The events server is not set up.</p></div>'; return; }
    if (!ev().signedInMode()) {
      el.innerHTML = '<div class="card adm-gate"><h2>Admin</h2><p class="small">Sign in with Google or Microsoft to use the admin area.</p><button class="btn btn-primary" id="admSignIn">Sign in</button></div>';
      $('admSignIn').addEventListener('click', function () { $('accountBtn').click(); });
      return;
    }
    el.innerHTML = '<div class="card"><p class="small muted" style="margin:0">Checking your access…</p></div>';
    var go = ev().valid() ? Promise.resolve() : ev().ensureSession();
    go.then(function () { return api('GET', '/api/me'); }).then(function (j) {
      var u = j.user || {};
      if (!(u.isStaff || u.isAdmin)) {
        el.innerHTML = '<div class="card adm-gate"><h2>Admins only</h2><p class="small">This area is for Minneapolis Center admins. If you need access, contact MinneapolisCenter@sos.org.</p><a class="btn btn-ghost" href="#home">Back to Today</a></div>';
        return;
      }
      role = u.role || (u.isAdmin ? 'admin' : 'host');
      var allowed = TABS.filter(function (t) { return t[2] === 'staff' || role !== 'host'; });
      var want = param('tab');
      tab = allowed.some(function (t) { return t[0] === want; }) ? want : (allowed.some(function (t) { return t[0] === tab; }) ? tab : allowed[0][0]);
      el.innerHTML = '<div class="adm-head"><h1 class="greet" style="margin:0">Admin</h1><span class="badge role-badge">' + MC.esc(role) + '</span>' +
        '<span class="small muted adm-who">' + MC.esc(u.email || '') + ' · sessions last 12 hours</span></div>' +
        '<div class="adm-tabs" role="tablist">' + allowed.map(function (t) {
          return '<button role="tab" data-tab-id="' + t[0] + '" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="admBody"></div>';
      el.querySelector('.adm-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab-id]'); if (!b) return;
        history.replaceState(null, '', '#admin?tab=' + b.dataset.tabId);
        tab = b.dataset.tabId;
        el.querySelectorAll('.adm-tabs button').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
        draw();
      });
      draw();
    }).catch(function (x) {
      el.innerHTML = '<div class="card adm-gate"><h2>Admin</h2><p class="small">' + MC.esc(x.message || 'Could not reach the events server.') + '</p><button class="btn btn-ghost" id="admRetry">Try again</button></div>';
      $('admRetry').addEventListener('click', show);
    });
  }
  var role = null;
  function body() { return $('admBody'); }
  function loading() { body().innerHTML = '<div class="card"><p class="small muted" style="margin:0">Loading…</p></div>'; }
  function fail(x) { body().innerHTML = '<div class="card"><p class="small">' + MC.esc(x.message || 'Something went wrong.') + '</p></div>'; }
  function draw() { body().onclick = null; ({ overview: drawOverview, events: drawEvents, people: drawPeople, home: drawHome, team: drawTeam, log: drawLog })[tab](); }

  /* ---------- Overview (analytics) ---------- */
  function tile(k, v, sub) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div>'; }
  function drawOverview() {
    loading();
    api('GET', '/api/admin/stats').then(function (j) {
      var p = j.people || {}, a = j.activity || {}, pr = j.presence || {}, pt = j.points || {};
      var maxW = Math.max.apply(null, (j.signups || [0]).concat([1]));
      var gc = ((window.MC_CONFIG || {}).analyticsEndpoint || '').replace(/\/count$/, '');
      var html = '<div class="adm-grid">' +
        '<div class="card"><div class="section-title">Right now</div><div class="stats">' +
          tile('In the app now', n(pr.active)) + tile('Meditating now', n(pr.meditating)) + tile('In the app today', n(pr.activeToday)) + tile('Meditated today', n(pr.meditatedToday)) + '</div>' +
          '<p class="small muted" style="margin:10px 0 0">Signed-in people only. Guests aren’t counted.</p></div>' +
        '<div class="card"><div class="section-title">People</div><div class="stats">' +
          tile('Registered', n(p.total)) + tile('New · 7 days', n(p.new7), n(p.new30) + ' in 30 days') + tile('Active · 7 days', n(p.active7), n(p.active30) + ' in 30 days') +
          tile('Initiates', n(p.initiates), n(p.friends) + ' seeker friends · ' + n(p.seekers) + ' seekers') + '</div>' +
          '<div class="section-title" style="margin-top:14px">New sign-ups by week</div><div class="bars" aria-label="Sign-ups, last 8 weeks">' + (j.signups || []).map(function (v, i) {
            return '<span class="bar" style="height:' + Math.max(4, v / maxW * 100) + '%" title="' + v + ' sign-ups"><i>' + (v || '') + '</i></span>';
          }).join('') + '</div><div class="small muted bars-x"><span>8 weeks ago</span><span>this week</span></div></div>' +
        '<div class="card"><div class="section-title">Events · last 30 days</div><div class="stats">' +
          tile('Upcoming events', n(a.upcoming)) + tile('RSVPs (going)', n(a.rsvps30)) + tile('Check-ins', n(a.checkins30)) + tile('Event messages', n(a.messages30)) + '</div></div>' +
        '<div class="card"><div class="section-title">Engagement</div><div class="stats">' +
          tile('Avg points', n(pt.avg), n(pt.n) + ' people reported this month') + tile('Top points', n(pt.max)) +
          tile('Buddy pairs', n(a.buddyPairs)) + tile('App rating', a.rating ? a.rating + ' ★' : '—', n(a.feedback30) + ' feedback in 30 days') + '</div>' +
          '<div class="tool-row two" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#feedback">💬 Read feedback</a>' +
          (gc ? '<a class="btn btn-ghost btn-sm" href="' + MC.esc(gc) + '" target="_blank" rel="noopener">📈 Anonymous usage ↗</a>' : '<span></span>') + '</div>' +
          '<p class="small muted" style="margin:8px 0 0">Anonymous usage (screens and features used, no names) is kept by GoatCounter. Personal sittings stay on each person’s device and are never sent to the center.</p></div>' +
        '</div>' +
        '<div class="card"><div class="section-title">Attendance at recent events</div>' + ((j.recent || []).length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Event</th><th>Going</th><th>Checked in</th><th>Turnout</th></tr></thead><tbody>' +
          j.recent.map(function (e) {
            var pct = e.going ? Math.round(e.checkedIn / e.going * 100) + '%' : '—';
            return '<tr><td>' + MC.esc(day(e.startsAt)) + '</td><td><a href="#event?e=' + encodeURIComponent(e.id) + '">' + MC.esc(e.title) + '</a></td><td>' + e.going + '</td><td>' + e.checkedIn + '</td><td>' + pct + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="small muted" style="margin:0">No past events in the last 4 months.</p>') + '</div>';
      body().innerHTML = html;
    }).catch(fail);
  }

  /* ---------- Events: list, feature, check-in, reminders ---------- */
  var evRange = 'upcoming';
  function drawEvents() {
    loading();
    var t = Date.now(), from = evRange === 'past' ? t - 60 * 86400000 : t - 6 * 3600000, to = evRange === 'past' ? t : t + 120 * 86400000;
    Promise.all([api('GET', '/api/events?from=' + from + '&to=' + to), H().loadUpcoming().catch(function () {})]).then(function (r) {
      var list = (r[0].events || []).slice();
      if (evRange === 'past') list = list.filter(function (e) { return e.startsAt < t; }).reverse();
      var top = MC.topEvents().all.map(function (e) { return e.id; }), heroId = (MC.topEvents().hero || {}).id;
      var admin = role !== 'host';
      body().innerHTML = '<div class="card"><div class="section-title"><span class="seg" role="tablist"><button data-range="upcoming" class="' + (evRange === 'upcoming' ? 'on' : '') + '">Upcoming</button><button data-range="past" class="' + (evRange === 'past' ? 'on' : '') + '">Past 60 days</button></span>' +
        (admin ? '<button class="btn btn-primary btn-sm" id="admNewEv" style="flex:0 0 auto">+ New event</button>' : '') + '</div>' +
        (admin && evRange === 'upcoming' ? '<p class="small muted" style="margin:-2px 0 10px">The next three events show on Today. ★ picks which one is shown large; otherwise the soonest is.</p>' : '') +
        (list.length ? list.map(function (e) {
          var cx = e.status === 'cancelled', inTop = top.indexOf(e.id) >= 0;
          return '<div class="adm-ev' + (cx ? ' cx' : '') + '"><div class="adm-ev-main"><b>' + MC.esc(e.title) + '</b>' + (cx ? ' <span class="ag-st miss">Cancelled</span>' : '') +
            (e.id === heroId && evRange === 'upcoming' ? ' <span class="ag-st now">★ On Today</span>' : inTop && evRange === 'upcoming' ? ' <span class="ag-st up">On Today</span>' : '') +
            '<small>' + MC.esc(H().fmtWhen(e)) + ' · ' + MC.esc(H().FORMAT[e.format] || '') + '</small>' +
            '<small><b>' + (e.going || 0) + '</b> going · <b>' + (e.checkedIn || 0) + '</b> checked in</small></div>' +
            '<div class="adm-ev-act">' +
            (admin && inTop && !cx && evRange === 'upcoming' ? '<button class="btn btn-ghost btn-sm" data-hero="' + MC.esc(e.id) + '"' + (e.hero ? ' data-on="1"' : '') + ' title="Show this event large on Today">' + (e.hero ? '★ Featured' : '☆ Feature') + '</button>' : '') +
            '<a class="btn btn-soft btn-sm" href="#event?e=' + encodeURIComponent(e.id) + '">' + (evRange === 'past' ? 'Attendance' : 'RSVPs & check-in') + '</a>' +
            (admin && !cx ? '<button class="btn btn-ghost btn-sm" data-mail="' + MC.esc(e.id) + '">✉️ Email</button><button class="btn btn-ghost btn-sm" data-wa="' + MC.esc(e.id) + '">💬 WhatsApp</button>' : '') +
            '</div></div>';
        }).join('') : '<p class="small muted">No events.</p>') + '</div>';
      var byId = {}; list.forEach(function (e) { byId[e.id] = e; });
      body().querySelectorAll('[data-range]').forEach(function (b) { b.addEventListener('click', function () { evRange = b.dataset.range; drawEvents(); }); });
      if ($('admNewEv')) $('admNewEv').addEventListener('click', function () { H().openForm(null); });
      body().onclick = function (x) {
        var b = x.target.closest('[data-hero],[data-mail],[data-wa]'); if (!b) return;
        if (b.dataset.mail) return emailRsvps(byId[b.dataset.mail]);
        if (b.dataset.wa) return whatsappDemo(byId[b.dataset.wa]);
        var off = b.dataset.on === '1';
        api(off ? 'DELETE' : 'POST', '/api/admin/events/' + encodeURIComponent(b.dataset.hero) + '/hero').then(function () {
          MC.toast(off ? 'Back to the soonest event on Today.' : '★ Featured on Today.'); H().refreshHome(); drawEvents();
        }).catch(function (y) { MC.toast(y.message); });
      };
    }).catch(fail);
  }

  /* ---------- Reminder email (opens the admin's own email app) ---------- */
  var dlg = null;
  function sheet(html) {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'sheet adm-sheet'; dlg.id = 'admDlg';
      dlg.innerHTML = '<div class="sheet-body" id="admDlgBody"></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    }
    $('admDlgBody').innerHTML = html;
    if (dlg.showModal && !dlg.open) dlg.showModal();
    return $('admDlgBody');
  }
  function eventText(e) {
    var place = e.format === 'online' ? 'online (the join link is in the app)' : (e.venue || 'the Minneapolis Meditation Center') + (e.format === 'hybrid' ? ', or online' : '');
    return { subject: 'Reminder: ' + e.title + ' · ' + day(e.startsAt),
      body: 'Namaste,\n\nThis is a friendly reminder that you signed up for ' + e.title + ' on ' + H().fmtWhen(e) + ', ' + place + '.\n\n' +
        'Details and check-in: ' + MC.APP_LINK + '#event?e=' + encodeURIComponent(e.id) + '\n\nWe look forward to meditating with you.\n\n' +
        'Science of Spirituality Minneapolis Meditation Center\nMinneapolisCenter@sos.org · 612-216-4444' };
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { MC.toast(msg); }, function () { window.prompt('Copy this:', text); });
  }
  function emailRsvps(e) {
    if (!e) return;
    var b = sheet('<h2 class="sheet-title">✉️ Email reminder</h2><p class="small muted">Loading the RSVP list…</p>');
    api('GET', '/api/admin/events/' + encodeURIComponent(e.id) + '/attendees?purpose=email').then(function (j) {
      var rows = (j.attendees || []).filter(function (x) { return x.email && (x.rsvp === 'going' || x.rsvp === 'maybe'); });
      var t = eventText(e), me = (ev().valid() && MC.store.get('meditation-copilot:events-session', {}).user || {}).email || 'MinneapolisCenter@sos.org';
      b.innerHTML = '<h2 class="sheet-title">✉️ Email reminder</h2><p class="small" style="margin:0 0 8px"><b>' + MC.esc(e.title) + '</b> · ' + MC.esc(H().fmtWhen(e)) + '</p>' +
        '<div class="chips" id="emWho"><label class="chip on"><input type="checkbox" value="going" checked hidden> Going (' + rows.filter(function (x) { return x.rsvp === 'going'; }).length + ')</label>' +
        '<label class="chip"><input type="checkbox" value="maybe" hidden> Maybe (' + rows.filter(function (x) { return x.rsvp === 'maybe'; }).length + ')</label></div>' +
        '<label class="field" for="emSubj">Subject</label><input class="text-input" id="emSubj" value="' + MC.esc(t.subject) + '">' +
        '<label class="field" for="emBody">Message</label><textarea id="emBody" rows="9">' + MC.esc(t.body) + '</textarea>' +
        '<p class="small muted" id="emCount"></p>' +
        '<div class="actions"><button class="btn btn-ghost" data-close>Close</button><button class="btn btn-ghost" id="emCopy">Copy addresses</button><button class="btn btn-primary" id="emOpen">Open in my email app</button></div>' +
        '<p class="small muted" style="margin:10px 0 0">Recipients go in <b>Bcc</b>, so nobody sees the others’ addresses. The email is sent from your own email account. Automatic reminders can come later.</p>';
      function picked() {
        var on = []; b.querySelectorAll('#emWho input').forEach(function (i) { if (i.checked) on.push(i.value); });
        return rows.filter(function (x) { return on.indexOf(x.rsvp) >= 0; }).map(function (x) { return x.email; });
      }
      function count() { var p = picked(); $('emCount').textContent = p.length + (p.length === 1 ? ' recipient' : ' recipients'); $('emOpen').disabled = !p.length; }
      b.querySelectorAll('#emWho label').forEach(function (l) {
        l.addEventListener('click', function (x) { x.preventDefault(); var i = l.querySelector('input'); i.checked = !i.checked; l.classList.toggle('on', i.checked); count(); });
      });
      count();
      $('emCopy').addEventListener('click', function () { var p = picked(); copy(p.join(', '), p.length + ' addresses copied.'); report('copy_emails', e.id, p.length + ' addresses'); });
      $('emOpen').addEventListener('click', function () {
        var p = picked();
        var href = 'mailto:' + encodeURIComponent(me) + '?bcc=' + encodeURIComponent(p.join(',')) + '&subject=' + encodeURIComponent($('emSubj').value) + '&body=' + encodeURIComponent($('emBody').value);
        if (href.length > 1900) MC.toast('Long list: if your email app drops addresses, use "Copy addresses" and paste them into Bcc.', 6000);
        report('email_rsvps', e.id, p.length + ' recipients');
        location.href = href;
      });
    }).catch(function (x) { b.innerHTML = '<p>' + MC.esc(x.message) + '</p><button class="btn btn-ghost" data-close>Close</button>'; });
  }

  /* ---------- WhatsApp: concept demo (nothing is sent automatically) ---------- */
  function whatsappDemo(e) {
    if (!e) return;
    var b = sheet('<h2 class="sheet-title">💬 WhatsApp reminders</h2><p class="small muted">Loading…</p>');
    api('GET', '/api/admin/events/' + encodeURIComponent(e.id) + '/attendees?purpose=whatsapp').then(function (j) {
      var all = (j.attendees || []).filter(function (x) { return x.rsvp === 'going' || x.rsvp === 'maybe'; });
      var ok = all.filter(function (x) { return x.phone && x.smsOk; });
      var t = eventText(e), msg = '🙏 ' + t.body.replace(/^Namaste,\n\n/, 'Namaste! ');
      report('whatsapp_demo', e.id, ok.length + ' with permission');
      b.innerHTML = '<h2 class="sheet-title">💬 WhatsApp reminders <span class="badge demo-badge">Demo</span></h2>' +
        '<div class="notice small" style="margin-bottom:12px"><b>Concept preview.</b> WhatsApp has no free way to message many people at once. This shows how it would work from your own phone. Nothing is sent automatically.</div>' +
        '<p class="small" style="margin:0 0 8px"><b>' + ok.length + '</b> of ' + all.length + ' people who RSVP’d allowed text messages and gave a phone number.</p>' +
        '<div class="wa-preview"><div class="wa-bubble">' + MC.esc(msg).replace(/\n/g, '<br>') + '</div></div>' +
        '<div class="section-title" style="margin-top:12px">Option 1 · One by one</div>' +
        (ok.length ? ok.map(function (x) {
          var digits = x.phone.replace(/\D/g, '');
          return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(x.name || '') + '</b><small>' + MC.esc(H().fmtPhone(x.phone)) + ' · ' + (x.rsvp === 'going' ? 'Going' : 'Maybe') + '</small></span>' +
            '<a class="btn btn-whatsapp btn-sm" href="https://wa.me/' + digits + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">Open chat</a></div>';
        }).join('') : '<p class="small muted">Nobody on this list allowed text messages yet.</p>') +
        '<div class="section-title" style="margin-top:12px">Option 2 · Broadcast list on the center phone</div>' +
        '<p class="small" style="margin:0 0 8px">Copy the numbers, create a WhatsApp broadcast list on the center’s phone, then paste the message once. People receive it only if they saved the center’s number.</p>' +
        '<div class="tool-row two" style="margin-top:0"><button class="btn btn-ghost btn-sm" id="waNums"' + (ok.length ? '' : ' disabled') + '>Copy ' + ok.length + ' numbers</button><button class="btn btn-ghost btn-sm" id="waMsg">Copy message</button></div>' +
        '<div class="section-title" style="margin-top:12px">Option 3 · Later: automatic</div>' +
        '<p class="small muted" style="margin:0">WhatsApp Business (paid per message, with Meta-approved message templates) could send reminders automatically, like the planned automatic emails.</p>' +
        '<div class="actions"><button class="btn btn-ghost" data-close>Close</button></div>';
      if ($('waNums')) $('waNums').addEventListener('click', function () { copy(ok.map(function (x) { return x.phone; }).join('\n'), ok.length + ' numbers copied.'); });
      $('waMsg').addEventListener('click', function () { copy(msg, 'Message copied.'); });
    }).catch(function (x) { b.innerHTML = '<p>' + MC.esc(x.message) + '</p><button class="btn btn-ghost" data-close>Close</button>'; });
  }
  MC.adminTools = { emailRsvps: emailRsvps, whatsappDemo: whatsappDemo };

  /* ---------- People: search, then one person's contact, points and event history ---------- */
  var pq = '', ptimer = null;
  function drawPeople() {
    var pid = param('person');
    if (pid) return drawPerson(pid);
    body().innerHTML = '<div class="card"><label class="sr-only" for="admFind">Search people</label>' +
      '<input type="search" id="admFind" class="text-input" placeholder="Search by name, email or phone" autocomplete="off" value="' + MC.esc(pq) + '">' +
      '<div id="admPeople" style="margin-top:10px"></div></div>';
    $('admFind').addEventListener('input', function () { clearTimeout(ptimer); ptimer = setTimeout(function () { pq = $('admFind').value.trim(); search(); }, 300); });
    search();
    setTimeout(function () { if ($('admFind')) $('admFind').focus(); }, 50);
  }
  function search() {
    var out = $('admPeople'); if (!out) return;
    out.innerHTML = '<p class="small muted">Searching…</p>';
    api('GET', '/api/admin/users?q=' + encodeURIComponent(pq)).then(function (j) {
      var u = j.users || [];
      out.innerHTML = u.length ? u.map(function (x) {
        return '<a class="ad-row person-row" href="#admin?tab=people&person=' + encodeURIComponent(x.userId) + '"><span class="ag-main"><b>' + MC.esc(x.name || '(no name)') + '</b> <span class="badge">' + MC.esc(H().CATEGORY[x.category] || 'Seeker') + '</span>' +
          (x.blockedAt ? ' <span class="ag-st miss">Blocked</span>' : '') + '<small>' + MC.esc(x.email || '') + ' · ' + x.visits + (x.visits === 1 ? ' visit' : ' visits') + ' · last seen ' + MC.esc(MC.relDay(x.lastSeenAt)) + '</small></span><span class="muted">›</span></a>';
      }).join('') + (u.length >= 30 ? '<p class="small muted">Showing the first 30. Type more to narrow down.</p>' : '') : '<p class="small muted">Nobody found.</p>';
    }).catch(function (x) { out.innerHTML = '<p class="small">' + MC.esc(x.message) + '</p>'; });
  }
  function drawPerson(uid) {
    loading();
    api('GET', '/api/admin/users/' + encodeURIComponent(uid)).then(function (j) {
      var p = j.person, hist = j.history || [];
      var digits = (p.phone || '').replace(/\D/g, '');
      var visits = hist.filter(function (h) { return h.checkedInAt; }).length, going = hist.filter(function (h) { return h.rsvp === 'going'; }).length;
      body().innerHTML = '<p class="small" style="margin:0 0 8px"><a href="#admin?tab=people">‹ All people</a></p>' +
        '<div class="adm-grid"><div class="card"><div class="section-title"><span><b style="font-size:1.25rem">' + MC.esc(p.name || '(no name)') + '</b>' + (p.role ? ' <span class="badge role-badge">' + MC.esc(p.role) + '</span>' : '') + '</span></div>' +
          '<div class="kv"><span>Email</span><a href="mailto:' + MC.esc(p.email) + '">' + MC.esc(p.email) + '</a>' +
          '<span>Phone</span><span>' + (p.phone ? '<a href="tel:' + MC.esc(p.phone) + '">' + MC.esc(H().fmtPhone(p.phone)) + '</a>' + (p.smsOk ? ' · <a href="https://wa.me/' + digits + '" target="_blank" rel="noopener">WhatsApp</a> <span class="small muted">(allowed messages)</span>' : ' <span class="small muted">(no messages)</span>') : '—') + '</span>' +
          '<span>Status</span><span><select id="pCat" aria-label="Category">' + ['seeker', 'friend', 'initiate'].map(function (c) { return '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + H().CATEGORY[c] + '</option>'; }).join('') + '</select></span>' +
          '<span>Signed in with</span><span>' + MC.esc(p.provider === 'microsoft' ? 'Microsoft' : p.provider === 'google' ? 'Google' : p.provider) + '</span>' +
          '<span>Joined</span><span>' + MC.esc(day(p.createdAt)) + '</span><span>Last seen</span><span>' + MC.esc(when(p.lastSeenAt)) + '</span></div>' +
          '<div class="tool-row two" style="margin-top:12px"><button class="btn ' + (p.blockedAt ? 'btn-soft' : 'btn-danger') + ' btn-sm" id="pBlock">' + (p.blockedAt ? 'Unblock' : 'Block from events') + '</button><span></span></div>' +
          (p.blockedAt ? '<p class="small" style="color:var(--danger)">Blocked ' + MC.esc(day(p.blockedAt)) + (p.blockReason ? ': ' + MC.esc(p.blockReason) : '') + '</p>' : '') + '</div>' +
        '<div class="card"><div class="section-title">Activity</div><div class="stats">' +
          tile('🏆 Points', p.points == null ? '—' : n(p.points), p.pointsLevel ? MC.esc(p.pointsLevel) + (p.pointsAt ? ' · as of ' + MC.esc(MC.relDay(p.pointsAt)) : '') : 'not reported yet') +
          tile('Check-ins', n(visits)) + tile('RSVPs (going)', n(going)) + tile('Event messages', n(p.messages), n(p.feedback) + ' feedback · ' + n(p.buddies) + ' buddies') + '</div>' +
          '<p class="small muted" style="margin:10px 0 0">Points are updated whenever the person opens the app while signed in. Their sittings and reflections stay on their own device.</p></div></div>' +
        '<div class="card"><div class="section-title">Event history</div>' + (hist.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Date</th><th>RSVP</th><th>Check-in</th></tr></thead><tbody>' +
          hist.map(function (h) {
            return '<tr><td><a href="#event?e=' + encodeURIComponent(h.id) + '">' + MC.esc(h.title) + '</a>' + (h.status === 'cancelled' ? ' <span class="ag-st miss">Cancelled</span>' : '') + '</td><td>' + MC.esc(day(h.startsAt)) + '</td>' +
              '<td>' + (h.rsvp ? ({ going: 'Going', maybe: 'Maybe', no: 'Can’t go' }[h.rsvp] + '<br><small class="muted">' + MC.esc(when(h.rsvpAt)) + '</small>') : '—') + '</td>' +
              '<td>' + (h.checkedInAt ? '✓ ' + MC.esc(when(h.checkedInAt)) + '<br><small class="muted">' + MC.esc({ qr: 'QR code', code: 'code', host: 'by host', online: 'online' }[h.method] || h.method) + '</small>' : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="small muted" style="margin:0">No RSVPs or check-ins yet.</p>') + '</div>';
      $('pCat').addEventListener('change', function () {
        api('PATCH', '/api/admin/users?user=' + encodeURIComponent(p.userId), { category: $('pCat').value }).then(function () { MC.toast('Status updated.'); }).catch(function (x) { MC.toast(x.message); drawPerson(uid); });
      });
      $('pBlock').addEventListener('click', function () {
        var block = !p.blockedAt, reason = '';
        if (block) { reason = window.prompt('Block ' + (p.name || 'this person') + ' from center events? Optional reason (only admins see it):', ''); if (reason === null) return; }
        api('PATCH', '/api/admin/users?user=' + encodeURIComponent(p.userId), { blocked: block, reason: reason }).then(function () { MC.toast(block ? 'Blocked.' : 'Unblocked.'); drawPerson(uid); })
          .catch(function (x) { MC.toast(x.message); });
      });
    }).catch(fail);
  }

  /* ---------- Today screen: hero event and hero article ---------- */
  var articles = null;
  function drawHome() {
    loading();
    H().loadUpcoming().catch(function () {}).then(function () {
      var top = MC.topEvents(), cur = MC.heroArticle();
      body().innerHTML = '<div class="adm-grid"><div class="card"><div class="section-title">Hero event</div>' +
        '<p class="small muted" style="margin:-4px 0 10px">Today shows the next three events. Pick which one is shown large.</p>' +
        (top.all.length ? '<div class="radio-list">' +
          '<label><input type="radio" name="heroEv" value=""' + (top.all.some(function (e) { return e.hero; }) ? '' : ' checked') + '> <span><b>Automatic</b><small>The soonest event</small></span></label>' +
          top.all.map(function (e) {
            return '<label><input type="radio" name="heroEv" value="' + MC.esc(e.id) + '"' + (e.hero ? ' checked' : '') + '> <span><b>' + MC.esc(e.title) + '</b><small>' + MC.esc(H().fmtWhen(e)) + '</small></span></label>';
          }).join('') + '</div>' : '<p class="small muted">No upcoming events.</p>') + '</div>' +
        '<div class="card"><div class="section-title">Hero article</div><p class="small muted" style="margin:-4px 0 10px">Shown on Today under the events. Pick any article from News &amp; Archive.</p>' +
          '<select id="haPick" aria-label="Hero article"><option value="">Loading articles…</option></select>' +
          '<div id="haPrev" style="margin-top:12px"></div>' +
          '<details class="small" style="margin-top:10px"><summary>Or enter an article by hand</summary>' +
          '<label class="field" for="haUrl">Address (on sosmn.org)</label><input class="text-input" id="haUrl" placeholder="/news/…" value="' + MC.esc(cur ? cur.url : '') + '">' +
          '<label class="field" for="haTitle">Title</label><input class="text-input" id="haTitle" value="' + MC.esc(cur ? cur.title : '') + '">' +
          '<label class="field" for="haImg">Picture address (optional)</label><input class="text-input" id="haImg" value="' + MC.esc(cur && cur.image || '') + '">' +
          '<label class="field" for="haSum">One-line summary (optional)</label><input class="text-input" id="haSum" maxlength="300" value="' + MC.esc(cur && cur.summary || '') + '"></details>' +
          '<div class="tool-row two" style="margin-top:12px"><button class="btn btn-ghost btn-sm" id="haNone">Hide the article</button><button class="btn btn-primary btn-sm" id="haSave">Save article</button></div></div></div>';
      body().querySelectorAll('input[name="heroEv"]').forEach(function (r) {
        r.addEventListener('change', function () {
          var id = r.value, was = (top.all.filter(function (e) { return e.hero; })[0] || {}).id;
          var req = id ? api('POST', '/api/admin/events/' + encodeURIComponent(id) + '/hero') : (was ? api('DELETE', '/api/admin/events/' + encodeURIComponent(was) + '/hero') : Promise.resolve());
          req.then(function () { MC.toast(id ? '★ Hero event saved.' : 'Today shows the soonest event.'); H().refreshHome(); return H().loadUpcoming(); }).catch(function (x) { MC.toast(x.message); });
        });
      });
      function preview(a) {
        $('haPrev').innerHTML = a ? '<div class="ha-mini">' + (a.image ? '<img src="' + MC.esc(a.image.charAt(0) === '/' ? MC.siteUrl(a.image) : a.image) + '" alt="" onerror="this.hidden=true">' : '') +
          '<span><small class="muted">' + MC.esc(a.date || '') + '</small><b>' + MC.esc(a.title) + '</b></span></div>' : '<p class="small muted">No article is shown on Today.</p>';
      }
      function fill(a) { $('haUrl').value = a ? a.url : ''; $('haTitle').value = a ? a.title : ''; $('haImg').value = a && a.image || ''; $('haSum').value = a && a.summary || ''; preview(a); }
      preview(cur);
      function paintPick() {
        var opts = (articles || []).map(function (a, i) { return '<option value="' + i + '"' + (cur && a.url === cur.url ? ' selected' : '') + '>' + MC.esc(a.date + ' · ' + a.title) + '</option>'; }).join('');
        $('haPick').innerHTML = '<option value="">' + (articles && articles.length ? 'Choose an article…' : 'Article list not available here; enter one by hand') + '</option>' + opts;
      }
      if (articles) paintPick();
      else fetch(MC.siteUrl('/news/articles.json')).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { articles = j.articles || []; paintPick(); }).catch(function () { articles = []; paintPick(); });
      $('haPick').addEventListener('change', function () {
        var a = (articles || [])[Number($('haPick').value)];
        if (a) fill({ url: a.url, title: a.title, image: a.image, summary: a.summary, date: a.date });
      });
      ['haUrl', 'haTitle', 'haImg', 'haSum'].forEach(function (id) { $(id).addEventListener('input', function () { preview({ url: $('haUrl').value, title: $('haTitle').value, image: $('haImg').value, summary: $('haSum').value }); }); });
      $('haSave').addEventListener('click', function () {
        var a = { url: $('haUrl').value.trim(), title: $('haTitle').value.trim(), image: $('haImg').value.trim() || null, summary: $('haSum').value.trim() || null };
        var picked = (articles || []).filter(function (x) { return x.url === a.url; })[0];
        if (picked) a.date = picked.date;
        H().saveSettings({ heroArticle: a }).then(function () { MC.toast('Hero article saved.'); cur = MC.heroArticle(); }).catch(function (x) { MC.toast(x.message, 5000); });
      });
      $('haNone').addEventListener('click', function () {
        if (!window.confirm('Hide the hero article on Today?')) return;
        H().saveSettings({ heroArticle: null }).then(function () { MC.toast('Article hidden.'); fill(null); }).catch(function (x) { MC.toast(x.message); });
      });
    });
  }

  /* ---------- Team ---------- */
  function drawTeam() {
    loading();
    api('GET', '/api/admin/staff').then(function (j) {
      var edit = j.canEdit;
      body().innerHTML = '<div class="adm-grid"><div class="card"><div class="section-title">Team</div>' +
        j.owners.map(function (o) { return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(o) + '</b><small>Owner · set on the server</small></span><span class="badge role-badge">owner</span></div>'; }).join('') +
        (j.staff || []).map(function (s) {
          return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(s.name || s.email) + '</b><small>' + MC.esc(s.email) + ' · added ' + MC.esc(day(s.addedAt)) + (s.lastSeenAt ? ' · last seen ' + MC.esc(MC.relDay(s.lastSeenAt)) : ' · not signed in yet') + '</small></span>' +
            '<span class="badge role-badge">' + MC.esc(s.role) + '</span>' + (edit ? '<button class="btn btn-ghost btn-sm" data-rm="' + MC.esc(s.email) + '">Remove</button>' : '') + '</div>';
        }).join('') +
        (edit ? '<form id="tmForm" style="margin-top:14px"><label class="field" for="tmEmail">Add a person (their Google or Microsoft sign-in email)</label>' +
          '<input class="text-input" id="tmEmail" type="email" required placeholder="name@example.com">' +
          '<div class="tool-row two" style="margin-top:8px"><select id="tmRole" aria-label="Role"><option value="host">Host · check-in only</option><option value="admin">Admin · everything except Team</option></select>' +
          '<button class="btn btn-primary btn-sm" type="submit">Add</button></div><p class="error" id="tmErr"></p></form>' : '<p class="small muted">Only the owner can change the team.</p>') + '</div>' +
        '<div class="card"><div class="section-title">Roles</div><div class="kv"><span>Owner</span><span>Everything, including adding and removing admins and hosts.</span>' +
          '<span>Admin</span><span>Events, RSVPs, check-in, reminders, people and contact details, analytics, Today screen, activity log.</span>' +
          '<span>Host</span><span>Check people in at the door. Sees names only, no contact details.</span></div>' +
          '<p class="small muted" style="margin:10px 0 0">Admin and host sign-ins last 12 hours. Every admin action is recorded in Activity.</p></div></div>';
      if (!edit) return;
      body().querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!window.confirm('Remove ' + b.dataset.rm + ' from the team?')) return;
          api('DELETE', '/api/admin/staff?email=' + encodeURIComponent(b.dataset.rm)).then(function () { MC.toast('Removed.'); drawTeam(); }).catch(function (x) { MC.toast(x.message); });
        });
      });
      $('tmForm').addEventListener('submit', function (e) {
        e.preventDefault();
        api('POST', '/api/admin/staff', { email: $('tmEmail').value.trim(), role: $('tmRole').value }).then(function () { MC.toast('Added. They see Admin after their next sign-in.'); drawTeam(); })
          .catch(function (x) { $('tmErr').textContent = x.message; });
      });
    }).catch(fail);
  }

  /* ---------- Activity log ---------- */
  function drawLog() {
    loading();
    api('GET', '/api/admin/log').then(function (j) {
      var rows = j.log || [];
      body().innerHTML = '<div class="card"><div class="section-title">Activity <span class="small muted">last ' + rows.length + '</span></div>' +
        (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' + rows.map(function (r) {
          return '<tr><td>' + MC.esc(when(r.at)) + '</td><td>' + MC.esc(r.byEmail || '') + '</td><td>' + MC.esc(ACTIONS[r.action] || r.action) + '</td><td class="small">' + MC.esc([r.detail, r.target].filter(Boolean).join(' · ')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="small muted">Nothing yet.</p>') + '</div>';
    }).catch(fail);
  }

  MC.views.admin = { show: show };
})();
