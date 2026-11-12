/* Meditation Copilot — challenges (v0.13)
 *  Four kinds, one active per kind:
 *   - 42-Day Challenge (js/challenge.js; now open to everyone)
 *   - Hours: log N hours between two dates (7–365 days). Reaching the target ends it early with full points.
 *   - Amrit Vela: a sitting with at least 15 minutes between 4:00 and 7:00 am, every day for 7–365 days.
 *   - Weekly attendance: at least one SOS event check-in each Mon–Sun week, for 2–52 weeks.
 *  Misses: 1 allowed per 10 days (or weeks), rounded down. Points: Hours 5/target hour (max 500);
 *  Amrit Vela 5/day; Weekly 15/week. Fail = floor(points × done ÷ total ÷ 2). Drop = 0.
 *  Stored in the person's own synced data (MC.collection 'challenges'); the server holds nothing about them.
 */
(function () {
  var MC = window.MC, $ = MC.$;
  var col = MC.collection('challenges');
  var KINDS = {
    hours:  { icon: '⏳', name: 'Hours Challenge', unit: 'hours' },
    amrit:  { icon: '🌅', name: 'Amrit Vela Challenge', unit: 'days' },
    weekly: { icon: '🗓', name: 'Weekly Attendance Challenge', unit: 'weeks' }
  };
  var AMRIT_FROM = 4 * 60, AMRIT_TO = 7 * 60, AMRIT_MIN = 15;
  function allowance(n) { return Math.floor(n / 10); }
  function pointsFor(c) {
    if (c.type === 'hours') return Math.min(500, 5 * c.target);
    if (c.type === 'amrit') return 5 * c.days;
    return 15 * c.weeks;
  }
  function dayStart(key) { return MC.parseDate(key).getTime(); }
  function minutesInAmrit(s) {   // minutes of a sitting that fall between 4:00 and 7:00 local time on its own day
    var st = new Date(s.start), base = new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime();
    var a = Math.max(s.start, base + AMRIT_FROM * 60000), b = Math.min(s.start + s.minutes * 60000, base + AMRIT_TO * 60000);
    return Math.max(0, (b - a) / 60000);
  }
  function mondayOf(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var wd = (x.getDay() + 6) % 7; return MC.addDays(x, -wd); }

  /* ---------- evaluation ---------- */
  function evaluate(c) {
    var today = MC.today(), todayKey = MC.toISO(today), start = MC.parseDate(c.startOn), end = MC.parseDate(c.endOn);
    var out = { c: c, kind: KINDS[c.type], points: pointsFor(c), status: c.status, done: 0, total: 0, misses: 0, allow: 0, note: '', pct: 0, earned: 0 };
    if (c.status === 'dropped') { out.earned = 0; return finish(out); }
    if (today < start) { out.upcoming = true; out.total = c.type === 'hours' ? c.target : c.type === 'amrit' ? c.days : c.weeks; return finish(out); }
    var sessions = MC.sessions.all();
    if (c.type === 'hours') {
      var from = start.getTime(), to = MC.addDays(end, 1).getTime(), min = 0;
      sessions.forEach(function (s) { if (s.start >= from && s.start < to) min += s.minutes; });
      out.done = Math.round(min / 60 * 10) / 10; out.total = c.target;
      if (min / 60 >= c.target) out.status = 'done';
      else if (today > end) out.status = 'failed';
      out.note = out.done + ' of ' + c.target + ' h' + (out.status === 'active' ? ' · ' + Math.max(0, MC.daysBetween(today, end) + 1) + ' days left' : '');
    } else if (c.type === 'amrit') {
      out.total = c.days; out.allow = allowance(c.days);
      var keptDays = {};
      sessions.forEach(function (s) { if (minutesInAmrit(s) >= AMRIT_MIN) keptDays[MC.dayKey(s.start)] = true; });
      var kept = 0, misses = 0, last = today < end ? today : end;
      for (var d = new Date(start); d <= last; d = MC.addDays(d, 1)) {
        var k = MC.toISO(d);
        if (keptDays[k]) kept++;
        else if (k !== todayKey) misses++;          // today isn't a miss until it's over
      }
      out.done = kept; out.misses = misses;
      if (misses > out.allow) out.status = 'failed';
      else if (today > end) out.status = 'done';
      out.note = kept + ' of ' + c.days + ' mornings · ' + misses + ' of ' + out.allow + ' misses used';
    } else {
      out.total = c.weeks; out.allow = allowance(c.weeks);
      var cks = (MC.events && MC.events.hostedCheckins ? MC.events.hostedCheckins() : []).map(function (x) { return x.checkedInAt || x.checked_in_at; }).filter(Boolean);
      var keptW = 0, missesW = 0, thisMon = mondayOf(today).getTime();
      for (var w = 0; w < c.weeks; w++) {
        var ws = MC.addDays(start, 7 * w).getTime(), we = ws + 7 * 86400000;
        if (ws > today.getTime()) break;
        var hit = cks.some(function (t) { return t >= ws && t < we; });
        if (hit) keptW++; else if (ws !== thisMon) missesW++;   // the current week isn't a miss until Sunday is over
      }
      out.done = keptW; out.misses = missesW;
      if (missesW > out.allow) out.status = 'failed';
      else if (today > end) out.status = 'done';
      out.note = keptW + ' of ' + c.weeks + ' weeks · ' + missesW + ' of ' + out.allow + ' misses used';
    }
    return finish(out);
  }
  function finish(out) {
    var c = out.c;
    out.pct = out.total ? Math.min(100, Math.round(out.done / out.total * 100)) : 0;
    if (out.status === 'done') out.earned = out.points;
    else if (out.status === 'failed') out.earned = Math.floor(out.points * (out.total ? out.done / out.total : 0) / 2);
    else out.earned = 0;
    // Freeze the outcome once reached, so later edits don't reopen it
    if (out.status !== c.status && (out.status === 'done' || out.status === 'failed')) {
      col.update(c.id, { status: out.status, endedOn: MC.toISO(MC.today()), earned: out.earned, finalDone: out.done });
      if (out.status === 'done') MC.toast('🏆 Challenge complete: ' + out.kind.name + ' · +' + out.earned + ' points');
      else MC.toast(out.kind.name + ' didn’t work out this time · +' + out.earned + ' points for what you kept. Try again when ready 🙏');
      MC.track('challenge_' + out.status, { type: c.type });
    }
    if ((c.status === 'done' || c.status === 'failed') && c.earned !== undefined) { out.earned = c.earned; out.done = c.finalDone !== undefined ? c.finalDone : out.done; out.status = c.status; }
    return out;
  }
  function all() { return col.all().map(evaluate); }
  function active(type) { return col.all().filter(function (c) { return c.status === 'active' && (!type || c.type === type); }); }

  /* ---------- rewards ---------- */
  function earnedFor(type) { var t = 0; all().forEach(function (o) { if (o.c.type === type) t += o.earned; }); return t; }
  function countFor(type) { return col.all().filter(function (c) { return c.type === type && (c.status === 'done' || c.status === 'failed'); }).length; }
  if (MC.rewards && MC.rewards.addRule) {
    MC.rewards.addRule({ id: 'ch_hours', category: 'goals', icon: '⏳', name: 'Hours Challenge', desc: '5 points per target hour (max 500); half of prorated if it fails', points: 0, repeat: true,
      count: function () { return countFor('hours'); }, total: function () { return earnedFor('hours'); } });
    MC.rewards.addRule({ id: 'ch_amrit', category: 'goals', icon: '🌅', name: 'Amrit Vela Challenge', desc: '5 points per day; half of prorated if it fails', points: 0, repeat: true,
      count: function () { return countFor('amrit'); }, total: function () { return earnedFor('amrit'); } });
    MC.rewards.addRule({ id: 'ch_weekly', category: 'goals', icon: '🗓', name: 'Weekly Attendance Challenge', desc: '15 points per week; half of prorated if it fails', points: 0, repeat: true,
      count: function () { return countFor('weekly'); }, total: function () { return earnedFor('weekly'); } });
  }

  /* ---------- Roadmap card ---------- */
  function fmtRange(c) { return MC.fmtDate(MC.parseDate(c.startOn), { month: 'short', day: 'numeric' }) + ' – ' + MC.fmtDate(MC.parseDate(c.endOn), { month: 'short', day: 'numeric', year: 'numeric' }); }
  function goalHTML(o) {
    var c = o.c, cls = o.status === 'done' ? ' ok' : o.status === 'failed' ? ' bad' : '';
    var label = o.status === 'active' ? (o.upcoming ? 'Starts ' + MC.fmtDate(MC.parseDate(c.startOn), { month: 'short', day: 'numeric' }) : o.pct + '%') :
      o.status === 'done' ? '✓ Completed · +' + o.earned : o.status === 'failed' ? 'Not completed · +' + o.earned : 'Dropped';
    return '<div class="goal' + (o.status !== 'active' ? ' goal-done' : '') + '"><div class="goal-head"><b>' + o.kind.icon + ' ' + MC.esc(o.kind.name) + '</b><span class="small">' + MC.esc(label) + '</span></div>' +
      '<div class="goal-meta">' + MC.esc(fmtRange(c)) + (c.type === 'hours' ? ' · ' + c.target + ' hours' : '') + ' · ' + o.points + ' points</div>' +
      (o.status === 'active' && !o.upcoming ? '<div class="bar"><div class="fill' + cls + '" style="width:' + o.pct + '%"></div></div><div class="goal-foot"><span>' + MC.esc(o.note) + '</span><button class="link small" data-drop="' + MC.esc(c.id) + '" style="padding:0">Drop</button></div>'
        : o.status === 'active' ? '<div class="goal-foot"><span></span><button class="link small" data-drop="' + MC.esc(c.id) + '" style="padding:0">Cancel</button></div>' : '') + '</div>';
  }
  function render() {
    if (MC.current !== 'roadmap') return;
    var screen = document.querySelector('#v-roadmap .screen.active');
    if (!screen || (screen.id !== 's-challenge' && screen.id !== 's-results')) { var old = $('goalsCard'); if (old) old.remove(); return; }
    var card = $('goalsCard');
    if (!card || card.parentNode !== screen) { if (card) card.remove(); card = document.createElement('div'); card.className = 'card'; card.id = 'goalsCard'; screen.appendChild(card); }
    var list = all(), act = list.filter(function (o) { return o.status === 'active'; }), past = list.filter(function (o) { return o.status !== 'active'; }).sort(function (a, b) { return (b.c.endedOn || '').localeCompare(a.c.endedOn || ''); });
    var seeker = MC.isSeeker && MC.isSeeker(), c42 = MC.challenge && MC.challenge.current();
    var html = '<div class="section-title">Challenges <button class="btn btn-soft btn-sm" id="goalNew" style="flex:0 0 auto">+ Start a challenge</button></div>' +
      '<p class="small" style="margin:-6px 0 10px">Set yourself a goal with a start and an end. One of each kind at a time; drop out any time (no points), or earn half of the prorated points if it doesn’t work out.</p>';
    if (!seeker && c42 && !c42.ended) html += '<div class="goal"><div class="goal-head"><b>🌱 42-Day Challenge</b><span class="small">Day ' + c42.count + ' of 42</span></div><div class="goal-meta">Today’s target ' + c42.todayTarget + ' min</div><div class="bar"><div class="fill" style="width:' + Math.round(c42.count / 42 * 100) + '%"></div></div></div>';
    html += act.map(goalHTML).join('');
    if (!act.length && !(c42 && !c42.ended)) html += '<p class="small muted">No active challenge. Tap <b>Start a challenge</b> to begin.</p>';
    if (past.length) html += '<details style="margin-top:10px"><summary class="small">Past challenges (' + past.length + ')</summary>' + past.slice(0, 20).map(goalHTML).join('') + '</details>';
    card.innerHTML = html;
    $('goalNew').addEventListener('click', openNew);
    card.querySelectorAll('[data-drop]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = col.get(b.dataset.drop); if (!c) return;
        if (!window.confirm('Drop this challenge? You won’t earn points for it, and you can start a new one any time.')) return;
        col.update(c.id, { status: 'dropped', endedOn: MC.toISO(MC.today()) }); MC.track('challenge_drop', { type: c.type }); MC.emit('data'); render();
      });
    });
  }

  /* ---------- start sheet ---------- */
  var dlg = $('goalDlg'), kind = 'hours';
  function openNew() {
    var seeker = MC.isSeeker && MC.isSeeker(), c42 = MC.challenge && MC.challenge.current(), can42 = !seeker && !(c42 && !c42.ended);
    $('gt42').hidden = !can42;
    kind = 'hours'; selectKind();
    $('gStart').value = MC.toISO(MC.today()); $('gStart').min = MC.toISO(MC.today()); $('gStart').max = MC.toISO(MC.addDays(MC.today(), 30));
    $('gHours').value = 10; $('gDays').value = 30; $('gWeeks').value = 8; $('gEnd').value = MC.toISO(MC.addDays(MC.today(), 29)); $('gErr').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    summarize();
  }
  function selectKind() {
    document.querySelectorAll('#gTypes button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === kind); });
    $('gfHours').hidden = kind !== 'hours'; $('gfDays').hidden = kind !== 'amrit'; $('gfWeeks').hidden = kind !== 'weekly'; $('gfStart').hidden = kind === '42';
    $('gfEnd').hidden = kind !== 'hours';
    var a = active(kind === '42' ? '' : kind);
    $('gErr').textContent = kind !== '42' && a.length ? 'You already have an active ' + KINDS[kind].name + '. Finish or drop it first.' : '';
  }
  function draft() {
    var start = MC.parseDate($('gStart').value), c = { type: kind, startOn: MC.toISO(start), status: 'active' };
    if (kind === 'hours') { c.target = Math.round(Number($('gHours').value)); var end = MC.parseDate($('gEnd').value); c.endOn = MC.toISO(end); c.days = MC.daysBetween(start, end) + 1; }
    else if (kind === 'amrit') { c.days = Math.round(Number($('gDays').value)); c.endOn = MC.toISO(MC.addDays(start, c.days - 1)); }
    else if (kind === 'weekly') { var mon = mondayOf(start); if (mon < MC.today()) mon = MC.addDays(mon, 7); c.startOn = MC.toISO(mon); c.weeks = Math.round(Number($('gWeeks').value)); c.endOn = MC.toISO(MC.addDays(mon, 7 * c.weeks - 1)); }
    return c;
  }
  function validate(c) {
    if (kind === '42') return '';
    if (!c.startOn || c.startOn < MC.toISO(MC.today())) return 'The start date can’t be in the past.';
    if (kind === 'hours') { if (!(c.target >= 1 && c.target <= 2000)) return 'Choose between 1 and 2,000 hours.'; if (!(c.days >= 7 && c.days <= 365)) return 'The timeframe must be 7 to 365 days.'; }
    if (kind === 'amrit' && !(c.days >= 7 && c.days <= 365)) return 'Choose between 7 and 365 days.';
    if (kind === 'weekly') { if (!(c.weeks >= 2 && c.weeks <= 52)) return 'Choose between 2 and 52 weeks.'; if (!(MC.events && MC.events.signedInMode && MC.events.signedInMode())) return 'Sign in with Google or Microsoft first: this challenge counts your SOS event check-ins.'; }
    if (active(kind).length) return 'You already have an active ' + KINDS[kind].name + '.';
    return '';
  }
  function summarize() {
    var c = draft(), s = $('gSum');
    if (kind === '42') { s.textContent = '42 days: 15 min a day for 21 days, then building to 30 min. 50 points at day 21, 100 at day 42.'; return; }
    var e = validate(c); if (e) { s.textContent = ''; return; }
    var pts = pointsFor(c), allow = kind === 'amrit' ? allowance(c.days) : kind === 'weekly' ? allowance(c.weeks) : null;
    s.textContent = (kind === 'hours' ? c.target + ' hours between ' + fmtRange(c) + ' (' + c.days + ' days).' :
      kind === 'amrit' ? c.days + ' mornings, ' + fmtRange(c) + '. At least 15 minutes between 4:00 and 7:00 am each day.' :
      c.weeks + ' weeks starting Monday ' + MC.fmtDate(MC.parseDate(c.startOn), { month: 'short', day: 'numeric' }) + '. At least one SOS event check-in each week.') +
      ' Worth ' + pts + ' points.' + (allow !== null ? ' Up to ' + allow + ' miss' + (allow === 1 ? '' : 'es') + ' allowed.' : '') + ' Once started it can’t be changed.';
  }
  $('gTypes').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; selectKind(); summarize(); });
  ['gStart', 'gEnd', 'gHours', 'gDays', 'gWeeks'].forEach(function (id) { $(id).addEventListener('input', summarize); $(id).addEventListener('change', summarize); });
  $('gCancel').addEventListener('click', function () { dlg.close(); });
  $('gForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (kind === '42') { MC.challenge.start(); dlg.close(); MC.toast('Day 1 of your 42-day challenge begins today 🌱'); render(); return; }
    var c = draft(), err = validate(c);
    if (err) { $('gErr').textContent = err; return; }
    col.add(c); MC.track('challenge_start2', { type: c.type });
    dlg.close(); MC.toast(KINDS[c.type].icon + ' Challenge started. You’ve got this!'); MC.emit('data'); render();
  });

  MC.goals = { all: all, evaluate: evaluate, pointsFor: pointsFor, allowance: allowance, minutesInAmrit: minutesInAmrit, render: render };
  MC.on('view', function (n) { if (n === 'roadmap') setTimeout(render, 0); });
  MC.on('data', function () { if (MC.current === 'roadmap') setTimeout(render, 0); });
  MC.on('profile', function () { if (MC.current === 'roadmap') setTimeout(render, 0); });
})();
