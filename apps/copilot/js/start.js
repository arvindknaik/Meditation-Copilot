/* Meditation Copilot — v0.24: "Getting started" on Today and the 5-card tour.
 * Nobody is asked anything at sign-in: people land on Today and pick from 7 first steps. Each gets a ✓ once done;
 * the card can be hidden (Account → Getting started brings it back). Shown to new users only (fewer than 5 sittings). */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var KEY = 'meditation-copilot:getting-started';
  function st() { return MC.store.get(KEY, null) || { done: {}, hidden: false }; }
  function save(s) { MC.store.set(KEY, s); }
  function mark(id) { var s = st(); if (!s.done[id]) { s.done[id] = Date.now(); save(s); } }
  MC.gettingStarted = { mark: mark, show: function () { var s = st(); s.hidden = false; s.shown = true; save(s); MC.go('home'); } };

  function scrollTo(id) { var el = $(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); } }
  var STEPS = [
    { id: 'quote', icon: '💭', label: 'Read the quote of the day', go: function () { scrollTo('thought'); } },
    { id: 'who', icon: '👥', label: 'See who’s on Copilot, and your buddies', go: function () { scrollTo('presence'); } },
    { id: 'timer', icon: '🪷', label: 'Start the meditation timer', done: function () { return MC.sessions.count() > 0; }, go: function () { MC.go('timer'); } },
    { id: 'sit', icon: '⏰', label: 'Set your daily sitting time', done: function () { return MC.hasSittingTimes && MC.hasSittingTimes(); }, go: function () { MC.addSittingTime(); } },
    { id: 'tour', icon: '🧭', label: 'Take a quick tour of the app', go: function () { MC.tour(); } },
    { id: 'events', icon: '📅', label: 'See upcoming events: RSVP or check in', go: function () { scrollTo('homeEvents'); } },
    { id: 'challenge', icon: '🏁', label: 'Start with a meditation challenge', done: function () { var c = MC.challenge && MC.challenge.current(); return !!(c && !c.ended) || !!(MC.goals && MC.goals.all && MC.goals.all().length); }, go: function () { MC.go('roadmap'); } }
  ];
  function isDone(x, s) { return !!s.done[x.id] || !!(x.done && x.done()); }

  MC.renderGettingStarted = function () {
    var el = $('gettingStarted'); if (!el) return;
    var s = st();
    var newUser = MC.sessions.count() < 5 || s.shown;
    var n = STEPS.filter(function (x) { return isDone(x, s); }).length;
    if (s.hidden || !newUser || n === STEPS.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="card gs-card"><div class="section-title">Getting started <span class="small muted">' + n + ' of ' + STEPS.length + '</span></div>' +
      '<div class="gs-list">' + STEPS.map(function (x) {
        var d = isDone(x, s);
        return '<button type="button" class="gs-row' + (d ? ' done' : '') + '" data-gs="' + x.id + '"><span class="gs-ic" aria-hidden="true">' + (d ? '✓' : x.icon) + '</span><span>' + MC.esc(x.label) + '</span><span class="muted">›</span></button>';
      }).join('') + '</div><p class="small" style="margin:10px 0 0;text-align:right"><button class="link small" id="gsHide" type="button" style="padding:0">Hide this</button></p></div>';
    el.querySelectorAll('[data-gs]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = STEPS.filter(function (y) { return y.id === b.dataset.gs; })[0];
        if (x.id !== 'tour' && !x.done) mark(x.id);
        x.go();
        if (MC.current === 'home') setTimeout(MC.renderGettingStarted, 300);
      });
    });
    $('gsHide').addEventListener('click', function () { var t = st(); t.hidden = true; t.shown = false; save(t); MC.renderGettingStarted(); MC.toast('Hidden. Bring it back from Account & settings.'); });
  };

  /* ---------- The tour: 5 cards ---------- */
  var CARDS = [
    ['☀️', 'Today', 'Your home screen: the quote of the day, today’s minutes, your next sitting with a button to start the timer, and the center’s upcoming events.'],
    ['🪷', 'Timer', 'Choose your minutes and begin. Afterwards, rate how it went and add a reflection if you like. Your sittings are saved privately in your own Google Drive or OneDrive.'],
    ['📅', 'Calendar', 'See your practice day by day. Set your daily sitting times (with reminders while the app is open, or in your phone’s calendar) and find your favourite center events.'],
    ['🏁', 'Roadmap', 'Gentle challenges that help meditation become a habit. Initiated? Say so once on the Roadmap, and the 10,000-hour journey opens for you.'],
    ['📚', 'Learn', 'Articles, talks, books, quizzes and quotes, all in one search. ★ Save what you want to come back to.']
  ];
  var dlg = null, i = 0;
  MC.tour = function () {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'sheet'; dlg.id = 'tourDlg'; document.body.appendChild(dlg); }
    i = 0; paint();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    MC.track && MC.track('tour_open');
  };
  function paint() {
    var c = CARDS[i], last = i === CARDS.length - 1;
    dlg.innerHTML = '<div class="sheet-body tour"><div class="tour-ic" aria-hidden="true">' + c[0] + '</div><h2 class="sheet-title" style="text-align:center">' + MC.esc(c[1]) + '</h2>' +
      '<p style="text-align:center">' + MC.esc(c[2]) + '</p><div class="tour-dots" aria-label="Card ' + (i + 1) + ' of ' + CARDS.length + '">' +
      CARDS.map(function (x, k) { return '<span class="' + (k === i ? 'on' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="actions"><button class="btn btn-ghost" id="tourBack" type="button">' + (i ? 'Back' : 'Close') + '</button>' +
      '<button class="btn btn-primary" id="tourNext" type="button">' + (last ? 'Done 🙏' : 'Next') + '</button></div></div>';
    $('tourBack').onclick = function () { if (i) { i--; paint(); } else dlg.close(); };
    $('tourNext').onclick = function () {
      if (last) { mark('tour'); dlg.close(); if (MC.current === 'home') MC.renderGettingStarted(); return; }
      i++; paint();
    };
  }
})();
