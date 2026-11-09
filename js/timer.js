/* Meditation Copilot — Timer: countdown or open sitting, bells, pause, wake lock, survives reloads */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var active = MC.store.get(MC.KEYS.active, null);   // { startedAt, pausedAt, pausedMs, target, interval, endRung, lastInt }
  var tickId = null, wakeLock = null;

  /* ---------- Setup screen ---------- */
  function selectedPreset() {
    var custom = Number($('customMin').value);
    if (custom > 0) return Math.min(600, Math.round(custom));
    return Number(MC.settings.preset) || 0;
  }
  function syncSetup() {
    var p = MC.settings.preset, custom = $('customMin').value;
    document.querySelectorAll('#presetChips .chip').forEach(function (c) { c.classList.toggle('on', !custom && Number(c.dataset.p) === Number(p)); });
    document.querySelectorAll('#intervalChips .chip').forEach(function (c) { c.classList.toggle('on', Number(c.dataset.i) === Number(MC.settings.interval)); });
    $('soundToggle').checked = !!MC.settings.sound;
    var sel = selectedPreset();
    $('presetHint').textContent = sel
      ? 'A ' + sel + '-minute sitting. A bell rings at ' + sel + ' min; keep sitting as long as you like and tap End when ready.'
      : 'Open sitting: no end bell. Tap End when you are ready.';
  }
  $('presetChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('customMin').value = ''; MC.saveSettings({ preset: Number(c.dataset.p) }); syncSetup();
  });
  $('customMin').addEventListener('input', syncSetup);
  $('intervalChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    MC.saveSettings({ interval: Number(c.dataset.i) }); syncSetup();
  });
  $('soundToggle').addEventListener('change', function () { MC.saveSettings({ sound: $('soundToggle').checked }); syncSetup(); });
  $('manualBtn').addEventListener('click', function () { MC.openSession({ mode: 'manual', minutes: MC.dailyTarget() }); });

  $('startBtn').addEventListener('click', function () {
    var target = selectedPreset();
    if ($('customMin').value) MC.saveSettings({ preset: target });
    MC.audioUnlock();
    active = { startedAt: Date.now(), pausedAt: null, pausedMs: 0, target: target, interval: Number(MC.settings.interval) || 0, endRung: false, lastInt: 0 };
    save();
    MC.bell('start');
    enterRun();
  });

  /* ---------- Running ---------- */
  function save() { if (active) MC.store.set(MC.KEYS.active, active); else MC.store.del(MC.KEYS.active); }
  function elapsedSec() {
    if (!active) return 0;
    var now = active.pausedAt || Date.now();
    return Math.max(0, (now - active.startedAt - active.pausedMs) / 1000);
  }

  function enterRun() {
    $('timerSetup').hidden = true;
    $('timerRun').hidden = false;
    document.body.classList.add('focus');
    $('runMode').textContent = active.target ? active.target + '-minute sitting' + (active.interval ? ' · bell every ' + active.interval + ' min' : '') : 'Open sitting' + (active.interval ? ' · bell every ' + active.interval + ' min' : '');
    requestWake();
    if (!tickId) tickId = setInterval(tick, 250);
    tick();
  }
  function exitRun() {
    clearInterval(tickId); tickId = null;
    releaseWake();
    document.body.classList.remove('focus');
    $('timerRun').hidden = true;
    $('timerSetup').hidden = false;
    syncSetup();
  }

  function tick() {
    if (!active) return;
    var sec = elapsedSec(), paused = !!active.pausedAt;
    var targetSec = active.target * 60;
    var ring = $('runRing'), timeEl = $('runTime');

    if (active.target) {
      if (sec < targetSec) {
        timeEl.textContent = MC.fmtClock(targetSec - sec);
        timeEl.classList.remove('over');
        $('runLabel').textContent = paused ? 'paused' : 'remaining';
        MC.setRing(ring, sec / targetSec);
        $('runNote').textContent = '';
      } else {
        timeEl.textContent = '+' + MC.fmtClock(sec - targetSec);
        timeEl.classList.add('over');
        $('runLabel').textContent = paused ? 'paused' : 'beyond your ' + active.target + ' min';
        MC.setRing(ring, 1);
        $('runNote').textContent = 'Your time is complete. Sit as long as you like. 🙏';
        if (!active.endRung && !paused) { active.endRung = true; save(); MC.bell('end'); if (navigator.vibrate) navigator.vibrate([200, 120, 200]); }
      }
    } else {
      timeEl.textContent = MC.fmtClock(sec);
      timeEl.classList.remove('over');
      $('runLabel').textContent = paused ? 'paused' : 'elapsed';
      MC.setRing(ring, (sec % 3600) / 3600);
    }

    if (active.interval && !paused) {
      var idx = Math.floor(sec / (active.interval * 60));
      if (idx > active.lastInt) {
        // skip an interval bell that coincides with the end bell
        if (!(active.target && Math.abs(idx * active.interval * 60 - targetSec) < 1)) MC.bell('interval');
        active.lastInt = idx; save();
      }
    }
    $('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
  }

  $('pauseBtn').addEventListener('click', function () {
    if (!active) return;
    MC.audioUnlock();
    if (active.pausedAt) { active.pausedMs += Date.now() - active.pausedAt; active.pausedAt = null; requestWake(); }
    else { active.pausedAt = Date.now(); }
    save(); tick();
  });

  $('endBtn').addEventListener('click', function () {
    if (!active) return;
    var sec = elapsedSec();
    if (sec < 60 && !window.confirm('That was less than a minute. Save it anyway?')) return;
    var minutes = Math.max(0.1, Math.round(sec / 60 * 10) / 10);
    if (!active.pausedAt) active.pausedAt = Date.now();   // freeze while the sheet is open
    save(); tick();
    MC.openSession({
      mode: 'timer', start: active.startedAt, minutes: minutes,
      onDone: function (result) {
        if (result === 'saved' || result === 'cancel') {
          active = null; save(); exitRun();
          MC.go(result === 'saved' ? 'home' : 'timer');
        }
      }
    });
  });

  $('cancelRunBtn').addEventListener('click', function () {
    if (!window.confirm('Discard this sitting? It will not be saved.')) return;
    active = null; save(); exitRun();
  });

  /* ---------- Screen wake lock ---------- */
  function requestWake() {
    if (!('wakeLock' in navigator) || (active && active.pausedAt)) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && active) { requestWake(); tick(); }
  });

  /* ---------- View hook ---------- */
  MC.views.timer = {
    show: function () {
      if (active) enterRun();
      else { $('timerRun').hidden = true; $('timerSetup').hidden = false; syncSetup(); }
    }
  };
  MC.timerActive = function () { return !!active; };
})();
