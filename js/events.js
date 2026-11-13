/* Meditation Copilot — SOS-hosted events (Part 2, B2–B4)
 * Talks to the events server (api/ — Cloudflare Worker + D1). Configure MC_CONFIG.apiBase.
 *  - Browse upcoming events (Calendar tab), event page (#event?e=<id>)
 *  - RSVP (Going / Maybe / Can't go), add to phone calendar, share
 *  - Check in: in person with the 4-digit code (or the QR code at the door, which carries the code);
 *    online by tapping "Join & check in" during the event
 *  - Admins: create / edit / cancel, check-in code + QR for the door, attendee list, host check-in, CSV
 *  - Repeating events (weekly / every other week / monthly, with an end date; skip dates); edit or cancel
 *    "this event" or "this and following". Cancelled events stay on the calendar, marked Cancelled.
 *  - Center check-in (#checkin): one permanent QR poster at the welcome table checks people in to
 *    whichever in-person event is open at the center right now.
 *  - Contact details: asked once at the first RSVP / check-in (email required, phone optional, text consent)
 *  - Rewards: hosted online check-in 25 points, in-person 50 points
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$, CFG = window.MC_CONFIG || {};
  var SESSION_KEY = 'meditation-copilot:events-session';
  var CACHE_KEY = 'meditation-copilot:events-cache';
  var CK_KEY = 'meditation-copilot:hosted-checkins';
  var PENDING_KEY = 'meditation-copilot:pending-checkin';
  var CENTER = 'mpls';
  var REPEAT = { weekly: 'Repeats weekly', biweekly: 'Repeats every other week', monthly: 'Repeats monthly' };
  var FORMAT = { in_person: '📍 In person', online: '💻 Online', hybrid: '📍💻 In person & online' };
  var ACCESS = { public: '🌍 Public', satsang: '🪷 Satsang', initiates: '🔒 Initiates' };
  var CATEGORY = { seeker: 'Seeker', friend: 'Seeker Friend', initiate: 'Initiate' };
  var MSG_KEY = 'meditation-copilot:event-messages';      // events I've posted a message on (for the +5 reward)
  var SETTINGS_KEY = 'meditation-copilot:center-settings';
  function badge(e) { var a = e.access || 'public'; return a === 'public' ? '' : '<span class="badge ' + a + '">' + ACCESS[a] + '</span>'; }
  function flyerUrl(id, thumb) { return base() + '/api/flyers/' + encodeURIComponent(id) + (thumb ? '?size=thumb' : ''); }

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
      session = { token: j.token, user: j.user, contact: j.contact || null, exp: Date.now() + 29 * 86400000 };
      if (j.user && j.user.name) MC.store.set('meditation-copilot:signin-name', j.user.name);
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
    return run.catch(function (e) {
      if (e && e.status === 428) return askContact().then(fn);      // first RSVP / check-in: confirm contact details
      throw e;
    }).catch(function (e) { if (!e || !e.silent) MC.toast((e && e.message) || 'Something went wrong.', 4500); throw e; });
  }

  /* ---------- Contact details (email required, phone optional) ---------- */
  var ctDlg = $('ctDlg'), ctDone = null;
  function askContact() {
    return new Promise(function (resolve, reject) {
      var c = (session && session.contact) || {};
      $('ctEmail').value = c.email || (session && session.user && session.user.email) || MC.account.email() || '';
      $('ctPhone').value = c.phone ? fmtPhone(c.phone) : '';
      $('ctSms').checked = !!c.smsOk;
      $('ctErr').textContent = '';
      ctDone = { resolve: resolve, reject: reject };
      if (ctDlg.showModal) ctDlg.showModal(); else ctDlg.setAttribute('open', '');
    });
  }
  function fmtPhone(p) { var m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ''); return m ? m[1] + '-' + m[2] + '-' + m[3] : (p || ''); }
  function closeCt(ok) {
    if (ctDlg.close) ctDlg.close(); else ctDlg.removeAttribute('open');
    var d = ctDone; ctDone = null;
    if (d) { if (ok) d.resolve(); else d.reject(err('Contact details are needed to RSVP or check in.', { silent: true })); }
  }
  $('ctCancel').addEventListener('click', function () { closeCt(false); });
  ctDlg.addEventListener('cancel', function () { closeCt(false); });
  $('ctForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var phone = $('ctPhone').value.trim(), sms = $('ctSms').checked;
    if (sms && !phone) { $('ctErr').textContent = 'Add a phone number to get text reminders, or untick the box.'; return; }
    api('PUT', '/api/me/contact', { phone: phone, smsOk: sms }).then(function (j) {
      session.contact = j.contact; MC.store.set(SESSION_KEY, session);
      MC.track('event_contact', { phone: !!phone, sms: sms });
      closeCt(true);
    }).catch(function (x) { $('ctErr').textContent = x.message; });
  });
  function contactSummary() {
    var c = session && session.contact;
    if (!c || !c.confirmedAt) return 'Not set up yet. You\u2019ll be asked at your first RSVP or check-in.';
    return MC.esc(c.email || '') + (c.phone ? ' · ' + MC.esc(fmtPhone(c.phone)) + (c.smsOk ? ' · texts on' : ' · texts off') : ' · no phone');
  }
  function promptSignIn() {
    MC.toast('Sign in with Google or Microsoft to RSVP and check in.', 4500);
    $('accountBtn').click();
  }
  var meAt = 0;
  function refreshMe() {
    if (!valid()) return Promise.resolve();
    meAt = Date.now();
    return api('GET', '/api/me').then(function (j) {
      session.user = j.user; if (j.contact) session.contact = j.contact; MC.store.set(SESSION_KEY, session);
      MC.store.set(CK_KEY, j.checkins || []);
      MC.store.set(MSG_KEY, j.messageEvents || []);
      MC.emit('data');                          // re-evaluate rewards
    }).then(syncCategory).catch(function () {});
  }
  // Tell the server only the word 'seeker' or 'initiate' (never the initiation details). Seeker Friend is set by an admin.
  function syncCategory() {
    if (!valid() || !MC.profile.userType) return Promise.resolve();
    var mine = MC.profile.userType === 'initiated' ? 'initiate' : 'seeker';
    var have = session.user && session.user.category;
    if (have === mine || (mine === 'seeker' && have === 'friend')) return Promise.resolve();
    return api('PUT', '/api/me/category', { category: mine }).then(function (j) {
      session.user.category = j.category; MC.store.set(SESSION_KEY, session);
    }).catch(function () {});
  }
  MC.on('profile', function () { if (valid()) syncCategory(); });

  MC.events = {
    api: api, withSession: withSession, valid: valid, signedInMode: signedInMode, ensureSession: ensureSession,   // shared with social.js
    enabled: function () { return !!base(); },
    isAdmin: function () { return valid() && session.user && session.user.isAdmin; },
    hostedCheckins: function () { return MC.store.get(CK_KEY, []) || []; },
    // Account & settings: event contact details
    accountHTML: function () {
      if (!MC.events.enabled() || !valid()) return '';
      var cat = session.user && session.user.category;
      return '<div class="section-title" style="margin-top:20px">SOS events</div>' +
        (cat ? '<p class="small" style="margin:-6px 0 6px">Events status: <b>' + MC.esc(CATEGORY[cat] || cat) + '</b>' +
          (cat === 'seeker' ? ' <span class="muted">· the center can mark you a Seeker Friend after a few visits</span>' : '') + '</p>' : '') +
        (session.user && session.user.blocked ? '<p class="small" style="margin:0 0 6px;color:var(--danger,#b00)">Your account can\u2019t take part in center events. Contact MinneapolisCenter@sos.org.</p>' : '') +
        '<p class="small" style="margin:0 0 10px">Contact details: ' + contactSummary() + '</p>' +
        '<button class="btn btn-ghost btn-sm btn-block" id="acContact">✎ Edit contact details</button>';
    },
    bindAccount: function (close) {
      if (!$('acContact')) return;
      $('acContact').addEventListener('click', function () { close(); askContact().then(function () { MC.toast('Contact details saved.'); }, function () {}); });
    }
  };

  /* ---------- Rewards for hosted check-ins ---------- */
  function isInPerson(c) { return c.format === 'in_person' || (c.format === 'hybrid' && c.method !== 'online'); }
  if (MC.rewards && MC.rewards.addRule) {
    MC.rewards.addRule({ id: 'hosted_online', category: 'community', icon: '💻', name: 'Joined an SOS Online Event', desc: 'Check in to an SOS-hosted online event', points: 25, repeat: true,
      count: function () { return MC.events.hostedCheckins().filter(function (c) { return !isInPerson(c); }).length; } });
    MC.rewards.addRule({ id: 'hosted_in_person', category: 'community', icon: '📍', name: 'Attended an SOS Event in Person', desc: 'Check in at an SOS-hosted event in person', points: 50, repeat: true,
      count: function () { return MC.events.hostedCheckins().filter(isInPerson).length; } });
    MC.rewards.addRule({ id: 'event_message', category: 'community', icon: '💬', name: 'Shared a Reflection on an Event', desc: 'Post your first message on an SOS event', points: 5, repeat: true,
      count: function () { return (MC.store.get(MSG_KEY, []) || []).length; } });
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
      cache = { events: j.events || [], at: Date.now(), blocked: !!j.blocked, blockedMessage: j.message || '' };
      MC.store.set(CACHE_KEY, cache);
      return cache.events;
    });
  }
  MC.eventsOn = function (isoDay) {      // for the Calendar month dots and day agenda
    // Cancelled events stay visible (marked Cancelled) so people aren't left wondering
    return (cache.events || []).filter(function (e) { return MC.toISO(new Date(e.startsAt)) === isoDay; });
  };

  function eventRow(e) {
    var tag = e.status === 'cancelled' ? '<span class="ag-st miss">Cancelled</span>'
      : e.myCheckin ? '<span class="ag-st ok">✓ Checked in</span>'
      : e.myRsvp === 'going' ? '<span class="ag-st now">Going</span>'
      : e.myRsvp === 'maybe' ? '<span class="ag-st up">Maybe</span>' : '';
    return '<a class="ev-row' + (e.status === 'cancelled' ? ' cx' : '') + '" href="#event?e=' + encodeURIComponent(e.id) + '"><span class="ev-date"><b>' + new Date(e.startsAt).getDate() + '</b>' +
      new Date(e.startsAt).toLocaleDateString(undefined, { month: 'short' }) + '</span>' +
      (e.flyerId ? '<img class="ev-thumb" src="' + MC.esc(flyerUrl(e.flyerId, true)) + '" alt="" loading="lazy">' : '') +
      '<span class="ag-main"><b>' + MC.esc(e.title) + '</b> ' + badge(e) + '<small>' +
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
    if (MC.events.isAdmin()) html += '<div class="tool-row two" style="margin:-4px 0 10px">' +
      '<button class="btn btn-ghost btn-sm" id="evPoster">🖨 QR poster</button><a class="btn btn-ghost btn-sm" href="#people">👥 People</a>' +
      '<button class="btn btn-ghost btn-sm" id="evVideo">▶ Featured</button><a class="btn btn-ghost btn-sm" href="#feedback">💬 Feedback</a></div>';
    if (cache.blocked) { el.innerHTML = html + '<p class="small">' + MC.esc(cache.blockedMessage || '') + '</p>'; return; }
    var list = (cache.events || []).filter(function (e) { return e.endsAt > Date.now() - 3600000; });
    html += list.length ? list.slice(0, 12).map(eventRow).join('') : '<p class="small muted" style="margin:0">No upcoming events yet.</p>';
    if (!signedInMode()) html += '<p class="small muted" style="margin:12px 0 0">Sign in with Google or Microsoft to RSVP and check in.</p>';
    else if (!valid()) html += '<button class="btn btn-soft btn-sm btn-block" id="evConnect" style="margin-top:12px">Connect to SOS events</button>';
    el.innerHTML = html;
    if ($('evNew')) $('evNew').addEventListener('click', function () { openForm(null); });
    if ($('evPoster')) $('evPoster').addEventListener('click', printPoster);
    if ($('evVideo')) $('evVideo').addEventListener('click', openVideoForm);
    if ($('evConnect')) $('evConnect').addEventListener('click', function () {
      withSession(function () { MC.renderEventsCard(); }).catch(function () {});
    });
  }
  MC.renderEventsCard = function () {
    renderCard();
    // Signed in but not yet connected to the events server: connect quietly (no pop-up) so admin tools and RSVPs show
    var pre = (signedInMode() && !valid() && MC.events.enabled()) ? ensureSession().catch(function () {}) : Promise.resolve();
    pre.then(function () { if (valid() && Date.now() - meAt > 60000) refreshMe(); }).then(loadUpcoming).then(function () { renderCard(); if (MC.current === 'calendar' && MC.views.calendar.refreshMonth) MC.views.calendar.refreshMonth(); })
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
    html += '<div class="card">' + (e.flyerId ? '<a href="' + MC.esc(flyerUrl(e.flyerId)) + '" target="_blank" rel="noopener"><img class="flyer" src="' + MC.esc(flyerUrl(e.flyerId)) + '" alt="Event flyer"></a>' : '') +
      '<span class="ev-format">' + MC.esc(FORMAT[e.format] || '') + '</span> ' + badge(e) +
      '<h1 class="ev-title">' + MC.esc(e.title) + '</h1>' +
      '<p class="ev-when">🗓 ' + MC.esc(fmtWhen(e)) + (e.repeats ? '<br><span class="small muted">↻ ' + MC.esc(REPEAT[e.repeats] || '') + '</span>' : '') + '</p>' +
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

    // Likes and messages (signed-in members)
    html += '<div class="card" id="evSocial" style="margin-top:16px"><div class="section-title">Reflections</div>' +
      (signedInMode() ? '<div class="social-row"><button class="like-btn' + (e.myLike ? ' on' : '') + '" id="evLike" aria-pressed="' + !!e.myLike + '">🙏 ' + (e.likes || 0) + '</button>' +
          '<span class="small muted">' + (e.messages || 0) + ' message' + ((e.messages || 0) === 1 ? '' : 's') + '</span></div>' +
        '<form class="msg-form" id="msgForm"><textarea id="msgText" maxlength="280" rows="2" placeholder="Share a brief reflection or a kind word… (+5 points for your first)" aria-label="Message"></textarea>' +
          '<button class="btn btn-soft btn-sm" type="submit">Post</button></form><div class="msg-count" id="msgCount">0 / 280</div><div id="msgList" class="small muted">Loading…</div>'
        : '<p class="small muted" style="margin:-6px 0 0">Sign in to see and share reflections on this event.</p>') + '</div>';

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
    if ($('msgForm')) bindSocial(e);
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

  /* ---------- Likes and messages ---------- */
  function bindSocial(e) {
    var list = $('msgList');
    function row(mg) {
      return '<div class="msg" data-id="' + MC.esc(mg.id) + '"><div class="msg-head"><span><b>' + MC.esc(mg.name || 'Member') + '</b> · ' + MC.esc(MC.fmtDate(new Date(mg.createdAt), { month: 'short', day: 'numeric' })) + ' ' + MC.esc(MC.fmtTime(mg.createdAt)) + '</span>' +
        (mg.mine || MC.events.isAdmin() ? '<button class="link small" data-del="' + MC.esc(mg.id) + '" style="padding:0">Delete</button>' : '') + '</div><p class="msg-body">' + MC.esc(mg.body) + '</p></div>';
    }
    function load() {
      if (!valid()) { list.innerHTML = '<p class="small muted">Connect to SOS events to see reflections.</p>'; return; }
      api('GET', '/api/events/' + encodeURIComponent(e.id) + '/messages').then(function (j) {
        $('evLike').textContent = '🙏 ' + j.likes; $('evLike').classList.toggle('on', !!j.myLike); $('evLike').setAttribute('aria-pressed', String(!!j.myLike));
        list.className = ''; list.innerHTML = (j.messages || []).length ? j.messages.map(row).join('') : '<p class="small muted">No reflections yet. Be the first 🙏</p>';
      }).catch(function (x) { list.innerHTML = '<p class="small muted">' + MC.esc(x.message) + '</p>'; });
    }
    $('msgText').addEventListener('input', function () { $('msgCount').textContent = $('msgText').value.length + ' / 280'; });
    $('evLike').addEventListener('click', function () {
      var on = $('evLike').classList.contains('on');
      withSession(function () {
        return api(on ? 'DELETE' : 'PUT', '/api/events/' + encodeURIComponent(e.id) + '/like').then(function (j) {
          $('evLike').textContent = '🙏 ' + j.likes; $('evLike').classList.toggle('on', !!j.myLike); $('evLike').setAttribute('aria-pressed', String(!!j.myLike));
          MC.track('event_like', { on: !on });
        });
      }).catch(function () {});
    });
    $('msgForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = $('msgText').value.trim(); if (!text) return;
      withSession(function () {
        return api('POST', '/api/events/' + encodeURIComponent(e.id) + '/messages', { body: text }).then(function (j) {
          $('msgText').value = ''; $('msgCount').textContent = '0 / 280';
          if (j.firstOnEvent) { var m = MC.store.get(MSG_KEY, []) || []; if (m.indexOf(e.id) < 0) { m.push(e.id); MC.store.set(MSG_KEY, m); MC.emit('data'); } MC.toast('Thank you for sharing 🙏 +5 points'); }
          else MC.toast('Posted.');
          MC.track('event_message'); load();
        });
      }).catch(function () {});
    });
    list.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]'); if (!b) return;
      if (!window.confirm('Delete this message?')) return;
      api('DELETE', '/api/events/' + encodeURIComponent(e.id) + '/messages/' + encodeURIComponent(b.dataset.del)).then(function () { refreshMe(); load(); }).catch(function (x) { MC.toast(x.message); });
    });
    load();
  }

  /* ---------- Featured video on Today (everyone) ---------- */
  var settingsAt = 0;
  MC.renderFeatured = function () {
    var el = $('featured'); if (!el || !MC.events.enabled()) return;
    var paint = function (st) {
      var list = (st && st.featuredVideos) || (st && st.featuredVideo ? [st.featuredVideo] : []);
      var v = list.length ? list[Math.floor((MC.today().getTime() / 86400000)) % list.length] : null;   // a different one each day
      el.innerHTML = v ? '<div class="section-title" style="margin-bottom:8px">Featured today</div><a class="card featured" href="' + MC.esc(v.url) + '" target="_blank" rel="noopener" id="featuredLink"><span class="ft-img">' +
        (v.videoId ? '<img src="https://i.ytimg.com/vi/' + MC.esc(v.videoId) + '/hqdefault.jpg" alt=""><span class="ft-play">▶</span>' : '<span class="ft-site">🪷</span>') + '</span>' +
        '<span><b>' + MC.esc(v.title) + '</b>' + (v.caption ? '<small>' + MC.esc(v.caption) + '</small>' : '') + '<small>' + (v.videoId ? 'Watch on YouTube ↗' : 'Open on sos.org ↗') + '</small></span></a>' : '';
      if ($('featuredLink')) $('featuredLink').addEventListener('click', function () { MC.track('featured_video'); });
    };
    var cached = MC.store.get(SETTINGS_KEY, null);
    if (cached) paint(cached.settings);
    if (Date.now() - settingsAt < 5 * 60000) return;
    settingsAt = Date.now();
    // The browser may cache this for 5 minutes; the ?v= changes after an admin saves, so the new value shows at once
    api('GET', '/api/centers/' + CENTER + '/settings?v=' + ((cached && cached.at) || 0)).then(function (j) { MC.store.set(SETTINGS_KEY, { settings: j.settings || {}, at: Date.now() }); paint(j.settings); })
      .catch(function () { settingsAt = 0; });
  };
  var vidDlg = $('vidDlg');
  function featuredList() { var st = (MC.store.get(SETTINGS_KEY, null) || {}).settings || {}; return st.featuredVideos || (st.featuredVideo ? [st.featuredVideo] : []); }
  function renderVidList() {
    var list = featuredList();
    $('vidList').innerHTML = list.length ? list.map(function (v, i) {
      return '<div class="vid-row">' + (v.videoId ? '<img src="https://i.ytimg.com/vi/' + MC.esc(v.videoId) + '/default.jpg" alt="">' : '<span style="width:64px;text-align:center">🪷</span>') +
        '<span class="ag-main"><b>' + MC.esc(v.title) + '</b><small>' + MC.esc(v.caption || v.url) + '</small></span><button type="button" class="link small" data-vrm="' + i + '">Remove</button></div>';
    }).join('') : '<p class="small muted">Nothing featured yet.</p>';
  }
  function openVideoForm() {
    $('vidUrl').value = ''; $('vidTitle').value = ''; $('vidCaption').value = ''; $('vidErr').textContent = '';
    renderVidList();
    if (vidDlg.showModal) vidDlg.showModal(); else vidDlg.setAttribute('open', '');
  }
  function saveFeatured(list, msg) {
    return api('PUT', '/api/admin/centers/' + CENTER + '/settings', { featuredVideos: list }).then(function (j) {
      MC.store.set(SETTINGS_KEY, { settings: j.settings || {}, at: Date.now() }); settingsAt = 0;
      renderVidList(); MC.toast(msg); if (MC.renderFeatured) MC.renderFeatured();
    }).catch(function (x) { $('vidErr').textContent = x.message; });
  }
  $('vidCancel').addEventListener('click', function () { vidDlg.close(); });
  $('vidList').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-vrm]'); if (!b) return;
    var list = featuredList().slice(); list.splice(Number(b.dataset.vrm), 1); saveFeatured(list, 'Removed.');
  });
  $('vidForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var url = $('vidUrl').value.trim();
    if (!url) { $('vidErr').textContent = 'Paste a YouTube link or a sos.org page.'; return; }
    var list = featuredList().slice(); list.push({ url: url, title: $('vidTitle').value.trim() || 'Featured today', caption: $('vidCaption').value.trim() });
    saveFeatured(list, 'Added.').then(function () { $('vidUrl').value = ''; $('vidTitle').value = ''; $('vidCaption').value = ''; });
  });

  /* ---------- Feedback: suggestions and ratings ---------- */
  var fbDlg = $('fbDlg'), fbKind = 'suggestion', fbStar = 0, FB_KEY = 'meditation-copilot:feedback-ask';
  function openFeedback(kind) {
    fbKind = kind; fbStar = 0;
    $('fbHead').textContent = kind === 'rating' ? 'How is the app working for you?' : 'Send a suggestion';
    $('fbLead').textContent = kind === 'rating' ? 'A quick rating helps the center improve this app. A comment is welcome but optional.' : 'What would make this app better for your practice? Every note is read by the center team.';
    $('fbStars').hidden = kind !== 'rating'; $('fbStars').querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    $('fbTextLabel').textContent = kind === 'rating' ? 'Comment (optional)' : 'Your suggestion';
    $('fbText').value = ''; $('fbErr').textContent = '';
    $('fbContactBox').hidden = signedInMode(); $('fbContact').value = '';
    $('fbNever').hidden = kind !== 'rating'; $('fbLater').textContent = kind === 'rating' ? 'Later' : 'Cancel';
    if (fbDlg.showModal) fbDlg.showModal(); else fbDlg.setAttribute('open', '');
    MC.track('feedback_open', { kind: kind });
  }
  $('fbStars').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-star]'); if (!b) return;
    fbStar = Number(b.dataset.star);
    $('fbStars').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', Number(x.dataset.star) <= fbStar); });
  });
  $('fbLater').addEventListener('click', function () { if (fbKind === 'rating') MC.store.set(FB_KEY, { at: Date.now(), state: 'later' }); fbDlg.close(); });
  $('fbNever').addEventListener('click', function () { MC.store.set(FB_KEY, { at: Date.now(), state: 'never' }); fbDlg.close(); });
  fbDlg.addEventListener('cancel', function () { if (fbKind === 'rating') MC.store.set(FB_KEY, { at: Date.now(), state: 'later' }); });
  $('fbForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var text = $('fbText').value.trim();
    if (fbKind === 'rating' && !fbStar) { $('fbErr').textContent = 'Tap a star to rate.'; return; }
    if (fbKind === 'suggestion' && !text) { $('fbErr').textContent = 'Please write your suggestion first.'; return; }
    $('fbErr').textContent = ''; $('fbSend').disabled = true;
    api('POST', '/api/feedback', { kind: fbKind, rating: fbStar || undefined, body: text, contact: $('fbContact').value.trim(), version: MC.VERSION }).then(function () {
      $('fbSend').disabled = false; fbDlg.close();
      if (fbKind === 'rating') MC.store.set(FB_KEY, { at: Date.now(), state: 'done' });
      MC.toast('Thank you 🙏 Your ' + (fbKind === 'rating' ? 'rating' : 'suggestion') + ' has been sent.');
      MC.track('feedback_sent', { kind: fbKind, rating: fbStar || 0 });
    }).catch(function (x) { $('fbSend').disabled = false; $('fbErr').textContent = x.message || 'Could not send. Please try again.'; });
  });
  if ($('fbSuggest')) $('fbSuggest').addEventListener('click', function () { openFeedback('suggestion'); });
  MC.openFeedback = openFeedback;
  // Ask for a rating once, after about a week of real use; "Later" asks again in 30 days
  function maybeAskRating() {
    if (!MC.events.enabled() || MC.current !== 'home') return;
    var st = MC.store.get(FB_KEY, null);
    if (st && (st.state === 'never' || st.state === 'done')) return;
    if (st && st.state === 'later' && Date.now() - st.at < 30 * 86400000) return;
    var days = {}; MC.sessions.all().forEach(function (s) { days[MC.dayKey(s.start)] = 1; });
    if (Object.keys(days).length < 7) return;
    if (document.querySelector('dialog[open]')) return;
    setTimeout(function () { if (!document.querySelector('dialog[open]')) openFeedback('rating'); }, 1500);
  }
  MC.on('view', function (n) { if (n === 'home') maybeAskRating(); });

  /* ---------- Feedback (admin) ---------- */
  function showFeedbackAdmin() {
    var view = $('v-feedback');
    if (!MC.events.isAdmin()) { view.innerHTML = '<div class="card">Admins only.</div>'; return; }
    view.innerHTML = '<a class="link" href="#calendar" style="padding:4px 0;display:inline-block">‹ Calendar</a><div class="card"><div class="section-title">Feedback <span class="small muted">admin</span></div><div id="fbaList" class="small muted">Loading…</div></div>';
    api('GET', '/api/admin/feedback').then(function (j) {
      var rows = j.feedback || [];
      $('fbaList').className = '';
      $('fbaList').innerHTML = '<p class="small" style="margin:-6px 0 10px">' + (j.ratings ? '<b>' + j.averageRating + ' ★</b> average from ' + j.ratings + ' rating' + (j.ratings === 1 ? '' : 's') + ' · ' : '') + rows.length + ' item' + (rows.length === 1 ? '' : 's') +
        ' · <button class="link small" id="fbaCsv" style="padding:0">⬇ CSV</button></p>' +
        (rows.length ? rows.map(function (r) {
          return '<div class="msg"><div class="msg-head"><span>' + (r.kind === 'rating' ? '<b>' + '★'.repeat(r.rating || 0) + '</b> ' : '💡 ') + MC.esc(r.name || 'Guest') + (r.email ? ' · ' + MC.esc(r.email) : r.contact ? ' · ' + MC.esc(r.contact) : '') + '</span><span>' +
            MC.esc(MC.fmtDate(new Date(r.createdAt), { month: 'short', day: 'numeric' })) + ' · v' + MC.esc(r.version || '?') + ' · ' + MC.esc(r.platform || '') + '</span></div>' + (r.body ? '<p class="msg-body">' + MC.esc(r.body) + '</p>' : '') + '</div>';
        }).join('') : '<p class="small muted">Nothing yet.</p>');
      $('fbaCsv').addEventListener('click', function () {
        raw('GET', '/api/admin/feedback?format=csv').then(function (r) { if (!r.ok) throw err('Could not download'); return r.blob(); }).then(function (b) {
          var url = URL.createObjectURL(b), a = document.createElement('a'); a.href = url; a.download = 'feedback.csv'; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
        }).catch(function (x) { MC.toast(x.message); });
      });
    }).catch(function (x) { $('fbaList').textContent = x.message; });
  }
  MC.views.feedback = { show: showFeedbackAdmin };

  /* ---------- People (admin): categories and blocking ---------- */
  function showPeople() {
    var view = $('v-people');
    if (!MC.events.isAdmin()) { view.innerHTML = '<div class="card">Admins only.</div>'; return; }
    view.innerHTML = '<a class="link" href="#calendar" style="padding:4px 0;display:inline-block">‹ Calendar</a>' +
      '<div class="card"><div class="section-title">People <span class="small muted">admin</span></div>' +
      '<p class="small" style="margin:-6px 0 10px">Seeker and Initiate are what people chose on their phone. Mark a seeker a <b>Seeker Friend</b> after a few visits so they can attend Satsang events.</p>' +
      '<input type="search" id="ppFind" class="text-input" placeholder="Search by name or email" autocomplete="off"><div id="ppList" style="margin-top:8px"></div></div>';
    var t, list = $('ppList');
    function row(u) {
      var blocked = !!u.blockedAt;
      return '<div class="pp-row' + (blocked ? ' blocked' : '') + '" data-uid="' + MC.esc(u.userId) + '"><span class="ag-main"><b>' + MC.esc(u.name || '') + '</b><small>' + MC.esc(u.email || '') +
        (u.phone ? ' · ' + MC.esc(fmtPhone(u.phone)) : '') + ' · ' + (u.visits || 0) + ' visit' + (u.visits === 1 ? '' : 's') +
        (u.lastVisitAt ? ', last ' + MC.esc(MC.fmtDate(new Date(u.lastVisitAt), { month: 'short', day: 'numeric' })) : '') +
        (blocked ? ' · <b>Blocked</b>' + (u.blockReason ? ' (' + MC.esc(u.blockReason) + ')' : '') : '') + '</small></span>' +
        '<select data-cat aria-label="Category">' + ['seeker', 'friend', 'initiate'].map(function (c) { return '<option value="' + c + '"' + (u.category === c ? ' selected' : '') + '>' + CATEGORY[c] + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-ghost btn-sm" data-block="' + (blocked ? '0' : '1') + '">' + (blocked ? 'Unblock' : 'Block') + '</button></div>';
    }
    function search() {
      var q = $('ppFind').value.trim();
      if (q.length < 2) { list.innerHTML = '<p class="small muted">Type at least two letters.</p>'; return; }
      api('GET', '/api/admin/users?q=' + encodeURIComponent(q)).then(function (j) {
        list.innerHTML = (j.users || []).length ? j.users.map(row).join('') : '<p class="small muted">No one found. They need to sign in to the app first.</p>';
      }).catch(function (x) { list.innerHTML = '<p class="small muted">' + MC.esc(x.message) + '</p>'; });
    }
    $('ppFind').addEventListener('input', function () { clearTimeout(t); t = setTimeout(search, 300); });
    list.addEventListener('change', function (ev) {
      var sel = ev.target.closest('[data-cat]'); if (!sel) return;
      var uid = sel.closest('.pp-row').dataset.uid;
      api('PATCH', '/api/admin/users?user=' + encodeURIComponent(uid), { category: sel.value }).then(function (j) { MC.toast(MC.esc(j.user.name) + ' is now ' + CATEGORY[j.user.category] + '.'); })
        .catch(function (x) { MC.toast(x.message); search(); });
    });
    list.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-block]'); if (!b) return;
      var uid = b.closest('.pp-row').dataset.uid, block = b.dataset.block === '1', reason = '';
      if (block) { reason = window.prompt('Block this person from center events? Add a short note for admins (optional):'); if (reason === null) return; }
      else if (!window.confirm('Unblock this person?')) return;
      api('PATCH', '/api/admin/users?user=' + encodeURIComponent(uid), { blocked: block, reason: reason }).then(function () { MC.toast(block ? 'Blocked.' : 'Unblocked.'); search(); })
        .catch(function (x) { MC.toast(x.message); });
    });
    list.innerHTML = '<p class="small muted">Type at least two letters.</p>';
    setTimeout(function () { $('ppFind').focus(); }, 50);
  }
  MC.views.people = { show: showPeople };

  /* ---------- Flyer images: resized on the phone, uploaded as JPEG ---------- */
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(err('That file is not an image the phone can read. Use a JPG or PNG.')); };
      img.src = url;
    });
  }
  function scaled(img, max, quality) {
    var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality).split(',')[1];
  }
  function prepareFlyer(file) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(err('That image is too large (over 25 MB).'));
    return readImage(file).then(function (img) {
      var full = scaled(img, 1600, 0.82);
      if (full.length > 1100000) full = scaled(img, 1200, 0.72);
      return { mime: 'image/jpeg', full: full, thumb: scaled(img, 320, 0.8) };
    });
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
      '<button class="btn btn-danger btn-sm" id="adCancel">' + (e.status === 'cancelled' ? 'Restore' : 'Cancel event') + '</button></div>' +
      (e.seriesId ? '<div class="small" style="text-align:center;margin-top:10px"><button class="link small" id="adCancelAll">' +
        (e.status === 'cancelled' ? 'Restore this & following' : 'Cancel this & following') + '</button> · <button class="link small" id="adCancelSeries">' +
        (e.status === 'cancelled' ? 'Restore whole series' : 'Cancel whole series') + '</button></div>' : '');
    $('adRefresh').addEventListener('click', loadAttendees);
    $('adEdit').addEventListener('click', function () { openForm(current); });
    $('adCsv').addEventListener('click', downloadCsv);
    function cancelOrRestore(scope) {
      var cancel = current.status !== 'cancelled';
      if (cancel && !window.confirm(scope === 'all' ? 'Cancel every event in this series, past and future? They stay on the calendar, marked Cancelled.'
        : scope === 'future' ? 'Cancel this and all following events in the series? They stay on the calendar, marked Cancelled.'
        : 'Cancel this event? It stays on the calendar, marked Cancelled, so people who RSVP\u2019d know.')) return;
      api('POST', '/api/admin/events/' + encodeURIComponent(current.id) + (cancel ? '/cancel' : '/restore') + (scope ? '?scope=' + scope : '')).then(function () {
        MC.toast(cancel ? (scope ? 'Events cancelled.' : 'Event cancelled.') : (scope ? 'Events restored.' : 'Event restored.'));
        showEvent(); loadUpcoming().catch(function () {});
      }).catch(function (x) { MC.toast(x.message); });
    }
    $('adCancel').addEventListener('click', function () { cancelOrRestore(''); });
    if ($('adCancelAll')) $('adCancelAll').addEventListener('click', function () { cancelOrRestore('future'); });
    if ($('adCancelSeries')) $('adCancelSeries').addEventListener('click', function () { cancelOrRestore('all'); });
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
          return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(x.name || '') + '</b> <span class="badge">' + MC.esc(CATEGORY[x.category] || 'Seeker') + '</span><small>' + MC.esc(x.email || '') + (x.phone ? ' · ' + MC.esc(fmtPhone(x.phone)) : '') + ' · ' +
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
    $('efAccess').value = e ? (e.access || 'public') : 'public';
    flyerPending = null; flyerRemove = false; $('efFlyer').value = '';
    setFlyerPreview(e && e.flyerId ? flyerUrl(e.flyerId, true) : null);
    $('efHead').textContent = e ? 'Edit event' : 'New SOS event';
    $('efErr').textContent = '';
    $('efRepeatBox').hidden = !!e;
    $('efRepeat').value = '';
    $('efUntil').value = MC.toISO(MC.addDays(new Date(start), 7 * 12));
    skipped = {};
    $('efScopeBox').hidden = !(e && e.seriesId);
    setScope('this');
    syncFormat(); syncRepeat();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function syncFormat() {
    var f = $('efFormat').value;
    $('efPlace').hidden = f === 'online';
    $('efOnline').hidden = f === 'in_person';
  }
  $('efFormat').addEventListener('change', syncFormat);
  function setScope(v) {
    $('efScope').value = v;
    Array.prototype.forEach.call($('efScopeChips').querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c.dataset.scope === v); c.setAttribute('aria-pressed', String(c.dataset.scope === v)); });
  }
  $('efScopeChips').addEventListener('click', function (ev) { var c = ev.target.closest('[data-scope]'); if (c) setScope(c.dataset.scope); });
  var flyerPending = null, flyerRemove = false;
  function setFlyerPreview(src) { $('efFlyerPrev').hidden = !src; if (src) $('efFlyerImg').src = src; }
  $('efFlyer').addEventListener('change', function () {
    var f = $('efFlyer').files && $('efFlyer').files[0]; if (!f) return;
    $('efErr').textContent = 'Preparing image…';
    prepareFlyer(f).then(function (p) { flyerPending = p; flyerRemove = false; setFlyerPreview('data:image/jpeg;base64,' + p.thumb); $('efErr').textContent = ''; })
      .catch(function (x) { $('efErr').textContent = x.message; $('efFlyer').value = ''; });
  });
  $('efFlyerRemove').addEventListener('click', function () { flyerPending = null; flyerRemove = true; $('efFlyer').value = ''; setFlyerPreview(null); });

  /* Repeating events: dates are worked out here in local time (daylight saving stays right) */
  var skipped = {};
  var ORD = ['1st', '2nd', '3rd', '4th', 'last'];
  function nthWeekday(d) { var n = Math.floor((d.getDate() - 1) / 7); var next = MC.addDays(d, 7); return next.getMonth() !== d.getMonth() ? 4 : n; }
  function monthlyOn(y, mo, wd, n) {
    if (n === 4) { var last = new Date(y, mo + 1, 0); while (last.getDay() !== wd) last.setDate(last.getDate() - 1); return last; }
    var d = new Date(y, mo, 1); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * n); return d.getMonth() === mo ? d : null;
  }
  function repeatDates() {
    var freq = $('efRepeat').value, first = MC.parseDate($('efDate').value), until = MC.parseDate($('efUntil').value), out = [];
    if (!freq || !first || !until) return out;
    if (freq === 'monthly') {
      var wd = first.getDay(), n = nthWeekday(first);
      for (var i = 0; out.length < 121; i++) {
        var d = monthlyOn(first.getFullYear(), first.getMonth() + i, wd, n);
        if (d && d > until) break;
        if (d) out.push(d);
        if (i > 400) break;
      }
    } else {
      for (var dd = new Date(first); dd <= until && out.length < 121; dd = MC.addDays(dd, freq === 'weekly' ? 7 : 14)) out.push(new Date(dd));
    }
    return out;
  }
  function syncRepeat() {
    var freq = $('efRepeat').value;
    $('efRepeatMore').hidden = !freq;
    $('efDateHint').textContent = freq ? '(first event)' : '';
    if (!freq) return;
    var first = MC.parseDate($('efDate').value), dates = repeatDates();
    var wd = first ? first.toLocaleDateString(undefined, { weekday: 'long' }) : '';
    var how = freq === 'weekly' ? 'Every ' + wd : freq === 'biweekly' ? 'Every other ' + wd : first ? 'Monthly on the ' + ORD[nthWeekday(first)] + ' ' + wd : '';
    var on = dates.filter(function (d) { return !skipped[MC.toISO(d)]; }).length;
    $('efRepeatSum').textContent = how + ' · ' + on + ' event' + (on === 1 ? '' : 's') + (dates.length > 120 ? ' (120 at most; choose an earlier end date)' : '') + '. Tap a date to skip it.';
    $('efDates').innerHTML = dates.slice(0, 120).map(function (d) {
      var k = MC.toISO(d);
      return '<button type="button" class="chip' + (skipped[k] ? '' : ' on') + '" data-k="' + k + '" aria-pressed="' + !skipped[k] + '">' +
        MC.esc(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</button>';
    }).join('');
  }
  $('efRepeat').addEventListener('change', syncRepeat);
  $('efUntil').addEventListener('change', syncRepeat);
  $('efDate').addEventListener('change', syncRepeat);
  $('efDates').addEventListener('click', function (ev) {
    var c = ev.target.closest('.chip'); if (!c) return;
    skipped[c.dataset.k] = !skipped[c.dataset.k]; syncRepeat();
  });
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
      onlineUrl: f === 'in_person' ? '' : $('efUrl').value, description: $('efDesc').value, access: $('efAccess').value
    };
    var freq = !editing && $('efRepeat').value;
    if (freq) {
      var dur = endsAt - startsAt;
      payload.repeat = { freq: freq };
      payload.occurrences = repeatDates().slice(0, 120).filter(function (dd) { return !skipped[MC.toISO(dd)]; }).map(function (dd) {
        var st = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), s[0], s[1]).getTime();
        return { startsAt: st, endsAt: st + dur };
      });
      if (!payload.occurrences.length) { $('efErr').textContent = 'Every date is skipped. Tap a date to include it.'; return; }
      payload.startsAt = payload.occurrences[0].startsAt; payload.endsAt = payload.occurrences[0].endsAt;
    }
    var scope = editing && editing.seriesId && $('efScope').value !== 'this' ? '?scope=' + $('efScope').value : '';
    $('efErr').textContent = flyerPending ? 'Uploading flyer…' : '';
    var upload = flyerPending ? api('POST', '/api/admin/flyers', flyerPending).then(function (j) { return j.flyerId; }) : Promise.resolve(null);
    var req = upload.then(function (flyerId) {
      if (!editing) { if (flyerId) payload.flyerId = flyerId; return api('POST', '/api/admin/events', payload); }
      return api('PATCH', '/api/admin/events/' + encodeURIComponent(editing.id) + scope, payload).then(function (j) {
        var fl = flyerId ? api('PUT', '/api/admin/events/' + encodeURIComponent(editing.id) + '/flyer' + scope, { flyerId: flyerId })
          : flyerRemove && editing.flyerId ? api('DELETE', '/api/admin/events/' + encodeURIComponent(editing.id) + '/flyer' + scope) : Promise.resolve();
        return fl.then(function () { return j; });
      });
    });
    req.then(function (j) {
      flyerPending = null; flyerRemove = false;
      dlg.close();
      MC.toast(editing ? (j.count > 1 ? j.count + ' events updated.' : 'Event updated.') : (j.count > 1 ? j.count + ' events created. 🙏' : 'Event created. 🙏'));
      MC.track(editing ? 'event_edit' : 'event_create');
      loadUpcoming().catch(function () {});
      if (location.hash.indexOf('#event?e=' + j.event.id) === 0) showEvent(); else location.hash = 'event?e=' + encodeURIComponent(j.event.id);
    }).catch(function (x) { $('efErr').textContent = x.message; });
  });

  /* ---------- Center check-in (#checkin): the printed QR poster at the welcome table ---------- */
  var ckBusy = false;
  function showCheckin() {
    var view = $('v-checkin');
    if (!MC.events.enabled()) { view.innerHTML = '<div class="card">Check-in is not set up yet.</div>'; return; }
    if (!signedInMode()) {
      MC.store.set(PENDING_KEY, Date.now());           // finish the check-in after sign-in (even after a redirect)
      view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🙏</div><h1>Welcome to the Minneapolis Center</h1>' +
        '<p>Sign in once with Google or Microsoft to check in. Next time it\u2019s one tap.</p>' +
        '<button class="btn btn-primary btn-block" id="ckSignIn" style="margin-top:14px">Sign in to check in</button>' +
        '<p class="small muted" style="margin:12px 0 0">Bringing family or friends? Each adult signs in on their own phone. Ask the host if you need help.</p></div>';
      $('ckSignIn').addEventListener('click', function () { $('accountBtn').click(); });
      return;
    }
    if (valid()) { centerCheckin(); return; }
    view.innerHTML = '<div class="card ck-big muted">Connecting…</div>';
    ensureSession().then(function () { centerCheckin(); }, function () {
      // Google needs a quick reconnect, which must come from a tap
      view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🙏</div><h1>Welcome</h1><button class="btn btn-gold btn-block" id="ckTap">Check in</button></div>';
      $('ckTap').addEventListener('click', function () { centerCheckin(); });
    });
  }
  function centerCheckin(eventId) {
    var view = $('v-checkin');
    if (ckBusy) return; ckBusy = true;
    withSession(function () {
      return api('POST', '/api/centers/' + CENTER + '/checkin', eventId ? { eventId: eventId } : {}).then(function (r) {
        MC.store.del(PENDING_KEY);
        if (!r.open && r.seeHost) {
          view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🙏</div><h1>Welcome</h1><p>Please see the host at the welcome table.</p><a class="btn btn-ghost btn-block" href="#calendar" style="margin-top:10px">See all events</a></div>';
          return;
        }
        if (!r.open) {
          view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🕊</div><h1>No event right now</h1>' +
            '<p>Check-in opens 30 minutes before an event starts.</p>' +
            (r.next ? '<p class="small">Next: <a href="#event?e=' + encodeURIComponent(r.next.id) + '"><b>' + MC.esc(r.next.title) + '</b></a><br>' + MC.esc(fmtWhen(r.next)) + '</p>' : '') +
            '<a class="btn btn-ghost btn-block" href="#calendar" style="margin-top:10px">See all events</a></div>';
          return;
        }
        if (r.choose) {
          view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🙏</div><h1>Which event?</h1><div class="ck-choose">' + r.choose.map(function (e) {
            return '<button class="btn btn-soft btn-block" data-ev="' + MC.esc(e.id) + '">' + MC.esc(e.title) + '<br><small>' + MC.esc(fmtWhen(e).split(' · ')[1]) + '</small></button>';
          }).join('') + '</div></div>';
          view.querySelectorAll('[data-ev]').forEach(function (b) { b.addEventListener('click', function () { centerCheckin(b.dataset.ev); }); });
          return;
        }
        MC.track('event_checkin', { format: r.event.format, method: 'center_qr' });
        view.innerHTML = '<div class="card ck-big ck-done"><div class="ck-icon">✓</div><h1>' + (r.already ? 'You\u2019re already checked in' : 'You\u2019re checked in') + '</h1>' +
          '<p><b>' + MC.esc(r.event.title) + '</b><br><span class="small">' + MC.esc(fmtWhen(r.event)) + '</span></p>' +
          '<p class="small">Welcome! 🙏</p><a class="btn btn-ghost btn-block" href="#event?e=' + encodeURIComponent(r.event.id) + '">Event details</a></div>';
        refreshMe();
      });
    }).catch(function () {
      if (MC.current === 'checkin' && !$('ckTap')) {
        view.innerHTML = '<div class="card ck-big"><div class="ck-icon">🙏</div><h1>Check in</h1><button class="btn btn-gold btn-block" id="ckTap">Try again</button></div>';
        $('ckTap').addEventListener('click', function () { centerCheckin(eventId); });
      }
    }).then(function () { ckBusy = false; }, function () { ckBusy = false; });
  }
  // Came from the poster and signed in (Google pop-up, or back from the Microsoft redirect): finish the check-in
  function resumePending() {
    var at = MC.store.get(PENDING_KEY, 0);
    if (!at || Date.now() - at > 20 * 60000) { if (at) MC.store.del(PENDING_KEY); return; }
    if (!signedInMode()) return;
    if (MC.current === 'checkin') showCheckin(); else location.hash = 'checkin';
  }
  function printPoster() {
    var url = MC.APP_LINK + '#checkin', w = window.open('', '_blank');
    if (!w) { MC.toast('Please allow pop-ups to print the poster.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Check in · Minneapolis Center</title><style>' +
      'body{font-family:Georgia,serif;text-align:center;color:#3b2466;margin:0;padding:40px 24px}h1{font-size:44px;margin:10px 0 6px}' +
      'p{font-family:system-ui,sans-serif;font-size:20px;margin:8px 0;color:#333}.qr{width:380px;height:380px;margin:24px auto}.qr svg{width:100%;height:100%}' +
      '.small{font-size:14px;color:#777}@media print{button{display:none}}</style></head><body>' +
      '<div style="font-size:48px">🙏</div><h1>Welcome! Please check in</h1><p>Scan with your phone camera</p>' +
      '<div class="qr">' + qrSvg(url) + '</div>' +
      '<p><b>1.</b> Scan the code &nbsp; <b>2.</b> Sign in with Google or Microsoft (first time only) &nbsp; <b>3.</b> You\u2019re checked in</p>' +
      '<p class="small">Science of Spirituality · Minneapolis Center · Meditation Copilot (prototype)<br>' + MC.esc(url) + '</p>' +
      '<button onclick="window.print()" style="margin-top:20px;font-size:18px;padding:10px 24px">Print</button></body></html>');
    w.document.close();
    MC.track('event_poster');
  }

  /* ---------- Wiring ---------- */
  MC.views.checkin = { show: showCheckin };
  MC.on('sync', function () { if (signedInMode()) resumePending(); });
  MC.views.event = { show: showEvent };
  MC.on('signout', function () { clearSession(); });   // earned check-in points stay
  // On start-up, refresh check-ins (for rewards) when we already have an events session
  setTimeout(function () { if (valid()) refreshMe(); }, 1500);
})();
