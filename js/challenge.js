/* Meditation Copilot — 42-day challenge for New Seekers
 *
 * Rules (agreed 10 Nov 2026):
 *  - Day 1 starts when the seeker taps "Start my 42-day challenge".
 *  - A day's minutes = all sittings that day added together (actual minutes, not quality-adjusted).
 *  - Daily target: days 1–21 = 15 min; days 22–42 rise smoothly from 15 to 30 min.
 *    The target always follows the CURRENT count (if the count drops back, so does the target).
 *  - A day is "missed" when its target was not met; it is judged once the day is over (midnight).
 *  - Phase 1 (count < 21): a missed day sets the count back by one (not below 0).
 *  - Phase 2 (count ≥ 21): a missed day sends the count back to 21; more than 7 missed days
 *    in phase 2 (in total) resets the count to 0 (start again from day 1).
 *  - Count 21 = Phase 1 complete; count 42 = challenge complete.
 *  - Runs are kept in profile.challenges = [{ startedOn: 'YYYY-MM-DD', endedOn?: 'YYYY-MM-DD' }]
 *    so history and rewards survive restarts and switching to Initiated.
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var TOTAL = 42, P1 = 21, MAX_P2_MISSES = 7;

  function targetFor(n) {                 // n = the day number being attempted (1..42)
    if (n <= P1) return 15;
    return Math.round(15 + (Math.min(n, TOTAL) - P1) * 15 / (TOTAL - P1));
  }
  function runs() { return Array.isArray(MC.profile.challenges) ? MC.profile.challenges : []; }
  function activeRun() { var r = runs(); var last = r[r.length - 1]; return last && !last.endedOn ? last : null; }
  MC.isSeeker = function () { return MC.profile.userType === 'seeker'; };
  MC.isInitiated = function () { return MC.profile.userType === 'initiated'; };

  /* Replay one run day by day. Returns the current state and per-day history. */
  function compute(run, byDay) {
    byDay = byDay || MC.byDay();
    var start = MC.parseDate(run.startedOn), t = MC.today();
    var end = run.endedOn ? MC.parseDate(run.endedOn) : t;          // days before `end` are complete
    var count = 0, p2Misses = 0, history = [], phase1On = null, completedOn = null, phase1Times = 0;
    for (var d = new Date(start); d < end && !completedOn; d = MC.addDays(d, 1)) {
      var key = MC.toISO(d), min = byDay[key] ? byDay[key].minutes : 0;
      var target = targetFor(count + 1), met = min >= target, before = count;
      if (met) {
        count++;
        if (count === P1) { phase1Times++; if (!phase1On) phase1On = key; }
        if (count === TOTAL) completedOn = key;
      } else if (count < P1) {
        count = Math.max(0, count - 1);
      } else {
        p2Misses++;
        if (p2Misses > MAX_P2_MISSES) { count = 0; p2Misses = 0; }
        else count = P1;
      }
      history.push({ date: key, minutes: min, target: target, met: met, before: before, after: count });
    }
    var todayKey = MC.toISO(t), todayMin = byDay[todayKey] ? byDay[todayKey].minutes : 0;
    var done = !!completedOn;
    var todayTarget = done ? 30 : targetFor(count + 1);
    return {
      run: run, count: count, phase: done ? 3 : count < P1 ? 1 : 2, p2Misses: p2Misses,
      history: history, phase1On: phase1On, completedOn: completedOn, done: done,
      todayKey: todayKey, todayMinutes: todayMin, todayTarget: todayTarget,
      metToday: !done && !run.endedOn && todayMin >= todayTarget,
      ended: !!run.endedOn
    };
  }

  MC.challenge = {
    TOTAL: TOTAL, P1: P1, MAX_P2_MISSES: MAX_P2_MISSES,
    targetFor: targetFor, runs: runs, active: activeRun, compute: compute,
    current: function () { var r = activeRun() || runs()[runs().length - 1]; return r ? compute(r) : null; },
    // All runs computed (for rewards)
    all: function () { var bd = MC.byDay(); return runs().map(function (r) { return compute(r, bd); }); },
    start: function () {
      var list = runs().slice(), today = MC.toISO(MC.today());
      var a = list[list.length - 1];
      if (a && !a.endedOn) a.endedOn = today;
      list.push({ startedOn: today });
      MC.profile.challenges = list; MC.saveProfile(); MC.emit('profile');
      MC.track('challenge_start');
    },
    // Daily target for a given date inside a challenge run, or null
    targetOn: function (key) {
      var all = MC.challenge.all();
      for (var i = all.length - 1; i >= 0; i--) {
        var h = all[i].history;
        for (var j = 0; j < h.length; j++) if (h[j].date === key) return h[j].target;
        if (key === all[i].todayKey && !all[i].ended) return all[i].todayTarget;
      }
      return null;
    }
  };

  // Seekers with a challenge: the Today target follows the challenge
  var baseTarget = MC.dailyTarget;
  MC.dailyTarget = function () {
    if (MC.isSeeker()) {
      var c = MC.challenge.current();
      if (c && !c.ended) return c.todayTarget;
      return Number(MC.settings.dailyTarget) > 0 ? Number(MC.settings.dailyTarget) : 15;
    }
    return baseTarget();
  };
  MC.targetLocked = function () { var c = MC.isSeeker() && MC.challenge.current(); return !!(c && !c.ended); };

  /* ---------------- UI: the seeker's Roadmap screen ---------------- */
  function dots(c) {
    function group(from, to, label) {
      var g = '<div class="ch-group"><span class="ch-glabel">' + label + '</span><div class="ch-grid">';
      for (var i = from; i <= to; i++) {
        g += '<span class="ch-dot' + (i <= c.count ? ' done' : '') + (i === c.count + 1 && !c.done ? ' now' : '') + (i > P1 ? ' p2' : '') + '"></span>';
      }
      return g + '</div></div>';
    }
    return '<div class="ch-dots" role="img" aria-label="Day ' + c.count + ' of 42 complete">' +
      group(1, P1, 'Phase 1 · 15 min') + group(P1 + 1, TOTAL, 'Phase 2 · 15→30') + '</div>';
  }
  function lastDays(c) {
    var h = c.history.slice(-7);
    if (!h.length) return '';
    return '<div class="section-title">Recent days</div><div class="ch-days" style="margin-bottom:12px">' + h.map(function (x) {
      var d = MC.parseDate(x.date);
      return '<div class="ch-day ' + (x.met ? 'met' : 'miss') + '"><b>' + d.toLocaleDateString(undefined, { weekday: 'short' }) + '</b>' +
        '<span>' + MC.fmtMin(x.minutes) + '/' + x.target + '</span><i>' + (x.met ? '✓' : '✕') + '</i></div>';
    }).join('') + '</div>';
  }
  var RULES_HTML =
    '<details class="ch-rules"><summary>How the challenge works</summary><ul class="small">' +
    '<li><b>Phase 1 (days 1–21):</b> meditate at least 15 minutes a day.</li>' +
    '<li><b>Phase 2 (days 22–42):</b> your daily time grows gently from 15 to 30 minutes.</li>' +
    '<li>All your sittings in a day are added together.</li>' +
    '<li>Phase 1: a missed day moves you back one day.</li>' +
    '<li>Phase 2: a missed day takes you back to day 21. More than 7 missed days in phase 2 starts the challenge again from day 1.</li>' +
    '<li>A day counts once it is over (at midnight), so you can still sit later today.</li></ul></details>';

  function render() {
    var el = $('s-challenge'), c = MC.challenge.current(), html = '';
    if (!c || c.ended && !c.done) {
      html = '<div class="card hero"><div class="lotus" aria-hidden="true">🌱</div><h1>Your 42-Day Challenge</h1>' +
        '<p class="tagline">Small moments. Daily practice. Inner transformation.</p>' +
        '<p class="lead">Build a daily meditation habit in two gentle phases:</p>' +
        '<div class="ch-phases"><div><b>Phase 1</b><span>Days 1–21</span><em>15 min a day</em></div><div><b>Phase 2</b><span>Days 22–42</span><em>15 → 30 min</em></div></div>' +
        '<button class="btn btn-gold btn-block btn-xl" id="chStart" style="margin-top:18px">Start my 42-day challenge</button>' +
        '<p class="small muted" style="margin:14px 0 0">New to meditation? <a href="#learn?a=learn-to-meditate">Learn how to meditate</a> first.</p></div>' +
        '<div class="card">' + RULES_HTML + '</div>';
    } else if (c.done) {
      html = '<div class="card hero"><div class="lotus" aria-hidden="true">🏆</div><h1>Challenge complete!</h1>' +
        '<p class="lead">You completed all 42 days on ' + MC.esc(MC.fmtDate(MC.parseDate(c.completedOn))) + '. Your daily practice is now 30 minutes. Beautiful work. 🙏</p>' +
        dots(c) +
        '<div class="stack"><a class="btn btn-primary" href="#timer">Keep going: start today’s sitting</a>' +
        '<a class="btn btn-soft" href="#learn">Explore Learn</a>' +
        '<button class="btn btn-ghost" id="chRestart">Start a new 42-day challenge</button></div></div>';
    } else {
      var pct = Math.min(1, c.todayMinutes / c.todayTarget);
      var dayNum = c.count + 1;
      html = '<div class="card center">' +
        '<div class="q-num">' + (c.phase === 1 ? 'Phase 1 · Build the habit' : 'Phase 2 · Deepen the practice') + '</div>' +
        '<h1 class="ch-day-title">Day ' + dayNum + ' <span>of 42</span></h1>' + dots(c) +
        '<div class="ch-today ' + (c.metToday ? 'met' : '') + '">' +
        (c.metToday
          ? '<b>✓ Today’s ' + c.todayTarget + ' minutes are complete.</b><span>Day ' + dayNum + ' will count at midnight.</span>'
          : '<b>Today: ' + MC.fmtMin(c.todayMinutes) + ' of ' + c.todayTarget + ' min</b><span>' + MC.fmtMin(Math.max(0, c.todayTarget - c.todayMinutes)) + ' more minutes to complete day ' + dayNum + '.</span>') +
        '<div class="meter" style="margin-top:8px"><div style="width:' + (pct * 100).toFixed(0) + '%"></div></div></div>' +
        (c.metToday ? '' : '<a class="btn btn-primary btn-block" href="#timer" style="margin-top:14px">🪷 Start Meditation</a>') +
        (c.phase === 2 ? '<p class="small muted" style="margin:12px 0 0">Missed days in phase 2: <b>' + c.p2Misses + ' of 7</b> allowed</p>' : '') +
        '</div>' +
        '<div class="card">' + lastDays(c) + RULES_HTML +
        '<div class="links" style="margin-top:10px"><button class="link" id="chRestart">Restart challenge</button></div></div>';
    }
    el.innerHTML = html;
    if ($('chStart')) $('chStart').addEventListener('click', function () { MC.challenge.start(); MC.toast('Day 1 begins today. You’ve got this! 🌱'); render(); });
    if ($('chRestart')) $('chRestart').addEventListener('click', function () {
      if (!window.confirm('Start a new 42-day challenge from today? Your points and history are kept.')) return;
      MC.challenge.start(); render();
    });
  }

  // Short summary for the Today screen
  MC.challengeHomeCard = function () {
    var c = MC.challenge.current();
    if (!c || (c.ended && !c.done)) {
      return '<div class="section-title">Your 42-day challenge</div>' +
        '<p class="small muted" style="margin:-4px 0 12px">Two gentle phases: 15 minutes a day for 21 days, then growing to 30 minutes.</p>' +
        '<a class="btn btn-gold btn-block" href="#roadmap">Start my challenge 🌱</a>';
    }
    if (c.done) return '<div class="section-title">42-day challenge <a class="link" href="#roadmap" style="padding:0">View</a></div><p class="small" style="margin:0">🏆 Completed on ' + MC.esc(MC.fmtDate(MC.parseDate(c.completedOn))) + '. Keep your 30-minute practice going.</p>';
    return '<div class="section-title">42-day challenge <a class="link" href="#roadmap" style="padding:0">View</a></div>' +
      '<div class="meter"><div style="width:' + (c.count / TOTAL * 100).toFixed(1) + '%"></div></div>' +
      '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><b>Day ' + (c.count + 1) + ' of 42</b><span class="muted">Phase ' + c.phase + ' · ' + c.todayTarget + ' min today</span></div>' +
      (c.metToday ? '<p class="small" style="margin:8px 0 0;color:var(--ok)">✓ Today’s target complete.</p>' : '');
  };

  MC.challengeUI = { render: render };
  MC.on('data', function () { if (MC.current === 'roadmap' && MC.isSeeker()) render(); });
})();
