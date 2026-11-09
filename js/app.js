/* Meditation Copilot — boot */
(function () {
  'use strict';
  var MC = window.MC;

  MC.initTheme();

  window.addEventListener('hashchange', function () {
    MC.route();
    if (MC.current !== 'timer') document.body.classList.remove('focus');   // a running sitting keeps going
  });

  // First visit with no roadmap and no sittings: open the Roadmap welcome. Returning users land on Today.
  // A sitting in progress always reopens the Timer.
  if (MC.timerActive()) location.replace('#timer');
  else if (!location.hash) {
    var isNew = !MC.hasProfile() && MC.sessions.count() === 0 && !MC.store.get(MC.KEYS.settings, null);
    location.replace(isNew ? '#roadmap' : '#home');
  }
  MC.route();

  // Re-render when the day changes or the app comes back to the foreground
  var lastDay = MC.toISO(MC.today());
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var d = MC.toISO(MC.today());
    if (d !== lastDay) { lastDay = d; MC.route(); }
  });

  // Service worker (only over http/https — opening the file directly still works)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
