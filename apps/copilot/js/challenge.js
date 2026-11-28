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
  MC.isSeeker = function () { return MC.profile.userType !== 'initiated'; };   // v0.24: everyone is a seeker until they say they're initiated
  MC.isInitiated = function () { return MC.profile.userType === 'initiated'; };

  /* ---------- v0.18: 21-day meditation path (SOSMN-SRM.md section 10) ----------
   * A run with run.plan is a fixed-length challenge from the Challenge Program:
   *  - day i's target = run.base minutes, or with run.rampTo it grows evenly from base to rampTo by the last day;
   *  - all sittings in a day add up; a day is judged at midnight;
   *  - misses allowed: 1 for every 10 days; one more ends the challenge (start again any time);
   *  - it is complete when the last day is over and the misses stayed within the allowance.
   * Runs without run.plan are the original 42-day challenge and keep their original rules. */
  function targetIn(run, i) {
    var days = run.days || 21, base = run.base || 15;
    if (!run.rampTo || run.rampTo <= base || days < 2) return base;
    return Math.round(base + (run.rampTo - base) * (Math.min(i, days) - 1) / (days - 1));
  }
  function computePlan(run, byDay) {
    byDay = byDay || MC.byDay();
    var days = run.days || 21, allow = Math.floor(days / 10);
    var start = MC.parseDate(run.startedOn), last = MC.addDays(start, days - 1), t = MC.today();
    var stop = run.endedOn ? MC.parseDate(run.endedOn) : t;
    var met = 0, miss = 0, history = [], failedOn = null, i = 0;
    for (var d = new Date(start); d < stop && d <= last && !failedOn; d = MC.addDays(d, 1)) {
      i++;
      var key = MC.toISO(d), min = byDay[key] ? byDay[key].minutes : 0, target = targetIn(run, i), ok = min >= target;
      if (ok) met++; else miss++;
      history.push({ date: key, minutes: min, target: target, met: ok, day: i });
      if (miss > allow) failedOn = key;
    }
    var todayKey = MC.toISO(t), todayMin = byDay[todayKey] ? byDay[todayKey].minutes : 0;
    var done = !failedOn && stop > last;
    var dayNum = Math.max(1, Math.min(days, MC.daysBetween(start, t) + 1));
    var todayTarget = done ? (run.rampTo || run.base || 15) : targetIn(run, dayNum);
    var ended = !!run.endedOn || !!failedOn;
    return {
      run: run, plan: true, total: days, count: met, misses: miss, allow: allow, history: history,
      done: done, completedOn: done ? MC.toISO(last) : null, failed: !!failedOn, failedOn: failedOn, endOn: MC.toISO(last),
      dayNum: dayNum, nearEnd: !ended && !done && dayNum >= days - 2, phase: 1, phase1On: null,
      todayKey: todayKey, todayMinutes: todayMin, todayTarget: todayTarget,
      metToday: !done && !ended && todayMin >= todayTarget, ended: ended && !done
    };
  }

  /* Replay one run day by day. Returns the current state and per-day history. */
  function compute(run, byDay) {
    if (run && run.plan) return computePlan(run, byDay);
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
    // Start a meditation challenge. def = a Challenge Program entry ({ id, title, days, minutes, rampTo, points }) and the
    // chosen minutes; with no def, the 21-Day Foundation at 15 minutes.
    start: function (def, minutes) {
      def = def || defaults()[0];
      var list = runs().slice(), today = MC.toISO(MC.today());
      var a = list[list.length - 1];
      if (a && !a.endedOn) a.endedOn = today;
      var prev = a && a.plan ? computePlan(a) : null;
      var base = Math.round(Number(minutes) || 0) || (def.rampTo && prev && prev.done ? (prev.run.rampTo || prev.run.base) : 0) || def.minutes || 15;
      list.push({ startedOn: today, plan: 1, cid: def.id || '', title: def.title || 'Meditation challenge', days: def.days || 21, base: base,
        rampTo: def.rampTo && def.rampTo > base ? def.rampTo : 0, points: def.points || 0 });
      MC.profile.challenges = list; MC.saveProfile(); MC.emit('profile');
      MC.track('challenge_start', { cid: def.id || '', days: def.days || 21, base: base });
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
    var cur = MC.challenge.current();
    if (cur && cur.plan && !cur.ended && !cur.done) return cur.todayTarget;
    if (MC.isSeeker()) {
      var c = MC.challenge.current();
      if (c && !c.ended) return c.todayTarget;
      return Number(MC.settings.dailyTarget) > 0 ? Number(MC.settings.dailyTarget) : 15;
    }
    return baseTarget();
  };
  MC.targetLocked = function () { var c = MC.challenge.current(); return !!(c && !c.ended && !c.done && (c.plan || MC.isSeeker())); };

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

  function renderClassic() {
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
    if (c && c.plan) {
      if (c.done || c.ended) return '<div class="section-title">Your challenge</div><p class="small muted" style="margin:-4px 0 12px">' + (c.done ? '🏆 ' + MC.esc(c.run.title) + ' complete. Choose what’s next.' : 'Start a new challenge whenever you’re ready.') + '</p><a class="btn btn-gold btn-block" href="#roadmap">' + (c.done ? 'Choose my next challenge 🌱' : 'Start a challenge 🌱') + '</a>';
      return '<div class="section-title">' + MC.esc(c.run.title) + ' <a class="link" href="#roadmap" style="padding:0">View</a></div>' +
        '<div class="meter"><div style="width:' + (c.count / c.total * 100).toFixed(1) + '%"></div></div>' +
        '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><b>Day ' + c.dayNum + ' of ' + c.total + '</b><span class="muted">' + c.todayTarget + ' min today · ' + c.misses + '/' + c.allow + ' misses</span></div>' +
        (c.metToday ? '<p class="small" style="margin:8px 0 0;color:var(--ok)">✓ Today’s target complete.</p>' : '');
    }
    if (!c || (c.ended && !c.done)) {
      return '<div class="section-title">Your daily practice</div>' +
        '<p class="small muted" style="margin:-4px 0 12px">Start with the 21-Day Foundation: the same short sitting every day for 21 days.</p>' +
        '<a class="btn btn-gold btn-block" href="#roadmap">Start a challenge 🌱</a>';
    }
    if (c.done) return '<div class="section-title">42-day challenge <a class="link" href="#roadmap" style="padding:0">View</a></div><p class="small" style="margin:0">🏆 Completed on ' + MC.esc(MC.fmtDate(MC.parseDate(c.completedOn))) + '. Keep your 30-minute practice going.</p>';
    return '<div class="section-title">42-day challenge <a class="link" href="#roadmap" style="padding:0">View</a></div>' +
      '<div class="meter"><div style="width:' + (c.count / TOTAL * 100).toFixed(1) + '%"></div></div>' +
      '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><b>Day ' + (c.count + 1) + ' of 42</b><span class="muted">Phase ' + c.phase + ' · ' + c.todayTarget + ' min today</span></div>' +
      (c.metToday ? '<p class="small" style="margin:8px 0 0;color:var(--ok)">✓ Today’s target complete.</p>' : '');
  };

  /* ================= v0.18 Challenge Program: catalog, chooser, progress ================= */
  var CC_KEY = 'meditation-copilot:center-challenges', FIRST_KEY = 'meditation-copilot:first-challenge';
  // Used when the center's list can't be loaded (offline, guest before first load). Same as the server's starter program.
  function defaults() {
    return [
      { id: 'c21-foundation', title: '21-Day Foundation', kind: 'daily_sitting', days: 21, minutes: 15, minutesChoices: [10, 15, 20], rampTo: 0, points: 100, signup: true, nextOf: null, audience: 'all', active: true,
        description: 'Sit every day for 21 days at the same length: 10, 15 or 20 minutes. All your sittings in a day add up.' },
      { id: 'c21-advance', title: '21-Day Advance', kind: 'daily_sitting', days: 21, minutes: 15, minutesChoices: [], rampTo: 30, points: 150, signup: false, nextOf: 'c21-foundation', audience: 'all', active: true,
        description: 'Grow your daily sitting by about a minute a day, reaching 30 minutes by day 21. More is welcome; reaching 30 is celebrated.' },
      { id: 'c-attend6', title: 'Attend 6 sessions in 3 months', kind: 'checkins', days: 90, target: 6, points: 150, signup: true, nextOf: null, audience: 'all', active: true,
        description: 'Join 6 center sessions (workshops, satsangs or other programs) in the next 3 months. Check in at each one.' }
    ];
  }
  function catalog() {
    var list = ((MC.store.get(CC_KEY, null) || {}).list || []).filter(function (x) { return x.kind === 'daily_sitting' || x.kind === 'checkins'; });
    if (!list.length) list = defaults();
    var seeker = MC.isSeeker(), init = MC.isInitiated();
    return initFirst(list.filter(function (x) { return x.active !== false && (x.audience === 'all' || (x.audience === 'seeker' && seeker) || (x.audience === 'initiate' && init)); }));
  }
  // v0.24: initiates-only challenges are listed first (stable order otherwise)
  function initFirst(l) { return l.filter(function (x) { return x.audience === 'initiate'; }).concat(l.filter(function (x) { return x.audience !== 'initiate'; })); }
  MC.challengeInitFirst = initFirst;
  function loadCatalog() {
    if (!(MC.events && MC.events.enabled && MC.events.enabled())) return Promise.resolve(catalog());
    return MC.events.api('GET', '/api/challenges').then(function (j) { MC.store.set(CC_KEY, { list: j.challenges || [], at: Date.now() }); return catalog(); })
      .catch(function () { return catalog(); });
  }
  function signedIn() { return !!(MC.events && MC.events.signedInMode && MC.events.signedInMode()); }
  function activePlan() { var c = MC.challenge.current(); return c && !c.ended && !c.done ? c : null; }
  function choicesOf(x) { return x.minutesChoices && x.minutesChoices.length ? x.minutesChoices : null; }
  function metaOf(x, base) {
    if (x.kind === 'checkins') return 'Attend ' + x.target + ' center sessions in ' + Math.round(x.days / 30) + ' months · ' + x.points + ' points';
    if (x.rampTo) return x.days + ' days · from ' + (base || x.minutes) + ' up to ' + x.rampTo + ' min a day · ' + x.points + ' points';
    return x.days + ' days · ' + (choicesOf(x) && !base ? choicesOf(x).join(', ') + ' min a day (you choose)' : (base || x.minutes) + ' min a day') + ' · ' + x.points + ' points';
  }
  // One option card; opts.base = minutes to use (repeat / advance), opts.label = button text
  function optionHTML(x, opts) {
    opts = opts || {};
    var ch = !opts.base && x.kind === 'daily_sitting' ? choicesOf(x) : null, def = ch ? (ch.indexOf(x.minutes) >= 0 ? x.minutes : ch[Math.floor(ch.length / 2)]) : 0;
    var needSign = x.kind === 'checkins' && !signedIn();
    return '<div class="cp-opt" data-opt="' + MC.esc(x.id) + '"' + (opts.base ? ' data-base="' + opts.base + '"' : '') + '>' +
      '<div class="cp-opt-head"><b>' + (x.kind === 'checkins' ? '🗓 ' : x.rampTo ? '🌿 ' : '🌱 ') + MC.esc(opts.title || x.title) + '</b>' + (x.audience === 'initiate' ? '<span class="badge">Initiates</span>' : '') + (opts.tag ? '<span class="badge">' + MC.esc(opts.tag) + '</span>' : '') + '</div>' +
      '<p class="small" style="margin:4px 0 6px">' + MC.esc(opts.desc || x.description || '') + '</p>' +
      '<p class="small muted" style="margin:0 0 10px">' + MC.esc(metaOf(x, opts.base)) + '</p>' +
      (ch ? '<div class="chips cp-min" role="radiogroup" aria-label="Minutes a day">' + ch.map(function (m) { return '<button type="button" class="chip' + (m === def ? ' on' : '') + '" data-min="' + m + '">' + m + ' min</button>'; }).join('') + '</div>' : '') +
      (needSign ? '<p class="small muted" style="margin:0 0 8px">Sign in with Google or Microsoft to choose this one: it counts your check-ins at the center.</p>' : '') +
      '<button type="button" class="btn ' + (opts.primary ? 'btn-gold' : 'btn-soft') + ' btn-block" data-go' + (needSign ? ' disabled' : '') + '>' + MC.esc(opts.label || 'Start today') + '</button></div>';
  }
  function bindOptions(root, list, after) {
    root.querySelectorAll('.cp-opt').forEach(function (box) {
      var x = list.filter(function (y) { return y.id === box.dataset.opt; })[0]; if (!x) return;
      box.querySelectorAll('[data-min]').forEach(function (b) { b.addEventListener('click', function () { box.querySelectorAll('[data-min]').forEach(function (o) { o.classList.toggle('on', o === b); }); }); });
      var go = box.querySelector('[data-go]');
      go.addEventListener('click', function () {
        if (x.kind === 'checkins') {
          if (!MC.goals || !MC.goals.startCenter) return;
          MC.goals.startCenter(x);
          MC.toast('🗓 Challenge started. See you at the center!');
        } else {
          var on = box.querySelector('[data-min].on'), base = Number(box.dataset.base) || (on ? Number(on.dataset.min) : 0);
          var cur = activePlan();
          if (cur && !window.confirm('You are in “' + (cur.run.title || '42-Day Challenge') + '”. Stop it and start “' + x.title + '” today?')) return;
          MC.challenge.start(x, base);
          MC.toast('Day 1 begins today. You’ve got this! 🌱');
        }
        MC.store.set(FIRST_KEY, { at: Date.now(), id: x.id });
        MC.emit('data');
        if (after) after(x);
      });
    });
  }
  function dotsPlan(c) {
    var g = '<div class="ch-dots" role="img" aria-label="' + c.count + ' of ' + c.total + ' days complete"><div class="ch-group"><div class="ch-grid">';
    var byDate = {}; c.history.forEach(function (h) { byDate[h.day] = h; });
    for (var i = 1; i <= c.total; i++) {
      var h = byDate[i];
      g += '<span class="ch-dot' + (h ? (h.met ? ' done' : ' miss') : '') + (i === c.dayNum && !h && !c.done ? ' now' : '') + '" title="Day ' + i + '"></span>';
    }
    return g + '</div></div></div>';
  }
  // General explainer, shown on the Roadmap before and between challenges
  var HOW_HTML =
    '<details class="ch-rules"><summary>How challenges work</summary><ul class="small">' +
    '<li>Every challenge has a finish line: a number of days or sessions, and an end date.</li>' +
    '<li><b>21-Day Foundation:</b> sit the same 10, 15 or 20 minutes every day for 21 days. It builds the habit.</li>' +
    '<li><b>21-Day Advance:</b> after the Foundation, your daily time grows about a minute a day, reaching 30 minutes by day 21. Or simply do another 21 days at the same time.</li>' +
    '<li>All your sittings in a day are added together. A day counts once it is over (at midnight), so you can still sit later today.</li>' +
    '<li>Life happens: you may miss up to 1 day in every 10 (2 days in a 21-day challenge). One more ends it, and you can start again whenever you like.</li>' +
    '<li><b>Attend 6 sessions in 3 months:</b> check in at center sessions on sosmn.org. Sign in with Google or Microsoft so your check-ins count.</li>' +
    '<li>Each challenge shows its points; you earn them when you finish.</li></ul></details>';
  function rulesPlan(c) {
    return '<details class="ch-rules"><summary>How this challenge works</summary><ul class="small">' +
      '<li>' + (c.run.rampTo ? 'Your daily time grows a little each day, from ' + c.run.base + ' to ' + c.run.rampTo + ' minutes by day ' + c.total + '.' : 'Meditate at least ' + c.run.base + ' minutes every day for ' + c.total + ' days.') + '</li>' +
      '<li>All your sittings in a day are added together. A day counts once it is over (at midnight).</li>' +
      '<li>Up to ' + c.allow + ' missed day' + (c.allow === 1 ? '' : 's') + ' allowed. One more ends the challenge; you can start again any time.</li>' +
      '<li>' + (c.run.rampTo ? 'Reaching ' + c.run.rampTo + ' minutes a day is worth celebrating. ' : 'When you finish, you can do another ' + c.total + ' days at the same time, or take the 21-Day Advance and grow to 30 minutes. ') + '</li>' +
      '<li>Finish it to earn ' + (c.run.points || 0) + ' points.</li></ul></details>';
  }
  function nextOptions(last) {
    var list = catalog().filter(function (x) { return x.kind === 'daily_sitting'; }), out = [];
    var base = last ? (last.run.plan ? (last.run.rampTo || last.run.base) : 30) : 0;
    var lastDef = last && last.run.cid ? list.filter(function (x) { return x.id === last.run.cid; })[0] : null;
    var repeatDef = (lastDef && !lastDef.rampTo ? lastDef : null) || list.filter(function (x) { return !x.rampTo && !x.nextOf; })[0] || defaults()[0];
    if (last && last.done) {
      out.push({ x: repeatDef, o: { base: base, title: 'Another ' + (repeatDef.days || 21) + ' days at ' + base + ' min', desc: 'Keep the same daily time and make it second nature.', label: 'Continue at ' + base + ' min' } });
      list.filter(function (x) { return x.nextOf && (x.nextOf === (last.run.cid || 'c21-foundation')) && x.rampTo > base; })
        .forEach(function (x) { out.push({ x: x, o: { base: base, tag: 'Next step', primary: true, label: 'Grow to ' + x.rampTo + ' min' } }); });
    }
    return out;
  }
  // Roadmap → challenges screen; js/roadmap.js adds the 10,000-hour journey (initiates) or "I've been initiated" (seekers) on top
  function render() { renderInner(); if (MC.afterChallengeRender) MC.afterChallengeRender($('s-challenge')); }
  function renderInner() {
    var el = $('s-challenge'), c = MC.challenge.current();
    if (c && !c.plan && !c.ended && !c.done) return renderClassic();   // a 42-day challenge already under way
    var html = '';
    if (c && c.plan && !c.ended && !c.done) {
      var pct = Math.min(1, c.todayMinutes / c.todayTarget), last = c.dayNum === c.total;
      html = '<div class="card center"><div class="q-num">' + MC.esc(c.run.title) + '</div>' +
        '<h1 class="ch-day-title">Day ' + c.dayNum + ' <span>of ' + c.total + '</span></h1>' + dotsPlan(c) +
        '<div class="ch-today ' + (c.metToday ? 'met' : '') + '">' +
        (c.metToday ? '<b>✓ Today’s ' + c.todayTarget + ' minutes are complete.</b><span>Day ' + c.dayNum + ' will count at midnight.</span>'
          : '<b>Today: ' + MC.fmtMin(c.todayMinutes) + ' of ' + c.todayTarget + ' min</b><span>' + MC.fmtMin(Math.max(0, c.todayTarget - c.todayMinutes)) + ' more minutes to complete day ' + c.dayNum + '.</span>') +
        '<div class="meter" style="margin-top:8px"><div style="width:' + (pct * 100).toFixed(0) + '%"></div></div></div>' +
        (c.metToday ? '' : '<a class="btn btn-primary btn-block" href="#timer" style="margin-top:14px">🪷 Start Meditation</a>') +
        '<p class="small muted" style="margin:12px 0 0">Missed days: <b>' + c.misses + ' of ' + c.allow + '</b> allowed · ends ' + MC.esc(MC.fmtDate(MC.parseDate(c.endOn), { month: 'short', day: 'numeric' })) + (last ? ' (today is the last day)' : '') + '</p></div>' +
        (c.nearEnd ? '<div class="card"><div class="section-title">Almost there: what’s next?</div><p class="small muted" style="margin:-4px 0 10px">After day ' + c.total + ' you can keep going at the same time, or grow toward 30 minutes.</p>' +
          '<p class="small" style="margin:0">Your choices will appear here when this challenge is complete. 🌱</p></div>' : '') +
        '<div class="card">' + lastDays(c) + rulesPlan(c) + '<div class="links" style="margin-top:10px"><button class="link" id="cpStop">Stop this challenge</button></div></div>';
      el.innerHTML = html;
      $('cpStop').addEventListener('click', function () {
        if (!window.confirm('Stop “' + c.run.title + '”? Your sittings and points so far are kept.')) return;
        var list = runs(); list[list.length - 1].endedOn = MC.toISO(MC.today()); MC.profile.challenges = list; MC.saveProfile(); MC.emit('profile'); render();
      });
      return;
    }
    var opts = [], intro = '';
    if (c && c.done) {
      var name = c.run.plan ? c.run.title : '42-Day Challenge';
      intro = '<div class="card hero"><div class="lotus" aria-hidden="true">🏆</div><h1>' + MC.esc(name) + ' complete!</h1>' +
        '<p class="lead">Completed on ' + MC.esc(MC.fmtDate(MC.parseDate(c.completedOn))) + '. ' + ((c.run.rampTo || 0) >= 30 || !c.run.plan ? 'You reached 30 minutes a day. Beautiful work. 🙏' : 'Your daily practice is taking root. 🙏') + '</p></div>';
      opts = nextOptions(c);
    } else {
      if (c && c.failed) intro = '<div class="card"><p style="margin:0">Your last challenge ended after ' + c.misses + ' missed days. That’s alright: every sitting still counts. Start again whenever you’re ready. 🌱</p></div>';
      else intro = '<div class="card ch-intro"><div class="lotus" aria-hidden="true">🌱</div><div><b>Build your daily practice</b><p class="small muted" style="margin:2px 0 0">Pick a challenge below. New to meditation? <a href="#learn?a=learn-to-meditate">Learn how to meditate</a> first.</p></div></div>';
      opts = [];   // v0.24: meditation challenges are in the one list below (js/goals.js), with the same sign-up sheet as all others
    }
    var list = opts.map(function (o) { return o.x; });
    el.innerHTML = intro + (opts.length ? '<div class="card"><div class="section-title">Choose your next challenge</div>' + opts.map(function (o) { return optionHTML(o.x, o.o); }).join('') + HOW_HTML + '</div>' : '');
    bindOptions(el, list, function () { render(); });
  }

  /* ---------- "Choose your first challenge" (Copilot sign-up step) ---------- */
  var firstDlg = null;
  function firstOpen() { return firstDlg && firstDlg.open; }
  // v0.24: no longer opened automatically (people start from Today's "Getting started"); kept for "Start with a challenge"
  MC.maybeAskFirstChallenge = function () {
    if (!MC.account.signedIn() || firstOpen()) return;
    if (!$('welcome').hidden || ($('typeDlg') && $('typeDlg').open)) return;
    if (MC.store.get(FIRST_KEY, null) || runs().length || (MC.goals && MC.goals.all && MC.goals.all().length)) return;
    var mustChoose = MC.sessions.count() === 0;
    loadCatalog().then(function (cat) {
      var list = cat.filter(function (x) { return x.signup; }); if (!list.length) list = defaults().filter(function (x) { return x.signup; });
      if (firstOpen() || MC.store.get(FIRST_KEY, null)) return;
      if (!firstDlg) { firstDlg = document.createElement('dialog'); firstDlg.className = 'sheet'; firstDlg.id = 'firstDlg'; document.body.appendChild(firstDlg);
        firstDlg.addEventListener('cancel', function (e) { if (firstDlg.dataset.must === '1') e.preventDefault(); }); }
      firstDlg.dataset.must = mustChoose ? '1' : '';
      firstDlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">Choose your first challenge</h2>' +
        '<p class="small" style="margin:-4px 0 12px">A gentle goal with a finish line helps meditation become a habit. Pick at least one; you can add more later in Roadmap.</p>' +
        list.map(function (x, i) { return optionHTML(x, { primary: i === 0, tag: i === 0 ? 'Recommended' : '' }); }).join('') +
        (mustChoose ? '' : '<div class="actions"><button type="button" class="btn btn-ghost" id="fdLater">Not now</button></div>') + '</div>';
      bindOptions(firstDlg, list, function () { firstDlg.close(); MC.go('roadmap'); });
      if ($('fdLater')) $('fdLater').addEventListener('click', function () { MC.store.set(FIRST_KEY, { at: Date.now(), skipped: true }); firstDlg.close(); });
      if (firstDlg.showModal) firstDlg.showModal(); else firstDlg.setAttribute('open', '');
    });
  };

  // Start one specific meditation challenge from a list (Roadmap → challenges card)
  MC.challenge.openOne = function (x) {
    if (!firstDlg) { firstDlg = document.createElement('dialog'); firstDlg.className = 'sheet'; firstDlg.id = 'firstDlg'; document.body.appendChild(firstDlg);
      firstDlg.addEventListener('cancel', function (e) { if (firstDlg.dataset.must === '1') e.preventDefault(); }); }
    firstDlg.dataset.must = '';
    firstDlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">' + MC.esc(x.title) + '</h2>' + optionHTML(x, { primary: true }) +
      '<div class="actions"><button type="button" class="btn btn-ghost" id="fdLater">Cancel</button></div></div>';
    bindOptions(firstDlg, [x], function () { firstDlg.close(); });
    $('fdLater').addEventListener('click', function () { firstDlg.close(); });
    if (firstDlg.showModal) firstDlg.showModal(); else firstDlg.setAttribute('open', '');
  };
  MC.challenge.defaults = defaults; MC.challenge.catalog = catalog; MC.challenge.HOW_HTML = HOW_HTML; MC.challenge.loadCatalog = loadCatalog; MC.challenge.optionHTML = optionHTML; MC.challenge.bindOptions = bindOptions;
  MC.challengeUI = { render: render };
  MC.on('data', function () { if (MC.current === 'roadmap' && $('s-challenge').classList.contains('active')) render(); });
})();
