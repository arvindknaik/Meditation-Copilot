/* Meditation Copilot — Roadmap view.
 * Everyone: the challenge program (js/challenge.js, js/goals.js). Initiates (v0.23): the optional, lifelong 10,000-hour journey:
 * 4 questions (initiation date, average time, quality, target year), results, milestones, what-if, sharing. */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var SCREENS = ['s-welcome', 's-q2', 's-q3', 's-q4', 's-q5', 's-results'];
  var NQ = 4, RESULTS = 5;
  var current = 0;
  function st() { return MC.profile; }   // edited in place, saved on each valid step

  /* ---------- Screen navigation inside the Roadmap view ---------- */
  function show(i) {
    current = i;
    $('s-challenge').classList.remove('active');
    SCREENS.forEach(function (id, idx) { $(id).classList.toggle('active', idx === i); });
    var isQ = i >= 1 && i <= NQ;
    $('progress').hidden = !isQ;
    if (isQ) {
      $('progressFill').style.width = (i / NQ * 100) + '%';
      $('progressCount').textContent = i + ' of ' + NQ;
    }
    prepare(i);
    window.scrollTo(0, 0);
    var focusEl = { 1: 'start', 2: 'minutes', 3: 'quality', 4: 'goalYear' }[i];
    if (focusEl && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(function () { $(focusEl).focus(); }, 60);
  }

  function prepare(i) {
    var t = MC.toISO(MC.today()), state = st(), id = SCREENS[i];
    if (id === 's-q2') {
      $('start').max = t; $('start').min = ''; $('start').value = state.start || '';
      $('s-q2').querySelector('.q-help').textContent = 'Your journey to 10,000 hours began at initiation' + (state.initiatedBy ? ' (by ' + state.initiatedBy + ')' : '') + '. You can correct the date here.';
    }
    if (id === 's-q3') { $('minutes').value = state.minutes; syncMinChips(); }
    if (id === 's-q4') { $('quality').value = state.quality; updateQuality(); }
    if (id === 's-q5') {
      var y = MC.today().getFullYear();
      $('goalYear').min = y + 1; $('goalYear').max = y + MC.MAX_YEARS;
      $('goalYear').value = state.goalYear || '';
      $('q5help').textContent = 'Choose a year between ' + (y + 1) + ' and ' + (y + MC.MAX_YEARS) + '. You can change it any time.';
      buildYearChips(y);
    }
    if (i === RESULTS) renderResults();
  }

  function validate(step) {
    var t = MC.today(), err = '', state = st(), id = SCREENS[step];
    if (id === 's-q2') {
      var s = MC.parseDate($('start').value);
      if (!s) err = 'Please enter the date you were initiated.';
      else if (s > t) err = 'Please choose a date on or before today.';
      else if (s.getFullYear() < 1900) err = 'Please check the year.';
      else state.start = $('start').value;
      $('e2').textContent = err;
    }
    if (id === 's-q3') {
      var raw = $('minutes').value.trim(), m = Number(raw);
      if (raw === '' || isNaN(m)) err = 'Please enter your average minutes per day.';
      else if (m < 0) err = 'Minutes can’t be negative.';
      else if (m > 1440) err = 'There are only 1,440 minutes in a day. 🙂';
      else state.minutes = String(Math.round(m * 10) / 10);
      $('e3').textContent = err;
    }
    if (id === 's-q4') state.quality = Number($('quality').value);
    if (id === 's-q5') {
      var g = Number($('goalYear').value), y = t.getFullYear();
      if (!$('goalYear').value || isNaN(g) || g !== Math.floor(g)) err = 'Please enter a year, e.g. ' + (y + 15) + '.';
      else if (g <= y) err = 'Choose a year after ' + y + '.';
      else if (g > y + MC.MAX_YEARS) err = 'Choose a year up to ' + (y + MC.MAX_YEARS) + '.';
      else state.goalYear = g;
      $('e5').textContent = err;
    }
    if (!err) { MC.saveProfile(); MC.emit('profile'); }
    return !err;
  }

  function next() {
    if (current >= 1 && current <= NQ && !validate(current)) return;
    if (current === 0 && !st().journey) { st().journey = { startedOn: MC.toISO(MC.today()) }; MC.saveProfile(); MC.track('journey_start'); }
    show(Math.min(current + 1, SCREENS.length - 1));
  }
  function back() { show(Math.max(current - 1, 0)); }

  document.querySelectorAll('#v-roadmap [data-next]').forEach(function (b) { b.addEventListener('click', next); });
  document.querySelectorAll('#v-roadmap [data-back]').forEach(function (b) { b.addEventListener('click', back); });
  $('v-roadmap').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && current >= 1 && current <= NQ && e.target.tagName === 'INPUT') { e.preventDefault(); next(); }
  });
  $('jBack').addEventListener('click', function (e) { e.preventDefault(); showChallenges(); });

  /* Q3 chips */
  function syncMinChips() {
    document.querySelectorAll('#minChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.min === String($('minutes').value)); });
  }
  $('minChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('minutes').value = c.dataset.min; syncMinChips(); $('e3').textContent = '';
  });
  $('minutes').addEventListener('input', function () { syncMinChips(); $('e3').textContent = ''; });

  /* Q4 slider */
  function updateQuality() {
    var q = Number($('quality').value), mins = Number(st().minutes) || 60;
    $('qVal').textContent = q + '%';
    $('qLabel').textContent = MC.qualityLabel(q);
    $('quality').style.setProperty('--pct', q + '%');
    document.querySelectorAll('#qChips .chip').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.q) === q); });
    $('formula').innerHTML = '<b>' + MC.fmtMin(mins) + ' minutes</b> at <b>' + q + '% quality</b> = <b>' +
      MC.fmtMin(mins * q / 100) + ' effective minutes</b> per day.';
  }
  $('quality').addEventListener('input', updateQuality);
  $('qChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('quality').value = c.dataset.q; updateQuality();
  });

  /* Q4 (target year) chips */
  function buildYearChips(y) {
    var opts = [10, 15, 20, 25, 30].map(function (n) { return y + n; });
    $('yearChips').innerHTML = opts.map(function (v) { return '<button class="chip" data-year="' + v + '">' + v + '</button>'; }).join('');
    syncYearChips();
  }
  function syncYearChips() {
    document.querySelectorAll('#yearChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.year === String($('goalYear').value)); });
  }
  $('yearChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('goalYear').value = c.dataset.year; syncYearChips(); $('e5').textContent = '';
  });
  $('goalYear').addEventListener('input', function () { syncYearChips(); $('e5').textContent = ''; });

  /* ---------- Results ---------- */
  var MOTIVATION = {
    done: ['Ten thousand hours of turning inward. What you have cultivated cannot be measured, only lived. 🙏', 'You have walked the long road. Now let the practice simply be who you are.'],
    ahead: ['Your steady devotion is bearing fruit. Keep sitting with the same gentle consistency.', 'Each quiet morning adds up. You are walking this path beautifully.', 'Discipline today, freedom tomorrow. Your practice is a gift to yourself and the world.'],
    behind: ['A small daily step is all it takes. Begin again, gently, today.', 'The path is not about perfection; it is about returning. Every sitting brings you closer.', 'Even a few extra mindful minutes, offered sincerely, transform a life.']
  };
  function monthYear(d) { return d ? MC.fmtDate(d, { month: 'short', year: 'numeric' }) : ''; }
  // Daily sitting time that reaches the goal by the target year (at the current quality); never less than today's pace
  MC.recommendedDaily = function (r) {
    r = r || MC.compute();
    if (r.done) return r.paceMin;
    var q = r.paceQ > 0 ? r.paceQ / 100 : 0.75;
    return Math.max(r.paceMin, Math.ceil(r.required / q));
  };
  function fmtDaily(min) { min = Math.round(min); return min >= 120 ? Math.floor(min / 60) + ' h ' + (min % 60 ? (min % 60) + ' min' : '') : min + ' min'; }
  MC.fmtDaily = fmtDaily;
  function pick(arr) { return arr[new Date().getDate() % arr.length]; }
  function stat(k, v, cls) { return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  function renderResults() {
    var r = MC.compute();
    var pct = Math.min(100, r.completed / MC.GOAL_HOURS * 100);
    $('asOf').textContent = 'As of ' + MC.fmtDate(r.t) + ' · Goal fixed at 10,000 hours';

    $('trackHours').textContent = MC.fmtHours(r.completed);
    $('trackPct').textContent = (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '% of 10,000';
    renderTrack(r.completed);

    // Where the numbers come from
    var src;
    if (!r.logged) {
      src = '📝 Based on your answers: ' + MC.fmtMin(r.profMin) + ' min/day at ' + r.profQ + '% since ' +
        MC.fmtDate(r.start, { month: 'short', year: 'numeric' }) + '. Use the Timer to log sittings and this roadmap will use your real practice.';
    } else {
      src = '📊 ' + MC.fmtHours(r.loggedHours) + ' effective hrs from ' + r.sessionCount + ' logged sitting' + (r.sessionCount === 1 ? '' : 's') +
        (r.estHours > 0 ? ' + ' + MC.fmtHours(r.estHours) + ' estimated before you started logging' : '') + '. ';
      src += r.paceSource === 'logged'
        ? 'Your pace uses the last ' + r.windowDays + ' days of logged practice.'
        : 'Your pace uses your answers until you have a week of logged practice.';
    }
    $('sourceNote').textContent = src;

    var box = $('statusBox'), msg, rec = MC.recommendedDaily(r);
    if (r.done) {
      box.className = 'status ahead';
      msg = '🎉 Goal Achieved<small>You completed 10,000 effective hours' + (r.projDate ? ' around ' + MC.esc(monthYear(r.projDate)) : '') + '. The journey continues. 🙏</small>';
    } else if (r.ahead) {
      box.className = 'status ahead';
      msg = '✅ On track<small>At your current practice you would reach 10,000 hours around <b>' + MC.esc(monthYear(r.projDate)) + '</b>, before your goal of ' + r.goalYear + '.' +
        (r.aheadBy ? '<br>That is about ' + MC.fmtYM(r.aheadBy) + ' early.' : '') + '<br>Recommended: keep at least <b>' + fmtDaily(rec) + '</b> a day.</small>';
    } else {
      box.className = 'status behind';
      var detail = 'To reach your goal by ' + r.goalYear + ', meditate about <b>' + fmtDaily(rec) + ' a day</b>' + (r.paceQ < 100 ? ' at your ' + Math.round(r.paceQ) + '% quality' : '') +
        ' (' + MC.fmtMin(r.extraActual != null ? r.extraActual : r.extraEff) + ' more minutes than now), or deepen your quality to close the gap faster.';
      if (r.required > 1440) detail += '<br>That is more than a full day, so consider a later year. Every hour you practice still transforms you.';
      else if (!r.projBeyond) detail += '<br>At your current pace you would reach 10,000 hours around ' + MC.esc(monthYear(r.projDate)) + '.';
      msg = '🌟 Your goal is within reach.<small>' + detail + '</small>';
    }
    box.innerHTML = msg;

    var paceLbl = r.paceSource === 'logged' ? 'Last ' + r.windowDays + ' days' : 'Your answers';
    var projText = r.projBeyond ? 'Beyond ' + (MC.today().getFullYear() + MC.MAX_YEARS) + ' <small>at current pace</small>' : MC.esc(monthYear(r.projDate));
    $('stats').innerHTML =
      stat('Initiated', MC.esc(MC.fmtDate(r.start, { month: 'short', year: 'numeric' })) + (st().initiatedBy ? ' <small>' + MC.esc(st().initiatedBy) + '</small>' : '')) +
      stat('Goal Year', r.goalYear + ' <small>' + Math.max(0, r.goalYear - MC.today().getFullYear()) + ' yrs to go</small>') +
      stat('Recommended / Day', fmtDaily(rec) + ' <small>of sitting</small>', 'hl') +
      stat('Meditation / Day', MC.fmtMin(r.paceMin) + ' <small>min · ' + paceLbl + '</small>') +
      stat('Quality Index', Math.round(r.paceQ) + '% <small>' + MC.qualityLabel(r.paceQ) + '</small>') +
      stat('Effective / Day', MC.fmtMin(r.effDaily) + ' <small>min</small>', 'hl') +
      stat('Required Effective Avg', (r.done ? '0' : MC.fmtMin(r.required)) + ' <small>min/day</small>', 'hl') +
      stat('Hours Completed', MC.fmtHours(r.completed)) +
      stat('Hours Remaining', MC.fmtHours(r.remaining)) +
      stat('Status', r.ahead ? '✅ Ahead of Schedule' : '🌟 Behind Schedule') +
      stat('Projected Completion', projText);

    $('motivation').innerHTML = MC.esc(pick(r.done ? MOTIVATION.done : r.ahead ? MOTIVATION.ahead : MOTIVATION.behind)) + '<cite>Meditation Copilot</cite>';

    renderMilestones(r);
    $('whatIfCard').hidden = r.done;
    $('whatIf').value = 0; renderWhatIf();
    renderInstallHint();
  }

  /* ---------- Linear track: evenly spaced milestone stops to the 10,000-hour finish ---------- */
  var STOPS = [0].concat(MC.MILESTONES);   // 0, 100, 500, 1000, 2500, 5000, 7500, 10000
  function stopLabel(v) { return v === 0 ? 'Start' : v >= 1000 ? (v / 1000) + 'k' : String(v); }
  MC.trackPos = function (h) {             // 0..1 along the track
    var n = STOPS.length - 1;
    if (h >= STOPS[n]) return 1;
    for (var i = 0; i < n; i++) {
      if (h < STOPS[i + 1]) return (i + (h - STOPS[i]) / (STOPS[i + 1] - STOPS[i])) / n;
    }
    return 1;
  };
  function renderTrack(h) {
    var n = STOPS.length - 1, pos = MC.trackPos(h);
    var next = STOPS.filter(function (v) { return v > h; })[0];
    var html = '<div class="track-line"><div class="track-fill" id="trackFill"></div></div>';
    STOPS.forEach(function (v, i) {
      var cls = 'stop' + (h >= v ? ' done' : '') + (v === next ? ' next' : '') + (i === n ? ' finish' : '');
      html += '<div class="' + cls + '" style="left:' + (i / n * 100) + '%"><i></i><span>' + (i === n ? '10k 🏁' : stopLabel(v)) + '</span></div>';
    });
    html += '<div class="track-me" id="trackMe" style="left:0%"><span>You · ' + MC.fmtHours(h) + '</span></div>';
    $('track').innerHTML = html;
    $('track').setAttribute('aria-label', MC.fmtHours(h) + ' of 10,000 effective hours' + (next ? '; next milestone ' + next.toLocaleString() + ' hours' : ''));
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      $('trackFill').style.width = (pos * 100) + '%';
      $('trackMe').style.left = (pos * 100) + '%';
    }); });
  }
  function renderMilestones(r) {
    var h = r.completed, next = STOPS.filter(function (v) { return v > h; })[0];
    if (!next) { $('msNext').innerHTML = '<div class="small" style="color:var(--gold-ink);font-weight:600">Finish line reached. 🙏</div>'; return; }
    var days = r.effDaily > 0 ? Math.ceil((next - h) * 60 / r.effDaily) : null;
    $('msNext').innerHTML = '<div class="small muted center">Next stop: <b style="color:var(--purple)">' + next.toLocaleString() + ' hours</b> · ' +
      MC.fmtHours(next - h) + ' to go' + (days ? ' · about ' + (days > 60 ? MC.fmtYM(MC.ymDiff(r.t, MC.addDays(r.t, days))) : days + ' days') : '') + '</div>';
  }
  MC.milestoneCrossed = function (before, after) {
    for (var i = MC.MILESTONES.length - 1; i >= 0; i--) {
      if (before < MC.MILESTONES[i] && after >= MC.MILESTONES[i]) return MC.MILESTONES[i];
    }
    return null;
  };

  /* ---------- What if ---------- */
  function renderWhatIf() {
    var extra = Number($('whatIf').value);
    $('whatIf').style.setProperty('--pct', (extra / 120 * 100) + '%');
    $('wiVal').textContent = '+' + extra + ' min';
    var base = MC.compute(0), r = MC.compute(extra);
    if (r.done) { $('wiOut').textContent = ''; return; }
    if (r.projBeyond) {
      $('wiOut').innerHTML = 'At <b>' + MC.fmtMin(base.paceMin + extra) + ' min/day</b> it would take more than ' + MC.MAX_YEARS + ' years. Try a little more.';
      return;
    }
    var out = 'At <b>' + MC.fmtMin(base.paceMin + extra) + ' min/day</b> you would reach 10,000 hours around <b>' + MC.esc(monthYear(r.projDate)) + '</b>';
    if (extra > 0 && base.projDate && !base.projBeyond && r.projDate < base.projDate) {
      out += ', <b>' + MC.fmtYM(MC.ymDiff(r.projDate, base.projDate)) + '</b> sooner';
    }
    out += r.ahead ? ' ✅' : '.';
    $('wiOut').innerHTML = out;
  }
  $('whatIf').addEventListener('input', renderWhatIf);

  /* ---------- Sharing ---------- */
  function shareText() {
    var r = MC.compute();
    var proj = r.projBeyond ? 'Growing my practice to get there 🌱' : monthYear(r.projDate);
    return [
      '🙏 My 10,000 Hour Spiritual Journey', '',
      'Goal year: ' + r.goalYear,
      'Quality Index: ' + Math.round(r.paceQ) + '%',
      'Effective Meditation: ' + MC.fmtMin(r.effDaily) + ' min/day',
      'Hours Completed: ' + MC.fmtHours(r.completed),
      'Hours Remaining: ' + MC.fmtHours(r.remaining),
      'Required Effective Average: ' + (r.done ? '0' : MC.fmtMin(r.required)) + ' min/day',
      'Status: ' + (r.ahead ? 'Ahead of Schedule' : 'Behind Schedule'),
      'Projected completion: ' + proj, '',
      '"The light you seek is already within you."', '',
      'Try Meditation Copilot:', MC.APP_LINK
    ].join('\n');
  }
  var INSPIRE_TEXT = 'I calculated my path to 10,000 meditation hours using Meditation Copilot.\n\nTry it yourself:\n' + MC.APP_LINK;
  function openWhatsApp(text) {
    var url = 'https://wa.me/?text=' + encodeURIComponent(text);
    var w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;
  }
  $('shareBtn').addEventListener('click', function () {
    var text = shareText();
    if (navigator.share) {
      navigator.share({ title: 'My 10,000 Hour Spiritual Journey', text: text })
        .catch(function (err) { if (!err || err.name !== 'AbortError') openWhatsApp(text); });
    } else openWhatsApp(text);
  });
  $('inspireBtn').addEventListener('click', function () { openWhatsApp(INSPIRE_TEXT); });
  $('editBtn').addEventListener('click', function () { show(1); });
  $('resetBtn').addEventListener('click', function () {
    if (!window.confirm('Start your 10,000-hour plan over? Your answers about practice and the goal year are cleared; your initiation details and logged sittings are kept.')) return;
    var p = MC.profile; p.minutes = ''; p.quality = 75; p.goalYear = ''; p.dob = ''; p.goalAge = 90; MC.saveProfile(); MC.emit('profile'); show(0);
  });

  /* ---------- Install hint ---------- */
  var deferredPrompt = null;
  var isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; renderInstallHint(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; renderInstallHint(); MC.toast('Installed. Find 🙏 on your home screen.'); });
  function renderInstallHint() {
    var el = $('installBanner');
    if (isStandalone || location.protocol === 'file:') { el.classList.remove('show'); return; }
    if (deferredPrompt) {
      el.innerHTML = '<b>📲 Keep your practice close.</b> Install Meditation Copilot on your home screen.' +
        '<div style="margin-top:10px"><button class="btn btn-gold btn-block" id="installBtn" style="min-height:48px">Add to Home Screen</button></div>';
      el.classList.add('show');
      $('installBtn').addEventListener('click', function () {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () { deferredPrompt = null; renderInstallHint(); });
      });
    } else if (isIOS) {
      el.innerHTML = '<b>📲 Add to Home Screen:</b> tap the Share icon <span aria-hidden="true">⬆️</span> in Safari, then choose <b>Add to Home Screen</b>.';
      el.classList.add('show');
    } else el.classList.remove('show');
  }

  /* ---------- View hook ----------
   * Seekers and initiates both see the challenge program. Initiates also get the 10,000-hour journey: an invitation until they
   * begin it, then their journey results (with the challenges below). Seekers can say they've been initiated (once; no way back). */
  function showChallenges() {
    current = -1;
    SCREENS.forEach(function (id) { $(id).classList.remove('active'); });
    $('progress').hidden = true;
    $('s-challenge').classList.add('active');
    MC.challengeUI.render();
    window.scrollTo(0, 0);
  }
  MC.afterChallengeRender = function (el) {
    var box = document.createElement('div');
    box.innerHTML = journeyBoxHTML();
    if (box.firstChild) el.insertBefore(box.firstChild, el.firstChild);
    bindJourneyBox(el);
  };
  function journeyBoxHTML() {
    if (MC.isInitiated()) {
      if (MC.profile.journey && MC.hasProfile()) return '';
      return '<div class="card journey-invite"><div class="section-title">🪷 The 10,000-hour journey <span class="badge">Initiates</span></div>' +
        '<p class="small" style="margin:-4px 0 12px">An optional, lifelong journey: from your initiation to 10,000 hours of meditation. Choose a year, and Copilot recommends the daily time that gets you there and marks each milestone on the way.</p>' +
        '<button class="btn btn-gold btn-block" id="jStart">' + (MC.profile.journey ? 'Continue my journey' : 'Begin my 10,000-hour journey') + '</button>' +
        '<p class="small muted" style="margin:10px 0 0">Initiated ' + MC.esc(MC.profile.start ? MC.fmtDate(MC.parseDate(MC.profile.start)) : '') + (MC.profile.initiatedBy ? ' by ' + MC.esc(MC.profile.initiatedBy) : '') +
        ' · <button class="link small" id="jFix" style="padding:0">Correct my details</button></p></div>';
    }
    if (MC.isSeeker()) return MC.profile.initiateRevoked
      ? '<p class="small muted center" style="margin:0 0 10px">Initiated? Please speak with the center team.</p>'
      : '<div class="card ini-card"><span class="small">Initiated? Tell Copilot once, and initiates’ challenges such as the 10,000-hour journey open for you.</span>' +
        '<button class="btn btn-soft btn-sm" id="jIni" type="button" style="flex:0 0 auto">I’ve been initiated</button></div>';
    return '';
  }
  function bindJourneyBox(el) {
    if ($('jStart')) $('jStart').addEventListener('click', function () { show(MC.profile.journey ? 1 : 0); });
    if ($('jFix')) $('jFix').addEventListener('click', function () { MC.askUserType(true); });
    if ($('jIni')) $('jIni').addEventListener('click', function () { MC.askUserType(true); });
  }
  MC.views.roadmap = {
    show: function () {
      if (!MC.isInitiated() || !MC.profile.journey) { showChallenges(); return; }
      if (current >= 1 && current <= NQ) { show(current); return; }   // mid-questionnaire: stay put
      if (MC.hasProfile()) { show(RESULTS); return; }
      showChallenges();
    },
    start: function () { show(0); },
    journey: function () { if (MC.isInitiated()) show(MC.hasProfile() && MC.profile.journey ? RESULTS : 0); }
  };
  MC.on('data', function () { if (MC.current === 'roadmap' && current === RESULTS && MC.isInitiated()) renderResults(); });
  MC.on('profile', function () { if (MC.current === 'roadmap') MC.views.roadmap.show(); });
})();
