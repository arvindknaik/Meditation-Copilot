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
  var CATEGORY = { seeker: 'Seeker', friend: 'Satsangi', initiate: 'Initiate' };
  var MSG_KEY = 'meditation-copilot:event-messages';      // events I've left a note on for the center (for the +5 reward; was: public reflections)
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
  function signedInMode() { return !!(MC.account && MC.account.signedIn()); }
  function ensureSession() {
    if (valid()) return Promise.resolve(session);
    if (!signedInMode()) return Promise.reject(err('Please sign in with Google or Microsoft first.', { needsSignIn: true }));
    return MC.sync.identityToken().then(function (idt) {
      return fetch(base() + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idt) });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw err(j.error || 'Could not sign in to events'); return j; });
    }).then(function (j) {
      // Admins and hosts get a shorter session (12 hours) from the server; others about 30 days
      session = { token: j.token, user: j.user, contact: j.contact || null, exp: j.exp ? j.exp - 60000 : Date.now() + 29 * 86400000 };
      markRole();
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
  function markRole() {
    var r = document.documentElement;
    r.classList.toggle('is-staff', !!MC.events.isStaff());
    r.classList.toggle('is-admin', !!MC.events.isAdmin());
  }
  var meAt = 0;
  function refreshMe() {
    if (!valid()) return Promise.resolve();
    meAt = Date.now();
    return api('GET', '/api/me').then(function (j) {
      session.user = j.user; if (j.contact) session.contact = j.contact; MC.store.set(SESSION_KEY, session); markRole();
      MC.store.set(CK_KEY, j.checkins || []);
      MC.store.set(MSG_KEY, j.noteEvents || j.messageEvents || []);
      MC.emit('data');                          // re-evaluate rewards
    }).then(syncCategory).catch(function () {});
  }
  // Tell the server only the word 'seeker' or 'initiate' (never the initiation details). Seeker Friend is set by an admin.
  // v0.23: Initiate is one way. If the center set someone as Initiate, the phone follows; if an admin revoked it, the phone goes
  // back to Seeker and can't declare it again (MC.profile.initiateRevoked) until an admin sets it.
  function syncCategory() {
    if (!valid() || !MC.profile.userType) return Promise.resolve();
    var u = session.user || {}, have = u.category, local = MC.profile.userType;
    if (u.initiateRevoked && have !== 'initiate') {
      if (local === 'initiated' || !MC.profile.initiateRevoked) {
        MC.profile.userType = 'seeker'; MC.profile.initiateRevoked = true; MC.saveProfile(); MC.emit('profile');
        if (local === 'initiated') MC.toast('The center has updated your details. Please speak with the center team if this isn’t right.', 6000);
      }
      return Promise.resolve();
    }
    if (MC.profile.initiateRevoked) { delete MC.profile.initiateRevoked; MC.saveProfile(); }
    if (have === 'initiate' && local !== 'initiated') { MC.profile.userType = 'initiated'; MC.saveProfile(); MC.emit('profile'); return Promise.resolve(); }
    var mine = local === 'initiated' ? 'initiate' : 'seeker';
    if (have === mine || (mine === 'seeker' && have === 'friend')) return Promise.resolve();
    return api('PUT', '/api/me/category', { category: mine }).then(function (j) {
      session.user.category = j.category; MC.store.set(SESSION_KEY, session);
    }).catch(function (x) {
      if (x && x.status === 403) { session.user.initiateRevoked = true; MC.store.set(SESSION_KEY, session); return syncCategory(); }
    });
  }
  MC.on('profile', function () { if (valid()) syncCategory(); });

  MC.events = {
    api: api, withSession: withSession, valid: valid, signedInMode: signedInMode, ensureSession: ensureSession,   // shared with social.js
    enabled: function () { return !!base(); },
    isAdmin: function () { return valid() && session.user && session.user.isAdmin; },
    isStaff: function () { return valid() && session.user && (session.user.isStaff || session.user.isAdmin); },
    role: function () { return valid() && session.user ? session.user.role || (session.user.isAdmin ? 'admin' : null) : null; },
    hostedCheckins: function () { return MC.store.get(CK_KEY, []) || []; },
    // Account & settings: event contact details
    accountHTML: function () {
      if (!MC.events.enabled() || !valid()) return '';
      return '<div class="section-title" style="margin-top:20px">Contact details</div>' +
        (session.user && session.user.blocked ? '<p class="small" style="margin:0 0 6px;color:var(--danger,#b00)">Your account can\u2019t take part in center events. Contact MinneapolisCenter@sos.org.</p>' : '') +
        '<p class="small" style="margin:-6px 0 10px">' + contactSummary() + '</p>' +
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
    MC.rewards.addRule({ id: 'event_message', category: 'community', icon: '💬', name: 'Left a Note for the Center', desc: 'After checking in, leave a note about the event (on its sosmn.org page)', points: 5, repeat: true,
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
  MC.eventsOn = function () { return []; };   // v0.16: no event dots in the app calendar (events are on sosmn.org)

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
  /* v0.16: events live on sosmn.org (RSVP, calendar, check-in). The app only links there and keeps the
   * person's check-ins in step with the server, so check-in points and attendance challenges still count. */
  function siteHref(path) { return MC.siteUrl(path); }
  function centerLinkHTML(compact) {
    return '<a class="card center-link" href="' + MC.esc(siteHref('/')) + '">' +
      '<span class="cl-ic" aria-hidden="true">📅</span><span class="cl-body"><b>Center events</b>' +
      '<small>' + (compact ? 'RSVP, calendar and check-in on sosmn.org' : 'Group meditations and programs at the Minneapolis Meditation Center. RSVP, calendar and check-in are on sosmn.org.') + '</small></span>' +
      '<span class="cl-go">sosmn.org ›</span></a>';
  }
  function syncMe() {
    if (!MC.events.enabled() || !signedInMode()) return;
    var pre = valid() ? Promise.resolve() : ensureSession();
    pre.then(function () { if (valid() && Date.now() - meAt > 60000) return refreshMe(); }).catch(function () {});
  }
  // Calendar tab: the center link and the person's ★ favourite events (saved on sosmn.org: an event or a whole series)
  var favAt = 0, favs = MC.store.get('meditation-copilot:favorites', null);
  function favHTML() {
    if (!signedInMode()) return '';
    var t = Date.now(), up = ((favs && favs.events) || []).filter(function (e) { return e.endsAt > t && e.status !== 'cancelled'; }).slice(0, 5);
    return '<div class="card home-evs"><div class="section-title">★ Your favourites <a class="link" href="' + MC.esc(siteHref('/calendar/?fav=1')) + '" style="padding:0">All ›</a></div>' +
      (up.length ? up.map(function (e) { return homeRow(e); }).join('') : '<p class="small muted" style="margin:-4px 0 0">Save events, or a whole series like weekly satsang, with ☆ on their page on sosmn.org. They appear here.</p>') + '</div>';
  }
  function renderCard() {
    var el = $('calEvents'); if (!el) return;
    el.classList.remove('card');
    el.innerHTML = centerLinkHTML(false) + favHTML();
    if (!signedInMode() || Date.now() - favAt < 5 * 60000) return;
    favAt = Date.now();
    withQuietSession(function () { return api('GET', '/api/me/favorites'); }).then(function (j) {
      if (!j) return;
      favs = { events: j.events || [], series: j.series || [], at: Date.now() }; MC.store.set('meditation-copilot:favorites', favs);
      if ($('calEvents')) $('calEvents').innerHTML = centerLinkHTML(false) + favHTML();
    }).catch(function () { favAt = 0; });
  }
  function withQuietSession(fn) { return (valid() ? Promise.resolve() : ensureSession()).then(fn); }
  MC.renderEventsCard = function () { renderCard(); syncMe(); };

  /* ---------- Today screen (v0.23): 4 upcoming events (★ featured first, then by date) and 2 recent ones, linking to sosmn.org ----------
   * Same rules as the sosmn.org home page (apps/site/js/types.js homeUpcoming / homeRecent). */
  var homeAt = 0, homeList = MC.store.get('meditation-copilot:home-events', null) || { events: [] };
  function byStart(a, b) { return a.startsAt - b.startsAt; }
  MC.topEvents = function (t) {
    t = t || Date.now();
    var ev = homeList.events || [], ok = function (e) { return e.status !== 'cancelled'; };
    var up = ev.filter(function (e) { return ok(e) && e.endsAt > t; }).sort(byStart);
    var past = ev.filter(function (e) { return ok(e) && e.endsAt <= t; }).sort(byStart).reverse();
    var featured = function (l) { return l.filter(function (e) { return e.hero; }).concat(l.filter(function (e) { return !e.hero; })); };
    return { upcoming: featured(up).slice(0, 4), recent: featured(past).slice(0, 2) };
  };
  function homeRow(e, past) {
    var tag = e.myCheckin ? '<span class="ag-st ok">✓ Checked in</span>' : !past && e.myRsvp === 'going' ? '<span class="ag-st now">Going</span>' : '';
    return '<a class="ev-row' + (past ? ' past' : '') + '" href="' + MC.esc(siteHref('/event/?id=' + encodeURIComponent(e.id))) + '"><span class="ev-date"><b>' + new Date(e.startsAt).getDate() + '</b>' +
      new Date(e.startsAt).toLocaleDateString(undefined, { month: 'short' }) + '</span>' +
      (e.flyerId ? '<img class="ev-thumb" src="' + MC.esc(flyerUrl(e.flyerId, true)) + '" alt="" loading="lazy">' : '') +
      '<span class="ag-main"><b>' + (e.hero ? '★ ' : '') + MC.esc(e.title) + '</b> ' + badge(e) + '<small>' + MC.esc(fmtWhen(e).split(' · ')[1]) + ' · ' + MC.esc(FORMAT[e.format] || '') + '</small></span>' + tag + '</a>';
  }
  function homeEventsHTML() {
    var top = MC.topEvents();
    return centerLinkHTML(true) + (top.upcoming.length ? '<div class="card home-evs"><div class="section-title">Upcoming events</div>' + top.upcoming.map(function (e) { return homeRow(e); }).join('') + '</div>' : '') +
      (top.recent.length ? '<div class="card home-evs"><div class="section-title">Recent events</div>' + top.recent.map(function (e) { return homeRow(e, true); }).join('') + '</div>' : '');
  }
  MC.renderHomeEvents = function () {
    var el = $('homeEvents'); if (!el) return;
    if (!MC.events.enabled()) { el.innerHTML = ''; return; }
    el.innerHTML = homeEventsHTML();
    syncMe();
    if (Date.now() - homeAt < 5 * 60000) return;
    homeAt = Date.now();
    var t = Date.now();
    api('GET', '/api/events?from=' + (t - 120 * 86400000) + '&to=' + (t + 180 * 86400000)).then(function (j) {
      homeList = { events: j.events || [], at: Date.now() }; MC.store.set('meditation-copilot:home-events', homeList);
      if (MC.current === 'home' && $('homeEvents')) $('homeEvents').innerHTML = homeEventsHTML();
    }).catch(function () { homeAt = 0; });
  };

  /* ---------- Today screen: hero article (chosen by an admin in Admin → Today screen) ---------- */
  var DEFAULT_ARTICLE = {
    url: '/news/ten-year-anniversary-2025/', title: 'Meditation Center Celebrates 10 Years of Peace and Harmony',
    image: '/news/media/2025/05/invitation.jpg', date: 'May 25, 2025',
    summary: 'Ten years of free meditation programs in Columbia Heights, marked with a Meditation Symposium in June 2025.'
  };
  function siteLink(u) { return u && u.charAt(0) === '/' ? MC.siteUrl(u) : u; }
  MC.heroArticle = function () {
    var st = (MC.store.get(SETTINGS_KEY, null) || {}).settings || {};
    return st.heroArticle === null ? null : (st.heroArticle || DEFAULT_ARTICLE);
  };
  MC.renderHeroArticle = function () { var el = $('heroArticle'); if (el) el.innerHTML = ''; };   // v0.16: removed (News lives on sosmn.org)

  /* ---------- Event page ---------- */
  var current = null, adminTimer = null;
  function showEvent() {
    var id = param('e'), view = $('v-event');
    // v0.16: event pages moved to sosmn.org. Old links (shares, reminders) open the same event there.
    if (!MC.store.get('meditation-copilot:legacy-events', false)) {
      view.innerHTML = '<div class="card center muted">Opening the event on sosmn.org…</div>';
      location.replace(siteHref(id ? '/event/?id=' + encodeURIComponent(id) : '/'));
      return;
    }
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

    // v0.23: public reflections are retired; after checking in, people leave a private note for the center on sosmn.org
    if (e.myCheckin) html += '<p class="small" style="margin-top:12px"><a href="' + MC.esc(siteHref('/event/?id=' + encodeURIComponent(e.id))) + '">Leave a note for the center ›</a></p>';

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

  /* ---------- Featured video on Today (everyone) ---------- */
  var settingsAt = 0;
  // Shared with the Admin area (js/admin.js)
  MC.events.helpers = {
    raw: raw, fmtWhen: fmtWhen, flyerUrl: flyerUrl, fmtPhone: fmtPhone, FORMAT: FORMAT, ACCESS: ACCESS, CATEGORY: CATEGORY, CENTER: CENTER,
    loadUpcoming: loadUpcoming, cached: function () { return cache; }, openForm: function (e) { openForm(e || null); },
    settings: function () { return (MC.store.get(SETTINGS_KEY, null) || {}).settings || {}; },
    saveSettings: function (patch) {
      return api('PUT', '/api/admin/centers/' + CENTER + '/settings', patch).then(function (j) {
        MC.store.set(SETTINGS_KEY, { settings: j.settings || {}, at: Date.now() }); settingsAt = Date.now(); return j.settings;
      });
    },
    refreshHome: function () { homeLoadAt = 0; }
  };
  markRole();

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
    api('GET', '/api/centers/' + CENTER + '/settings?v=' + ((cached && cached.at) || 0)).then(function (j) { MC.store.set(SETTINGS_KEY, { settings: j.settings || {}, at: Date.now() }); paint(j.settings); if (MC.renderHeroArticle) MC.renderHeroArticle(); })
      .catch(function () { settingsAt = 0; });
  };
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
    var adminOnly = MC.events.isAdmin();
    var heroBox = adminOnly ? '<div class="hero-toggle">' + (e.hero
        ? '<span>★ Featured (shown first on sosmn.org and Today)</span><button class="btn btn-ghost btn-sm" id="adHero" data-on="1">Remove</button>'
        : '<span class="small">Feature this event: shown first on sosmn.org and Today</span><button class="btn btn-soft btn-sm" id="adHero">★ Feature</button>') + '</div>' : '';
    var remind = adminOnly ? '<div class="tool-row two" style="margin:8px 0 0"><button class="btn btn-soft btn-sm" id="adEmail">✉️ Email RSVPs</button><button class="btn btn-ghost btn-sm" id="adWa">💬 WhatsApp (demo)</button></div>' : '';
    el.innerHTML = '<div class="section-title">Host tools <span class="small muted">' + (adminOnly ? 'admin' : 'host') + '</span></div>' + heroBox + door +
      '<div class="section-title" style="margin-top:16px">Attendees <button class="link" id="adRefresh" style="padding:0">Refresh</button></div>' +
      '<div class="seg ad-filter" role="tablist" aria-label="Show"><button class="on" data-f="all">All</button><button data-f="waiting">Not yet in</button><button data-f="in">Checked in</button></div>' +
      '<div id="adList" class="small muted">Loading…</div>' + remind +
      '<label class="field" for="adFind">Check in someone who registered on the spot</label>' +
      '<input type="search" id="adFind" class="text-input" placeholder="Search name or email" autocomplete="off"><div id="adFound"></div>' +
      '<div class="tool-row" style="grid-template-columns:1fr 1fr 1fr;margin-top:14px">' +
      '<button class="btn btn-ghost btn-sm" id="adCsv">⬇ CSV</button><button class="btn btn-ghost btn-sm" id="adEdit">✎ Edit</button>' +
      '<button class="btn btn-danger btn-sm" id="adCancel">' + (e.status === 'cancelled' ? 'Restore' : 'Cancel event') + '</button></div>' +
      (e.seriesId ? '<div class="small" style="text-align:center;margin-top:10px"><button class="link small" id="adCancelAll">' +
        (e.status === 'cancelled' ? 'Restore this & following' : 'Cancel this & following') + '</button> · <button class="link small" id="adCancelSeries">' +
        (e.status === 'cancelled' ? 'Restore whole series' : 'Cancel whole series') + '</button></div>' : '');
    $('adRefresh').addEventListener('click', loadAttendees);
    el.querySelectorAll('.ad-filter button').forEach(function (b) {
      b.addEventListener('click', function () { adFilter = b.dataset.f; el.querySelectorAll('.ad-filter button').forEach(function (x) { x.classList.toggle('on', x === b); }); paintAttendees(); });
    });
    if ($('adHero')) $('adHero').addEventListener('click', function () {
      var off = $('adHero').dataset.on === '1';
      api(off ? 'DELETE' : 'POST', '/api/admin/events/' + encodeURIComponent(current.id) + '/hero').then(function () {
        MC.toast(off ? 'No longer featured.' : '★ Featured on Today.'); homeLoadAt = 0;
        loadUpcoming().then(function () { showEvent(); }).catch(function () {});
      }).catch(function (x) { MC.toast(x.message); });
    });
    if ($('adEmail')) $('adEmail').addEventListener('click', function () { MC.adminTools.emailRsvps(current); });
    if ($('adWa')) $('adWa').addEventListener('click', function () { MC.adminTools.whatsappDemo(current); });
    if (!adminOnly) { $('adEdit').hidden = true; $('adCsv').hidden = true; $('adCancel').hidden = true; if ($('adNewCode')) $('adNewCode').hidden = true; }
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
  var adFilter = 'all', adRows = [];
  function whenShort(ms) { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function paintAttendees() {
    if (!$('adList')) return;
    var a = adRows, inN = a.filter(function (x) { return x.checkedInAt; }).length;
    var going = a.filter(function (x) { return x.rsvp === 'going'; }).length, maybe = a.filter(function (x) { return x.rsvp === 'maybe'; }).length;
    var list = a.filter(function (x) { return adFilter === 'all' || (adFilter === 'in' ? x.checkedInAt : !x.checkedInAt && x.rsvp !== 'no'); });
    $('adList').innerHTML = '<p class="small" style="margin:0 0 8px"><b>' + inN + '</b> checked in · <b>' + going + '</b> going · ' + maybe + ' maybe · ' + a.length + ' responded</p>' +
      (list.length ? list.map(function (x) {
        return '<div class="ad-row"><span class="ag-main"><b>' + MC.esc(x.name || '') + '</b> <span class="badge">' + MC.esc(CATEGORY[x.category] || 'Seeker') + '</span><small>' +
          (x.rsvp ? { going: 'Going', maybe: 'Maybe', no: 'Can\u2019t go' }[x.rsvp] + (x.rsvpAt ? ' · RSVP\u2019d ' + MC.esc(whenShort(x.rsvpAt)) : '') : 'No RSVP') +
          (x.checkedInAt ? ' · ✓ in at ' + MC.esc(MC.fmtTime(x.checkedInAt)) + ' (' + ({ qr: 'QR', code: 'code', host: 'by host', online: 'online' }[x.method] || x.method) + ')' : '') +
          (x.email ? '<br>' + MC.esc(x.email) + (x.phone ? ' · ' + MC.esc(fmtPhone(x.phone)) : '') : '') + '</small></span>' +
          (x.checkedInAt ? '<button class="btn btn-ghost btn-sm" data-unck="' + MC.esc(x.userId) + '">Undo</button>'
            : '<button class="btn btn-soft btn-sm" data-ck="' + MC.esc(x.userId) + '">Check in</button>') + '</div>';
      }).join('') : '<p class="small muted">' + (a.length ? 'Nobody in this list.' : 'No responses yet.') + '</p>');
  }
  function loadAttendees() {
    if (!$('adList')) return;
    api('GET', '/api/admin/events/' + encodeURIComponent(current.id) + '/attendees').then(function (j) {
      adRows = j.attendees || []; paintAttendees();
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
    // v0.16: center check-in moved to sosmn.org/checkin/. Posters printed with the app link keep working.
    if (!MC.store.get('meditation-copilot:legacy-events', false)) {
      MC.store.del(PENDING_KEY);
      view.innerHTML = '<div class="card center muted">Opening check-in on sosmn.org…</div>';
      location.replace(siteHref('/checkin/'));
      return;
    }
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
  /* ---------- Wiring ---------- */
  MC.views.checkin = { show: showCheckin };
  MC.on('sync', function () { if (signedInMode()) resumePending(); });
  MC.views.event = { show: showEvent };
  MC.on('signout', function () { clearSession(); });   // earned check-in points stay
  // On start-up, refresh check-ins (for rewards) when we already have an events session
  setTimeout(function () { if (valid()) refreshMe(); }, 1500);
})();
