/* Meditation Copilot — diagnostics & anonymous usage
 *  - A private diagnostic log on this device (later also in the user's own drive):
 *    app events and errors only. Never reflections, names, emails or birth dates.
 *  - "Send diagnostics to support" shares the log only when the user chooses to.
 *  - MC.track(): anonymous, cookie-free usage counts when an endpoint is configured
 *    and the user has not opted out.
 */
(function () {
  'use strict';
  var MC = window.MC, CFG = window.MC_CONFIG || {};
  var MAX = 300, MAX_AGE = 90 * 86400000;
  var log = MC.store.get(MC.KEYS.diag, []);
  if (!Array.isArray(log)) log = [];

  function save() {
    var cutoff = Date.now() - MAX_AGE;
    log = log.filter(function (e) { return e.t > cutoff; }).slice(-MAX);
    MC.store.set(MC.KEYS.diag, log);
  }
  // Only short, non-personal values are kept
  function clean(d) {
    if (!d) return undefined;
    var o = {};
    Object.keys(d).forEach(function (k) {
      var v = d[k];
      if (typeof v === 'number' || typeof v === 'boolean') o[k] = v;
      else if (typeof v === 'string') o[k] = v.slice(0, 160);
    });
    return o;
  }
  MC.diag = {
    add: function (ev, d) { log.push({ t: Date.now(), ev: ev, d: clean(d) }); save(); },
    all: function () { return log.slice(); },
    clear: function () { log = []; save(); },
    report: function () {
      var acct = MC.account ? MC.account.mode() : 'unknown';
      var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
      var lines = [
        'Meditation Copilot diagnostic report',
        'Generated: ' + new Date().toISOString(),
        'App version: ' + MC.VERSION + ' · data schema ' + MC.SCHEMA,
        'Account: ' + acct + ' · installed: ' + (standalone ? 'yes' : 'no'),
        'Browser: ' + navigator.userAgent,
        'Screen: ' + screen.width + 'x' + screen.height + ' · online: ' + navigator.onLine,
        'Sittings stored: ' + MC.sessions.count() + ' · roadmap set: ' + (MC.hasProfile() ? 'yes' : 'no'),
        '(No reflections, names, emails or birth dates are included.)',
        '',
        'Recent events (newest last):'
      ];
      log.slice(-120).forEach(function (e) {
        lines.push(new Date(e.t).toISOString().replace('T', ' ').slice(0, 19) + '  ' + e.ev + (e.d ? '  ' + JSON.stringify(e.d) : ''));
      });
      return lines.join('\n');
    }
  };

  /* Anonymous usage counts */
  var gcLoaded = false;
  MC.track = function (ev, d) {
    MC.diag.add(ev, d);
    if (!CFG.analyticsEndpoint || MC.settings.analyticsOptOut) return;
    try {
      if (!gcLoaded) {
        gcLoaded = true;
        window.goatcounter = { no_onload: true, endpoint: CFG.analyticsEndpoint };
        var sc = document.createElement('script');
        sc.async = true; sc.src = 'https://gc.zgo.at/count.js';
        sc.onload = function () { send(ev); };
        document.head.appendChild(sc);
        return;
      }
      send(ev);
    } catch (e) {}
  };
  function send(ev) {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'event/' + ev, title: ev, event: true });
  }

  /* Capture errors (message and location only) */
  window.addEventListener('error', function (e) {
    MC.diag.add('error', { msg: String(e.message || 'error'), src: String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0) });
  });
  window.addEventListener('unhandledrejection', function (e) {
    MC.diag.add('error', { msg: 'promise: ' + String((e.reason && e.reason.message) || e.reason || '') });
  });

  /* Usage events from the rest of the app */
})();
