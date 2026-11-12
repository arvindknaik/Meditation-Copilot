/* Meditation Copilot — social: presence counts and meditation buddies (v0.13)
 *  - Presence: while the app is open and the person is signed in, a heartbeat goes to the events server every
 *    60 s with 'active' or 'meditating' (Timer running). Only counts are shown; names are never shown, except
 *    between buddies who both agreed.
 *  - Buddies: invite by sign-in email (up to 10). Buddies see each other's name and presence only.
 */
(function () {
  var MC = window.MC, $ = MC.$;
  var HEARTBEAT = 60000, WINDOW = 3 * 60000, COUNTS_KEY = 'meditation-copilot:presence-counts';
  var counts = MC.store.get(COUNTS_KEY, null), inviteCount = 0, hbTimer = null, lastBeat = 0, buddyData = null;

  function ev() { return MC.events; }
  function enabled() { return ev() && ev().enabled(); }
  function meditatingNow() { var a = MC.store.get(MC.KEYS.active, null); return !!(a && !a.pausedAt); }

  /* ---------- heartbeat ---------- */
  function beat(force) {
    if (!enabled() || document.hidden) return Promise.resolve();
    if (!force && Date.now() - lastBeat < HEARTBEAT - 2000) return Promise.resolve();
    lastBeat = Date.now();
    if (ev().signedInMode()) {
      // Quietly connect to the events server if needed (no pop-up); fall back to public counts if that fails
      var pre = ev().valid() ? Promise.resolve() : ev().ensureSession();
      return pre.then(function () {
        return ev().api('POST', '/api/presence', { state: meditatingNow() ? 'meditating' : 'active' }).then(function (j) {
          counts = j; MC.store.set(COUNTS_KEY, j); inviteCount = j.invitesIn || 0; paint();
        });
      }).catch(function () { return ev().api('GET', '/api/presence/counts').then(function (j) { counts = j; MC.store.set(COUNTS_KEY, j); paint(); }).catch(function () {}); });
    }
    return ev().api('GET', '/api/presence/counts').then(function (j) { counts = j; MC.store.set(COUNTS_KEY, j); paint(); }).catch(function () {});
  }
  function startBeats() {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(function () { beat(false); }, HEARTBEAT);
    beat(true);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(true); });
  // Timer start / stop changes the state right away
  MC.on('timer', function () { lastBeat = 0; beat(true); });

  /* ---------- rendering ---------- */
  function fresh() { return counts && Date.now() - (counts.at || 0) < 10 * 60000; }
  function countsHTML() {
    if (!fresh()) return '';
    var me = ev().signedInMode() && ev().valid() ? 1 : 0;
    var others = Math.max(0, (counts.active || 0) - me), med = Math.max(0, (counts.meditating || 0) - (me && meditatingNow() ? 1 : 0));
    var parts = ['🟢 ' + (others ? others + (others === 1 ? ' other' : ' others') + ' on the app now' : 'You’re the first one here right now')];
    if (med) parts.push('🧘 ' + med + ' meditating');
    if (counts.meditatedToday) parts.push('🌅 ' + counts.meditatedToday + ' meditated today');
    return parts.join(' · ');
  }
  function paint() {
    var el = $('presence');
    if (el) {
      var html = '';
      if (enabled()) {
        var c = countsHTML();
        html = '<div class="card presence">' + (c ? '<p class="small" style="margin:0">' + c + '</p>' : '<p class="small muted" style="margin:0">Connecting to the sangat…</p>') +
          (inviteCount ? '<button class="btn btn-soft btn-sm btn-block" id="prInvites" style="margin-top:10px">🤝 ' + inviteCount + (inviteCount === 1 ? ' buddy invite waiting' : ' buddy invites waiting') + '</button>' : '') + '</div>';
      }
      el.innerHTML = html;
      if ($('prInvites')) $('prInvites').addEventListener('click', openBuddies);
    }
    var t = $('timerPresence');
    if (t) {
      var med = fresh() ? Math.max(0, (counts.meditating || 0) - 1) : 0;
      t.textContent = med ? '🧘 ' + med + (med === 1 ? ' other is' : ' others are') + ' meditating with you right now' : (fresh() ? 'You hold the space for others right now 🙏' : '');
    }
  }
  MC.renderPresence = paint;

  /* ---------- buddies ---------- */
  var dlg = $('buddyDlg');
  function openBuddies() {
    if (!ev().signedInMode()) { MC.toast('Sign in with Google or Microsoft to add buddies.'); return; }
    $('bdList').innerHTML = '<p class="small muted">Loading…</p>'; $('bdErr').textContent = ''; $('bdEmail').value = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    load();
  }
  function load() {
    return ev().withSession(function () { return ev().api('GET', '/api/buddies').then(function (j) { buddyData = j; inviteCount = (j.invitesIn || []).length; renderList(); paint(); }); })
      .catch(function (x) { $('bdList').innerHTML = '<p class="small muted">' + MC.esc(x.message || 'Could not load.') + '</p>'; });
  }
  function presenceText(b) {
    if (b.state === 'meditating') return '<span class="pr-dot med"></span>Meditating now';
    if (b.state === 'active') return '<span class="pr-dot on"></span>On the app now';
    if (!b.lastSeenAt) return '<span class="pr-dot"></span>Not seen yet';
    var days = Math.floor((Date.now() - b.lastSeenAt) / 86400000);
    return '<span class="pr-dot"></span>Last active ' + (days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? days + ' days ago' : 'a while ago');
  }
  function renderList() {
    var d = buddyData || { buddies: [], invitesIn: [], invitesOut: [], max: 10 }, html = '';
    if (d.invitesIn.length) html += '<div class="section-title" style="margin-top:4px">Invitations</div>' + d.invitesIn.map(function (i) {
      return '<div class="bd-row"><span class="ag-main"><b>' + MC.esc(i.name || i.email) + '</b><small>invited you to be meditation buddies</small></span>' +
        '<button class="btn btn-primary btn-sm" data-acc="' + MC.esc(i.id) + '">Accept</button><button class="btn btn-ghost btn-sm" data-dec="' + MC.esc(i.id) + '">Decline</button></div>'; }).join('');
    html += '<div class="section-title" style="margin-top:12px">My buddies <span class="small muted">' + d.buddies.length + ' of ' + d.max + '</span></div>';
    html += d.buddies.length ? d.buddies.map(function (b) {
      return '<div class="bd-row"><span class="ag-main"><b>' + MC.esc(b.name || 'Buddy') + '</b><small>' + presenceText(b) + '</small></span><button class="link small" data-rm="' + MC.esc(b.id) + '">Remove</button></div>'; }).join('')
      : '<p class="small muted">No buddies yet. Invite someone below: you’ll see when each other is on the app or meditating. Nothing else is shared.</p>';
    if (d.invitesOut.length) html += '<div class="section-title" style="margin-top:12px">Sent</div>' + d.invitesOut.map(function (i) {
      return '<div class="bd-row"><span class="ag-main"><b>' + MC.esc(i.email) + '</b><small>Invited · waiting</small></span><button class="link small" data-rm="' + MC.esc(i.id) + '">Withdraw</button></div>'; }).join('');
    $('bdList').innerHTML = html;
  }
  function act(method, path, okMsg) {
    $('bdErr').textContent = '';
    return ev().api(method, path).then(function (j) { buddyData = j; inviteCount = (j.invitesIn || []).length; renderList(); paint(); if (okMsg) MC.toast(okMsg); })
      .catch(function (x) { $('bdErr').textContent = x.message; });
  }
  $('bdList').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.acc) act('POST', '/api/buddies/' + encodeURIComponent(b.dataset.acc) + '/accept', 'You’re buddies now 🤝');
    else if (b.dataset.dec) act('POST', '/api/buddies/' + encodeURIComponent(b.dataset.dec) + '/decline');
    else if (b.dataset.rm) { if (window.confirm('Remove? You’ll no longer see each other’s presence.')) act('DELETE', '/api/buddies/' + encodeURIComponent(b.dataset.rm)); }
  });
  $('bdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('bdEmail').value.trim(); if (!email) return;
    $('bdErr').textContent = '';
    ev().withSession(function () {
      return ev().api('POST', '/api/buddies/invite', { email: email }).then(function (j) {
        buddyData = j; renderList(); $('bdEmail').value = '';
        MC.toast(j.accepted ? 'You’re buddies now 🤝' : 'Invitation sent. They’ll see it when they open the app.');
        MC.track('buddy_invite');
      });
    }).catch(function (x) { $('bdErr').textContent = x.message || ''; });
  });
  $('bdClose').addEventListener('click', function () { dlg.close(); });
  MC.openBuddies = openBuddies;
  MC.buddiesAccountHTML = function () {
    if (!enabled() || !ev().signedInMode()) return '';
    return '<div class="section-title" style="margin-top:20px">Meditation buddies</div>' +
      '<p class="small" style="margin:-6px 0 10px">See when a friend is on the app or meditating, and they see you. Names only, nothing else.' + (inviteCount ? ' <b>' + inviteCount + ' waiting.</b>' : '') + '</p>' +
      '<button class="btn btn-ghost btn-sm btn-block" id="acBuddies">🤝 Buddies</button>';
  };
  MC.bindBuddiesAccount = function (close) { if ($('acBuddies')) $('acBuddies').addEventListener('click', function () { close(); openBuddies(); }); };

  /* ---------- wiring ---------- */
  MC.on('view', function () { paint(); beat(false); });
  MC.on('sync', function () { beat(true); });
  MC.on('signout', function () { buddyData = null; inviteCount = 0; paint(); });
  setTimeout(function () { if (enabled()) startBeats(); }, 0);   // after all scripts (account.js loads later)
})();
