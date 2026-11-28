/* Meditation Copilot — Home (Today) */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;

  var THOUGHTS = [
    'The light you seek is already within you.',
    'Sit not to become someone else, but to remember who you are.',
    'Stillness is not the absence of life. It is life without hurry.',
    'Every time the mind wanders and you return, that return is the practice.',
    'A quiet mind hears what a busy one cannot.',
    'Begin where you are. The path meets you there.',
    'Small moments, offered daily, become a transformed life.',
    'Peace is not found somewhere else. It is uncovered here.',
    'Let today’s sitting be enough. Tomorrow will have its own.',
    'Gratitude opens the door; stillness walks you through it.',
    'The ocean is calm beneath its waves. So are you.',
    'Turn inward as gently as you would turn toward a friend.',
    'Consistency is devotion made visible.',
    'Love is the doorway, and attention is the key.'
  ];

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Peaceful night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function render() {
    if (MC.account) MC.account.renderBanner();
    if (MC.renderGettingStarted) MC.renderGettingStarted();
    var t = MC.today(), tomorrow = MC.addDays(t, 1);
    var today = MC.sumRange(t, tomorrow), week = MC.sumRange(MC.weekStart(t), tomorrow);
    var st = MC.streaks(), target = MC.dailyTarget();

    var fn = MC.firstName ? MC.firstName() : '';
    $('greet').textContent = greeting() + (fn ? ', ' + fn : '') + ' 🙏';
    var sub = MC.fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' });
    if (st.current > 1 && !st.practicedToday) sub += ' · Sit today to keep your ' + st.current + '-day streak';
    else if (today.minutes >= target) sub += ' · Today’s target complete ✨';
    $('greetSub').textContent = sub;

    $('todayMin').textContent = MC.fmtMin(today.minutes);
    $('todayOf').innerHTML = '<b>' + MC.esc(MC.fmtMin(today.minutes)) + '</b> of ' + MC.esc(MC.fmtMin(target)) + ' min today';
    $('targetVal').textContent = MC.fmtMin(target) + ' min' + (MC.targetLocked() ? ' · set by your challenge' : '');
    var ring = $('todayRing');
    MC.setRing(ring, 0);
    requestAnimationFrame(function () { requestAnimationFrame(function () { MC.setRing(ring, today.minutes / target); }); });

    $('hStreak').innerHTML = st.current + ' <small>' + (st.current === 1 ? 'day' : 'days') + '</small>';
    $('hWeek').textContent = MC.fmtDur(week.minutes);
    $('hWeekCount').textContent = week.count;

    // Next scheduled sitting and today's plan (sittings + events); points are in the header
    if (MC.renderPointsPill) MC.renderPointsPill();
    if (MC.renderFeatured) MC.renderFeatured();
    $('nextSitting').innerHTML = MC.nextSittingHTML ? MC.nextSittingHTML() : '';
    $('todayAgenda').innerHTML = MC.todayAgendaHTML ? MC.todayAgendaHTML() : '';

    // Upcoming SOS events (hero + next two) and the hero article
    if (MC.renderHomeEvents) MC.renderHomeEvents();
    if (MC.renderHeroArticle) MC.renderHeroArticle();

    // Seekers: their challenge · Initiates: the 10,000-hour journey once they've begun it (v0.23: optional), else their challenge
    var jc = $('journeyCard');
    if (MC.isInitiated() && MC.profile.journey && MC.hasProfile()) {
      var r = MC.compute(), pct = r.completed / MC.GOAL_HOURS * 100;
      var next = MC.MILESTONES.filter(function (m) { return m > r.completed; })[0];
      jc.innerHTML = '<div class="section-title">10,000-hour journey <a class="link" href="#roadmap" style="padding:0">Roadmap</a></div>' +
        '<div class="meter"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
        '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><b>' + MC.fmtHours(r.completed) + ' hrs</b><span class="muted">' +
        (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '% of 10,000</span></div>' +
        '<p class="small" style="margin:10px 0 0">' + (r.done ? '🎉 Goal achieved.' : r.ahead
          ? '✅ On track for your goal of ' + r.goalYear + '.'
          : '🌟 About ' + MC.fmtDaily(MC.recommendedDaily(r)) + ' a day reaches your goal by ' + r.goalYear + '.') +
        (next ? ' <span class="muted">Next milestone: ' + next.toLocaleString() + ' hrs.</span>' : '') + '</p>';
    } else {
      jc.innerHTML = MC.challengeHomeCard() + (MC.isInitiated() && !MC.profile.journey ? '<p class="small" style="margin:10px 0 0">🪷 <a href="#roadmap">The 10,000-hour journey</a> is open to you as an initiate (optional).</p>' : '');
    }

    // Last sitting
    var last = MC.sessions.all()[0];
    $('lastCard').hidden = !last;
    if (last) {
      $('lastSession').innerHTML = '<div><b>' + MC.fmtDur(last.minutes) + '</b> <span class="muted small">· ' + MC.esc(MC.relDay(last.start)) + ', ' + MC.esc(MC.fmtTime(last.start)) + '</span>' +
        (last.note ? '<div class="small muted">' + MC.esc(last.note) + '</div>' : '') + '</div>' +
        '<span class="small" style="color:var(--gold-ink);font-weight:600;white-space:nowrap">' + Math.round(last.quality) + '% ' + MC.qualityLabel(last.quality) + '</span>';
    }

    // Quote of the day (MC.thoughtFor), with "✓ I read it" for the Daily Quote challenge (js/library.js)
    var q = MC.thoughtFor(t), who = q.author || 'Unknown';
    $('thought').innerHTML = '<span class="small muted" style="font-style:normal;font-family:var(--sans);display:block;margin-bottom:6px">Quote of the day</span>' +
      '\u201C' + MC.esc(q.text) + '\u201D<cite>\u2014 ' + MC.esc(who) + (q.source ? ', <i>' + MC.esc(q.source) + '</i>' : '') + '</cite>' +
      (MC.library ? '<div class="thought-foot">' + MC.library.quoteButton(MC.toISO(t)) + '</div>' : '');
  }

  // Approved quotes (js/quotes.js) mixed with the app's own reflections (author unknown), one per day.
  // A fixed step that shares no factor with the list length visits every quote once per cycle, with authors mixed.
  MC.thoughtFor = function (day) {
    var doy = MC.daysBetween(new Date(2000, 0, 1), day);
    var mq = window.MC_QUOTES || {};
    var all = (mq.quotes || []).filter(function (q) { return q && q.text; })
      .concat(THOUGHTS.map(function (x) { return { text: x }; }));
    var n = all.length, step = 1;
    [37, 31, 29, 23, 19, 17, 13, 11, 7].some(function (k) { if (n % k) { step = k; return true; } return false; });
    var q = all[(doy * step) % n];
    return { text: q.text, author: q.author || mq.author || '', source: q.source || '' };
  };

  /* Daily target sheet */
  var dlg = $('targetDlg');
  $('targetBtn').addEventListener('click', function () {
    if (MC.targetLocked()) { MC.go('roadmap'); return; }
    $('tdMin').value = MC.dailyTarget();
    $('tdHint').textContent = MC.settings.dailyTarget ? '' : 'Currently using the average from your roadmap answers.';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('tdCancel').addEventListener('click', function () { dlg.close(); });
  $('targetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = Number($('tdMin').value);
    if (!(v >= 1 && v <= 1440)) { $('tdHint').textContent = 'Please enter between 1 and 1,440 minutes.'; return; }
    MC.saveSettings({ dailyTarget: Math.round(v) });
    dlg.close(); render(); MC.toast('Daily target set to ' + Math.round(v) + ' min.');
  });

  MC.views.home = { show: render };
  MC.on('data', function () { if (MC.current === 'home') render(); });
  MC.on('profile', function () { if (MC.current === 'home') render(); });
})();
