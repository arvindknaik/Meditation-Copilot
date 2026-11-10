/* Meditation Copilot — Timer: 10-second settling moment, countdown or open sitting, start/end bells,
   pause, wake lock, survives reloads */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var SETTLE_SEC = 10;
  var active = MC.store.get(MC.KEYS.active, null);   // { startedAt, pausedAt, pausedMs, target, endRung }
  var prep = null;                                     // { until, target } during the settling moment (not persisted)
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
    $('startBellToggle').checked = MC.settings.startBell !== false;
    $('endBellToggle').checked = MC.settings.endBell !== false;
    var sel = selectedPreset();
    $('presetHint').textContent = sel
      ? 'A ' + sel + '-minute sitting. When the time is complete you can keep sitting as long as you like; tap End when ready.'
      : 'Open sitting: no set end time. Tap End when you are ready.';
  }
  $('presetChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    $('customMin').value = ''; MC.saveSettings({ preset: Number(c.dataset.p) }); syncSetup();
  });
  $('customMin').addEventListener('input', syncSetup);
  $('startBellToggle').addEventListener('change', function () { MC.saveSettings({ startBell: $('startBellToggle').checked }); });
  $('endBellToggle').addEventListener('change', function () { MC.saveSettings({ endBell: $('endBellToggle').checked }); });
  $('previewBellBtn').addEventListener('click', function () { MC.audioUnlock(); MC.bell('start'); });
  $('manualBtn').addEventListener('click', function () { MC.openSession({ mode: 'manual', minutes: MC.dailyTarget() }); });

  $('startBtn').addEventListener('click', function () {
    var target = selectedPreset();
    if ($('customMin').value) MC.saveSettings({ preset: target });
    MC.audioUnlock();                       // must happen on a tap so the bells can play later (iOS)
    prep = { until: Date.now() + SETTLE_SEC * 1000, target: target };
    enterRun();
  });

  /* ---------- Running ---------- */
  function save() { if (active) MC.store.set(MC.KEYS.active, active); else MC.store.del(MC.KEYS.active); }
  function elapsedSec() {
    if (!active) return 0;
    var now = active.pausedAt || Date.now();
    return Math.max(0, (now - active.startedAt - active.pausedMs) / 1000);
  }
  function beginSitting() {
    var target = prep.target;
    prep = null;
    active = { startedAt: Date.now(), pausedAt: null, pausedMs: 0, target: target, endRung: false };
    save();
    if (MC.settings.startBell !== false) MC.bell('start');
    MC.track('timer_start', { open: !target });
    setModeText();
    tick();
  }
  function setModeText() {
    var t = prep ? prep.target : active.target;
    $('runMode').textContent = t ? t + '-minute sitting' : 'Open sitting';
  }

  function enterRun() {
    $('timerSetup').hidden = true;
    $('timerRun').hidden = false;
    document.body.classList.add('focus');
    setModeText();
    requestWake();
    if (!tickId) tickId = setInterval(tick, 250);
    tick();
  }
  function exitRun() {
    clearInterval(tickId); tickId = null;
    prep = null;
    releaseWake();
    document.body.classList.remove('focus');
    $('timerRun').hidden = true;
    $('timerSetup').hidden = false;
    syncSetup();
  }

  function tick() {
    var ring = $('runRing'), timeEl = $('runTime');

    // Settling moment before the sitting begins
    if (prep) {
      var left = Math.max(0, (prep.until - Date.now()) / 1000);
      if (left <= 0) { beginSitting(); return; }
      timeEl.textContent = String(Math.ceil(left));
      timeEl.classList.remove('over');
      $('runLabel').textContent = 'settle in…';
      $('runNote').textContent = 'Sit comfortably, close your eyes, and let the body become still.';
      MC.setRing(ring, 1 - left / SETTLE_SEC);
      $('pauseBtn').textContent = 'Skip';
      $('endBtn').hidden = true;
      return;
    }
    if (!active) return;
    $('endBtn').hidden = false;

    var sec = elapsedSec(), paused = !!active.pausedAt;
    var targetSec = active.target * 60;
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
        if (!active.endRung && !paused) {
          active.endRung = true; save();
          if (MC.settings.endBell !== false) MC.bell('end');
          try { if (navigator.vibrate) navigator.vibrate([200, 120, 200]); } catch (e) {}
        }
      }
    } else {
      timeEl.textContent = MC.fmtClock(sec);
      timeEl.classList.remove('over');
      $('runLabel').textContent = paused ? 'paused' : 'elapsed';
      $('runNote').textContent = '';
      MC.setRing(ring, (sec % 3600) / 3600);
    }
    $('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
  }

  $('pauseBtn').addEventListener('click', function () {
    if (prep) { beginSitting(); return; }     // "Skip" during the settling moment
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
    if (active && !window.confirm('Discard this sitting? It will not be saved.')) return;
    active = null; save(); exitRun();
  });

  /* ---------- Screen wake lock ---------- */
  function requestWake() {
    if (!('wakeLock' in navigator) || (active && active.pausedAt)) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && (active || prep)) { requestWake(); tick(); }
  });

  /* ---------- View hook ---------- */
  MC.views.timer = {
    show: function () {
      if (active || prep) enterRun();
      else { $('timerRun').hidden = true; $('timerSetup').hidden = false; syncSetup(); }
    }
  };
  MC.timerActive = function () { return !!active; };
})();
