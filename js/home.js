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

    // Points and next scheduled sitting
    $('pointsLine').innerHTML = MC.rewardsHomeLine();
    if (MC.renderFeatured) MC.renderFeatured();
    $('nextSitting').innerHTML = MC.nextSittingHTML ? MC.nextSittingHTML() : '';

    // Seekers: 42-day challenge · Initiates: 10,000-hour journey
    var jc = $('journeyCard');
    if (MC.isSeeker()) {
      jc.innerHTML = MC.challengeHomeCard();
    } else if (MC.hasProfile()) {
      var r = MC.compute(), pct = r.completed / MC.GOAL_HOURS * 100;
      var next = MC.MILESTONES.filter(function (m) { return m > r.completed; })[0];
      jc.innerHTML = '<div class="section-title">10,000-hour journey <a class="link" href="#roadmap" style="padding:0">Roadmap</a></div>' +
        '<div class="meter"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
        '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><b>' + MC.fmtHours(r.completed) + ' hrs</b><span class="muted">' +
        (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '% of 10,000</span></div>' +
        '<p class="small" style="margin:10px 0 0">' + (r.done ? '🎉 Goal achieved.' : r.ahead
          ? '✅ Ahead of schedule' + (r.projBeyond ? '' : ', on track for age ' + r.projAge.y + '.')
          : '🌟 ' + MC.fmtMin(r.extraEff) + ' more effective min/day reaches your goal by ' + r.goalAge + '.') +
        (next ? ' <span class="muted">Next milestone: ' + next.toLocaleString() + ' hrs.</span>' : '') + '</p>';
    } else {
      jc.innerHTML = '<div class="section-title">Your 10,000-hour roadmap</div>' +
        '<p class="small muted" style="margin:-4px 0 12px">Answer five gentle questions to see when you’ll reach 10,000 effective hours, and what it takes.</p>' +
        '<a class="btn btn-gold btn-block" href="#roadmap">Plan my roadmap 🪷</a>';
    }

    // Last sitting
    var last = MC.sessions.all()[0];
    $('lastCard').hidden = !last;
    if (last) {
      $('lastSession').innerHTML = '<div><b>' + MC.fmtDur(last.minutes) + '</b> <span class="muted small">· ' + MC.esc(MC.relDay(last.start)) + ', ' + MC.esc(MC.fmtTime(last.start)) + '</span>' +
        (last.note ? '<div class="small muted">' + MC.esc(last.note) + '</div>' : '') + '</div>' +
        '<span class="small" style="color:var(--gold-ink);font-weight:600;white-space:nowrap">' + Math.round(last.quality) + '% ' + MC.qualityLabel(last.quality) + '</span>';
    }

    // Thought for today: approved quotes from js/quotes.js, otherwise the app's own reflections
    var doy = MC.daysBetween(new Date(2000, 0, 1), t);
    var mq = window.MC_QUOTES || {}, qs = (mq.quotes || []).filter(function (q) { return q && q.text; });
    if (qs.length) {
      var q = qs[doy % qs.length];
      $('thought').innerHTML = '<span class="small muted" style="font-style:normal;font-family:var(--sans);display:block;margin-bottom:6px">Thought for today</span>' +
        '\u201C' + MC.esc(q.text) + '\u201D<cite>\u2014 ' + MC.esc(mq.author || '') + (q.source ? ', <i>' + MC.esc(q.source) + '</i>' : '') + '</cite>';
    } else {
      $('thought').innerHTML = MC.esc(THOUGHTS[doy % THOUGHTS.length]) + '<cite>Thought for today</cite>';
    }
  }

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
