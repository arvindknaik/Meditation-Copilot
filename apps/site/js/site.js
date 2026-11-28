/* sosmn.org — Science of Spirituality Minneapolis Meditation Center events site.
 * Pages: home (next events), calendar, event (details, RSVP with guests, add to calendar, check-in), checkin (center QR poster).
 */
(function () {
  'use strict';
  var S = window.SOS, esc = S.esc, TZ = 'America/Chicago';
  var $ = function (id) { return document.getElementById(id); };
  var page = document.body.getAttribute('data-page');
  var FORMAT = { in_person: '📍 In person', online: '💻 Online', hybrid: '📍💻 In person & online' };

  /* ---------- small helpers ---------- */
  function fmt(ms, o) { return new Date(ms).toLocaleString('en-US', Object.assign({ timeZone: TZ }, o)); }
  function dayKey(ms) { return fmt(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }); }   // MM/DD/YYYY in center time
  function whenText(e) {
    var d = fmt(e.startsAt, { weekday: 'short', month: 'short', day: 'numeric' });
    var a = fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' }), z = fmt(e.endsAt, { hour: 'numeric', minute: '2-digit' });
    return d + ' · ' + a + '–' + z;
  }
  function flyer(e, thumb) { return e.flyerId ? S.CFG.apiBase + '/api/flyers/' + encodeURIComponent(e.flyerId) + (thumb ? '?size=thumb' : '') : null; }
  function toast(msg, ms) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  function sheet(html) {
    var d = $('sheet'); $('sheetBody').innerHTML = html;
    if (d.showModal && !d.open) d.showModal();
    return $('sheetBody');
  }
  function closeSheet() { var d = $('sheet'); if (d.open) d.close(); }
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet') || e.target.closest('[data-close]')) closeSheet(); });
  function headcount(e) { var n = e.headcount != null ? e.headcount : e.going; return n ? n + ' going' : ''; }
  function badge(e) { return e.status === 'cancelled' ? '<span class="tag cx">Cancelled</span>' : ''; }
  var T = window.SOS_TYPES;
  var FREE = '<span class="tag free">FREE</span>';
  function kicker(e) { return esc([T.label(e.kind), FORMAT[e.format] || '', e.access !== 'public' ? T.AUDIENCE[e.access] : ''].filter(Boolean).join(' · ')); }

  /* ---------- account: sign-in, contact details ---------- */
  function paintAccount() {
    var box = $('acct'), u = S.user();
    if (!u) { box.innerHTML = '<button class="btn btn-ghost btn-sm" id="signInBtn" type="button">Sign in</button>'; $('signInBtn').onclick = function () { signIn(); }; return; }
    var first = (u.name || u.email || '').split(' ')[0];
    box.innerHTML = '<button class="btn btn-ghost btn-sm acct-btn" id="acctBtn" type="button" aria-label="Your account">👤 ' + esc(first) + '</button>';
    $('acctBtn').onclick = accountSheet;
  }
  // Sign in, then make sure contact details are confirmed (needed to RSVP and check in). Resolves with the session.
  function signIn(reason) {
    if (S.valid()) return ensureContact();
    S.prepareGoogle().catch(function () {});   // load early so the pop-up isn't blocked
    return new Promise(function (res, rej) {
      var b = sheet('<h2 class="sheet-title">Sign in</h2><p class="small muted">' + esc(reason || 'Sign in to RSVP and check in to events.') + ' We only use your name and email.</p>' +
        '<div class="signin-btns"><button class="btn btn-block prov" id="gBtn" type="button"><span class="g-logo" aria-hidden="true">G</span> Continue with Google</button>' +
        '<button class="btn btn-block prov" id="mBtn" type="button"><span class="m-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span> Continue with Microsoft</button></div>' +
        (S.isLocal ? '<p class="small"><b>Local test sign-in</b> (this computer only): <input class="input" id="tEmail" placeholder="any email, e.g. priya@example.com" style="margin:6px 0"><button class="btn btn-soft btn-sm" id="tBtn" type="button">Sign in as test user</button></p>' : '') +
        '<p class="error" id="siErr" role="alert"></p><p class="small muted">See our <a href="/privacy/">privacy notice</a>.</p>' +
        '<div class="actions"><button class="btn btn-ghost" data-close type="button">Not now</button></div>');
      $('gBtn').onclick = function () {
        $('siErr').textContent = '';
        S.signInGoogle().then(function () { closeSheet(); return ensureContact(); }).then(res, function (x) { $('siErr').textContent = x.message; });
      };
      $('mBtn').onclick = function () { S.signInMicrosoft(); };
      if ($('tBtn')) $('tBtn').onclick = function () { var e = $('tEmail').value.trim(); if (!e) return; S.signInTest(e, e.split('@')[0]).then(function () { closeSheet(); return ensureContact(); }).then(res, function (x) { $('siErr').textContent = x.message; }); };
      $('sheet').addEventListener('close', function once() { $('sheet').removeEventListener('close', once); if (!S.valid()) rej(new Error('cancelled')); }, { once: true });
    });
  }
  function ensureContact() {
    if (S.contactOk()) return Promise.resolve(S.session());
    return S.refreshMe().catch(function () {}).then(function () {
      if (S.contactOk()) return S.session();
      return contactSheet(true);
    });
  }
  function contactSheet(first) {
    var s = S.session(), c = (s && s.contact) || {}, nm = c.name || (s && s.user && s.user.name) || '';
    return new Promise(function (res, rej) {
      sheet('<h2 class="sheet-title">' + (first ? 'Your details' : 'Your details') + '</h2>' +
        '<label class="field" for="cName">Your name</label><input class="input" id="cName" autocomplete="name" maxlength="80" value="' + esc(nm) + '">' +
        (c.providerName && c.providerName !== nm ? '<p class="small muted" style="margin:4px 0 0">From ' + (s.provider === 'microsoft' ? 'Microsoft' : 'Google') + ': ' + esc(c.providerName) + '</p>' : '') +
        '<label class="field">Email</label><input class="input" value="' + esc(c.email || (s && s.user && s.user.email) || '') + '" disabled>' +
        '<label class="field" for="cZip">ZIP code <span class="muted">(optional)</span></label><input class="input" id="cZip" inputmode="numeric" autocomplete="postal-code" maxlength="10" placeholder="55421" value="' + esc(c.zip || '') + '">' +
        '<label class="field" for="cPhone">Mobile phone <span class="muted">(optional)</span></label><input class="input" id="cPhone" type="tel" autocomplete="tel" value="' + esc(c.phone || '') + '" placeholder="612-555-0100">' +
        '<label class="check" id="cSmsRow"' + (c.phone ? '' : ' hidden') + '><input type="checkbox" id="cSms"' + (c.smsOk || !c.phone ? ' checked' : '') + '> OK to send me event reminders by text or WhatsApp <span class="muted">(uncheck if you’d rather not)</span></label>' +
        '<label class="check"><input type="checkbox" id="cNoMsg"' + (c.noMessages ? ' checked' : '') + '> Please don’t send me any messages from the center</label>' +
        '<p class="privacy-note small">🔒 <b>Your privacy:</b> we use your details only to share center programs and reminders, and to know roughly where our visitors come from (ZIP code). They are kept confidential by the Minneapolis Center volunteers, never sold or shared, and you can ask us to delete them at any time. <a href="/privacy/">Privacy notice</a></p>' +
        '<p class="error" id="cErr" role="alert"></p>' +
        '<div class="actions"><button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" id="cSave" type="button">Save</button></div>');
      // Typing a number ticks the reminders box (people can untick it); clearing the number hides it
      var hadPhone = !!c.phone;
      $('cPhone').addEventListener('input', function () {
        var has = !!this.value.trim(); $('cSmsRow').hidden = !has;
        if (has && !hadPhone && !$('cNoMsg').checked) $('cSms').checked = true;
        hadPhone = has;
      });
      $('cNoMsg').addEventListener('change', function () { if (this.checked) $('cSms').checked = false; });
      $('cSave').onclick = function () {
        var phone = $('cPhone').value.trim() || null;
        S.saveContact({ name: $('cName').value.trim(), zip: $('cZip').value.trim() || null, phone: phone, smsOk: !!phone && $('cSms').checked && !$('cNoMsg').checked, noMessages: $('cNoMsg').checked })
          .then(function () { return S.refreshMe(); }).then(function () { closeSheet(); toast('Saved.'); res(S.session()); }, function (x) { $('cErr').textContent = x.message; });
      };
      $('sheet').addEventListener('close', function once() { if (!S.contactOk()) rej(new Error('cancelled')); }, { once: true });
    });
  }
  function accountSheet() {
    var s = S.session(); if (!s) return;
    sheet('<h2 class="sheet-title">' + esc(s.user.name || 'Your account') + '</h2><p class="small muted">' + esc(s.user.email) + ' · signed in with ' + (s.provider === 'microsoft' ? 'Microsoft' : 'Google') + '</p>' +
      '<div class="stack"><button class="btn btn-ghost btn-block" id="aContact" type="button">Your details</button><a class="btn btn-ghost btn-block" href="/calendar/?mine=1">My events</a>' +
      '<button class="btn btn-ghost btn-block" id="aOut" type="button">Sign out</button></div><div class="actions"><button class="btn btn-ghost" data-close type="button">Close</button></div>');
    $('aContact').onclick = function () { contactSheet(false).catch(function () {}); };
    $('aOut').onclick = function () { S.signOut(); closeSheet(); toast('Signed out.'); if (page === 'event') loadEvent(); else if (page === 'home') loadHome(); };
  }
  S.onChange(paintAccount);

  /* ---------- data ---------- */
  var cache = null, cacheAt = 0;
  function loadEvents(from, to) {
    return S.api('GET', '/api/events?from=' + from + '&to=' + to).then(function (j) { return j.events || []; });
  }
  function upcoming() {
    if (cache && Date.now() - cacheAt < 60000) return Promise.resolve(cache);
    var t = Date.now();
    return loadEvents(t - 6 * 3600000, t + 180 * 86400000).then(function (ev) { cache = ev; cacheAt = Date.now(); return ev; });
  }

  /* ---------- cards ---------- */
  function myTag(e) {
    if (e.myCheckin) return '<span class="tag ok">✓ Checked in</span>';
    if (e.myRsvp === 'going') return '<span class="tag ok">You\u2019re going' + (e.myGuests ? ' +' + e.myGuests : '') + '</span>';
    if (e.myRsvp === 'maybe') return '<span class="tag">Maybe</span>';
    return '';
  }
  function heroCard(e) {
    var img = flyer(e);
    return '<a class="card ev-hero" href="/event/?id=' + encodeURIComponent(e.id) + '">' +
      '<span class="ev-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph" style="--tc:' + T.color(e.kind) + '">' + T.icon(e.kind, 96) + '</span>') + '</span>' +
      '<span class="ev-body"><span class="kicker">' + (e.hero ? '★ Featured · ' : '') + kicker(e) + ' ' + FREE + '</span>' +
      '<b class="ev-title">' + esc(e.title) + '</b><span class="ev-when">' + esc(whenText(e)) + '</span>' +
      (e.venue && e.format !== 'online' ? '<span class="ev-meta">' + esc(e.venue) + '</span>' : '') +
      (e.description ? '<span class="ev-desc">' + esc(e.description.slice(0, 220)) + (e.description.length > 220 ? '…' : '') + '</span>' : '') +
      '<span class="ev-foot">' + (myTag(e) || '<span class="btn btn-primary btn-sm">Details &amp; RSVP</span>') + '<span class="muted small">' + esc(headcount(e)) + '</span>' + badge(e) + '</span></span></a>';
  }
  function smallCard(e, past) {
    return '<a class="card ev-card' + (past ? ' ev-past' : '') + '" href="/event/?id=' + encodeURIComponent(e.id) + '">' +
      T.thumb(e, flyer(e, true), 52) +
      '<span class="ev-body"><span class="kicker">' + (e.hero ? '★ Featured · ' : '') + kicker(e) + (past ? '' : ' ' + FREE) + (e.myFav ? ' <span class="fav-mark" title="In your favourites">★</span>' : '') + '</span><b class="ev-title">' + esc(e.title) + '</b>' +
      '<span class="ev-when">' + esc(whenText(e)) + '</span><span class="ev-foot">' + myTag(e) + '<span class="muted small">' + esc(headcount(e)) + '</span>' + badge(e) + '</span></span></a>';
  }

  /* ---------- home: 4 upcoming events (★ featured first, then by date; the soonest featured is large) and 2 recent ones ---------- */
  function loadHome() {
    upcoming().then(function (ev) {
      var up = T.homeUpcoming(ev, 4), hero = up[0], rest = up.slice(1);
      $('upcoming').innerHTML = up.length ? heroCard(hero) + '<div class="up-rest">' + rest.map(function (e) { return smallCard(e); }).join('') + '</div>'
        : '<div class="card empty"><p>No upcoming events are scheduled right now.</p><p class="small muted">Check back soon, or see <a href="https://sos.org/location/Minneapolis-StPaul/" target="_blank" rel="noopener">our page on sos.org</a>.</p></div>';
    }).catch(function (x) { $('upcoming').innerHTML = '<div class="card empty"><p>' + esc(x.message) + '</p></div>'; });
    var t = Date.now();
    if ($('recent')) loadEvents(t - 120 * 86400000, t).then(function (ev) {
      var past = T.homeRecent(ev, 2, t);
      $('recentSec').hidden = !past.length;
      $('recent').innerHTML = past.map(function (e) { return smallCard(e, true); }).join('');
    }).catch(function () { $('recentSec').hidden = true; });
  }

  /* ---------- calendar: month grid + list ---------- */
  var calMonth = null, calView = 'up', calEvents = [];
  // ★ Favourites: events and whole series the person saved (signed in)
  function loadFavorites() {
    document.querySelectorAll('.cal-bar, .page-head .seg').forEach(function (x) { x.hidden = true; });
    $('calMonth').hidden = true;
    var el = $('calList'), head = '<div class="sec-head"><h2>★ Your favourites</h2><a class="link" href="/calendar/">‹ All events</a></div>';
    if (!S.valid()) {
      el.innerHTML = head + '<div class="card empty"><p>Sign in to see the events and series you saved as favourites.</p><button class="btn btn-primary" id="favSignL" type="button">Sign in</button></div>';
      $('favSignL').onclick = function () { signIn('Sign in to see your favourites.').then(loadFavorites).catch(function () {}); };
      return;
    }
    el.innerHTML = head + '<div class="card skeleton"></div>';
    S.api('GET', '/api/me/favorites').then(function (j) {
      var t = Date.now(), list = j.events || [], up = list.filter(function (e) { return e.endsAt > t; }), past = list.filter(function (e) { return e.endsAt <= t; }).reverse().slice(0, 10);
      el.innerHTML = head + ((j.series || []).length ? '<p class="small muted">Series: ' + j.series.map(function (x) { return '<b>' + esc(x.title) + '</b>' + (x.freq ? ' (' + esc(x.freq) + ')' : ''); }).join(', ') + '. Every date of a favourite series is listed.</p>' : '') +
        (up.length ? up.map(function (e) { return smallCard(e); }).join('') : '<div class="card empty"><p>No upcoming favourites. Open an event and tap <b>☆ Favourite</b> to save it, or its whole series.</p></div>') +
        (past.length ? '<h3 class="small muted" style="margin-top:18px">Earlier</h3>' + past.map(function (e) { return smallCard(e, true); }).join('') : '');
    }).catch(function (x) { el.innerHTML = head + '<div class="card empty"><p>' + esc(x.message) + '</p></div>'; });
  }
  /* Calendar (v0.24): Upcoming = yesterday through the next 30 days, "Show the next 30 days" adds more;
   * Recent = 2 to 32 days ago (newest first), "Show earlier" goes back, up to 12 months; Month = the grid.
   * The address keeps the tab and how far you've loaded (?view=recent&from=2026-09-01 · ?to=2027-02-15), so Back and shared links work. */
  var DAY = 86400000, MAXBACK = 365;
  function dayStart(ms) { return centerDayEnd(ms) - DAY; }
  function isoDay(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms)); }
  function fromIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? dayStart(Date.UTC(+m[1], +m[2] - 1, +m[3], 18)) : null; }
  function dayHead(ms, today) {
    var d = Math.round((dayStart(ms) - today) / DAY);
    return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : fmt(ms, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function chunks(from, to) {   // fetch in 31-day pieces (the server returns up to 200 events per request)
    var parts = [];
    for (var a = from; a < to; a += 31 * DAY) parts.push(S.api('GET', '/api/events?from=' + a + '&to=' + Math.min(to, a + 31 * DAY) + '&edges=1'));
    return Promise.all(parts).then(function (rs) {
      var seen = {}, ev = [];
      rs.forEach(function (j) { (j.events || []).forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; ev.push(e); } }); });
      return { events: ev, next: rs.length ? rs[rs.length - 1].next : null, prev: rs.length ? rs[0].prev : null };
    });
  }
  function setUrl(params) {
    var u = new URL(location.href);
    ['view', 'to', 'from'].forEach(function (k) { u.searchParams.delete(k); });
    Object.keys(params).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); });
    history.replaceState(null, '', u.pathname + (u.search || ''));
  }
  function loadCalendar() {
    var q = new URLSearchParams(location.search);
    var mine = q.get('mine') === '1';
    if (q.get('fav') === '1') return loadFavorites();
    calView = ['up', 'recent', 'month'].indexOf(q.get('view')) >= 0 ? q.get('view') : calView === 'list' ? 'up' : calView;
    document.querySelectorAll('[data-cv]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.cv === calView);
      b.onclick = function () { calView = b.dataset.cv; setUrl({ view: calView === 'up' ? '' : calView }); loadCalendar(); };
    });
    document.querySelector('.cal-bar').hidden = calView !== 'month';
    $('calMore').innerHTML = '';
    var filt = function (ev) { return mine ? ev.filter(function (e) { return e.myRsvp && e.myRsvp !== 'no' || e.myCheckin; }) : ev; };
    var fail = function (x) { $('calList').innerHTML = '<div class="card empty"><p>' + esc(x.message) + '</p></div>'; };
    if (calView === 'month') {
      $('calList').classList.remove('cal-days');
      if (!calMonth) { var n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
      var from = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getTime() - 7 * DAY;
      var to = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1).getTime() + 7 * DAY;
      $('calTitle').textContent = calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + (mine ? ' · my events' : '');
      $('calPrev').onclick = function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); loadCalendar(); };
      $('calNext').onclick = function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); loadCalendar(); };
      $('calToday').onclick = function () { calMonth = null; loadCalendar(); };
      loadEvents(from, to).then(function (ev) { calEvents = filt(ev); paintMonth(); paintList(); }).catch(fail);
      return;
    }
    $('calMonth').hidden = true;
    var today = dayStart(Date.now()), el = $('calList');
    el.classList.add('cal-days');
    el.innerHTML = '<div class="card skeleton"></div>';
    if (calView === 'up') {
      var upFrom = today - DAY, upTo = Math.max(fromIso(q.get('to')) || 0, today + 31 * DAY);   // through day 30 (end of that day)
      chunks(upFrom, upTo).then(function (r) {
        var list = filt(r.events).filter(function (e) { return e.startsAt >= upFrom || e.endsAt > Date.now(); }).sort(function (a, b) { return a.startsAt - b.startsAt; });
        el.innerHTML = list.length ? dayGroups(list, today) : '<div class="card empty"><p>No events in the next 30 days.</p></div>';
        var lastDay = upTo - DAY;
        if (r.next) {
          var gap = r.next - upTo > 30 * DAY;
          $('calMore').innerHTML = '<button class="btn btn-ghost btn-block" id="calMoreBtn" type="button">' + (gap ? 'Next event: ' + esc(fmt(r.next, { month: 'short', day: 'numeric' })) + ' ›' : 'Show the next 30 days') + '</button>';
          $('calMoreBtn').onclick = function () { var nt = gap ? dayStart(r.next) + 31 * DAY : upTo + 30 * DAY; setUrl({ to: isoDay(nt - DAY) }); loadCalendar(); };
        } else $('calMore').innerHTML = '<p class="small muted center">Nothing scheduled after ' + esc(fmt(lastDay, { month: 'short', day: 'numeric' })) + '.</p>';
      }).catch(fail);
    } else {
      var reTo = today - DAY, limit = today - MAXBACK * DAY, reFrom = Math.max(limit, Math.min(fromIso(q.get('from')) || Infinity, today - 32 * DAY));
      chunks(reFrom, reTo).then(function (r) {
        var list = filt(r.events).filter(function (e) { return e.startsAt < reTo && e.endsAt <= Date.now(); }).sort(function (a, b) { return b.startsAt - a.startsAt; });
        el.innerHTML = list.length ? dayGroups(list, today, true) : '<div class="card empty"><p>No events in the past month.</p></div>';
        if (r.prev && r.prev >= limit) {
          var gap = reFrom - r.prev > 30 * DAY;
          $('calMore').innerHTML = '<button class="btn btn-ghost btn-block" id="calMoreBtn" type="button">' + (gap ? 'Earlier event: ' + esc(fmt(r.prev, { month: 'short', day: 'numeric' })) + ' ›' : 'Show earlier') + '</button>';
          $('calMoreBtn').onclick = function () { var nf = Math.max(limit, gap ? dayStart(r.prev) - 30 * DAY : reFrom - 30 * DAY); setUrl({ view: 'recent', from: isoDay(nf) }); loadCalendar(); };
        } else $('calMore').innerHTML = '<p class="small muted center">' + (r.prev ? 'That’s the past 12 months.' : 'No earlier events.') + '</p>';
      }).catch(fail);
    }
  }
  function dayGroups(list, today, past) {
    var html = '', cur = null;
    list.forEach(function (e) {
      var k = isoDay(e.startsAt);
      if (k !== cur) { cur = k; html += '<h3 class="cal-dayh">' + esc(dayHead(e.startsAt, today)) + '</h3>'; }
      html += smallCard(e, past || e.endsAt <= Date.now());
    });
    return html;
  }
  function paintMonth() {
    var el = $('calMonth'); el.hidden = calView !== 'month';
    if (calView !== 'month') return;
    var y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
    var byDay = {};
    calEvents.forEach(function (e) { var k = dayKey(e.startsAt); (byDay[k] = byDay[k] || []).push(e); });
    var todayK = dayKey(Date.now()), html = '<div class="cal-dow">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="cal-grid">';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var k = dayKey(d.getTime() + 12 * 3600000), list = byDay[k] || [];
      html += '<div class="cal-day' + (d.getMonth() !== m ? ' out' : '') + (k === todayK ? ' today' : '') + '"><span class="dnum">' + d.getDate() + '</span>' +
        list.map(function (e) {
          return '<a class="cal-ev' + (e.status === 'cancelled' ? ' cx' : '') + (e.myRsvp === 'going' || e.myCheckin ? ' mine' : '') + '" style="--tc:' + T.color(e.kind) + '" href="/event/?id=' + encodeURIComponent(e.id) + '" title="' + esc(T.label(e.kind) + ': ' + e.title) + '">' +
            '<i>' + esc(fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' }).replace(':00', '')) + '</i> ' + esc(e.title) + '</a>';
        }).join('') + '</div>';
      if (i === 34 && d.getMonth() !== m) break;
    }
    el.innerHTML = html + '</div>';
  }
  function paintList() {
    var el = $('calList');
    var mStart = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getTime(), mEnd = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1).getTime();
    var list = calEvents.filter(function (e) { return e.startsAt >= mStart && e.startsAt < mEnd; });
    if (calView === 'month' && document.documentElement.classList.contains('mc-desktop')) { el.innerHTML = ''; return; }
    el.innerHTML = list.length ? list.map(function (e) { return smallCard(e, e.endsAt <= Date.now()); }).join('') : '<div class="card empty"><p>No events this month.</p></div>';
  }

  /* ---------- event page ---------- */
  var ev = null, guests = 0, savingT = null;
  function eventId() { return new URLSearchParams(location.search).get('id'); }
  // Self check-in: from 1 hour before the start until the end of that day (Minneapolis time)
  function inWindow(e) {
    var t = Date.now(), end = Math.max(e.endsAt, centerDayEnd(e.startsAt));
    return t >= e.startsAt - 3600000 && t <= end;
  }
  function centerDayEnd(ms) {
    // end of the event's day in Minneapolis time
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = Number(x.value); });
    return ms - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + 86400000;
  }
  function loadEvent() {
    var id = eventId();
    if (!id) { $('event').innerHTML = '<div class="card empty"><p>No event selected.</p><a class="btn btn-primary" href="/calendar/">See the calendar</a></div>'; return; }
    S.api('GET', '/api/events/' + encodeURIComponent(id)).then(function (j) {
      ev = j.event; guests = ev.myGuests || 0;
      document.title = ev.title + ' · Science of Spirituality Minneapolis Meditation Center';
      paintEvent();
      try { if (!sessionStorage.getItem('sosmn.viewed.' + id)) { sessionStorage.setItem('sosmn.viewed.' + id, '1'); S.api('POST', '/api/events/' + encodeURIComponent(id) + '/view').catch(function () {}); } } catch (e) {}
    }).catch(function (x) {
      $('event').innerHTML = '<div class="card empty"><p>' + esc(x.status === 404 ? 'This event isn\u2019t available. It may have been removed, or it may be for members only.' : x.message) + '</p>' +
        (x.status === 404 && !S.valid() ? '<button class="btn btn-primary" id="evSign" type="button">Sign in</button> ' : '') + '<a class="btn btn-ghost" href="/calendar/">See the calendar</a></div>';
      if ($('evSign')) $('evSign').onclick = function () { signIn().then(loadEvent).catch(function () {}); };
    });
  }
  function paintEvent() {
    var e = ev, img = flyer(e), past = e.endsAt < Date.now(), cx = e.status === 'cancelled';
    var mapQ = encodeURIComponent((e.address || e.venue || '4054 Van Buren St NE, Columbia Heights, MN 55421'));
    var html = '<article class="card ev-page">' + (img ? '<a class="ev-flyer" href="' + esc(img) + '" target="_blank" rel="noopener"><img src="' + esc(img) + '" alt="Event flyer"></a>' : '') +
      '<div class="ev-page-body"><div class="ev-type">' + T.icon(e.kind, 40) + '<p class="kicker">' + kicker(e) + (e.repeats ? ' · repeats ' + esc(e.repeats) : '') + '</p></div>' +
      '<h1>' + esc(e.title) + '</h1>' + (cx ? '<p class="notice warn"><b>This event was cancelled.</b></p>' : '') +
      '<p class="free-line">' + FREE + ' <span>This program is free of charge, like all our programs. No registration fee, no donations expected.</span></p>' +
      '<p class="ev-when big">🗓 ' + esc(fmt(e.startsAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '<br>🕒 ' +
        esc(fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' }) + ' – ' + fmt(e.endsAt, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })) + '</p>' +
      (e.format !== 'online' ? '<p class="ev-where">📍 <b>' + esc(e.venue || 'Minneapolis Meditation Center') + '</b>' + (e.address ? '<br>' + esc(e.address) : '') +
        ' · <a href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank" rel="noopener">Map ↗</a></p>' : '') +
      (e.description ? '<div class="ev-desc-full">' + esc(e.description).replace(/\n/g, '<br>') + '</div>' : '') +
      (e.format !== 'online' ? '<p class="ev-kids">' + (e.children ? '👧 <b>Children’s program available.</b> Children are welcome in their own program during this event.'
        : '👪 No separate children’s program at this event. Parents, please keep children with you.') + '</p>' : '') +
      (e.format !== 'online' ? '<p class="small muted">Please read our <a href="/guidelines/">visitor guidelines</a>: the center is monitored by video for safety and security, and photography needs permission.</p>' : '') +
      '<p class="muted small">' + esc(headcount(e)) + (e.checkedIn ? ' · ' + (e.checkedIn + (e.checkedInGuests || 0)) + ' checked in' : '') + '</p>' +
      '<div class="fav-row">' + favButtons(e) + '</div></div></article>';

    // RSVP
    if (!cx && !past) {
      html += '<section class="card" aria-labelledby="rsvpH"><h2 id="rsvpH">Will you join?</h2>';
      if (!S.valid()) html += '<p class="small">Sign in with Google or Microsoft to RSVP. It takes a few seconds.</p><button class="btn btn-primary" id="rsvpSign" type="button">Sign in to RSVP</button>';
      else {
        html += '<div class="rsvp" role="group" aria-label="RSVP">' + [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Can\u2019t go']].map(function (o) {
          return '<button type="button" class="rsvp-btn' + (e.myRsvp === o[0] ? ' on' : '') + '" data-rsvp="' + o[0] + '" aria-pressed="' + (e.myRsvp === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div>' +
          '<div class="guests" id="guestsRow"' + (e.myRsvp === 'going' || e.myRsvp === 'maybe' ? '' : ' hidden') + '><span>Bringing anyone? <small class="muted">family or friends, not counting you</small></span>' +
          '<span class="stepper"><button type="button" class="step" data-g="-1" aria-label="One fewer guest">−</button><b id="gVal" aria-live="polite">' + guests + '</b><button type="button" class="step" data-g="1" aria-label="One more guest">+</button></span></div>' +
          '<p class="small muted" id="rsvpNote">' + (e.myRsvp ? 'Saved. You can change this any time.' : '') + '</p>';
      }
      html += '</section>';
    }
    // Check-in
    if (!cx && (e.format !== 'online' || e.onlineUrl || !S.valid())) {
      var open = inWindow(e);
      html += '<section class="card" aria-labelledby="ckH"><h2 id="ckH">Check in</h2>';
      if (e.myCheckin) html += '<p class="notice ok">✓ You checked in at ' + esc(fmt(e.myCheckin, { hour: 'numeric', minute: '2-digit' })) + '. Thank you for coming!</p>';
      else if (!open) html += '<p class="small muted">' + (Date.now() < e.startsAt ? 'Check-in opens 1 hour before the start, ' + esc(fmt(e.startsAt - 3600000, { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '.' : 'Check-in for this event has closed.') + '</p>';
      else if (!S.valid()) html += '<p class="small">Sign in to check in.</p><button class="btn btn-primary" id="ckSign" type="button">Sign in</button>';
      else {
        var code = new URLSearchParams(location.search).get('code') || '';
        if (e.format !== 'online') html += '<p class="small">At the center? Enter the 4-digit code shown at the door, or scan the QR code there.</p>' +
          '<div class="ck-row"><input class="input code" id="ckCode" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Code" aria-label="Check-in code" value="' + esc(code) + '">' +
          '<button class="btn btn-primary" id="ckGo" type="button">I\u2019m here</button></div>';
        if (e.format !== 'in_person') html += '<p class="small" style="margin-top:12px">Joining online?</p><button class="btn btn-soft" id="ckOnline" type="button">💻 Join online &amp; check in</button>';
        html += '<p class="small muted" id="ckGuestsNote">Checking in ' + (guests ? 'with ' + guests + (guests === 1 ? ' guest' : ' guests') + ' (change above)' : 'just yourself') + '.</p><p class="error" id="ckErr" role="alert"></p>';
      }
      html += '</section>';
    }
    // Visitor log: a private note for the center, after checking in (until 7 days after the event)
    if (e.myCheckin && Date.now() <= (e.noteUntil || e.endsAt + 7 * 86400000)) html += '<section class="card" id="noteCard" aria-labelledby="noteH"><h2 id="noteH">Leave a note for the center</h2><p class="small muted">Loading…</p></section>';
    // Add to calendar + share
    if (!cx && !past) html += '<section class="card"><h2>Add to your calendar</h2><div class="cal-btns">' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(googleCal(e)) + '" target="_blank" rel="noopener">Google Calendar</a>' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(outlookCal(e)) + '" target="_blank" rel="noopener">Outlook.com</a>' +
      '<button class="btn btn-ghost btn-sm" id="icsBtn" type="button">Apple / Outlook (.ics)</button>' +
      '<button class="btn btn-ghost btn-sm" id="shareBtn" type="button">↗ Share</button></div></section>';
    $('event').innerHTML = html;
    wireEvent();
    if ($('noteCard')) loadNote();
  }
  function favButtons(e) {
    if (!S.valid()) return '<button class="btn btn-ghost btn-sm" id="favSign" type="button">☆ Favourite</button>';
    return '<button class="btn btn-ghost btn-sm' + (e.favEvent ? ' on' : '') + '" id="favEv" type="button" aria-pressed="' + !!e.favEvent + '">' + (e.favEvent ? '★ Favourite' : '☆ Favourite') + '</button>' +
      (e.seriesId ? '<button class="btn btn-ghost btn-sm' + (e.favSeries ? ' on' : '') + '" id="favSr" type="button" aria-pressed="' + !!e.favSeries + '">' + (e.favSeries ? '★ Whole series saved' : '☆ Save the whole series') + '</button>' : '') +
      '<a class="link small" href="/calendar/?fav=1">Your favourites ›</a>';
  }
  function toggleFav(kind, on) {
    var ref = kind === 'series' ? ev.seriesId : ev.id;
    S.api(on ? 'DELETE' : 'PUT', '/api/me/favorites/' + kind + '/' + encodeURIComponent(ref)).then(function () {
      if (kind === 'series') ev.favSeries = !on; else ev.favEvent = !on;
      toast(on ? 'Removed from your favourites.' : kind === 'series' ? '★ Every date of this series is in your favourites.' : '★ Saved to your favourites.');
      cache = null; paintEvent();
    }).catch(function (x) { toast(x.message, 5000); });
  }
  function loadNote() {
    S.api('GET', '/api/events/' + encodeURIComponent(ev.id) + '/note').then(function (j) {
      var box = $('noteCard'); if (!box) return;
      if (!j.canWrite) { box.hidden = true; return; }
      var n = j.note;
      box.innerHTML = '<h2 id="noteH">Leave a note for the center</h2><p class="small muted">How was it for you? Only the center team reads this. One note per event; you can change it until ' +
        esc(fmt(j.until, { weekday: 'short', month: 'short', day: 'numeric' })) + '.</p>' +
        '<textarea class="input" id="noteBody" rows="3" maxlength="500" placeholder="A few words for the center team">' + esc(n ? n.body : '') + '</textarea>' +
        '<label class="check small"><input type="checkbox" id="noteShare"' + (n && n.shareOk ? ' checked' : '') + '> The center may share this note publicly (first name only)</label>' +
        '<div class="ck-row" style="margin-top:8px"><button class="btn btn-primary" id="noteSave" type="button">' + (n ? 'Update note' : 'Send note') + '</button>' +
        (n ? '<button class="btn btn-ghost btn-sm" id="noteDel" type="button">Remove</button>' : '') + '</div><p class="error" id="noteErr" role="alert"></p>' +
        (n ? '<p class="small muted">Sent ' + esc(fmt(n.updatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '. Thank you 🙏</p>' : '');
      $('noteSave').onclick = function () {
        S.api('PUT', '/api/events/' + encodeURIComponent(ev.id) + '/note', { body: $('noteBody').value, shareOk: $('noteShare').checked })
          .then(function () { toast('Thank you. Your note was sent to the center team. 🙏', 4000); loadNote(); }, function (x) { $('noteErr').textContent = x.message; });
      };
      if ($('noteDel')) $('noteDel').onclick = function () {
        if (!window.confirm('Remove your note?')) return;
        S.api('DELETE', '/api/events/' + encodeURIComponent(ev.id) + '/note').then(function () { toast('Note removed.'); loadNote(); }, function (x) { $('noteErr').textContent = x.message; });
      };
    }).catch(function () { if ($('noteCard')) $('noteCard').hidden = true; });
  }
  function wireEvent() {
    var e = ev;
    if ($('rsvpSign')) $('rsvpSign').onclick = function () { signIn().then(loadEvent).catch(function () {}); };
    if ($('ckSign')) $('ckSign').onclick = function () { signIn().then(loadEvent).catch(function () {}); };
    if ($('favSign')) $('favSign').onclick = function () { signIn('Sign in to save favourites.').then(loadEvent).catch(function () {}); };
    if ($('favEv')) $('favEv').onclick = function () { toggleFav('event', !!ev.favEvent); };
    if ($('favSr')) $('favSr').onclick = function () { toggleFav('series', !!ev.favSeries); };
    document.querySelectorAll('[data-rsvp]').forEach(function (b) { b.onclick = function () { saveRsvp(b.dataset.rsvp); }; });
    document.querySelectorAll('[data-g]').forEach(function (b) {
      b.onclick = function () {
        guests = Math.max(0, Math.min(20, guests + Number(b.dataset.g)));
        $('gVal').textContent = guests;
        if ($('ckGuestsNote')) $('ckGuestsNote').textContent = 'Checking in ' + (guests ? 'with ' + guests + (guests === 1 ? ' guest' : ' guests') : 'just yourself') + '.';
        clearTimeout(savingT); savingT = setTimeout(function () { if (ev.myRsvp && ev.myRsvp !== 'no') saveRsvp(ev.myRsvp, true); }, 600);
      };
    });
    if ($('ckGo')) $('ckGo').onclick = function () { checkIn(new URLSearchParams(location.search).get('code') ? 'qr' : 'code'); };
    if ($('ckOnline')) $('ckOnline').onclick = function () { checkIn('online'); };
    if ($('icsBtn')) $('icsBtn').onclick = function () { downloadIcs(e); };
    if ($('shareBtn')) $('shareBtn').onclick = function () {
      var url = location.origin + '/event/?id=' + encodeURIComponent(e.id);
      if (navigator.share) navigator.share({ title: e.title, text: e.title + ' · ' + whenText(e), url: url }).catch(function () {});
      else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied.'); }, function () { window.prompt('Copy this link:', url); });
    };
  }
  function saveRsvp(st, quiet) {
    ensureContact().then(function () {
      return S.api('PUT', '/api/events/' + encodeURIComponent(ev.id) + '/rsvp', { status: st, guests: st === 'no' ? 0 : guests });
    }).then(function (j) {
      var was = ev.myRsvp;
      ev.myRsvp = j.status; ev.myGuests = j.guests;
      if (!quiet) { toast(st === 'going' ? 'See you there 🙏' : st === 'maybe' ? 'Marked as maybe.' : 'Thanks for letting us know.'); }
      else toast('Guests updated.');
      cache = null;
      if (!quiet || was !== j.status) S.api('GET', '/api/events/' + encodeURIComponent(ev.id)).then(function (k) { ev = k.event; guests = ev.myGuests || 0; paintEvent(); });
    }).catch(function (x) { if (x.message !== 'cancelled') toast(x.message, 5000); });
  }
  function checkIn(method) {
    ensureContact().then(function () {
      var body = { method: method, guests: guests };
      if (method !== 'online') body.code = ($('ckCode').value || '').trim();
      if (method !== 'online' && !/^\d{4}$/.test(body.code)) throw new Error('Please enter the 4-digit code shown at the center.');
      return S.api('POST', '/api/events/' + encodeURIComponent(ev.id) + '/checkin', body);
    }).then(function (j) {
      toast(j.already ? 'You were already checked in.' : 'Checked in. Welcome! 🙏', 4000);
      if (method === 'online' && j.onlineUrl) window.open(j.onlineUrl, '_blank', 'noopener');
      cache = null; loadEvent();
    }).catch(function (x) { if (x.message !== 'cancelled' && $('ckErr')) $('ckErr').textContent = x.message; });
  }

  /* ---------- add to calendar ---------- */
  function utc(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function evUrl(e) { return location.origin + '/event/?id=' + encodeURIComponent(e.id); }
  function evPlace(e) { return e.format === 'online' ? 'Online' : [e.venue, e.address].filter(Boolean).join(', '); }
  function googleCal(e) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) + '&dates=' + utc(e.startsAt) + '/' + utc(e.endsAt) +
      '&details=' + encodeURIComponent((e.description ? e.description + '\n\n' : '') + 'Details & check-in: ' + evUrl(e)) + '&location=' + encodeURIComponent(evPlace(e));
  }
  function outlookCal(e) {
    return 'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=' + encodeURIComponent(e.title) +
      '&startdt=' + encodeURIComponent(new Date(e.startsAt).toISOString()) + '&enddt=' + encodeURIComponent(new Date(e.endsAt).toISOString()) +
      '&body=' + encodeURIComponent('Details & check-in: ' + evUrl(e)) + '&location=' + encodeURIComponent(evPlace(e));
  }
  function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, function (c) { return '\\' + c; }); }
  function downloadIcs(e) {
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sosmn.org//Events//EN', 'BEGIN:VEVENT', 'UID:' + e.id + '@sosmn.org', 'DTSTAMP:' + utc(Date.now()),
      'DTSTART:' + utc(e.startsAt), 'DTEND:' + utc(e.endsAt), 'SUMMARY:' + icsText(e.title), 'DESCRIPTION:' + icsText((e.description ? e.description + '\n\n' : '') + 'Details & check-in: ' + evUrl(e)),
      'LOCATION:' + icsText(evPlace(e)), 'URL:' + evUrl(e), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = e.title.replace(/[^\w]+/g, '-').slice(0, 40) + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- center QR poster check-in ---------- */
  function loadCheckin(eventId) {
    var box = $('checkin');
    if (!S.valid()) {
      box.innerHTML = '<div class="card"><p>Welcome! Sign in to check in to today\u2019s program.</p><button class="btn btn-primary" id="ciSign" type="button">Sign in</button></div>';
      $('ciSign').onclick = function () { signIn().then(function () { loadCheckin(); }).catch(function () {}); };
      return;
    }
    box.innerHTML = '<div class="card"><p class="muted small">Checking…</p></div>';
    ensureContact().then(function () {
      return S.api('POST', '/api/centers/' + S.CFG.center + '/checkin', eventId ? { eventId: eventId, guests: guests } : { guests: guests });
    }).then(function (j) {
      if (j.ok) {
        box.innerHTML = '<div class="card center"><p class="big-ok">✓</p><h2>' + (j.already ? 'You\u2019re already checked in' : 'Welcome!') + '</h2><p><b>' + esc(j.event.title) + '</b></p>' +
          '<div class="guests"><span>Anyone with you?</span><span class="stepper"><button type="button" class="step" data-g="-1" aria-label="One fewer guest">−</button><b id="gVal">' + guests + '</b><button type="button" class="step" data-g="1" aria-label="One more guest">+</button></span></div>' +
          '<p class="small muted">Guests are saved with your check-in.</p><a class="btn btn-ghost" href="/event/?id=' + encodeURIComponent(j.event.id) + '">Event details</a></div>';
        document.querySelectorAll('[data-g]').forEach(function (b) {
          b.onclick = function () {
            guests = Math.max(0, Math.min(20, guests + Number(b.dataset.g))); $('gVal').textContent = guests;
            clearTimeout(savingT); savingT = setTimeout(function () { S.api('POST', '/api/centers/' + S.CFG.center + '/checkin', { eventId: j.event.id, guests: guests }).then(function () { toast('Guests saved.'); }).catch(function () {}); }, 600);
          };
        });
      } else if (j.choose) {
        box.innerHTML = '<div class="card"><p>Which program are you here for?</p>' + j.choose.map(function (e) { return '<button class="btn btn-ghost btn-block" data-pick="' + esc(e.id) + '" type="button">' + esc(e.title) + ' · ' + esc(fmt(e.startsAt, { hour: 'numeric', minute: '2-digit' })) + '</button>'; }).join('') + '</div>';
        document.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { loadCheckin(b.dataset.pick); }; });
      } else if (j.seeHost) box.innerHTML = '<div class="card"><p>Please see the host at the door to check in.</p></div>';
      else box.innerHTML = '<div class="card"><p>There\u2019s no program to check in to right now. Check-in opens 1 hour before a program starts.</p>' +
        (j.next ? '<p class="small">Next: <a href="/event/?id=' + encodeURIComponent(j.next.id) + '">' + esc(j.next.title) + '</a>, ' + esc(whenText(j.next)) + '</p>' : '') + '</div>';
    }).catch(function (x) { if (x.message !== 'cancelled') box.innerHTML = '<div class="card"><p>' + esc(x.message) + '</p></div>'; });
  }

  /* ---------- layout switch (phone / computer): the small icon in the header ---------- */
  function layoutSwitch() {
    var KEY = 'mc.layout', root = document.documentElement, btn = $('viewBtn');
    function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
    if (!btn) return;
    var m = root.getAttribute('data-layout') || 'mobile';
    btn.firstElementChild.textContent = m === 'desktop' ? '🖥️' : '📱';
    btn.title = 'Layout: ' + (pref() === 'auto' ? 'Auto (' + (m === 'desktop' ? 'computer' : 'phone') + ')' : m === 'desktop' ? 'Computer' : 'Phone');
    btn.onclick = function () {
      var p = pref(), opt = function (v, label, hint) {
        return '<button type="button" class="btn btn-block ' + (p === v ? 'btn-primary' : 'btn-ghost') + '" data-view="' + v + '" style="margin-top:8px">' + label + (hint ? ' <span class="small" style="font-weight:400">' + hint + '</span>' : '') + '</button>'; };
      sheet('<h2 class="sheet-title">Layout</h2><p class="small muted">Choose how this site looks on this device.</p>' +
        opt('auto', 'Auto', '(recommended)') + opt('mobile', '📱 Phone') + opt('desktop', '🖥️ Computer') +
        '<div class="actions"><button class="btn btn-ghost" data-close type="button">Close</button></div>');
      $('sheetBody').querySelectorAll('[data-view]').forEach(function (b) {
        b.onclick = function () { var u = new URL(location.href); u.searchParams.set('view', b.dataset.view); location.replace(u.toString()); };
      });
    };
  }

  /* ---------- start ---------- */
  document.querySelectorAll('[data-this-year]').forEach(function (s) { s.textContent = new Date().getFullYear(); });
  document.querySelectorAll('[data-nav="' + page + '"]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
  if (page === 'event') document.querySelectorAll('[data-nav="calendar"]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
  layoutSwitch();
  paintAccount();
  S.handleRedirect().catch(function (x) { toast(x.message, 5000); }).then(function (signedIn) {
    if (signedIn) ensureContact().catch(function () {});
    if (page === 'home') loadHome();
    else if (page === 'calendar') loadCalendar();
    else if (page === 'event') loadEvent();
    else if (page === 'checkin') loadCheckin();
  });
})();
