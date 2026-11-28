/* Meditation Copilot — boot */
(function () {
  'use strict';
  var MC = window.MC;

  MC.initTheme();
  MC.upgradeProfile();          // v0.23: target year instead of date of birth + age; initiates already planning are on the journey

  window.addEventListener('hashchange', function () {
    MC.route();
    if (MC.current !== 'timer') document.body.classList.remove('focus');   // a running sitting keeps going
  });

  // v0.24: everyone lands on Today (new users find "Getting started" there). A sitting in progress always reopens the Timer.
  if (MC.timerActive()) location.replace('#timer');
  else if (!location.hash) location.replace('#home');
  MC.route();

  // v0.23: sign-in is required (guests who already used the app keep their data: it's added at sign-in).
  // Skip the welcome screen when returning from Microsoft sign-in (?code=…).
  var returningFromSignIn = /[?&](code|error)=/.test(location.search);
  if (!MC.account.signedIn() && !returningFromSignIn) MC.account.showWelcome();
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
