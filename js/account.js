/* Meditation Copilot — account: welcome / sign-in choice, guest mode, signed-in state,
   Account & settings sheet, reconnect and backup reminders */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$, CFG = window.MC_CONFIG || {};
  var DAY = 86400000;
  var acct = Object.assign({ mode: null, email: '', guestAckAt: 0, lastExportAt: 0, snoozeUntil: 0, persisted: null },
    MC.store.get(MC.KEYS.account, {}));
  function save() { MC.store.set(MC.KEYS.account, acct); }
  function open(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  function signedIn() { return acct.mode === 'google' || acct.mode === 'microsoft'; }
  function prov(id) { return MC.sync && MC.sync.providers[id]; }

  MC.account = {
    mode: function () { return acct.mode || 'none'; },
    email: function () { return acct.email || ''; },
    isGuest: function () { return acct.mode === 'guest'; },
    setMode: function (mode, email) {
      acct.mode = mode; acct.email = email || ''; save();
      hideWelcome(); renderBadge(); renderBanner();
    },
    noteExport: function () { acct.lastExportAt = Date.now(); save(); renderBadge(); },
    showWelcome: showWelcome,
    renderBanner: renderBanner
  };

  /* ---------- Sign-in buttons ---------- */
  function providerButtons() {
    return ['google', 'microsoft'].map(function (k) {
      var p = prov(k), ready = p && p.ready;
      return '<button class="btn btn-signin" data-provider="' + k + '"' + (ready ? '' : ' disabled aria-disabled="true"') + '>' +
        (k === 'google' ? '<span class="g-logo" aria-hidden="true">G</span>' : '<span class="ms-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>') +
        'Continue with ' + (k === 'google' ? 'Google' : 'Microsoft') + (ready ? '' : ' <small>coming soon</small>') + '</button>';
    }).join('');
  }
  function onProvider(e) {
    var b = e.target.closest('[data-provider]'); if (!b || b.disabled) return;
    var id = b.dataset.provider, wasGuest = acct.mode === 'guest' && MC.sessions.count() > 0;
    b.disabled = true;
    MC.sync.signIn(id).then(function () {
      close($('accountDlg'));
      MC.toast('Signed in. ' + (wasGuest ? 'Your guest data was added to ' : 'Your data is saved in ') + prov(id).storeName + '.', 4000);
      MC.route();
      MC.maybeAskUserType();
    }).catch(function (er) {
      MC.toast(er.message || 'Sign-in failed.', 4500);
      MC.diag.add('signin_error', { provider: id, msg: String(er.message || er) });
    }).then(function () { b.disabled = false; });
  }

  /* ---------- Welcome (first launch) ---------- */
  function showWelcome() {
    $('welcomeProviders').innerHTML = providerButtons();
    $('welcome').hidden = false;
    document.body.classList.add('welcome-open');
  }
  function hideWelcome() { $('welcome').hidden = true; document.body.classList.remove('welcome-open'); }
  $('welcomeProviders').addEventListener('click', onProvider);

  /* ---------- Guest ---------- */
  $('guestBtn').addEventListener('click', function () {
    $('guestAck').checked = false; $('guestGo').disabled = true;
    open($('guestDlg'));
  });
  $('guestAck').addEventListener('change', function () { $('guestGo').disabled = !$('guestAck').checked; });
  $('guestCancel').addEventListener('click', function () { close($('guestDlg')); });
  $('guestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!$('guestAck').checked) return;
    acct.mode = 'guest'; acct.email = ''; acct.guestAckAt = Date.now(); save();
    close($('guestDlg')); hideWelcome(); renderBadge();
    MC.track('account_guest');
    requestPersist();
    MC.route();
    MC.maybeAskUserType();
  });
  function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persist().then(function (granted) {
      acct.persisted = !!granted; save();
      MC.diag.add('storage_persist', { granted: !!granted });
    }).catch(function () {});
  }

  /* ---------- Header badge ---------- */
  var ICON = { ok: '✓', syncing: '⟳', connecting: '⟳', 'needs-auth': '!', error: '⚠', offline: '⦸', idle: '' };
  function renderBadge() {
    var b = $('accountBtn'), st = MC.sync ? MC.sync.state().status : 'idle';
    var label = acct.mode === 'guest' ? 'Guest' : acct.mode === 'google' ? 'Google' : acct.mode === 'microsoft' ? 'Microsoft' : 'Account';
    var icon = signedIn() ? (ICON[st] || '') : '';
    var dot = needsBackup() || (signedIn() && (st === 'needs-auth' || st === 'error'));
    b.innerHTML = '<span aria-hidden="true">👤</span> ' + label +
      (icon ? ' <span class="sync-ic sync-' + st + '" aria-hidden="true">' + icon + '</span>' : '') +
      (dot ? '<span class="dot" aria-hidden="true"></span>' : '');
    b.setAttribute('aria-label', 'Account: ' + label + (signedIn() ? ', sync ' + st : ''));
  }

  /* ---------- Today banners: reconnect (signed in) or backup reminder (guest) ---------- */
  function needsBackup() {
    if (acct.mode !== 'guest' || MC.sessions.count() < 3) return false;
    return !acct.lastExportAt || Date.now() - acct.lastExportAt > 30 * DAY;
  }
  function renderBanner() {
    var el = $('backupBanner');
    if (!el) return;
    var st = MC.sync ? MC.sync.state().status : 'idle';
    if (signedIn() && st === 'needs-auth') {
      var p = prov(acct.mode);
      el.innerHTML = '<b>🔄 Reconnect to ' + MC.esc(p.storeName) + '</b><p class="small" style="margin:4px 0 10px">For your security, ' + MC.esc(p.name) +
        ' sign-in expires after a while. Reconnect to save your latest sittings. Nothing is lost in the meantime; everything stays on this device until then.</p>' +
        '<button class="btn btn-gold btn-sm btn-block" id="bbReconnect">Reconnect ' + MC.esc(p.name) + '</button>';
      el.hidden = false;
      $('bbReconnect').addEventListener('click', reconnect);
      return;
    }
    if (!needsBackup() || Date.now() < acct.snoozeUntil) { el.hidden = true; return; }
    var days = acct.lastExportAt ? Math.floor((Date.now() - acct.lastExportAt) / DAY) : null;
    el.innerHTML = '<b>💾 Keep your sittings safe</b><p class="small" style="margin:4px 0 10px">You are using guest mode, so your ' +
      MC.sessions.count() + ' sittings live only on this device. ' + (days ? 'Your last export was ' + days + ' days ago.' : 'You have not exported a backup yet.') +
      ' Or sign in to keep them in your own drive.</p>' +
      '<div class="tool-row two" style="margin-top:0"><button class="btn btn-gold btn-sm" id="bbExport">Export CSV</button><button class="btn btn-ghost btn-sm" id="bbLater">Remind me later</button></div>';
    el.hidden = false;
    $('bbExport').addEventListener('click', function () { MC.exportCSV(); renderBanner(); });
    $('bbLater').addEventListener('click', function () { acct.snoozeUntil = Date.now() + 7 * DAY; save(); renderBanner(); });
  }
  function reconnect() {
    MC.sync.reconnect().then(function () { MC.toast('Reconnected. Your data is in sync.'); })
      .catch(function (e) { MC.toast(e.message || 'Could not reconnect.', 4500); });
  }

  /* ---------- Account sheet ---------- */
  function ago(ms) {
    if (!ms) return 'not yet';
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    return Math.round(h / 24) + ' days ago';
  }
  var STATUS_TEXT = {
    ok: 'Up to date', syncing: 'Syncing…', connecting: 'Connecting…', 'needs-auth': 'Reconnect needed',
    error: 'Sync problem', offline: 'Offline, will sync when back online', idle: 'Waiting to sync'
  };
  function renderSheet() {
    var st = MC.sync.state(), html = '';
    var days = acct.lastExportAt ? Math.floor((Date.now() - acct.lastExportAt) / DAY) : null;

    if (signedIn()) {
      var p = prov(acct.mode);
      html += '<div class="signed-card"><div><b>Signed in with ' + MC.esc(p.name) + '</b>' +
        (acct.email ? '<div class="small muted">' + MC.esc(acct.email) + '</div>' : '') + '</div>' +
        '<div class="small" style="margin-top:8px">Saved privately in your ' + MC.esc(p.storeName) +
        (acct.mode === 'microsoft' ? ' (Apps › Meditation Copilot)' : ' (hidden app folder)') + '.</div>' +
        '<div class="small" style="margin-top:4px"><b>Sync:</b> ' + MC.esc(STATUS_TEXT[st.status] || st.status) + ' · last synced ' + ago(MC.sync.lastSyncAt()) + '</div>' +
        (st.status === 'error' && st.error ? '<div class="small" style="color:var(--danger);margin-top:4px">' + MC.esc(st.error) + '</div>' : '') +
        '<div class="tool-row two" style="margin-top:12px">' +
        (st.status === 'needs-auth'
          ? '<button class="btn btn-gold btn-sm" id="acReconnect">Reconnect</button>'
          : '<button class="btn btn-soft btn-sm" id="acSync">⟳ Sync now</button>') +
        '<button class="btn btn-ghost btn-sm" id="acSignOut">Sign out</button></div></div>';
    } else {
      if (acct.mode === 'guest') {
        html += '<div class="guest-warn"><b>Guest mode · data on this device only</b><p class="small" style="margin:6px 0 0">Your sittings and reflections can be lost if browser data is cleared, the app is removed, or you change phones. Sign in to keep them safe in your own Google Drive or OneDrive. Your guest data comes with you.</p></div>';
      }
      html += '<div class="section-title" style="margin-top:16px">Sign in to keep your data safe</div>' +
        '<p class="small muted" style="margin:-6px 0 10px">Your data is saved privately in your own drive, in a folder only this app can use. We never see it.</p>' +
        '<div class="stack" style="margin-top:0" id="sheetProviders">' + providerButtons() + '</div>';
    }

    html += MC.profileSheetHTML();
    if (MC.events && MC.events.accountHTML) html += MC.events.accountHTML();

    html += '<div class="section-title" style="margin-top:20px">Your data</div>' +
      '<p class="small" style="margin:-6px 0 10px">' + MC.sessions.count() + ' sittings · last CSV export: ' +
      (days === null ? 'never' : days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago') + '</p>' +
      '<div class="tool-row two" style="margin-top:0"><button class="btn btn-ghost btn-sm" id="acExport">⬇ Export CSV</button><a class="btn btn-ghost btn-sm" href="#insights" id="acImport">⬆ Import (Insights)</a></div>';

    html += '<div class="section-title" style="margin-top:20px">Appearance</div>' +
      '<div class="seg" id="themeSeg" role="radiogroup" aria-label="Theme">' +
      ['auto', 'light', 'dark'].map(function (t) {
        var on = MC.themePref() === t;
        return '<button role="radio" aria-checked="' + on + '" class="' + (on ? 'on' : '') + '" data-theme="' + t + '">' + { auto: 'Automatic', light: 'Light', dark: 'Dark' }[t] + '</button>';
      }).join('') + '</div>';

    html += '<div class="section-title" style="margin-top:20px">Privacy &amp; support</div>' +
      '<div class="toggle" style="border-top:0;margin-top:0;padding-top:0"><div><b>Share anonymous usage statistics</b><div class="small muted">Counts like "sitting saved". No personal data. Helps improve the app.</div></div>' +
      '<label class="switch"><input type="checkbox" id="acStats"' + (MC.settings.analyticsOptOut ? '' : ' checked') + ' aria-label="Share anonymous usage statistics"><span></span></label></div>' +
      '<button class="btn btn-soft btn-sm btn-block" id="acDiag">🩺 Send diagnostics to support</button>' +
      '<p class="small muted" style="margin:8px 0 0">Shares a technical log (' + MC.diag.all().length + ' events, no reflections or personal details) only when you tap this.</p>' +
      '<p class="small" style="margin:14px 0 0"><a href="' + MC.esc(CFG.privacyPolicyUrl || 'privacy.html') + '" target="_blank" rel="noopener">Privacy notice</a> · ' +
      '<a href="tel:+16122164444">612-216-4444</a> · <a href="mailto:' + MC.esc(CFG.support.email) + '">' + MC.esc(CFG.support.email) + '</a></p>' +
      '<p class="small muted" style="margin:10px 0 0">Version ' + MC.esc(MC.VERSION) + ' · Prototype only. Not an official or approved Science of Spirituality app.</p>';
    $('accountBody').innerHTML = html;

    if ($('sheetProviders')) $('sheetProviders').addEventListener('click', onProvider);
    $('acProfile').addEventListener('click', function () { close($('accountDlg')); MC.askUserType(true); });
    if (MC.events && MC.events.bindAccount) MC.events.bindAccount(function () { close($('accountDlg')); });
    if ($('acSync')) $('acSync').addEventListener('click', function () { MC.sync.run(); });
    if ($('acReconnect')) $('acReconnect').addEventListener('click', reconnect);
    if ($('acSignOut')) $('acSignOut').addEventListener('click', signOut);
    $('acExport').addEventListener('click', function () { MC.exportCSV(); renderSheet(); });
    $('acImport').addEventListener('click', function () { close($('accountDlg')); });
    $('themeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme]'); if (!b) return;
      MC.setTheme(b.dataset.theme); renderSheet();
    });
    $('acStats').addEventListener('change', function () { MC.saveSettings({ analyticsOptOut: !$('acStats').checked }); });
    $('acDiag').addEventListener('click', sendDiagnostics);
  }
  $('accountBtn').addEventListener('click', function () { renderSheet(); open($('accountDlg')); });
  $('accountClose').addEventListener('click', function () { close($('accountDlg')); });

  function signOut() {
    var p = prov(acct.mode);
    if (!window.confirm('Sign out of ' + p.name + '? Your data stays safe in your ' + p.storeName + '.')) return;
    var remove = window.confirm('Also remove your sittings and reflections from this device?\n\nOK = remove from this device (recommended on shared devices)\nCancel = keep a copy on this device');
    MC.sync.signOut(remove).then(function () {
      acct.mode = null; acct.email = ''; save();
      close($('accountDlg')); renderBadge();
      MC.toast('Signed out.');
      showWelcome(); MC.route();
    });
  }

  /* ---------- Send diagnostics ---------- */
  function sendDiagnostics() {
    var text = MC.diag.report();
    MC.diag.add('diagnostics_shared');
    var subject = 'Meditation Copilot diagnostics (' + MC.VERSION + ')';
    var file = null;
    try { file = new File([text], 'meditation-copilot-diagnostics.txt', { type: 'text/plain' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: subject, text: 'Diagnostics for ' + CFG.support.email }).catch(function () {});
      return;
    }
    var url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), a = document.createElement('a');
    a.href = url; a.download = 'meditation-copilot-diagnostics.txt'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    var body = 'Hello,\n\nI need help with Meditation Copilot. Describe the problem here:\n\n\n' +
      '(Please attach the file "meditation-copilot-diagnostics.txt" that was just downloaded.)\n\n' +
      'App version ' + MC.VERSION + ' · ' + navigator.userAgent;
    location.href = 'mailto:' + CFG.support.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    MC.toast('Diagnostics file downloaded. Please attach it to the email.', 4500);
  }

  MC.on('data', function () { renderBadge(); if (MC.current === 'home') renderBanner(); });
  MC.on('sync', function () {
    renderBadge();
    if (MC.current === 'home') renderBanner();
    var d = $('accountDlg'); if (d && d.open) renderSheet();
  });
  renderBadge();
})();
