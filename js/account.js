/* Meditation Copilot — account: welcome / sign-in choice, guest mode, account sheet, backup reminder
 * Google and Microsoft sign-in are switched on once Client IDs are added in js/config.js
 * (the sign-in and drive sync code ships in the next update). */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$, CFG = window.MC_CONFIG || {};
  var DAY = 86400000;
  var acct = Object.assign({ mode: null, guestAckAt: 0, lastExportAt: 0, snoozeUntil: 0, persisted: null }, MC.store.get(MC.KEYS.account, {}));
  function save() { MC.store.set(MC.KEYS.account, acct); }
  function open(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  var PROVIDERS = {
    google: { name: 'Google', ready: !!CFG.googleClientId },
    microsoft: { name: 'Microsoft', ready: !!CFG.microsoftClientId }
  };

  MC.account = {
    mode: function () { return acct.mode || 'none'; },
    isGuest: function () { return acct.mode === 'guest'; },
    noteExport: function () { acct.lastExportAt = Date.now(); save(); renderBadge(); },
    showWelcome: showWelcome,
    renderBanner: renderBanner
  };

  /* ---------- Welcome (first launch) ---------- */
  function providerButtons(where) {
    return ['google', 'microsoft'].map(function (k) {
      var p = PROVIDERS[k];
      return '<button class="btn btn-signin" data-provider="' + k + '"' + (p.ready ? '' : ' disabled aria-disabled="true"') + '>' +
        (k === 'google' ? '<span class="g-logo" aria-hidden="true">G</span>' : '<span class="ms-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>') +
        'Continue with ' + p.name + (p.ready ? '' : ' <small>coming soon</small>') + '</button>';
    }).join('');
  }
  function showWelcome() {
    $('welcomeProviders').innerHTML = providerButtons('welcome');
    $('welcome').hidden = false;
    document.body.classList.add('welcome-open');
  }
  function hideWelcome() { $('welcome').hidden = true; document.body.classList.remove('welcome-open'); }

  function onProvider(e) {
    var b = e.target.closest('[data-provider]'); if (!b || b.disabled) return;
    // Next update: Google Identity Services / MSAL sign-in + drive sync
    MC.toast(PROVIDERS[b.dataset.provider].name + ' sign-in is being set up and will arrive in the next update.');
  }
  $('welcomeProviders').addEventListener('click', onProvider);

  $('guestBtn').addEventListener('click', function () {
    $('guestAck').checked = false; $('guestGo').disabled = true;
    open($('guestDlg'));
  });
  $('guestAck').addEventListener('change', function () { $('guestGo').disabled = !$('guestAck').checked; });
  $('guestCancel').addEventListener('click', function () { close($('guestDlg')); });
  $('guestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!$('guestAck').checked) return;
    acct.mode = 'guest'; acct.guestAckAt = Date.now(); save();
    close($('guestDlg')); hideWelcome(); renderBadge();
    MC.track('account_guest');
    requestPersist();
    MC.route();
  });

  // Ask the browser not to clear our storage automatically (best effort)
  function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persist().then(function (granted) {
      acct.persisted = !!granted; save();
      MC.diag.add('storage_persist', { granted: !!granted });
    }).catch(function () {});
  }

  /* ---------- Header badge ---------- */
  function renderBadge() {
    var b = $('accountBtn');
    var label = acct.mode === 'guest' ? 'Guest' : acct.mode === 'google' ? 'Google' : acct.mode === 'microsoft' ? 'Microsoft' : 'Account';
    b.innerHTML = '<span aria-hidden="true">👤</span> ' + label + (needsBackup() ? '<span class="dot" aria-label="Backup recommended"></span>' : '');
  }

  /* ---------- Backup reminder (guests) ---------- */
  function needsBackup() {
    if (acct.mode !== 'guest' || MC.sessions.count() < 3) return false;
    return !acct.lastExportAt || Date.now() - acct.lastExportAt > 30 * DAY;
  }
  function renderBanner() {
    var el = $('backupBanner');
    if (!needsBackup() || Date.now() < acct.snoozeUntil) { el.hidden = true; return; }
    var days = acct.lastExportAt ? Math.floor((Date.now() - acct.lastExportAt) / DAY) : null;
    el.innerHTML = '<b>💾 Keep your sittings safe</b><p class="small" style="margin:4px 0 10px">You are using guest mode, so your ' +
      MC.sessions.count() + ' sittings live only on this device. ' + (days ? 'Your last export was ' + days + ' days ago.' : 'You have not exported a backup yet.') + '</p>' +
      '<div class="tool-row two" style="margin-top:0"><button class="btn btn-gold btn-sm" id="bbExport">Export CSV</button><button class="btn btn-ghost btn-sm" id="bbLater">Remind me later</button></div>';
    el.hidden = false;
    $('bbExport').addEventListener('click', function () { MC.exportCSV(); renderBanner(); });
    $('bbLater').addEventListener('click', function () { acct.snoozeUntil = Date.now() + 7 * DAY; save(); renderBanner(); });
  }

  /* ---------- Account sheet ---------- */
  function renderSheet() {
    var guest = acct.mode === 'guest', days = acct.lastExportAt ? Math.floor((Date.now() - acct.lastExportAt) / DAY) : null;
    var html = '';
    if (guest) {
      html += '<div class="guest-warn"><b>Guest mode · data on this device only</b><p class="small" style="margin:6px 0 0">Your sittings and reflections can be lost if browser data is cleared, the app is removed, or you change phones. Export a CSV regularly, or sign in (coming soon) to keep them in your own Google Drive or OneDrive.</p></div>';
    } else {
      html += '<p class="small muted">Not signed in.</p>';
    }
    html += '<div class="section-title" style="margin-top:16px">Sign in to keep your data safe</div>' +
      '<p class="small muted" style="margin:-6px 0 10px">Your data will be saved privately in your own drive, in a folder only this app can use.</p>' +
      '<div class="stack" style="margin-top:0" id="sheetProviders">' + providerButtons('sheet') + '</div>';

    html += '<div class="section-title" style="margin-top:20px">Your data</div>' +
      '<p class="small" style="margin:-6px 0 10px">' + MC.sessions.count() + ' sittings on this device · last export: ' +
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

    $('sheetProviders').addEventListener('click', onProvider);
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
    // Fallback: download the file and open an email to support
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
  renderBadge();
})();
