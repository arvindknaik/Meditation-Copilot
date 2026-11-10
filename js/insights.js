/* Meditation Copilot — Insights: totals, chart, patterns, session log, export/backup */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var range = 'days', pageSize = 10, shown = 10;

  function tile(k, v, sub, cls) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v +
      (sub ? ' <small>' + sub + '</small>' : '') + '</div></div>';
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- Summary tiles ---------- */
  function renderSummary() {
    var t = MC.today(), tomorrow = MC.addDays(t, 1);
    var today = MC.sumRange(t, tomorrow);
    var week = MC.sumRange(MC.weekStart(t), tomorrow);
    var month = MC.sumRange(new Date(t.getFullYear(), t.getMonth(), 1), tomorrow);
    var all = MC.sumRange(new Date(0), new Date(8.64e15));
    $('sumTiles').innerHTML =
      tile('Today', MC.fmtDur(today.minutes), plural(today.count, 'sitting')) +
      tile('This week', MC.fmtDur(week.minutes), plural(week.count, 'sitting')) +
      tile('This month', MC.fmtDur(month.minutes), plural(month.count, 'sitting')) +
      tile('All logged', MC.fmtDur(all.minutes), MC.fmtDur(all.eff) + ' effective', 'hl');
  }

  /* ---------- Patterns (last 30 days) ---------- */
  function renderPatterns() {
    var t = MC.today(), from = MC.addDays(t, -29), tomorrow = MC.addDays(t, 1);
    var r = MC.sumRange(from, tomorrow), st = MC.streaks(), days = MC.byDay();
    var practiced = 0;
    for (var i = 0; i < 30; i++) if (days[MC.toISO(MC.addDays(from, i))]) practiced++;
    var buckets = { 'Early morning': 0, 'Morning': 0, 'Afternoon': 0, 'Evening': 0, 'Night': 0 };
    MC.sessions.all().forEach(function (s) {
      if (s.start < from.getTime()) return;
      var h = new Date(s.start).getHours();
      var b = h >= 3 && h < 6 ? 'Early morning' : h >= 6 && h < 12 ? 'Morning' : h >= 12 && h < 17 ? 'Afternoon' : h >= 17 && h < 21 ? 'Evening' : 'Night';
      buckets[b] += s.minutes;
    });
    var best = Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; })[0];
    $('patternTiles').innerHTML =
      tile('Current streak', st.current + ' 🔥', st.current === 1 ? 'day' : 'days') +
      tile('Longest streak', st.longest, st.longest === 1 ? 'day' : 'days') +
      tile('Consistency', Math.round(practiced / 30 * 100) + '%', practiced + ' of 30 days') +
      tile('Avg quality', r.avgQuality != null ? Math.round(r.avgQuality) + '%' : '—', r.avgQuality != null ? MC.qualityLabel(r.avgQuality) : '') +
      tile('Avg sitting', r.count ? MC.fmtDur(r.minutes / r.count) : '—') +
      tile('Best time', r.count ? best : '—');
  }

  /* ---------- Chart ---------- */
  function niceMax(v) {
    var steps = [15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3000, 4200, 6000, 9000, 12000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 600) * 600;
  }
  function axisLabel(v) { return v >= 120 ? (Math.round(v / 6) / 10) + 'h' : Math.round(v) + 'm'; }

  function chartData() {
    var t = MC.today(), days = MC.byDay(), out = [];
    if (range === 'days') {
      for (var i = 13; i >= 0; i--) {
        var d = MC.addDays(t, -i), k = MC.toISO(d), v = days[k] || { minutes: 0, eff: 0, count: 0 };
        out.push({
          label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
          title: MC.fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' }),
          minutes: v.minutes, eff: v.eff, count: v.count, today: i === 0
        });
      }
      return { bars: out, target: MC.dailyTarget(), title: 'Daily minutes' };
    }
    if (range === 'all') return allTimeData(t);
    var ws = MC.weekStart(t);
    for (var w = 11; w >= 0; w--) {
      var s = MC.addDays(ws, -7 * w), r = MC.sumRange(s, MC.addDays(s, 7));
      out.push({
        label: (w % 3 === 0) ? s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
        title: 'Week of ' + MC.fmtDate(s, { month: 'short', day: 'numeric' }),
        minutes: r.minutes, eff: r.eff, count: r.count, today: w === 0
      });
    }
    return { bars: out, target: MC.dailyTarget() * 7, title: 'Weekly minutes' };
  }

  // All time: one bar per month since your first logged sitting (per year once it spans more than 2 years)
  function allTimeData(t) {
    var list = MC.sessions.all(), out = [];
    var first = list.length ? new Date(list[list.length - 1].start) : t;
    var months = (t.getFullYear() - first.getFullYear()) * 12 + (t.getMonth() - first.getMonth()) + 1;
    if (months > 24) {
      for (var y = first.getFullYear(); y <= t.getFullYear(); y++) {
        var r = MC.sumRange(new Date(y, 0, 1), new Date(y + 1, 0, 1));
        out.push({ label: String(y), title: String(y), minutes: r.minutes, eff: r.eff, count: r.count, today: y === t.getFullYear() });
      }
      return { bars: out, target: MC.dailyTarget() * 365, title: 'Yearly minutes' };
    }
    months = Math.max(months, 6);                 // always show at least 6 months for context
    var every = Math.ceil(months / 6);
    for (var i = months - 1; i >= 0; i--) {
      var s = new Date(t.getFullYear(), t.getMonth() - i, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      var rr = MC.sumRange(s, e), idx = months - 1 - i;
      var showYear = s.getMonth() === 0 || idx === 0;
      out.push({
        label: (i % every === 0) ? s.toLocaleDateString(undefined, showYear ? { month: 'short', year: '2-digit' } : { month: 'short' }) : '',
        title: s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        minutes: rr.minutes, eff: rr.eff, count: rr.count, today: i === 0
      });
    }
    return { bars: out, target: MC.dailyTarget() * 30.4, title: 'Monthly minutes' };
  }

  function renderChart() {
    var data = chartData(), bars = data.bars;
    $('chartTitle').textContent = data.title;
    var W = 340, H = 190, L = 34, R = 6, T = 12, B = 22;
    var pw = W - L - R, ph = H - T - B;
    var maxV = niceMax(Math.max(data.target * 1.1, Math.max.apply(null, bars.map(function (b) { return b.minutes; })), 1));
    var band = pw / bars.length, bw = Math.max(4, Math.min(18, band * 0.62));
    var y = function (v) { return T + ph - (v / maxV) * ph; };

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + MC.esc(data.title) + '">';
    svg += '<g class="grid">';
    [0, 0.5, 1].forEach(function (f) { svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(maxV * f) + '" y2="' + y(maxV * f) + '"/>'; });
    svg += '</g><g class="axis">';
    [0, 0.5, 1].forEach(function (f) { svg += '<text x="' + (L - 6) + '" y="' + (y(maxV * f) + 3) + '" text-anchor="end">' + axisLabel(maxV * f) + '</text>'; });
    bars.forEach(function (b, i) {
      if (b.label) svg += '<text x="' + (L + band * i + band / 2) + '" y="' + (H - 6) + '" text-anchor="middle"' + (b.today ? ' class="today"' : '') + '>' + MC.esc(b.label) + '</text>';
    });
    svg += '</g>';
    bars.forEach(function (b, i) {
      var x = L + band * i + (band - bw) / 2;
      svg += '<rect class="hit" data-i="' + i + '" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + ph + '"/>';
      if (b.minutes > 0) {
        var top = y(b.minutes), h = T + ph - top, r = Math.min(4, h, bw / 2);
        svg += '<path class="bar" data-i="' + i + '" d="M' + x + ',' + (T + ph) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (T + ph) + 'Z"/>';
      }
    });
    var ty = y(data.target);
    svg += '<line class="target" x1="' + L + '" x2="' + (W - R) + '" y1="' + ty + '" y2="' + ty + '"/>';
    svg += '<text class="target-label" x="' + (W - R) + '" y="' + (ty - 4) + '" text-anchor="end">Target ' + axisLabel(data.target) + '</text>';
    svg += '</svg><div class="tip" id="chartTip" hidden></div>';
    $('chartWrap').innerHTML = svg;

    var wrap = $('chartWrap'), tip = $('chartTip'), svgEl = wrap.querySelector('svg');
    function showTip(i) {
      var b = bars[i], box = svgEl.getBoundingClientRect(), scale = box.width / W;
      tip.innerHTML = '<b>' + MC.esc(b.title) + '</b>' + (b.count
        ? MC.fmtDur(b.minutes) + ' · ' + MC.fmtDur(b.eff) + ' effective<br>' + plural(b.count, 'sitting')
        : 'No sittings logged');
      var cx = (L + band * i + band / 2) * scale;
      tip.style.left = Math.max(64, Math.min(box.width - 64, cx)) + 'px';
      tip.style.top = (y(Math.max(b.minutes, 0)) * scale - 8) + 'px';
      tip.hidden = false;
      wrap.querySelectorAll('.bar').forEach(function (el) { el.classList.toggle('hover', Number(el.dataset.i) === i); });
    }
    function hideTip() { tip.hidden = true; wrap.querySelectorAll('.bar.hover').forEach(function (el) { el.classList.remove('hover'); }); }
    wrap.querySelectorAll('.hit').forEach(function (h) {
      var i = Number(h.dataset.i);
      h.addEventListener('pointerenter', function () { showTip(i); });
      h.addEventListener('click', function (e) { e.stopPropagation(); showTip(i); });
    });
    svgEl.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    hideCurrentTip = hideTip;
  }
  var hideCurrentTip = null;
  document.addEventListener('click', function (e) {
    if (hideCurrentTip && !$('chartWrap').contains(e.target)) hideCurrentTip();
  });
  document.querySelectorAll('#v-insights .seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      range = b.dataset.range;
      document.querySelectorAll('#v-insights .seg button').forEach(function (x) {
        var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderChart();
    });
  });

  /* ---------- Session log ---------- */
  function renderLog() {
    var list = MC.sessions.all();
    if (!list.length) {
      $('logList').innerHTML = '<div class="empty">No sittings yet.<br><a class="link" href="#timer">Start your first sitting</a></div>';
      $('moreBtn').hidden = true; return;
    }
    var html = '', lastDay = null;
    list.slice(0, shown).forEach(function (s) {
      var day = MC.relDay(s.start);
      if (day !== lastDay) { html += '<div class="log-day">' + MC.esc(day) + '</div>'; lastDay = day; }
      html += '<button class="log-item" data-id="' + MC.esc(s.id) + '">' +
        '<span class="t">' + MC.esc(MC.fmtTime(s.start)) + '</span>' +
        '<span style="min-width:0"><span class="m">' + MC.fmtDur(s.minutes) + '</span>' +
        (s.note ? '<span class="n">' + MC.esc(s.note) + '</span>' : '') + '</span>' +
        '<span class="q">' + Math.round(s.quality) + '% · ' + MC.fmtDur(MC.effMin(s)) + ' eff</span></button>';
    });
    $('logList').innerHTML = html;
    $('moreBtn').hidden = list.length <= shown;
  }
  $('logList').addEventListener('click', function (e) {
    var b = e.target.closest('.log-item'); if (!b) return;
    MC.openSession({ mode: 'edit', id: b.dataset.id });
  });
  $('moreBtn').addEventListener('click', function () { shown += pageSize; renderLog(); });
  $('addSessionBtn').addEventListener('click', function () { MC.openSession({ mode: 'manual', minutes: MC.dailyTarget() }); });

  /* ---------- Export / backup / restore ---------- */
  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  MC.exportCSV = function () {
    if (!MC.sessions.count()) { MC.toast('No sittings to export yet.'); return; }
    download('meditation-sessions-' + MC.toISO(MC.today()) + '.csv', MC.sessionsToCSV(), 'text/csv;charset=utf-8');
    if (MC.account) MC.account.noteExport();
    MC.track('csv_export', { count: MC.sessions.count() });
    MC.toast('Exported ' + MC.sessions.count() + ' sittings.');
  };
  $('csvBtn').addEventListener('click', MC.exportCSV);

  function showImport(title, html) {
    $('imTitle').textContent = title; $('imBody').innerHTML = html;
    var d = $('importDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function fmtRow(s) {
    return MC.esc(MC.fmtDate(new Date(s.start), { year: 'numeric', month: 'short', day: 'numeric' }) + ', ' + MC.fmtTime(s.start)) + ' · ' + MC.fmtDur(s.minutes);
  }
  $('importBtn').addEventListener('click', function () { $('importFile').value = ''; $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = $('importFile').files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { showImport('Import rejected', '<p>The file is larger than 5 MB.</p>'); return; }
    var reader = new FileReader();
    reader.onerror = function () { showImport('Import rejected', '<p>The file could not be read.</p>'); };
    reader.onload = function () {
      var res = MC.parseSessionsCSV(reader.result);
      if (res.errors) {
        MC.track('csv_import_rejected', { problems: res.errors.length });
        var shown = res.errors.slice(0, 12);
        showImport('Import rejected',
          '<p class="small">Nothing was imported. Please fix ' + (res.errors.length === 1 ? 'this problem' : 'these ' + res.errors.length + ' problems') + ' and try again:</p>' +
          '<ul class="small" style="padding-left:18px;color:var(--danger);white-space:pre-wrap">' + shown.map(function (e) { return '<li>' + MC.esc(e) + '</li>'; }).join('') + '</ul>' +
          (res.errors.length > shown.length ? '<p class="small muted">…and ' + (res.errors.length - shown.length) + ' more.</p>' : '') +
          '<p class="small muted">Tip: use a file exported from this app. If you edit it in Excel, keep dates as YYYY-MM-DD and times as HH:MM, and save as CSV UTF-8.</p>');
        return;
      }
      var add = [], conflicts = [];
      res.sessions.forEach(function (s) {
        var hit = MC.findOverlap(s.start, s.minutes);
        if (hit) conflicts.push({ s: s, hit: hit }); else add.push({ start: s.start, minutes: s.minutes, quality: s.quality, note: s.note, source: s.source });
      });
      if (add.length) MC.addSessionsBulk(add);
      MC.track('csv_import', { added: add.length, skipped: conflicts.length });
      var html = '<p><b>' + add.length + '</b> sitting' + (add.length === 1 ? '' : 's') + ' imported.' +
        (conflicts.length ? ' <b>' + conflicts.length + '</b> skipped because ' + (conflicts.length === 1 ? 'it overlaps a sitting' : 'they overlap sittings') + ' already on this device:' : '') + '</p>';
      if (conflicts.length) {
        html += '<ul class="small" style="padding-left:18px">' + conflicts.slice(0, 30).map(function (c) {
          return '<li>Row ' + c.s.row + ': ' + fmtRow(c.s) + ' <span class="muted">(overlaps ' + fmtRow(c.hit) + ')</span></li>';
        }).join('') + '</ul>' + (conflicts.length > 30 ? '<p class="small muted">…and ' + (conflicts.length - 30) + ' more.</p>' : '');
        html += '<p class="small muted">Your existing sittings were kept unchanged.</p>';
      }
      showImport(add.length ? 'Import complete' : 'Nothing new to import', html);
    };
    reader.readAsText(f);
  });

  function renderAll() { renderSummary(); renderChart(); MC.renderRewardsCard(); renderPatterns(); renderLog(); }
  MC.views.insights = { show: function () {
    shown = pageSize; renderAll();
    if (/rewards/.test(location.hash)) setTimeout(function () { $('rewardsCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  } };
  MC.on('data', function () { if (MC.current === 'insights') renderAll(); });
})();
