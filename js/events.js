/* Meditation Copilot — SOS-hosted events (Part 2, B2–B4)
 * Talks to the events server (api/ — Cloudflare Worker + D1). Configure MC_CONFIG.apiBase.
 *  - Browse upcoming events (Calendar tab), event page (#event?e=<id>)
 *  - RSVP (Going / Maybe / Can't go), add to phone calendar, share
 *  - Check in: in person with the 4-digit code (or the QR code at the door, which carries the code);
 *    online by tapping "Join & check in" during the event
 *  - Admins: create / edit / cancel, check-in code + QR for the door, attendee list, host check-in, CSV
 *  - Rewards: hosted online check-in 25 points, in-person 50 points
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$, CFG = window.MC_CONFIG || {};
  var SESSION_KEY = 'meditation-copilot:events-session';
  var CACHE_KEY = 'meditation-copilot:events-cache';
  var CK_KEY = 'meditation-copilot:hosted-checkins';
  var FORMAT = { in_person: '📍 In person', online: '💻 Online', hybrid: '📍💻 In person & online' };

  function base() { return String(MC.store.get('meditation-copilot:api-override', null) || CFG.apiBase || '').replace(/\/+$/, ''); }
  var session = MC.store.get(SESSION_KEY, null);
  function valid() { return !!(session && session.token && session.exp > Date.now() + 60000); }
  function clearSession() { session = null; MC.store.del(SESSION_KEY); }
  function err(msg, extra) { var e = new Error(msg); Object.assign(e, extra || {}); return e; }

  /* ---------- API ---------- */
  function raw(method, path, body) {
    var h = { 'Content-Type': 'application/json' };
    if (valid()) h.Authorization = 'Bearer ' + session.token;
    return fetch(base() + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined });
  }
  function api(method, path, body, retried) {
    return raw(method, path, body).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && valid() && !retried) {           // session expired: get a new one once
          clearSession();
          return ensureSession().then(function () { return api(method, path, body, true); });
        }
        if (!r.ok) throw err(j.error || ('Something went wrong (' + r.status + ')'), { status: r.status });
        return j;
      });
    }, function () { throw err('Can\u2019t reach the events server. Check your connection.', { offline: true }); });
  }
  function signedInMode() { var m = MC.account.mode(); return m === 'google' || m === 'microsoft'; }
  function ensureSession() {
    if (valid()) return Promise.resolve(session);
    if (!signedInMode()) return Promise.reject(err('Please sign in with Google or Microsoft first.', { needsSignIn: true }));
    return MC.sync.identityToken().then(function (idt) {
      return fetch(base() + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idt) });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw err(j.error || 'Could not sign in to events'); return j; });
    }).then(function (j) {
      session = { token: j.token, user: j.user, exp: Date.now() + 29 * 86400000 };
      MC.store.set(SESSION_KEY, session);
      refreshMe();
      return session;
    });
  }
  // From a tap: make sure we can sign in to the events server (Google may need a quick reconnect pop-up)
  function withSession(fn) {
    var run;
    if (valid()) run = Promise.resolve().then(fn);
    else if (!signedInMode()) { promptSignIn(); return Promise.resolve(); }
    else {
      var p = MC.sync.provider();
      var pre = (p && p.id === 'google' && !p.canSync()) ? MC.sync.reconnect() : Promise.resolve();
      run = pre.then(ensureSession).then(fn);
    }
    return run.catch(function (e) { MC.toast(e.message || 'Something went wrong.', 4500); throw e; });
  }
  function promptSignIn() {
    MC.toast('Sign in with Google or Microsoft to RSVP and check in.', 4500);
    $('accountBtn').click();
  }
  function refreshMe() {
    if (!valid()) return Promise.resolve();
    return api('GET', '/api/me').then(function (j) {
      session.user = j.user; MC.store.set(SESSION_KEY, session);
      MC.store.set(CK_KEY, j.checkins || []);
      MC.emit('data');                          // re-evaluate rewards
    }).catch(function () {});
  }

  MC.events = {
    enabled: function () { return !!base(); },
    isAdmin: function () { return valid() && session.user && session.user.isAdmin; },
    hostedCheckins: function () { return MC.store.get(CK_KEY, []) || []; }
  };

  /* ---------- Rewards for hosted check-ins ---------- */
  function isInPerson(c) { return c.format === 'in_person' || (c.format === 'hybrid' && c.method !== 'online'); }
  if (MC.rewards && MC.rewards.addRule) {
    MC.rewards.addRule({ id: 'hosted_online', category: 'community', icon: '💻', name: 'Joined an SOS Online Event', desc: 'Check in to an SOS-hosted online event', points: 25, repeat: true,
      count: function () { return MC.events.hostedCheckins().filter(function (c) { return !isInPerson(c); }).length; } });
    MC.rewards.addRule({ id: 'hosted_in_person', category: 'community', icon: '📍', name: 'Attended an SOS Event in Person', desc: 'Check in at an SOS-hosted event in person', points: 50, repeat: true,
      count: function () { return MC.events.hostedCheckins().filter(isInPerson).length; } });
  }

  /* ---------- Formatting ---------- */
  function fmtWhen(e) {
    var s = new Date(e.startsAt), en = new Date(e.endsAt);
    var day = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    var t1 = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    var sameDay = MC.toISO(s) === MC.toISO(en);
    var t2 = sameDay ? en.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : en.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + en.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return day + ' · ' + t1 + '–' + t2;
  }
  function linkFor(e) { return MC.APP_LINK + '#event?e=' + encodeURIComponent(e.id); }
  function param(name) {
    var m = (location.hash.split('?')[1] || '').match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- Upcoming events (Calendar tab) ---------- */
  var cache = MC.store.get(CACHE_KEY, { events: [], at: 0 }) || { events: [], at: 0 };
  function loadUpcoming() {
    if (!MC.events.enabled()) return Promise.resolve(cache.events);
    var from = Date.now() - 6 * 3600000, to = Date.now() + 90 * 86400000;
    return api('GET', '/api/events?from=' + from + '&to=' + to).then(function (j) {
      cache = { events: j.events || [], at: Date.now() };
      MC.store.set(CACHE_KEY, cache);
      return cache.events;
    });
  }
  MC.eventsOn = function (isoDay) {      // for the Calendar month dots and day agenda
    return (cache.events || []).filter(function (e) { return MC.toISO(new Date(e.startsAt)) === isoDay && e.status !== 'cancelled'; });
  };

  function eventRow(e) {
    var tag = e.status === 'cancelled' ? '<span class="ag-st miss">Cancelled</span>'
      : e.myCheckin ? '<span class="ag-st ok">✓ Checked in</span>'
      : e.myRsvp === 'going' ? '<span class="ag-st now">Going</span>'
      : e.myRsvp === 'maybe' ? '<span class="ag-st up">Maybe</span>' : '';
    return '<a class="ev-row" href="#event?e=' + encodeURIComponent(e.id) + '"><span class="ev-date"><b>' + new Date(e.startsAt).getDate() + '</b>' +
      new Date(e.startsAt).toLocaleDateString(undefined, { month: 'short' }) + '</span><span class="ag-main"><b>' + MC.esc(e.title) + '</b><small>' +
      MC.esc(fmtWhen(e).split(' · ')[1]) + ' · ' + MC.esc(FORMAT[e.format] || '') + (e.going ? ' · ' + e.going + ' going' : '') + '</small></span>' + tag + '</a>';
  }
  function renderCard() {
    var el = $('calEvents'); if (!el) return;
    if (!MC.events.enabled()) {
      el.innerHTML = '<div class="section-title">SOS events <span class="small muted">coming soon</span></div>' +
        '<p class="small" style="margin:-4px 0 12px">Group meditations, programs and retreats, in person and online, with RSVP, check-in and reminders.</p>' +
        '<a class="btn btn-soft btn-sm btn-block" href="https://sos.org/find-local-programs/" target="_blank" rel="noopener">Find programs on sos.org ↗</a>';
      return;
    }
    var html = '<div class="section-title">SOS events' + (MC.events.isAdmin() ? ' <button class="btn btn-soft btn-sm" id="evNew" style="flex:0 0 auto">+ New event</button>' : '') + '</div>';
    var list = (cache.events || []).filter(function (e) { return e.endsAt > Date.now() - 3600000; });
    html += list.length ? list.slice(0, 12).map(eventRow).join('') : '<p class="small muted" style="margin:0">No upcoming events yet.</p>';
    if (!signedInMode()) html += '<p class="small muted" style="margin:12px 0 0">Sign in with Google or Microsoft to RSVP and check in.</p>';
    else if (!valid()) html += '<button class="btn btn-soft btn-sm btn-block" id="evConnect" style="margin-top:12px">Connect to SOS events</button>';
    el.innerHTML = html;
    if ($('evNew')) $('evNew').addEventListener('click', function () { openForm(null); });
    if ($('evConnect')) $('evConnect').addEventListener('click', function () {
      withSession(function () { MC.renderEventsCard(); }).catch(function () {});
    });
  }
  MC.renderEventsCard = function () {
    renderCard();
    // Signed in but not yet connected to the events server: connect quietly (no pop-up) so admin tools and RSVPs show
    var pre = (signedInMode() && !valid() && MC.events.enabled()) ? ensureSession().catch(function () {}) : Promise.resolve();
    pre.then(loadUpcoming).then(function () { renderCard(); if (MC.current === 'calendar' && MC.views.calendar.refreshMonth) MC.views.calendar.refreshMonth(); })
      .catch(function (e) { if ($('calEvents') && !(cache.events || []).length) $('calEvents').insertAdjacentHTML('beforeend', '<p class="small muted">' + MC.esc(e.message) + '</p>'); });
  };

  /* ---------- Event page ---------- */
  var current = null, adminTimer = null;
  function showEvent() {
    var id = param('e'), view = $('v-event');
    clearInterval(adminTimer);
    if (!id) { MC.go('calendar'); return; }
    if (!MC.events.enabled()) { view.innerHTML = '<div class="card">Events are not set up yet.</div>'; return; }
    view.innerHTML = '<div class="card center muted">Loading event…</div>';
    var go = function () {
      return api('GET', '/api/events/' + encodeURIComponent(id)).then(function (j) { current = j.event; render(); })
        .catch(function (e) { view.innerHTML = '<div class="card"><p>' + MC.esc(e.message) + '</p><a class="link" href="#calendar">‹ Back to Calendar</a></div>'; });
    };
    // Signed in but no events session yet: get one quietly (Microsoft renews silently; Google if still valid)
    if (!valid() && signedInMode()) ensureSession().then(go, go); else go();
  }
  function windowOpen(e, online) {
    var t = Date.now();
    return online ? (t >= e.startsAt - 15 * 60000 && t <= e.endsAt) : (t >= e.startsAt - 30 * 60000 && t <= e.endsAt + 30 * 60000);
  }
  function render() {
    var e = current, view = $('v-event'), html = '';
    var ended = Date.now() > e.endsAt + 30 * 60000, cancelled = e.status === 'cancelled';
    html += '<a class="link" href="#calendar" style="padding:4px 0;display:inline-block">‹ Calendar</a>';
    html += '<div class="card"><span class="ev-format">' + MC.esc(FORMAT[e.format] || '') + (e.visibility === 'members' ? ' · Members' : '') + '</span>' +
      '<h1 class="ev-title">' + MC.esc(e.title) + '</h1>' +
      '<p class="ev-when">🗓 ' + MC.esc(fmtWhen(e)) + '</p>' +
      (cancelled ? '<div class="status behind" style="margin:10px 0">This event has been cancelled.</div>' : '') +
      (e.venue || e.address ? '<p class="small" style="margin:6px 0">📍 <b>' + MC.esc(e.venue || '') + '</b>' + (e.address ? '<br><a href="https://maps.google.com/?q=' + encodeURIComponent(e.address) + '" target="_blank" rel="noopener">' + MC.esc(e.address) + ' ↗</a>' : '') + '</p>' : '') +
      (e.format !== 'in_person' ? '<p class="small muted" style="margin:6px 0">💻 ' + (e.onlineUrl === undefined ? 'Sign in to get the online link.' : e.onlineUrl ? 'Online link opens when you check in.' : 'The online link will be added soon.') + '</p>' : '') +
      (e.description ? '<p style="white-space:pre-wrap;margin:12px 0 0">' + MC.esc(e.description) + '</p>' : '') +
      '<p class="small muted" style="margin:12px 0 0">' + (e.going || 0) + ' going' + (e.checkedIn ? ' · ' + e.checkedIn + ' checked in' : '') + '</p></div>';

    // Check-in
    if (!cancelled) {
      var codeFromQr = param('c');
      if (e.myCheckin) {
        html += '<div class="card ck-done">✓ You\u2019re checked in <span class="small">(' + MC.esc(MC.fmtTime(e.myCheckin)) + ')</span>' +
          (e.format !== 'in_person' && e.onlineUrl && windowOpen(e, true) ? '<a class="btn btn-soft btn-sm btn-block" style="margin-top:10px" href="' + MC.esc(e.onlineUrl) + '" target="_blank" rel="noopener">Open the online session ↗</a>' : '') + '</div>';
      } else if (!ended) {
        var inPersonOpen = e.format !== 'online' && windowOpen(e, false), onlineOpen = e.format !== 'in_person' && windowOpen(e, true);
        html += '<div class="card"><div class="section-title">Check in</div>';
        if (e.format !== 'online') {
          html += inPersonOpen || codeFromQr
            ? '<p class="small" style="margin:-6px 0 10px">At the venue? Enter the 4-digit code shown by the host' + (codeFromQr ? ' (filled in from the QR code)' : '') + '.</p>' +
              '<div class="ck-row"><input type="text" id="ckCode" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" value="' + MC.esc(codeFromQr || '') + '" aria-label="Check-in code">' +
              '<button class="btn btn-gold" id="ckGo">Check in · +50</button></div>'
            : '<p class="small muted" style="margin:-6px 0 0">In-person check-in opens 30 minutes before the start.</p>';
        }
        if (e.format !== 'in_person') {
          html += onlineOpen
            ? '<button class="btn btn-primary btn-block" id="ckOnline" style="margin-top:10px">💻 Join & check in · +25</button>'
            : '<p class="small muted" style="margin:8px 0 0">Online check-in opens 15 minutes before the start.</p>';
        }
        html += '</div>';
      }
    }

    // RSVP + actions
    if (!cancelled && !ended) {
      html += '<div class="card"><div class="section-title">Will you join?</div><div class="rsvp-seg">' +
        [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Can\u2019t go']].map(function (o) {
          return '<button class="' + (e.myRsvp === o[0] ? 'on' : '') + '" data-rsvp="' + o[0] + '">' + o[1] + '</button>';
        }).join('') + '</div>' +
        (signedInMode() ? '' : '<p class="small muted" style="margin:10px 0 0">Sign in with Google or Microsoft to RSVP. Adults bringing friends: each person registers in the app, before the event or at the door.</p>') + '</div>';
    }
    html += '<div class="tool-row two"><button class="btn btn-ghost btn-sm" id="evIcs">📅 Add to calendar</button><button class="btn btn-ghost btn-sm" id="evShare">↗ Share</button></div>';

    // Admin tools
    if (MC.events.isAdmin()) html += '<div class="card admin-card" id="evAdmin" style="margin-top:16px"></div>';
    view.innerHTML = html;
    bind();
    if (MC.events.isAdmin()) { renderAdmin(); adminTimer = setInterval(function () { if (MC.current === 'event') loadAttendees(); }, 20000); }
    // Arrived by scanning the QR code: offer one-tap check-in
    if (param('c') && !e.myCheckin && !cancelled && $('ckCode')) $('ckCode').focus();
  }

  function bind() {
    var e = current;
    view$('[data-rsvp]').forEach(function (b) {
      b.addEventListener('click', function () {
        withSession(function () {
          return api('PUT', '/api/events/' + encodeURIComponent(e.id) + '/rsvp', { status: b.dataset.rsvp }).then(function () {
            MC.track('event_rsvp', { status: b.dataset.rsvp, format: e.format });
            MC.toast(b.dataset.rsvp === 'going' ? 'See you there! 🙏' : 'RSVP updated.');
            showEvent(); loadUpcoming().catch(function () {});
          });
        }).catch(function () {});
      });
    });
    if ($('ckGo')) $('ckGo').addEventListener('click', function () {
      var code = ($('ckCode').value || '').trim();
      if (!/^\d{4}$/.test(code)) { MC.toast('Please enter the 4-digit code.'); return; }
      withSession(function () {
        return api('POST', '/api/events/' + encodeURIComponent(e.id) + '/checkin', { method: param('c') ? 'qr' : 'code', code: code }).then(function (r) {
          MC.track('event_checkin', { format: e.format, method: 'code' });
          MC.toast(r.already ? 'You were already checked in. 🙏' : 'Checked in. Welcome! 🙏', 4000);
          if (param('c')) history.replaceState(null, '', location.pathname + '#event?e=' + encodeURIComponent(e.id));
          refreshMe(); showEvent();
        });
      }).catch(function () {});
    });
    if ($('ckOnline')) $('ckOnline').addEventListener('click', function () {
      var w = window.open('', '_blank');          // open now (inside the tap) so it isn't blocked
      withSession(function () {
        return api('POST', '/api/events/' + encodeURIComponent(e.id) + '/checkin', { method: 'online' }).then(function (r) {
          MC.track('event_checkin', { format: e.format, method: 'online' });
          if (r.onlineUrl && w) w.location.href = r.onlineUrl; else if (w) w.close();
          if (!r.onlineUrl) MC.toast('Checked in. The online link has not been added yet.');
          refreshMe(); showEvent();
        });
      }).catch(function () { if (w) w.close(); });
      setTimeout(function () { if (w && !w.closed && w.location.href === 'about:blank' && !valid()) w.close(); }, 15000);
    });
    $('evIcs').addEventListener('click', function () { downloadIcs(e); });
    $('evShare').addEventListener('click', function () {
      var text = '🙏 Join me at "' + e.title + '" · ' + fmtWhen(e) + (e.format === 'online' ? ' (online)' : e.venue ? ' at ' + e.venue : '') + '\n' + linkFor(e);
      MC.track('event_share');
      if (navigator.share) navigator.share({ title: e.title, text: text }).catch(function () {});
      else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }
  function view$(sel) { return Array.prototype.slice.call($('v-event').querySelectorAll(sel)); }

  function downloadIcs(e) {
    function u(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meditation Copilot//Events//EN', 'BEGIN:VEVENT',
      'UID:' + e.id + '@meditation-copilot-events', 'DTSTAMP:' + u(Date.now()), 'DTSTART:' + u(e.startsAt), 'DTEND:' + u(e.endsAt),
      'SUMMARY:' + esc('🙏 ' + e.title), 'DESCRIPTION:' + esc((e.description ? e.description + '\n\n' : '') + linkFor(e)),
      'LOCATION:' + esc(e.format === 'online' ? 'Online' : [e.venue, e.address].filter(Boolean).join(', ')),
      'URL:' + linkFor(e), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-PT60M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    var url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'sos-event.ics'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    MC.toast('Calendar file downloaded. Open it to add the event.');
  }

  /* ---------- Admin: door screen, attendees, host check-in ---------- */
  function qrSvg(text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    catch (x) { return ''; }
  }
  function renderAdmin() {
    var e = current, el = $('evAdmin'); if (!el) return;
    var door = e.format !== 'online' ? '<div class="door"><div class="small muted">Check-in code</div><div class="door-code">' + MC.esc(e.checkinCode || '----') + '</div>' +
      '<div class="door-qr">' + qrSvg(linkFor(e) + '&c=' + (e.checkinCode || '')) + '</div><div class="small muted">Show this at the door: people scan the QR code or type the code.</div>' +
      '<button class="link" id="adNewCode">Generate a new code</button></div>' : '';
    el.innerHTML = '<div class="section-title">Host tools <span class="small muted">admin</span></div>' + door +
      '<div class="section-title" style="margin-top:16px">Attendees <button class="link" id="adRefresh" style="padding:0">Refresh</button></div><div id="adList" class="small muted">Loading…</div>' +
      '<label class="field" for="adFind">Check in someone who registered on the spot</label>' +
      '<input type="search" id="adFind" class="text-input" placeholder="Search name or email" autocomplete="off"><div id="adFound"></div>' +
      '<div class="tool-row" style="grid-template-columns:1fr 1fr 1fr;margin-top:14px">' +
      '<button class="btn btn-ghost btn-sm" id="adCsv">⬇ CSV</button><button class="btn btn-ghost btn-sm" id="adEdit">✎ Edit</button>' +
      '<button class="btn btn-danger btn-sm" id="adCancel">' + (e.status === 'cancelled' ? 'Restore' : 'Cancel event') + '</button></div>';
    $('adRefresh').addEventListener('click', loadAttendees);
    $('adEdit').addEventListener('click', function () { openForm(current); });
    $('adCsv').addEventListener('click', downloadCsv);
    $('adCancel').addEventListener('click', function () {
      var cancel = current.status !== 'cancelled';
      if (cancel && !window.confirm('Cancel this event? People who RSVP\u2019d will see it as cancelled.')) return;
      api('POST', '/api/admin/events/' + encodeURIComponent(current.id) + (cancel ? '/cancel' : '/restore')).then(function () { MC.toast(cancel ? 'Event cancelled.' : 'Event restored.'); showEvent(); }).catch(function (x) { MC.toast(x.message); });
    });
    if ($('adNewCode')) $('adNewCode').addEventListener('click', function () {
      if (!window.confirm('Create a new check-in code? The old code and QR stop working.')) return;
      api('POST', '/api/admin/events/' + encodeURIComponent(current.id) + '/new-code').then(function (j) { current = j.event; renderAdmin(); }).catch(function (x) { MC.toast(x.message); });
    });
    var t;
    $('adFind').addEventListener('input', function () {
      clearTimeout(t); var q = $('adFind').value.trim();
      if (q.length < 2) { $('adFound').innerHTML = ''; return; }
      t = setTimeout(function () {
        api('GET', '/api/admin/users?q=' + encodeURIComponent(q)).then(function (j) {
          $('adFound').innerHTML = (j.users || []).length ? j.users.map(function (u) {
            return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(u.name || '') + '</b><small>' + MC.esc(u.email || '') + '</small></span>' +
              '<button class="btn btn-soft btn-sm" data-ck="' + MC.esc(u.userId) + '">Check in</button></div>';
          }).join('') : '<p class="small muted">No registered person found. Ask them to open the app and sign in, then search again.</p>';
        }).catch(function (x) { $('adFound').innerHTML = '<p class="small muted">' + MC.esc(x.message) + '</p>'; });
      }, 300);
    });
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ck],[data-unck]'); if (!b) return;
      var undo = b.hasAttribute('data-unck'), uid = b.getAttribute(undo ? 'data-unck' : 'data-ck');
      if (undo && !window.confirm('Undo this check-in?')) return;
      api(undo ? 'DELETE' : 'POST', '/api/admin/events/' + encodeURIComponent(current.id) + '/checkin?user=' + encodeURIComponent(uid))
        .then(function () { MC.toast(undo ? 'Check-in removed.' : 'Checked in.'); loadAttendees(); })
        .catch(function (x) { MC.toast(x.message); });
    });
    loadAttendees();
  }
  function loadAttendees() {
    if (!$('adList')) return;
    api('GET', '/api/admin/events/' + encodeURIComponent(current.id) + '/attendees').then(function (j) {
      var a = j.attendees || [], inN = a.filter(function (x) { return x.checkedInAt; }).length;
      var going = a.filter(function (x) { return x.rsvp === 'going'; }).length;
      $('adList').innerHTML = '<p class="small" style="margin:0 0 8px"><b>' + inN + '</b> checked in · <b>' + going + '</b> going · ' + a.length + ' responded</p>' +
        (a.length ? a.map(function (x) {
          return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(x.name || '') + '</b><small>' + MC.esc(x.email || '') + ' · ' +
            (x.rsvp ? { going: 'Going', maybe: 'Maybe', no: 'Can\u2019t go' }[x.rsvp] : 'No RSVP') +
            (x.checkedInAt ? ' · ✓ ' + MC.esc(MC.fmtTime(x.checkedInAt)) + ' (' + x.method + ')' : '') + '</small></span>' +
            (x.checkedInAt ? '<button class="btn btn-ghost btn-sm" data-unck="' + MC.esc(x.userId) + '">Undo</button>'
              : '<button class="btn btn-soft btn-sm" data-ck="' + MC.esc(x.userId) + '">Check in</button>') + '</div>';
        }).join('') : '<p class="small muted">No responses yet.</p>');
    }).catch(function (x) { $('adList').textContent = x.message; });
  }
  function downloadCsv() {
    raw('GET', '/api/admin/events/' + encodeURIComponent(current.id) + '/attendees?format=csv').then(function (r) {
      if (!r.ok) throw err('Could not download');
      return r.blob();
    }).then(function (b) {
      var url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = 'attendance-' + MC.toISO(new Date(current.startsAt)) + '.csv'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    }).catch(function (x) { MC.toast(x.message); });
  }

  /* ---------- Admin: create / edit form ---------- */
  var dlg = $('evDlg'), editing = null;
  function hm(ms) { return MC.toHM(new Date(ms)); }
  function openForm(e) {
    editing = e;
    var start = e ? e.startsAt : (function () { var d = MC.addDays(MC.today(), 1); d.setHours(10, 0, 0, 0); return d.getTime(); })();
    var end = e ? e.endsAt : start + 90 * 60000;
    $('efTitle').value = e ? e.title : '';
    $('efFormat').value = e ? e.format : 'in_person';
    $('efDate').value = MC.toISO(new Date(start));
    $('efStart').value = hm(start); $('efEnd').value = hm(end);
    $('efVenue').value = e ? (e.venue || '') : 'Minneapolis Center';
    $('efAddress').value = e ? (e.address || '') : '';
    $('efUrl').value = e ? (e.onlineUrl || '') : '';
    $('efDesc').value = e ? (e.description || '') : '';
    $('efVis').value = e ? e.visibility : 'public';
    $('efHead').textContent = e ? 'Edit event' : 'New SOS event';
    $('efErr').textContent = '';
    syncFormat();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function syncFormat() {
    var f = $('efFormat').value;
    $('efPlace').hidden = f === 'online';
    $('efOnline').hidden = f === 'in_person';
  }
  $('efFormat').addEventListener('change', syncFormat);
  $('efCancel').addEventListener('click', function () { dlg.close(); });
  $('efForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var d = MC.parseDate($('efDate').value), s = $('efStart').value.split(':').map(Number), en = $('efEnd').value.split(':').map(Number);
    if (!d || s.length < 2 || en.length < 2) { $('efErr').textContent = 'Please set the date and times.'; return; }
    var startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s[0], s[1]).getTime();
    var endsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), en[0], en[1]).getTime();
    if (endsAt <= startsAt) endsAt += 86400000;                  // ends after midnight
    var f = $('efFormat').value;
    var payload = {
      title: $('efTitle').value, format: f, startsAt: startsAt, endsAt: endsAt,
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'),
      venue: f === 'online' ? '' : $('efVenue').value, address: f === 'online' ? '' : $('efAddress').value,
      onlineUrl: f === 'in_person' ? '' : $('efUrl').value, description: $('efDesc').value, visibility: $('efVis').value
    };
    var req = editing ? api('PATCH', '/api/admin/events/' + encodeURIComponent(editing.id), payload) : api('POST', '/api/admin/events', payload);
    req.then(function (j) {
      dlg.close();
      MC.toast(editing ? 'Event updated.' : 'Event created. 🙏');
      MC.track(editing ? 'event_edit' : 'event_create');
      loadUpcoming().catch(function () {});
      if (location.hash.indexOf('#event?e=' + j.event.id) === 0) showEvent(); else location.hash = 'event?e=' + encodeURIComponent(j.event.id);
    }).catch(function (x) { $('efErr').textContent = x.message; });
  });

  /* ---------- Wiring ---------- */
  MC.views.event = { show: showEvent };
  MC.on('signout', function () { clearSession(); });   // earned check-in points stay
  // On start-up, refresh check-ins (for rewards) when we already have an events session
  setTimeout(function () { if (valid()) refreshMe(); }, 1500);
})();
