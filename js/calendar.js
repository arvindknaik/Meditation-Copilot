/* Meditation Copilot — Calendar: personal meditation schedule (Part 1)
 *  - Sitting times: { id, title, time 'HH:MM', minutes, days [0..6] (0 = Sunday), remind (-1 none | minutes before), enabled }
 *    stored in the synced collection 'schedule' (several per day allowed)
 *  - "Kept": a sitting STARTS between 30 min before and 60 min after the scheduled time;
 *    each logged sitting can satisfy only one scheduled time
 *  - Month view shaded by practice, day agenda, Today "next sitting", in-app reminders,
 *    and .ics export (weekly repeats + alarms) for the phone's own calendar
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var schedule = MC.collection('schedule');
  var BEFORE = 30 * 60000, AFTER = 60 * 60000;
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  MC.schedule = schedule;

  function active() { return schedule.all().filter(function (x) { return x.enabled !== false; }); }
  function fmtClockTime(hm) { var p = hm.split(':').map(Number); return new Date(2000, 0, 1, p[0], p[1]).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function daysLabel(days) {
    var d = (days || []).slice().sort();
    if (d.length === 7) return 'Every day';
    if (d.join() === '1,2,3,4,5') return 'Weekdays';
    if (d.join() === '0,6') return 'Weekends';
    return d.map(function (i) { return DAY_NAMES[i]; }).join(', ');
  }

  /* ---------- Occurrences & "kept" status ---------- */
  function occurrences(from, to) {          // Date range, inclusive by day
    var list = active(), out = [];
    for (var d = MC.startOfDay(from); d <= to; d = MC.addDays(d, 1)) {
      var wd = d.getDay();
      list.forEach(function (it) {
        if ((it.days || []).indexOf(wd) < 0) return;
        if (MC.startOfDay(it.createdAt || 0) > d) return;          // only from the day it was created
        var hm = it.time.split(':').map(Number);
        out.push({ item: it, date: MC.toISO(d), at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0], hm[1]).getTime() });
      });
    }
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  // Match sittings to scheduled times (greedy, earliest first) and give each a status
  function evaluate(occs) {
    if (!occs.length) return occs;
    var from = occs[0].at - BEFORE, to = occs[occs.length - 1].at + AFTER, now = Date.now();
    var sess = MC.sessions.all().filter(function (s) { return s.start >= from && s.start <= to; }).sort(function (a, b) { return a.start - b.start; });
    var used = {};
    occs.forEach(function (o) {
      var hit = null;
      for (var i = 0; i < sess.length; i++) {
        var s = sess[i];
        if (!used[s.id] && s.start >= o.at - BEFORE && s.start <= o.at + AFTER) { hit = s; break; }
      }
      if (hit) { used[hit.id] = true; o.session = hit; o.status = 'kept'; }
      else if (now > o.at + AFTER) o.status = 'missed';
      else if (now >= o.at - BEFORE) o.status = 'now';
      else o.status = 'upcoming';
    });
    occs.used = used;
    return occs;
  }
  MC.scheduleKeptCount = function () {
    var list = active(); if (!list.length) return 0;
    var first = Math.min.apply(null, list.map(function (x) { return x.createdAt || Date.now(); }));
    return evaluate(occurrences(new Date(first), MC.today())).filter(function (o) { return o.status === 'kept'; }).length;
  };
  MC.dayAgenda = function (date) { return evaluate(occurrences(date, date)); };

  // Next scheduled sitting (now or later), looking up to a week ahead
  function nextOcc() {
    var occs = evaluate(occurrences(MC.today(), MC.addDays(MC.today(), 7)));
    return occs.filter(function (o) { return o.status === 'now' || o.status === 'upcoming'; })[0] || null;
  }

  /* ---------- Start the Timer from a scheduled sitting ---------- */
  MC.startPreset = function (minutes) {
    MC.saveSettings({ preset: Number(minutes) });
    var chip = document.querySelector('#presetChips .chip[data-p="' + minutes + '"]');
    $('customMin').value = chip ? '' : minutes;
    MC.go('timer');
  };

  /* ---------- Today screen line ---------- */
  MC.nextSittingHTML = function () {
    var o = nextOcc();
    if (!o) return active().length ? '' : '<a class="next-sit muted" href="#calendar">⏰ Set your daily sitting times ›</a>';
    var when = o.date === MC.toISO(MC.today()) ? 'Today' : MC.relDay(o.at);
    var label = MC.esc(o.item.title || 'Meditation') + ' · ' + MC.esc(when) + ' ' + MC.esc(fmtClockTime(o.item.time)) + ' · ' + o.item.minutes + ' min';
    if (o.status === 'now') {
      return '<div class="next-sit now"><span>⏰ <b>Now:</b> ' + label + '</span><button class="btn btn-gold btn-sm" data-start="' + o.item.minutes + '">Start</button></div>';
    }
    return '<a class="next-sit" href="#calendar">⏰ <span><b>Next:</b> ' + label + '</span></a>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-start]'); if (!b) return;
    MC.startPreset(Number(b.dataset.start));
  });

  /* ---------- Calendar view ---------- */
  var viewMonth = null, selected = null;
  function render() {
    var t = MC.today();
    if (!viewMonth) viewMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    if (!selected) selected = t;
    renderMonth(); renderAgenda(); renderSchedule();
    if (MC.renderEventsCard) MC.renderEventsCard();
  }
  function renderMonth() {
    var t = MC.today(), days = MC.byDay(), target = MC.dailyTarget();
    var first = viewMonth, startPad = (first.getDay() + 6) % 7;     // Monday first
    var dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var html = '<div class="cal-head"><button class="icon-btn cal-nav" id="calPrev" aria-label="Previous month">‹</button>' +
      '<b>' + first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</b>' +
      '<button class="icon-btn cal-nav" id="calNext" aria-label="Next month">›</button></div>' +
      '<div class="cal-grid" role="grid">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d) { return '<span class="cal-wd">' + d + '</span>'; }).join('');
    for (var i = 0; i < startPad; i++) html += '<span></span>';
    for (var dnum = 1; dnum <= dim; dnum++) {
      var d = new Date(first.getFullYear(), first.getMonth(), dnum), k = MC.toISO(d), v = days[k];
      var tgt = (MC.challenge && MC.challenge.targetOn(k)) || target;
      var hasEv = MC.eventsOn && MC.eventsOn(k).length;
      var cls = 'cal-day' + (v ? (v.minutes >= tgt ? ' met' : ' some') : '') + (k === MC.toISO(t) ? ' today' : '') + (k === MC.toISO(selected) ? ' sel' : '') + (d > t ? ' future' : '') + (hasEv ? ' ev' : '');
      html += '<button class="' + cls + '" data-day="' + k + '" aria-label="' + MC.esc(MC.fmtDate(d)) + (v ? ', ' + Math.round(v.minutes) + ' minutes' : '') + '">' + dnum + '</button>';
    }
    html += '</div><div class="cal-legend small muted"><span><i class="lg met"></i>Target met</span><span><i class="lg some"></i>Some practice</span>' +
      (MC.events && MC.events.enabled() ? '<span><i class="lg ev"></i>SOS event</span>' : '') + '</div>';
    $('calMonth').innerHTML = html;
  }
  $('calMonth').addEventListener('click', function (e) {
    if (e.target.id === 'calPrev') { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderMonth(); return; }
    if (e.target.id === 'calNext') { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderMonth(); return; }
    var b = e.target.closest('[data-day]'); if (!b) return;
    selected = MC.parseDate(b.dataset.day); renderMonth(); renderAgenda();
  });

  var STATUS = { kept: ['✓ Kept', 'ok'], missed: ['Missed', 'miss'], now: ['Now', 'now'], upcoming: ['Upcoming', 'up'] };
  function renderAgenda() {
    var occs = MC.dayAgenda(selected), key = MC.toISO(selected);
    var sess = MC.sessions.all().filter(function (s) { return MC.dayKey(s.start) === key; }).sort(function (a, b) { return a.start - b.start; });
    var used = occs.used || {};
    var html = '<div class="section-title">' + MC.esc(MC.relDay(selected.getTime())) + (MC.relDay(selected.getTime()) === 'Today' ? ' · ' + MC.esc(MC.fmtDate(selected, { weekday: 'long', month: 'short', day: 'numeric' })) : '') + '</div>';
    if (!occs.length && !sess.length) {
      html += '<p class="small muted" style="margin:0">' + (selected > MC.today() ? 'Nothing scheduled.' : 'No sittings this day.') + '</p>';
    }
    occs.forEach(function (o) {
      var st = STATUS[o.status];
      html += '<div class="ag-row"><span class="ag-time">' + MC.esc(fmtClockTime(o.item.time)) + '</span>' +
        '<span class="ag-main"><b>' + MC.esc(o.item.title || 'Meditation') + '</b><small>' + o.item.minutes + ' min' +
        (o.session ? ' · sat ' + MC.fmtDur(o.session.minutes) + ' at ' + MC.esc(MC.fmtTime(o.session.start)) : '') + '</small></span>' +
        (o.status === 'now' || (o.status === 'upcoming' && o.date === MC.toISO(MC.today()))
          ? '<button class="btn btn-gold btn-sm" data-start="' + o.item.minutes + '">Start</button>'
          : '<span class="ag-st ' + st[1] + '">' + st[0] + '</span>') + '</div>';
    });
    var evs = MC.eventsOn ? MC.eventsOn(key) : [];
    if (evs.length) {
      html += '<div class="log-day" style="margin-top:12px">SOS events</div>' + evs.map(function (e) {
        return '<a class="ag-row ev-link" href="#event?e=' + encodeURIComponent(e.id) + '"><span class="ag-time">' + MC.esc(MC.fmtTime(e.startsAt)) + '</span>' +
          '<span class="ag-main"><b>' + MC.esc(e.title) + '</b><small>' + (e.format === 'online' ? 'Online' : e.format === 'hybrid' ? 'In person & online' : 'In person') + '</small></span>' +
          (e.myCheckin ? '<span class="ag-st ok">✓ Checked in</span>' : e.myRsvp === 'going' ? '<span class="ag-st now">Going</span>' : '<span class="muted">›</span>') + '</a>';
      }).join('');
    }
    var other = sess.filter(function (s) { return !used[s.id]; });
    if (other.length) {
      html += '<div class="log-day" style="margin-top:12px">' + (occs.length ? 'Other sittings' : 'Sittings') + '</div>';
      other.forEach(function (s) {
        html += '<div class="ag-row"><span class="ag-time">' + MC.esc(MC.fmtTime(s.start)) + '</span><span class="ag-main"><b>' + MC.fmtDur(s.minutes) + '</b><small>' +
          Math.round(s.quality) + '% quality' + (s.note ? ' · ' + MC.esc(s.note.slice(0, 40)) : '') + '</small></span></div>';
      });
    }
    $('calAgenda').innerHTML = html;
  }

  function renderSchedule() {
    var list = schedule.all().sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    var html = '<div class="section-title">My sitting times <button class="btn btn-soft btn-sm" id="schAdd" style="flex:0 0 auto">+ Add</button></div>';
    if (!list.length) {
      html += '<p class="small muted" style="margin:-4px 0 0">Plan when you\u2019ll sit each day, even several times a day. Keeping a scheduled time earns ⏰ 10 points.</p>';
    } else {
      html += list.map(function (it) {
        return '<button class="sch-row' + (it.enabled === false ? ' off' : '') + '" data-edit="' + MC.esc(it.id) + '"><span class="ag-time">' + MC.esc(fmtClockTime(it.time)) + '</span>' +
          '<span class="ag-main"><b>' + MC.esc(it.title || 'Meditation') + '</b><small>' + it.minutes + ' min · ' + MC.esc(daysLabel(it.days)) +
          (it.remind >= 0 ? ' · 🔔 ' + (it.remind ? it.remind + ' min before' : 'at start') : '') + (it.enabled === false ? ' · paused' : '') + '</small></span><span class="muted">›</span></button>';
      }).join('');
      html += '<div class="tool-row two" style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="schIcs">📅 Add to phone calendar</button>' +
        (('Notification' in window) && Notification.permission !== 'granted'
          ? '<button class="btn btn-ghost btn-sm" id="schNotify">🔔 Allow reminders</button>' : '<span></span>') + '</div>' +
        '<p class="small muted" style="margin:8px 0 0">For reminders even when the app is closed, add your times to your phone\u2019s calendar. In-app reminders appear while Meditation Copilot is open.</p>';
    }
    $('calSchedule').innerHTML = html;
  }
  $('calSchedule').addEventListener('click', function (e) {
    if (e.target.id === 'schAdd') return openSheet(null);
    if (e.target.id === 'schIcs') return exportIcs();
    if (e.target.id === 'schNotify') {
      Notification.requestPermission().then(function (p) { MC.toast(p === 'granted' ? 'Reminders allowed while the app is open.' : 'Reminders not allowed.'); renderSchedule(); });
      return;
    }
    var b = e.target.closest('[data-edit]'); if (b) openSheet(b.dataset.edit);
  });

  /* ---------- Add / edit sheet ---------- */
  var dlg = $('schedDlg'), editing = null;
  function setDays(days) {
    document.querySelectorAll('#sdDays .chip').forEach(function (c) { c.classList.toggle('on', days.indexOf(Number(c.dataset.d)) >= 0); });
  }
  function getDays() {
    var out = []; document.querySelectorAll('#sdDays .chip.on').forEach(function (c) { out.push(Number(c.dataset.d)); }); return out.sort();
  }
  function openSheet(id) {
    editing = id ? schedule.get(id) : null;
    var it = editing || { title: '', time: '05:00', minutes: Math.round(MC.dailyTarget()) || 30, days: [0, 1, 2, 3, 4, 5, 6], remind: 10, enabled: true };
    $('scTitle').textContent = editing ? 'Edit sitting time' : 'Add a sitting time';
    $('scName').value = it.title || '';
    $('scTime').value = it.time;
    $('scMin').value = it.minutes;
    $('scRemind').value = String(it.remind == null ? -1 : it.remind);
    $('scEnabled').checked = it.enabled !== false;
    setDays(it.days || []);
    $('scDelete').hidden = !editing;
    $('scEnabledRow').hidden = !editing;
    $('scErr').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeSheet() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  $('sdDays').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.preset) {
      setDays({ all: [0, 1, 2, 3, 4, 5, 6], wk: [1, 2, 3, 4, 5], we: [0, 6] }[c.dataset.preset]);
    } else c.classList.toggle('on');
  });
  $('scMinChips').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) $('scMin').value = c.dataset.m; });
  $('scCancel').addEventListener('click', closeSheet);
  $('scDelete').addEventListener('click', function () {
    if (!editing || !window.confirm('Delete this sitting time?')) return;
    schedule.remove(editing.id); closeSheet(); MC.toast('Sitting time deleted.');
  });
  $('scForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var time = $('scTime').value, min = Number($('scMin').value), days = getDays(), err = '';
    if (!/^\d{2}:\d{2}$/.test(time)) err = 'Please choose a time.';
    else if (!(min >= 1 && min <= 600)) err = 'Please enter 1 to 600 minutes.';
    else if (!days.length) err = 'Please choose at least one day.';
    if (err) { $('scErr').textContent = err; return; }
    var rec = { title: $('scName').value.trim().slice(0, 40), time: time, minutes: Math.round(min), days: days, remind: Number($('scRemind').value), enabled: editing ? $('scEnabled').checked : true };
    if (editing) schedule.update(editing.id, rec); else { schedule.add(rec); MC.track('schedule_add'); }
    closeSheet();
    MC.toast(editing ? 'Sitting time updated.' : 'Sitting time added. 🙏');
  });

  /* ---------- Export to the phone's calendar (.ics) ---------- */
  function icsDate(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + '00';
  }
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function exportIcs() {
    var BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], now = new Date();
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meditation Copilot//Schedule//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Meditation Copilot'];
    active().forEach(function (it) {
      // first occurrence on or after today
      var d = MC.today(), hm = it.time.split(':').map(Number);
      for (var i = 0; i < 7 && (it.days || []).indexOf(d.getDay()) < 0; i++) d = MC.addDays(d, 1);
      var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0], hm[1]);
      lines.push('BEGIN:VEVENT', 'UID:' + it.id + '@meditation-copilot', 'DTSTAMP:' + stamp,
        'DTSTART:' + icsDate(start), 'DURATION:PT' + it.minutes + 'M',
        'RRULE:FREQ=WEEKLY;BYDAY=' + it.days.map(function (x) { return BYDAY[x]; }).join(','),
        'SUMMARY:' + icsText('🪷 ' + (it.title || 'Meditation') + ' (' + it.minutes + ' min)'),
        'DESCRIPTION:' + icsText('Open Meditation Copilot: ' + MC.APP_LINK + '#timer'),
        'URL:' + MC.APP_LINK + '#timer');
      if (it.remind >= 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Time to meditate 🙏'), 'TRIGGER:-PT' + it.remind + 'M', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'meditation-schedule.ics'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    MC.track('schedule_ics');
    MC.toast('Calendar file downloaded. Open it to add your sitting times.', 4500);
  }
  MC.scheduleIcs = exportIcs;

  /* ---------- In-app reminders (while the app is open) ---------- */
  var FIRED_KEY = 'meditation-copilot:reminded';
  function checkReminders() {
    var now = Date.now(), fired = MC.store.get(FIRED_KEY, {}) || {}, changed = false;
    occurrences(MC.today(), MC.today()).forEach(function (o) {
      var r = o.item.remind; if (!(r >= 0)) return;
      var at = o.at - r * 60000, k = o.item.id + '@' + o.date;
      if (now >= at && now < at + 5 * 60000 && !fired[k]) {
        fired[k] = now; changed = true;
        var msg = (o.item.title || 'Meditation') + (r ? ' starts in ' + r + ' min' : ' starts now') + ' · ' + o.item.minutes + ' min';
        MC.toast('⏰ ' + msg, 6000);
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Meditation Copilot', { body: msg, icon: 'icons/icon-192.png', tag: k });
        } catch (e) {}
      }
    });
    Object.keys(fired).forEach(function (k) { if (now - fired[k] > 2 * 86400000) { delete fired[k]; changed = true; } });
    if (changed) MC.store.set(FIRED_KEY, fired);
  }
  setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkReminders(); });
  setTimeout(checkReminders, 2000);

  /* ---------- Rewards: scheduled sitting kept ---------- */
  if (MC.rewards && MC.rewards.addRule) {
    MC.rewards.addRule({ id: 'schedule_kept', category: 'consistency', icon: '⏰', name: 'Scheduled Sitting Kept',
      desc: 'Start a sitting within 30 min before to 60 min after one of your scheduled times', points: 10, repeat: true,
      count: function () { return MC.scheduleKeptCount(); } });
  }

  MC.views.calendar = { show: render, refreshMonth: function () { renderMonth(); renderAgenda(); } };
  MC.on('schedule', function () { if (MC.current === 'calendar') render(); if (MC.current === 'home' && MC.views.home) MC.views.home.show(); });
  MC.on('data', function () { if (MC.current === 'calendar') render(); });
})();
