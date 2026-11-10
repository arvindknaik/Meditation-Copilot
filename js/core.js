/* Meditation Copilot — core: storage, dates, sessions, calculations, bells, routing */
(function () {
  'use strict';
  var MC = window.MC = {};

  MC.VERSION = '0.10.1';          // shown in Account and diagnostics
  MC.SCHEMA = 2;                 // data snapshot format used for cloud sync
  MC.GOAL_HOURS = 10000;           // fixed spiritual goal — not user-editable
  MC.MAX_AGE = 90;
  MC.APP_LINK = 'https://arvindknaik.github.io/Meditation-Copilot/';
  MC.MILESTONES = [100, 500, 1000, 2500, 5000, 7500, 10000];
  var DAY_MS = 86400000;
  var KEYS = {
    profile: 'meditation-copilot:v1',          // kept from v1 so existing answers carry over
    sessions: 'meditation-copilot:sessions',
    settings: 'meditation-copilot:settings',
    active: 'meditation-copilot:active',
    theme: 'meditation-copilot:theme',
    deleted: 'meditation-copilot:deleted',     // tombstones so deletions sync across devices
    meta: 'meditation-copilot:meta',           // { profileUpdatedAt, settingsUpdatedAt }
    account: 'meditation-copilot:account',
    diag: 'meditation-copilot:diag'
  };
  MC.KEYS = KEYS;

  MC.$ = function (id) { return document.getElementById(id); };
  MC.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- Storage (safe) ---------- */
  MC.store = {
    get: function (k, def) {
      try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- Profile (roadmap answers) ---------- */
  var DEFAULT_PROFILE = { dob: '', start: '', minutes: '', quality: 75, goalAge: 90 };
  MC.profile = Object.assign({}, DEFAULT_PROFILE, MC.store.get(KEYS.profile, {}));
  var meta = Object.assign({ profileUpdatedAt: 0, settingsUpdatedAt: 0 }, MC.store.get(KEYS.meta, {}));
  function saveMeta() { MC.store.set(KEYS.meta, meta); }
  MC.saveProfile = function () { MC.store.set(KEYS.profile, MC.profile); meta.profileUpdatedAt = Date.now(); saveMeta(); MC.emit('changed'); };
  MC.resetProfile = function () {
    MC.profile = Object.assign({}, DEFAULT_PROFILE); MC.store.del(KEYS.profile);
    meta.profileUpdatedAt = Date.now(); saveMeta(); MC.emit('changed');
  };
  MC.hasProfile = function () {
    var p = MC.profile;
    if (!(p.dob && p.start && p.minutes !== '' && p.goalAge)) return false;
    var dob = MC.parseDate(p.dob);
    return !!dob && MC.addYears(dob, Number(p.goalAge)) > MC.today();
  };

  /* ---------- Settings ---------- */
  var DEFAULT_SETTINGS = { dailyTarget: null, preset: 30, startBell: true, endBell: true, lastQuality: null };
  MC.settings = Object.assign({}, DEFAULT_SETTINGS, MC.store.get(KEYS.settings, {}));
  MC.saveSettings = function (patch) {
    Object.assign(MC.settings, patch || {}); MC.store.set(KEYS.settings, MC.settings);
    meta.settingsUpdatedAt = Date.now(); saveMeta(); MC.emit('changed');
  };
  MC.dailyTarget = function () {
    var t = Number(MC.settings.dailyTarget);
    if (t > 0) return t;
    var m = Number(MC.profile.minutes);
    return m > 0 ? m : 30;
  };
  MC.defaultQuality = function () {
    if (MC.settings.lastQuality != null) return Number(MC.settings.lastQuality);
    return MC.profile.quality != null ? Number(MC.profile.quality) : 75;
  };

  /* ---------- Sessions ----------
     { id, start: epoch ms, minutes: actual minutes, quality: 0-100, note, source: 'timer'|'manual' } */
  var sessions = MC.store.get(KEYS.sessions, []);
  if (!Array.isArray(sessions)) sessions = [];
  sessions.forEach(function (s) { if (!s.updatedAt) s.updatedAt = s.start; });   // migrate older data
  var deleted = MC.store.get(KEYS.deleted, []);                                    // [{ id, at }]
  if (!Array.isArray(deleted)) deleted = [];
  function persist() {
    sessions.sort(function (a, b) { return b.start - a.start; });
    MC.store.set(KEYS.sessions, sessions); MC.store.set(KEYS.deleted, deleted);
    MC.emit('data'); MC.emit('changed');
  }
  function newId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  MC.sessions = {
    all: function () { return sessions.slice().sort(function (a, b) { return b.start - a.start; }); },
    count: function () { return sessions.length; },
    get: function (id) { return sessions.filter(function (s) { return s.id === id; })[0] || null; },
    add: function (s) {
      s.id = s.id || newId(); s.updatedAt = Date.now();
      sessions.push(s); persist(); return s;
    },
    update: function (id, patch) { var s = this.get(id); if (s) { Object.assign(s, patch, { updatedAt: Date.now() }); persist(); } return s; },
    remove: function (id) {
      sessions = sessions.filter(function (s) { return s.id !== id; });
      deleted.push({ id: id, at: Date.now() }); persist();
    }
  };
  MC.effMin = function (s) { return s.minutes * s.quality / 100; };

  /* ---------- Tiny event bus ---------- */
  var listeners = {};
  MC.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  MC.emit = function (ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------- Dates ---------- */
  MC.today = function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  MC.parseDate = function (s) {
    if (!s) return null;
    var p = String(s).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  };
  MC.toISO = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  MC.toHM = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  MC.dayKey = function (ms) { return MC.toISO(new Date(ms)); };
  MC.startOfDay = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
  MC.daysBetween = function (a, b) { return Math.round((b - a) / DAY_MS); };
  MC.addDays = function (d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; };
  MC.addYears = function (d, n) {
    var r = new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
    if (r.getMonth() !== d.getMonth()) r.setDate(0);
    return r;
  };
  MC.ymDiff = function (a, b) {
    var months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    months = Math.max(0, months);
    return { y: Math.floor(months / 12), m: months % 12 };
  };
  MC.fmtYM = function (ym) {
    var y = ym.y + (ym.y === 1 ? ' year' : ' years');
    var m = ym.m + (ym.m === 1 ? ' month' : ' months');
    if (ym.y === 0 && ym.m === 0) return 'less than a month';
    if (ym.y === 0) return m;
    if (ym.m === 0) return y;
    return y + ' and ' + m;
  };
  MC.fmtDate = function (d, opts) { return d.toLocaleDateString(undefined, opts || { year: 'numeric', month: 'long', day: 'numeric' }); };
  MC.fmtTime = function (ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  MC.weekStart = function (d) { var r = new Date(d); r.setHours(0, 0, 0, 0); var wd = (r.getDay() + 6) % 7; r.setDate(r.getDate() - wd); return r; }; // Monday
  MC.relDay = function (ms) {
    var diff = MC.daysBetween(MC.startOfDay(ms), MC.today());
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return MC.fmtDate(new Date(ms), { weekday: 'short', month: 'short', day: 'numeric' });
  };

  /* ---------- Number formatting ---------- */
  MC.fmtMin = function (x) {
    if (!isFinite(x)) return '—';
    if (x > 0 && x < 10) return (Math.round(x * 10) / 10).toString();
    return Math.round(x).toLocaleString();
  };
  MC.fmtHours = function (x) { return Math.round(x).toLocaleString(); };
  MC.fmtDur = function (min) {            // 135 -> "2h 15m"
    min = Math.round(min);
    if (min < 60) return min + 'm';
    var h = Math.floor(min / 60), m = min % 60;
    return h.toLocaleString() + 'h' + (m ? ' ' + m + 'm' : '');
  };
  MC.fmtClock = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  };
  MC.qualityLabel = function (q) {
    if (q >= 100) return 'Absorbed';
    if (q >= 90) return 'Deep';
    if (q >= 75) return 'Good';
    if (q >= 50) return 'Beginner';
    return 'Settling in';
  };

  /* ---------- Aggregates ---------- */
  MC.byDay = function () {
    var map = {};
    sessions.forEach(function (s) {
      var k = MC.dayKey(s.start);
      var d = map[k] || (map[k] = { minutes: 0, eff: 0, count: 0 });
      d.minutes += s.minutes; d.eff += MC.effMin(s); d.count++;
    });
    return map;
  };
  MC.sumRange = function (fromDate, toDateExcl) {
    var r = { minutes: 0, eff: 0, count: 0, qSum: 0 };
    sessions.forEach(function (s) {
      if (s.start >= fromDate.getTime() && s.start < toDateExcl.getTime()) {
        r.minutes += s.minutes; r.eff += MC.effMin(s); r.count++; r.qSum += s.quality * s.minutes;
      }
    });
    r.avgQuality = r.minutes ? r.qSum / r.minutes : null;  // minute-weighted
    return r;
  };
  MC.streaks = function () {
    var days = MC.byDay();
    var keys = Object.keys(days).filter(function (k) { return days[k].minutes > 0; }).sort();
    var longest = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      var d = MC.parseDate(k);
      run = (prev && MC.daysBetween(prev, d) === 1) ? run + 1 : 1;
      longest = Math.max(longest, run); prev = d;
    });
    var cur = 0, d = MC.today();
    if (!days[MC.toISO(d)]) d = MC.addDays(d, -1);  // streak survives until today ends
    while (days[MC.toISO(d)] && days[MC.toISO(d)].minutes > 0) { cur++; d = MC.addDays(d, -1); }
    return { current: cur, longest: longest, practicedToday: !!days[MC.toISO(MC.today())] };
  };

  /* ---------- Roadmap calculation (uses logged sessions when available) ----------
     Hours completed = estimate from profile average for the period before the first logged
     sitting + the real effective minutes from every logged sitting.
     Current pace    = last 30 days of logged sittings (once 7+ days of logging exist),
     otherwise the profile average. */
  MC.compute = function (extraMinPerDay) {
    var p = MC.profile, t = MC.today();
    var dob = MC.parseDate(p.dob), start = MC.parseDate(p.start);
    var profMin = Number(p.minutes), profQ = Number(p.quality), goalAge = Number(p.goalAge);
    var profEff = profMin * profQ / 100;

    var list = sessions.slice().sort(function (a, b) { return a.start - b.start; });
    var logged = list.length > 0;
    var firstLogDay = logged ? MC.startOfDay(list[0].start) : null;
    if (firstLogDay && firstLogDay < start) firstLogDay = start;

    var estDays = Math.max(0, MC.daysBetween(start, logged ? firstLogDay : t));
    var estHours = profEff * estDays / 60;
    var loggedEffMin = list.reduce(function (a, s) { return a + MC.effMin(s); }, 0);
    var loggedHours = loggedEffMin / 60;
    var loggedActualHours = list.reduce(function (a, s) { return a + s.minutes; }, 0) / 60;

    var completedRaw = estHours + loggedHours;
    var completed = Math.min(MC.GOAL_HOURS, completedRaw);
    var remaining = Math.max(0, MC.GOAL_HOURS - completed);

    // Current pace
    var spanDays = logged ? MC.daysBetween(MC.startOfDay(list[0].start), t) + 1 : 0;
    var paceSource = 'profile', paceEff = profEff, paceMin = profMin, paceQ = profQ, windowDays = 0;
    if (logged && spanDays >= 7) {
      // Window ends today if you've already sat today, otherwise yesterday (today isn't over yet)
      var end = MC.sumRange(t, MC.addDays(t, 1)).count ? t : MC.addDays(t, -1);
      var span = MC.daysBetween(MC.startOfDay(list[0].start), end) + 1;
      windowDays = Math.max(1, Math.min(30, span));
      var r = MC.sumRange(MC.addDays(end, -(windowDays - 1)), MC.addDays(end, 1));
      paceSource = 'logged';
      paceEff = r.eff / windowDays;
      paceMin = r.minutes / windowDays;
      paceQ = r.avgQuality != null ? r.avgQuality : profQ;
    }
    var extra = Number(extraMinPerDay) || 0;
    var effDaily = paceEff + extra * paceQ / 100;

    var currentAge = MC.ymDiff(dob, t);
    var goalDate = MC.addYears(dob, goalAge);
    var remainingDays = Math.max(1, MC.daysBetween(t, goalDate));
    var required = remaining * 60 / remainingDays;
    var done = remaining <= 0;
    var ahead = done || effDaily >= required;

    var projDate = null;
    if (done) {
      projDate = crossingDate(start, profEff, estHours, list, MC.GOAL_HOURS);
    } else if (effDaily > 0) {
      projDate = MC.addDays(t, Math.ceil(remaining * 60 / effDaily));
    }
    var projAge = projDate ? MC.ymDiff(dob, projDate) : null;
    var projBeyond = !projAge || projAge.y >= MC.MAX_AGE + 1;
    var aheadBy = (ahead && projDate && projDate <= goalDate) ? MC.ymDiff(projDate, goalDate) : null;
    var extraEff = ahead ? 0 : Math.ceil(required - effDaily);
    var extraActual = (!ahead && paceQ > 0) ? Math.ceil((required - effDaily) / (paceQ / 100)) : null;

    return {
      t: t, dob: dob, start: start, goalAge: goalAge,
      profMin: profMin, profQ: profQ, profEff: profEff,
      paceSource: paceSource, windowDays: windowDays, paceMin: paceMin, paceQ: paceQ,
      effDaily: effDaily, logged: logged, firstLogDay: firstLogDay,
      estHours: estHours, loggedHours: loggedHours, loggedActualHours: loggedActualHours, sessionCount: list.length,
      completed: completed, completedRaw: completedRaw, remaining: remaining,
      currentAge: currentAge, goalDate: goalDate, remainingDays: remainingDays, required: required,
      done: done, ahead: ahead, projDate: projDate, projAge: projAge, projBeyond: projBeyond,
      aheadBy: aheadBy, extraEff: extraEff, extraActual: extraActual
    };
  };
  // Date on which cumulative effective hours crossed `goal`
  function crossingDate(start, profEff, estHours, list, goal) {
    if (estHours >= goal && profEff > 0) return MC.addDays(start, Math.ceil(goal * 60 / profEff));
    var cum = estHours;
    for (var i = 0; i < list.length; i++) {
      cum += MC.effMin(list[i]) / 60;
      if (cum >= goal) return MC.startOfDay(list[i].start);
    }
    return MC.today();
  }
  MC.completedHours = function () { return MC.hasProfile() ? MC.compute().completed : null; };

  /* ---------- CSV: one fixed format for export and import ---------- */
  MC.CSV_HEADER = ['date', 'start_time', 'minutes', 'quality_pct', 'effective_minutes', 'reflection', 'source'];
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  MC.sessionsToCSV = function () {
    var rows = [MC.CSV_HEADER];
    MC.sessions.all().slice().reverse().forEach(function (s) {
      var d = new Date(s.start);
      rows.push([MC.toISO(d), MC.toHM(d), round1(s.minutes), Math.round(s.quality), round1(MC.effMin(s)), s.note || '', s.source === 'manual' ? 'manual' : 'timer']);
    });
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  };
  function round1(x) { return Math.round(x * 10) / 10; }

  /* Dates in common formats (export always writes YYYY-MM-DD):
       2026-11-09 · 2026/11/9 · 11/9/2026 · 11-9-2026 · 11/9/26 (US month/day/year)
       25/11/2026 (day/month when the first number is over 12) · 9-Nov-2026 · Nov 9, 2026 · 9 November 2026
     Returns a Date only when it is a real calendar date between 1900 and today. */
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function monthNum(name) { var i = MONTHS.indexOf(String(name).slice(0, 3).toLowerCase()); return i < 0 ? 0 : i + 1; }
  function fullYear(y) {
    y = Number(y);
    if (y >= 100) return y;
    var cur = new Date().getFullYear() % 100;
    return y <= cur + 1 ? 2000 + y : 1900 + y;
  }
  function parseFlexibleDate(str) {
    str = String(str || '').trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, '');   // drop a trailing time (e.g. "11/9/2026 0:00")
    var y, mo, da, x;
    if ((x = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(str))) { y = +x[1]; mo = +x[2]; da = +x[3]; }
    else if ((x = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/.exec(str))) {
      var a = +x[1], b = +x[2]; y = fullYear(x[3]);
      if (a > 12 && b <= 12) { da = a; mo = b; } else { mo = a; da = b; }
    }
    else if ((x = /^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{2}|\d{4})$/.exec(str))) { da = +x[1]; mo = monthNum(x[2]); y = fullYear(x[3]); }
    else if ((x = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/.exec(str))) { mo = monthNum(x[1]); da = +x[2]; y = fullYear(x[3]); }
    else return null;
    if (!mo || mo > 12 || !da || da > 31 || y < 1900) return null;
    var d = new Date(y, mo - 1, da);
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;   // e.g. Feb 30
    return d;
  }
  MC.parseFlexibleDate = parseFlexibleDate;

  // RFC 4180 parser: quoted fields, escaped quotes, commas and line breaks inside quotes
  function parseCSVText(text) {
    var rows = [], row = [], field = '', i = 0, q = false, n = text.length;
    while (i < n) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { q = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      field += c; i++;
    }
    if (q) return { error: 'A quoted field is never closed (unbalanced " character).' };
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return { rows: rows };
  }

  /* Validates a CSV exported by this app. Returns { sessions } or { errors: [...] }.
     Any error rejects the whole file. */
  MC.parseSessionsCSV = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    var parsed = parseCSVText(text);
    if (parsed.error) return { errors: [parsed.error] };
    var rows = parsed.rows.filter(function (r, idx) { return !(r.length === 1 && r[0] === '' && idx > 0); });
    if (!rows.length || (rows.length === 1 && rows[0].join('') === '')) return { errors: ['The file is empty.'] };
    if (rows[0].join(',') !== MC.CSV_HEADER.join(',')) {
      return { errors: ['The first line must be exactly:\n' + MC.CSV_HEADER.join(',') + '\nFound:\n' + rows[0].join(',').slice(0, 200)] };
    }
    if (rows.length === 1) return { errors: ['The file has a header but no sittings.'] };
    var errors = [], out = [], now = Date.now();
    for (var r = 1; r < rows.length; r++) {
      var f = rows[r], rn = 'Row ' + (r + 1) + ': ', bad = [];
      if (f.length !== MC.CSV_HEADER.length) { errors.push(rn + 'expected ' + MC.CSV_HEADER.length + ' columns, found ' + f.length + '.'); continue; }
      var date = f[0], time = f[1], min = f[2], qual = f[3], eff = f[4], note = f[5], src = f[6];
      var d = parseFlexibleDate(date);
      if (!d) bad.push('date "' + date + '" is not a valid date (use e.g. 2026-11-09, 11/9/2026 or 9-Nov-2026)');
      // 24-hour time. Accept H:MM and HH:MM:SS too (Excel often drops the leading zero or adds seconds).
      var tm = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(time.trim());
      if (!tm) bad.push('start_time "' + time + '" must be a 24-hour time such as 06:00 or 18:30');
      else time = String(tm[1]).padStart(2, '0') + ':' + tm[2];
      min = min.trim(); qual = qual.trim().replace(/%$/, ''); eff = eff.trim();
      var m = round1(Number(min));
      if (!/^\d+(\.\d{1,2})?$/.test(min) || !(m > 0) || m > 1440) bad.push('minutes "' + min + '" must be a number from 0.1 to 1440');
      var qn = Number(qual);
      if (!/^\d{1,3}$/.test(qual) || qn > 100) bad.push('quality_pct "' + f[3] + '" must be a whole number from 0 to 100');
      if (!/^\d+(\.\d{1,2})?$/.test(eff)) bad.push('effective_minutes "' + eff + '" must be a number');
      else if (!bad.length && Math.abs(Number(eff) - round1(m * qn / 100)) > 0.11) bad.push('effective_minutes ' + eff + ' does not equal minutes × quality (' + round1(m * qn / 100) + ')');
      if (note.length > 2000) bad.push('reflection is longer than 2,000 characters');
      if (src !== 'timer' && src !== 'manual') bad.push('source "' + src + '" must be "timer" or "manual"');
      var start = null;
      if (!bad.length) {
        var hm = time.split(':').map(Number);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0], hm[1]).getTime();
        if (start > now) bad.push('the sitting is in the future');
      }
      if (bad.length) { errors.push(rn + bad.join('; ') + '.'); continue; }
      out.push({ row: r + 1, start: start, minutes: m, quality: qn, note: note.trim(), source: src });
    }
    // Sittings inside the file must not overlap each other
    var sorted = out.slice().sort(function (a, b) { return a.start - b.start; });
    for (var k = 1; k < sorted.length; k++) {
      var p = sorted[k - 1], c2 = sorted[k];
      if (c2.start < p.start + p.minutes * 60000) errors.push('Rows ' + p.row + ' and ' + c2.row + ' overlap in time.');
    }
    if (errors.length) return { errors: errors };
    return { sessions: out };
  };
  // Existing sitting that overlaps [start, start + minutes)
  MC.findOverlap = function (start, minutes) {
    var end = start + minutes * 60000;
    return sessions.filter(function (s) { return start < s.start + s.minutes * 60000 && s.start < end; })[0] || null;
  };
  MC.addSessionsBulk = function (list) {
    var now = Date.now();
    list.forEach(function (s) { s.id = newId(); s.updatedAt = now; sessions.push(s); });
    persist();
  };

  /* ---------- Other synced lists (e.g. personal schedule) ----------
     MC.collection('schedule') returns { all, get, add, update, remove }. Items get id, createdAt,
     updatedAt; deletions leave tombstones so they sync. Included in MC.snapshot() automatically. */
  var collections = {};
  function mergeLists(items, tombs, rItems, rTombs) {
    var changed = false, tomb = {}, cutoff = Date.now() - 365 * 86400000, byId = {};
    tombs.concat(rTombs || []).forEach(function (t) { if (t && t.id && t.at > cutoff && (!tomb[t.id] || t.at > tomb[t.id])) tomb[t.id] = t.at; });
    items.forEach(function (x) { byId[x.id] = x; });
    (rItems || []).forEach(function (r) {
      if (!r || !r.id) return;
      var l = byId[r.id];
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { byId[r.id] = r; changed = true; }
    });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (x) { return !(tomb[x.id] && tomb[x.id] >= (x.updatedAt || 0)); });
    if (merged.length !== items.length) changed = true;
    return { items: merged, tombs: Object.keys(tomb).map(function (id) { return { id: id, at: tomb[id] }; }), changed: changed };
  }
  MC.collection = function (name) {
    if (collections[name]) return collections[name].api;
    var key = 'meditation-copilot:' + name, dkey = key + ':deleted';
    var c = { items: MC.store.get(key, []), tombs: MC.store.get(dkey, []) };
    if (!Array.isArray(c.items)) c.items = [];
    if (!Array.isArray(c.tombs)) c.tombs = [];
    c.persist = function (local) {
      MC.store.set(key, c.items); MC.store.set(dkey, c.tombs);
      MC.emit(name); if (local) MC.emit('changed');
    };
    c.api = {
      all: function () { return c.items.slice(); },
      get: function (id) { return c.items.filter(function (x) { return x.id === id; })[0] || null; },
      add: function (o) { var now = Date.now(); o.id = o.id || newId(); o.createdAt = o.createdAt || now; o.updatedAt = now; c.items.push(o); c.persist(true); return o; },
      update: function (id, patch) { var x = c.api.get(id); if (x) { Object.assign(x, patch, { updatedAt: Date.now() }); c.persist(true); } return x; },
      remove: function (id) { c.items = c.items.filter(function (x) { return x.id !== id; }); c.tombs.push({ id: id, at: Date.now() }); c.persist(true); }
    };
    c.name = name;
    collections[name] = c;
    return c.api;
  };

  // Remove all personal data from this device (used on sign-out when the user asks)
  MC.clearLocalData = function () {
    [KEYS.profile, KEYS.sessions, KEYS.deleted, KEYS.meta, KEYS.active].forEach(function (k) { MC.store.del(k); });
    Object.keys(collections).forEach(function (n) { var c = collections[n]; c.items = []; c.tombs = []; c.persist(false); });
    sessions = []; deleted = []; meta.profileUpdatedAt = 0; meta.settingsUpdatedAt = 0;
    MC.profile = Object.assign({}, DEFAULT_PROFILE);
    MC.emit('data'); MC.emit('profile');
  };

  /* ---------- Sync groundwork: snapshot + merge ----------
     A snapshot is everything that should follow the user across devices. Cloud providers
     (Google Drive / OneDrive, coming next) will store one snapshot file and merge on each sync:
       - sittings: union by id; the newer updatedAt wins
       - deletions: a tombstone removes a sitting unless the sitting was edited after it
       - roadmap answers and settings: the newer copy wins */
  var SYNC_SETTINGS = ['dailyTarget', 'preset', 'startBell', 'endBell', 'lastQuality'];
  MC.snapshot = function () {
    var st = {}; SYNC_SETTINGS.forEach(function (k) { st[k] = MC.settings[k]; });
    return {
      app: 'meditation-copilot', schema: MC.SCHEMA, savedAt: Date.now(),
      profile: MC.profile, profileUpdatedAt: meta.profileUpdatedAt,
      settings: st, settingsUpdatedAt: meta.settingsUpdatedAt,
      sessions: sessions.slice(), deleted: deleted.slice(),
      collections: Object.keys(collections).reduce(function (o, n) {
        o[n] = { items: collections[n].items.slice(), deleted: collections[n].tombs.slice() }; return o;
      }, {})
    };
  };
  MC.mergeSnapshot = function (remote) {
    if (!remote || remote.app !== 'meditation-copilot') throw new Error('Not a Meditation Copilot data file');
    var changed = false;
    // tombstones: union, keep the latest time per id, drop after 1 year
    var tomb = {}, cutoff = Date.now() - 365 * 86400000;
    deleted.concat(remote.deleted || []).forEach(function (t) {
      if (t && t.id && t.at > cutoff && (!tomb[t.id] || t.at > tomb[t.id])) tomb[t.id] = t.at;
    });
    // sittings: newer updatedAt wins
    var byId = {};
    sessions.forEach(function (s) { byId[s.id] = s; });
    (remote.sessions || []).forEach(function (r) {
      if (!r || !r.id) return;
      var l = byId[r.id];
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { byId[r.id] = r; changed = true; }
    });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (s) {
      var gone = tomb[s.id] && tomb[s.id] >= (s.updatedAt || 0);
      return !gone;
    });
    if (merged.length !== sessions.length) changed = true;
    sessions = merged;
    deleted = Object.keys(tomb).map(function (id) { return { id: id, at: tomb[id] }; });
    if ((remote.profileUpdatedAt || 0) > meta.profileUpdatedAt && remote.profile) {
      MC.profile = Object.assign({}, DEFAULT_PROFILE, remote.profile);
      MC.store.set(KEYS.profile, MC.profile); meta.profileUpdatedAt = remote.profileUpdatedAt; changed = true;
    }
    if ((remote.settingsUpdatedAt || 0) > meta.settingsUpdatedAt && remote.settings) {
      Object.assign(MC.settings, remote.settings); MC.store.set(KEYS.settings, MC.settings);
      meta.settingsUpdatedAt = remote.settingsUpdatedAt; changed = true;
    }
    // Other synced lists (schedule, …)
    var rc = remote.collections || {};
    Object.keys(rc).forEach(function (n) {
      MC.collection(n);
      var c = collections[n], m = mergeLists(c.items, c.tombs, rc[n].items, rc[n].deleted);
      c.items = m.items; c.tombs = m.tombs;
      c.persist(false);
      if (m.changed) changed = true;
    });
    saveMeta();
    sessions.sort(function (a, b) { return b.start - a.start; });
    MC.store.set(KEYS.sessions, sessions); MC.store.set(KEYS.deleted, deleted);
    if (changed) { MC.emit('data'); MC.emit('profile'); }
    return changed;
  };

  /* ---------- Toast ---------- */
  var toastTimer;
  MC.toast = function (msg, ms) {
    var el = MC.$('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2800);
  };

  /* ---------- Ring helper ---------- */
  MC.setRing = function (el, frac) {
    var r = Number(el.getAttribute('r'));
    var C = 2 * Math.PI * r;
    frac = Math.max(0, Math.min(1, frac || 0));
    el.style.strokeDasharray = C.toFixed(2);
    el.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
  };

  /* ---------- Bells (synthesised singing bowl — works offline, no audio files) ---------- */
  var actx = null;
  MC.audioUnlock = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      var b = actx.createBuffer(1, 1, 22050), src = actx.createBufferSource();   // silent unlock (iOS)
      src.buffer = b; src.connect(actx.destination); src.start(0);
    } catch (e) {}
  };
  MC.bell = function (kind) {
    if (!actx) return;
    try {
      if (actx.state === 'suspended') actx.resume();
      var strikes = kind === 'end' ? 3 : 1;
      var base = kind === 'interval' ? 528 : 396;
      var dur = kind === 'interval' ? 4.5 : 7;
      var partials = [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]];
      for (var s = 0; s < strikes; s++) {
        var t0 = actx.currentTime + 0.05 + s * 2.6;
        var master = actx.createGain();
        master.gain.value = kind === 'interval' ? 0.18 : 0.28;
        master.connect(actx.destination);
        partials.forEach(function (pp, i) {
          var o = actx.createOscillator(), g = actx.createGain();
          o.type = 'sine'; o.frequency.value = base * pp[0];
          o.detune.value = (i % 2 ? 4 : -3);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(pp[1], t0 + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / (1 + i * 0.7));
          o.connect(g); g.connect(master);
          o.start(t0); o.stop(t0 + dur + 0.1);
        });
      }
    } catch (e) {}
  };

  /* ---------- Theme (Automatic / Light / Dark — set in the Account sheet) ---------- */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  MC.themePref = function () { var t = MC.store.get(KEYS.theme, null); return t === 'light' || t === 'dark' ? t : 'auto'; };
  MC.setTheme = function (t) { if (t === 'auto') MC.store.del(KEYS.theme); else MC.store.set(KEYS.theme, t); applyTheme(t); };
  MC.initTheme = function () { applyTheme(MC.themePref()); };

  /* ---------- Router (hash-based: #home, #timer, #insights, #roadmap) ---------- */
  MC.views = {};
  MC.current = null;
  var VIEWS = ['home', 'timer', 'calendar', 'insights', 'roadmap', 'learn', 'event'];
  MC.route = function () {
    var name = (location.hash || '#home').slice(1).split('?')[0];
    if (VIEWS.indexOf(name) < 0) name = 'home';
    MC.current = name;
    VIEWS.forEach(function (v) { MC.$('v-' + v).classList.toggle('active', v === name); });
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle('on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (MC.views[name] && MC.views[name].show) MC.views[name].show();
    window.scrollTo(0, 0);
  };
  MC.go = function (name) { if (location.hash === '#' + name) MC.route(); else location.hash = name; };
})();
