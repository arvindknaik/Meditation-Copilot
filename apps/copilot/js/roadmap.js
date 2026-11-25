/* Meditation Copilot — Roadmap view: 5-question planner, results, milestones, what-if, sharing */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var SCREENS = ['s-welcome', 's-q1', 's-q2', 's-q3', 's-q4', 's-q5', 's-results'];
  var current = 0;
  var state = MC.profile;   // edited in place, saved on each valid step

  /* ---------- Screen navigation inside the Roadmap view ---------- */
  function show(i) {
    current = i;
    $('s-challenge').classList.remove('active');
    SCREENS.forEach(function (id, idx) { $(id).classList.toggle('active', idx === i); });
    var isQ = i >= 1 && i <= 5;
    $('progress').hidden = !isQ;
    if (isQ) {
      $('progressFill').style.width = (i / 5 * 100) + '%';
      $('progressCount').textContent = i + ' of 5';
    }
    prepare(i);
    window.scrollTo(0, 0);
    var focusEl = { 1: 'dob', 2: 'start', 3: 'minutes', 4: 'quality', 5: 'goalAge' }[i];
    if (focusEl && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(function () { $(focusEl).focus(); }, 60);
  }

  function prepare(i) {
    var t = MC.toISO(MC.today());
    if (i === 1) { $('dob').max = t; $('dob').value = state.dob || ''; }
    if (i === 2) {
      $('start').max = t; $('start').min = state.dob || ''; $('start').value = state.start || '';
      // For initiates the journey begins at initiation (same saved value)
      $('s-q2').querySelector('.q-title').textContent = MC.isInitiated() ? 'When were you initiated?' : 'When did your meditation journey begin?';
      $('s-q2').querySelector('.q-help').textContent = MC.isInitiated() ? 'Your journey to 10,000 hours began at initiation. You can adjust this date.' : 'An approximate date is perfectly fine. Every sincere sitting counts.';
    }
    if (i === 3) { $('minutes').value = state.minutes; syncMinChips(); }
    if (i === 4) { $('quality').value = state.quality; updateQuality(); }
    if (i === 5) {
      var age = MC.ymDiff(MC.parseDate(state.dob), MC.today()).y;
      $('goalAge').min = age + 1;
      $('goalAge').value = state.goalAge || MC.MAX_AGE;
      $('q5help').textContent = 'You are ' + age + ' today. Choose an age between ' + (age + 1) + ' and ' + MC.MAX_AGE + '. Default is 90.';
      buildAgeChips(age);
    }
    if (i === 6) renderResults();
  }

  function validate(step) {
    var t = MC.today(), err = '';
    if (step === 1) {
      var dob = MC.parseDate($('dob').value);
      if (!dob) err = 'Please choose your date of birth.';
      else if (dob > t) err = 'Your date of birth can’t be in the future.';
      else if (MC.ymDiff(dob, t).y >= MC.MAX_AGE) err = 'This planner supports goals up to age 90. Your practice is already a blessing. 🙏';
      else state.dob = $('dob').value;
      $('e1').textContent = err;
    }
    if (step === 2) {
      var s = MC.parseDate($('start').value), d = MC.parseDate(state.dob);
      if (!s) err = 'Please choose when your journey began.';
      else if (s > t) err = 'Please choose a date on or before today.';
      else if (d && s < d) err = 'Your journey can’t begin before your date of birth.';
      else state.start = $('start').value;
      $('e2').textContent = err;
    }
    if (step === 3) {
      var raw = $('minutes').value.trim(), m = Number(raw);
      if (raw === '' || isNaN(m)) err = 'Please enter your average minutes per day.';
      else if (m < 0) err = 'Minutes can’t be negative.';
      else if (m > 1440) err = 'There are only 1,440 minutes in a day. 🙂';
      else state.minutes = String(Math.round(m * 10) / 10);
      $('e3').textContent = err;
    }
    if (step === 4) state.quality = Number($('quality').value);
    if (step === 5) {
      var g = Number($('goalAge').value), dob5 = MC.parseDate(state.dob), age = MC.ymDiff(dob5, t).y;
      if (!$('goalAge').value || isNaN(g) || g !== Math.floor(g)) err = 'Please enter a whole number for your goal age.';
      else if (g > MC.MAX_AGE) err = 'The goal age cannot exceed 90.';
      else if (g <= age || MC.addYears(dob5, g) <= t) err = 'Your goal age must be greater than your current age (' + age + ').';
      else state.goalAge = g;
      $('e5').textContent = err;
    }
    if (!err) { MC.saveProfile(); MC.emit('profile'); }
    return !err;
  }

  function next() {
    if (current >= 1 && current <= 5 && !validate(current)) return;
    show(Math.min(current + 1, SCREENS.length - 1));
  }
  function back() { show(Math.max(current - 1, 0)); }

  document.querySelectorAll('#v-roadmap [data-next]').forEach(function (b) { b.addEventListener('click', next); });
  document.querySelectorAll('#v-roadmap [data-back]').forEach(function (b) { b.addEventListener('click', back); });
  $('v-roadmap').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && current >= 1 && current <= 5 && e.target.tagName === 'INPUT') { e.preventDefault(); next(); }
  });

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
    var q = Number($('quality').value), mins = Number(state.minutes) || 60;
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

  /* Q5 chips */
  function buildAgeChips(age) {
    var opts = [50, 60, 70, 80, 90].filter(function (a) { return a > age; });
    $('ageChips').innerHTML = opts.map(function (a) { return '<button class="chip" data-age="' + a + '">' + a + '</button>'; }).join('');
    syncAgeChips();
  }
  function syncAgeChips() {
    document.querySelectorAll('#ageChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.age === String($('goalAge').value)); });
  }
  $('ageChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('goalAge').value = c.dataset.age; syncAgeChips(); $('e5').textContent = '';
  });
  $('goalAge').addEventListener('input', function () { syncAgeChips(); $('e5').textContent = ''; });

  /* ---------- Results ---------- */
  var MOTIVATION = {
    done: ['Ten thousand hours of turning inward. What you have cultivated cannot be measured, only lived. 🙏', 'You have walked the long road. Now let the practice simply be who you are.'],
    ahead: ['Your steady devotion is bearing fruit. Keep sitting with the same gentle consistency.', 'Each quiet morning adds up. You are walking this path beautifully.', 'Discipline today, freedom tomorrow. Your practice is a gift to yourself and the world.'],
    behind: ['A small daily step is all it takes. Begin again, gently, today.', 'The path is not about perfection; it is about returning. Every sitting brings you closer.', 'Even a few extra mindful minutes, offered sincerely, transform a life.']
  };
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

    var box = $('statusBox'), msg;
    if (r.done) {
      box.className = 'status ahead';
      msg = '🎉 Goal Achieved<small>You completed 10,000 effective hours' + (r.projAge ? ' around age ' + MC.fmtYM(r.projAge) : '') + '.</small>';
    } else if (r.ahead) {
      box.className = 'status ahead';
      msg = '✅ Ahead of Schedule<small>Based on your current practice, you are projected to complete your 10,000-hour goal at age ' + MC.fmtYM(r.projAge) + '.' +
        (r.aheadBy ? '<br>You are on track to complete your goal approximately ' + MC.fmtYM(r.aheadBy) + ' earlier than planned.' : '') + '</small>';
    } else {
      box.className = 'status behind';
      var detail = 'To achieve your goal by age ' + r.goalAge + ', increase your effective meditation time by ' +
        MC.fmtMin(r.extraEff) + ' minute' + (r.extraEff === 1 ? '' : 's') + ' per day.';
      if (r.extraActual !== null && r.paceQ < 100) {
        detail += '<br>At your ' + Math.round(r.paceQ) + '% quality, that is about ' + MC.fmtMin(r.extraActual) +
          ' more minutes of sitting, or deepen your quality to close the gap faster.';
      }
      if (r.required > 1440) {
        detail += '<br>That is more than a full day, so the target may stretch beyond age ' + r.goalAge + '. Every hour you practice still transforms you.';
      } else if (!r.projBeyond) {
        detail += '<br>At your current pace you would reach 10,000 hours at about age ' + MC.fmtYM(r.projAge) + '.';
      }
      msg = '🌟 Your goal is within reach.<small>' + detail + '</small>';
    }
    box.innerHTML = msg;

    var paceLbl = r.paceSource === 'logged' ? 'Last ' + r.windowDays + ' days' : 'Your answers';
    var projText = r.projBeyond ? 'Beyond 90 <small>at current pace</small>' : r.projAge.y + ' <small>yrs ' + r.projAge.m + ' mo</small>';
    $('stats').innerHTML =
      stat('Current Age', r.currentAge.y + ' <small>yrs ' + r.currentAge.m + ' mo</small>') +
      stat('Target Age', r.goalAge + ' <small>yrs</small>') +
      stat('Meditation / Day', MC.fmtMin(r.paceMin) + ' <small>min · ' + paceLbl + '</small>') +
      stat('Quality Index', Math.round(r.paceQ) + '% <small>' + MC.qualityLabel(r.paceQ) + '</small>') +
      stat('Effective / Day', MC.fmtMin(r.effDaily) + ' <small>min</small>', 'hl') +
      stat('Required Effective Avg', (r.done ? '0' : MC.fmtMin(r.required)) + ' <small>min/day</small>', 'hl') +
      stat('Hours Completed', MC.fmtHours(r.completed)) +
      stat('Hours Remaining', MC.fmtHours(r.remaining)) +
      stat('Status', r.ahead ? '✅ Ahead of Schedule' : '🌟 Behind Schedule') +
      stat('Projected Completion Age', projText);

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
      $('wiOut').innerHTML = 'At <b>' + MC.fmtMin(base.paceMin + extra) + ' min/day</b> you would still finish beyond age 90. Try a little more.';
      return;
    }
    var out = 'At <b>' + MC.fmtMin(base.paceMin + extra) + ' min/day</b> you would reach 10,000 hours at age <b>' + MC.fmtYM(r.projAge) + '</b>';
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
    var proj = r.projBeyond ? 'Growing my practice to get there 🌱' : MC.fmtYM(r.projAge);
    return [
      '🙏 My 10,000 Hour Spiritual Journey', '',
      'Current Age: ' + r.currentAge.y,
      'Target Age: ' + r.goalAge,
      'Quality Index: ' + Math.round(r.paceQ) + '%',
      'Effective Meditation: ' + MC.fmtMin(r.effDaily) + ' min/day',
      'Hours Completed: ' + MC.fmtHours(r.completed),
      'Hours Remaining: ' + MC.fmtHours(r.remaining),
      'Required Effective Average: ' + (r.done ? '0' : MC.fmtMin(r.required)) + ' min/day',
      'Status: ' + (r.ahead ? 'Ahead of Schedule' : 'Behind Schedule'),
      'Projected Completion Age: ' + proj, '',
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
    if (!window.confirm('Start over and clear your roadmap answers? Your logged sittings are kept.')) return;
    MC.resetProfile(); state = MC.profile; MC.emit('profile'); show(0);
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

  /* ---------- View hook ---------- */
  MC.views.roadmap = {
    show: function () {
      if (MC.isSeeker()) {                       // New Seekers: 42-day challenge instead of the 10,000-hour roadmap
        SCREENS.forEach(function (id) { $(id).classList.remove('active'); });
        $('progress').hidden = true;
        $('s-challenge').classList.add('active');
        MC.challengeUI.render();
        return;
      }
      $('s-challenge').classList.remove('active');
      if (current >= 1 && current <= 5) { show(current); return; }   // mid-questionnaire: stay put
      show(MC.hasProfile() ? 6 : 0);
    },
    start: function () { show(0); }
  };
  MC.on('data', function () { if (MC.current === 'roadmap' && current === 6 && !MC.isSeeker()) renderResults(); });
  MC.on('profile', function () { if (MC.current === 'roadmap') MC.views.roadmap.show(); });
})();
