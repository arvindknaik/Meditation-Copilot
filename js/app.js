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

  // First launch: choose how to use the app (sign in or guest).
  // Skip the welcome screen when returning from Microsoft sign-in (?code=…).
  var returningFromSignIn = /[?&](code|error)=/.test(location.search);
  if (MC.account.mode() === 'none' && !returningFromSignIn) MC.account.showWelcome();
  // After any Microsoft redirect and the first sync (which may bring the profile from the cloud),
  // ask "Are you an initiate?" if it hasn't been answered yet.
  MC.sync.init().then(function () { MC.maybeAskUserType(); });
  MC.track('app_open', {
    installed: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
    mode: MC.account.mode()
  });

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
