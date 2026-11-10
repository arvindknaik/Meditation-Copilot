/* Meditation Copilot — rewards: points, badges and levels
 *
 * HOW TO ADD A NEW WAY TO EARN POINTS
 * Add one object to RULES:
 *   id        unique key (never change it once released)
 *   category  'practice' | 'consistency' | 'goals' | 'learning' | 'community'
 *   icon, name, desc
 *   points    points per time earned
 *   repeat    true if it can be earned more than once
 *   who       'all' (default) | 'seeker' | 'initiated'  (who sees it when not yet earned)
 *   count(d)  how many times it has been earned, computed from the data summary `d`
 * Points are always computed from the user's data, so they sync across devices,
 * can't be double-counted, and stay correct after imports. Earned badges are never taken away.
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;

  var HOURS = [[25, 25], [50, 50], [100, 100], [250, 150], [500, 200], [1000, 250], [2500, 300], [5000, 500], [10000, 1000]];

  var RULES = [
    { id: 'first_sitting', category: 'practice', icon: '🌱', name: 'First Sitting', desc: 'Log your first sitting', points: 10,
      count: function (d) { return d.sessions > 0 ? 1 : 0; } },
    { id: 'target_met', category: 'consistency', icon: '✅', name: 'Daily Target Met', desc: 'Each day you reach your daily target', points: 5, repeat: true,
      count: function (d) { return d.metDays; } },
    { id: 'streak7', category: 'consistency', icon: '🔥', name: '7-Day Streak', desc: '7 days in a row meeting your target (again at 14, 28, 35…)', points: 25, repeat: true,
      count: function (d) { return d.runs.reduce(function (a, L) { return a + Math.floor(L / 7) - Math.floor(L / 21); }, 0); } },
    { id: 'streak21', category: 'consistency', icon: '🌿', name: '21-Day Streak', desc: '21 days in a row meeting your target (again every 21 days)', points: 50, repeat: true,
      count: function (d) { return d.runs.reduce(function (a, L) { return a + Math.floor(L / 21); }, 0); } },
    { id: 'challenge_p1', category: 'goals', icon: '🪷', name: 'Phase 1 Complete', desc: 'Reach day 21 of the 42-day challenge', points: 50, repeat: true, who: 'seeker',
      count: function (d) { return d.phase1Runs; } },
    { id: 'challenge_42', category: 'goals', icon: '🏆', name: '42-Day Challenge Complete', desc: 'Complete all 42 days', points: 100, repeat: true, who: 'seeker',
      count: function (d) { return d.challengesDone; } }
  ].concat(HOURS.map(function (h) {
    return { id: 'hours_' + h[0], category: 'goals', icon: '⏳', name: h[0].toLocaleString() + ' Hours', desc: 'Log ' + h[0].toLocaleString() + ' hours of meditation in the app', points: h[1],
      count: function (d) { return d.loggedHours >= h[0] ? 1 : 0; } };
  }));

  // Levels: initiates aim higher (thresholds × 2)
  var LEVELS = [['Seed', 0], ['Sprout', 100], ['Bud', 300], ['Bloom', 700], ['Lotus', 1500], ['Radiant Lotus', 3000]];
  function levelScale() { return MC.isInitiated && MC.isInitiated() ? 2 : 1; }

  /* ---------- Data summary used by the rules ---------- */
  function summary() {
    var days = MC.byDay(), t = MC.today(), todayKey = MC.toISO(t);
    var keys = Object.keys(days).sort();
    // Target per day: the challenge target when the day was in a challenge, otherwise the base target
    var challengeTargets = {}, phase1Runs = 0, challengesDone = 0;
    if (MC.challenge) {
      MC.challenge.all().forEach(function (c) {
        c.history.forEach(function (h) { challengeTargets[h.date] = h.target; });
        if (!c.ended && !c.done) challengeTargets[c.todayKey] = c.todayTarget;
        if (c.phase1On) phase1Runs++;
        if (c.done) challengesDone++;
      });
    }
    var base = baseTarget();
    var met = {};
    keys.forEach(function (k) {
      var target = challengeTargets[k] || base;
      if (days[k].minutes >= target) met[k] = true;
    });
    // Consecutive runs of met days (an unfinished today never breaks a run; it counts once met)
    var runs = [], run = 0, prev = null;
    Object.keys(met).sort().forEach(function (k) {
      var d = MC.parseDate(k);
      if (prev && MC.daysBetween(prev, d) === 1) run++; else { if (run) runs.push(run); run = 1; }
      prev = d;
    });
    if (run) runs.push(run);
    var loggedMin = 0; MC.sessions.all().forEach(function (s) { loggedMin += s.minutes; });
    return {
      sessions: MC.sessions.count(), metDays: Object.keys(met).length, runs: runs,
      loggedHours: loggedMin / 60, phase1Runs: phase1Runs, challengesDone: challengesDone, todayKey: todayKey
    };
  }
  function baseTarget() {
    var s = Number(MC.settings.dailyTarget); if (s > 0) return s;
    if (MC.isSeeker && MC.isSeeker()) return 15;
    var m = Number(MC.profile.minutes); return m > 0 ? m : 30;
  }

  function compute() {
    var d = summary(), total = 0, items = RULES.map(function (r) {
      var n = Math.max(0, r.count(d) || 0);
      if (!r.repeat) n = Math.min(1, n);
      total += n * r.points;
      return { rule: r, times: n, points: n * r.points };
    });
    var scale = levelScale(), lvl = 0;
    for (var i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i][1] * scale) lvl = i;
    var next = LEVELS[lvl + 1];
    return {
      total: total, items: items, summary: d,
      level: LEVELS[lvl][0], levelIndex: lvl, levelMin: LEVELS[lvl][1] * scale,
      nextLevel: next ? next[0] : null, nextAt: next ? next[1] * scale : null
    };
  }

  MC.rewards = {
    RULES: RULES, LEVELS: LEVELS, compute: compute,
    // Other modules register their own rules (e.g. calendar: "Scheduled Sitting Kept")
    addRule: function (rule) { if (!RULES.some(function (r) { return r.id === rule.id; })) RULES.push(rule); }
  };

  /* ---------- Celebrate newly earned rewards (per device) ---------- */
  var SEEN_KEY = 'meditation-copilot:rewards-seen';
  function checkNew() {
    var r = compute(), seen = MC.store.get(SEEN_KEY, null), now = {};
    r.items.forEach(function (it) { now[it.rule.id] = it.times; });
    if (seen) {
      var fresh = r.items.filter(function (it) { return it.times > (seen[it.rule.id] || 0); });
      if (fresh.length) {
        var gained = fresh.reduce(function (a, it) { return a + (it.times - (seen[it.rule.id] || 0)) * it.rule.points; }, 0);
        var top = fresh.sort(function (a, b) { return b.rule.points - a.rule.points; })[0].rule;
        MC.toast('🏆 +' + gained + ' points · ' + top.icon + ' ' + top.name + (fresh.length > 1 ? ' and more' : ''), 4500);
        fresh.forEach(function (it) { MC.track('reward', { id: it.rule.id }); });
      }
    }
    MC.store.set(SEEN_KEY, now);
  }
  MC.on('data', function () { setTimeout(checkNew, 300); });

  /* ---------- UI ---------- */
  MC.rewardsHomeLine = function () {
    var r = compute();
    var toNext = r.nextAt ? (r.nextAt - r.total) + ' to ' + r.nextLevel : 'Highest level';
    return '<a class="points-line" href="#insights?rewards"><span class="pl-ic" aria-hidden="true">🏆</span><b>' + r.total.toLocaleString() + '</b> points' +
      '<span class="pl-lvl">' + MC.esc(r.level) + '</span><span class="pl-next">' + MC.esc(toNext) + ' ›</span></a>';
  };

  MC.renderRewardsCard = function () {
    var el = $('rewardsCard'); if (!el) return;
    var r = compute(), seeker = MC.isSeeker && MC.isSeeker();
    var frac = r.nextAt ? (r.total - r.levelMin) / (r.nextAt - r.levelMin) : 1;
    var earned = r.items.filter(function (it) { return it.times > 0; });
    var locked = r.items.filter(function (it) {
      if (it.times > 0) return false;
      var who = it.rule.who || 'all';
      return who === 'all' || (who === 'seeker' && seeker) || (who === 'initiated' && !seeker);
    });
    var html = '<div class="section-title">Rewards <span class="small muted">' + MC.esc(r.level) + '</span></div>' +
      '<div class="rw-total"><b>' + r.total.toLocaleString() + '</b> points</div>' +
      '<div class="meter" style="margin:8px 0 4px"><div style="width:' + (frac * 100).toFixed(0) + '%"></div></div>' +
      '<div class="small muted">' + (r.nextAt ? (r.nextAt - r.total).toLocaleString() + ' points to ' + MC.esc(r.nextLevel) : 'You’ve reached the highest level 🙏') + '</div>';
    if (earned.length) {
      html += '<div class="rw-grid">' + earned.map(function (it) {
        return '<div class="rw earned" title="' + MC.esc(it.rule.desc) + '"><span class="rw-ic">' + it.rule.icon + '</span><b>' + MC.esc(it.rule.name) + '</b>' +
          '<small>' + (it.times > 1 ? '×' + it.times + ' · ' : '') + it.points.toLocaleString() + ' pts</small></div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="small" style="margin:12px 0 0">Your first sitting earns your first reward. 🌱</p>';
    }
    html += '<details class="rw-more"><summary>Ways to earn points</summary><div class="rw-grid">' + locked.map(function (it) {
      return '<div class="rw"><span class="rw-ic">' + it.rule.icon + '</span><b>' + MC.esc(it.rule.name) + '</b><small>' + MC.esc(it.rule.desc) + ' · ' + it.rule.points + ' pts</small></div>';
    }).join('') + '</div><p class="small muted" style="margin:10px 0 0">' +
      (MC.isInitiated && MC.isInitiated() ? 'As an initiate, each level asks for twice the points.' : 'Points are never taken away, even if a challenge restarts.') + '</p></details>';
    el.innerHTML = html;
  };

  // Initialise the "seen" list silently so existing data doesn't trigger a flood of toasts
  if (!MC.store.get(SEEN_KEY, null)) { try { checkNew(); } catch (e) {} }
})();
