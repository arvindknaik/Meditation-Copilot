/* Meditation Copilot — session sheet: save from timer, add manually, edit, delete */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var dlg = $('sessionDlg');
  var mode = null, editId = null, onDone = null;

  function setQ(q) {
    $('sdQ').value = q;
    $('sdQVal').textContent = q + '%';
    $('sdQLabel').textContent = MC.qualityLabel(q);
    $('sdQ').style.setProperty('--pct', q + '%');
  }
  $('sdQ').addEventListener('input', function () { setQ(Number($('sdQ').value)); });

  function openDlg() {
    $('sdErr').textContent = '';
    $('sdDate').max = MC.toISO(MC.today());
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDlg() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  /* opts: { mode: 'timer'|'manual'|'edit', start, minutes, id, onDone } */
  MC.openSession = function (opts) {
    mode = opts.mode; editId = opts.id || null; onDone = opts.onDone || null;
    var s = mode === 'edit' ? MC.sessions.get(editId) : null;
    var start = s ? s.start : (opts.start || Date.now() - (opts.minutes || 30) * 60000);
    var d = new Date(start);
    $('sdDate').value = MC.toISO(d);
    $('sdTime').value = MC.toHM(d);
    $('sdMin').value = s ? s.minutes : (opts.minutes != null ? opts.minutes : '');
    setQ(s ? s.quality : MC.defaultQuality());
    $('sdNote').value = s ? (s.note || '') : '';
    $('sdTitle').textContent = mode === 'timer' ? 'Beautiful sitting 🙏' : mode === 'edit' ? 'Edit sitting' : 'Log a sitting';
    $('sdSub').textContent = mode === 'timer' ? 'Rate how deep it felt. This becomes your Quality Index.' : '';
    $('sdDelete').hidden = mode !== 'edit';
    $('sdCancel').textContent = mode === 'timer' ? 'Discard' : 'Cancel';
    openDlg();
    if (mode !== 'timer') setTimeout(function () { $('sdMin').focus(); }, 50);
  };

  $('sessionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = MC.parseDate($('sdDate').value);
    var hm = ($('sdTime').value || '00:00').split(':').map(Number);
    var min = Number($('sdMin').value);
    var err = '';
    if (!date) err = 'Please choose a date.';
    else if (!(min > 0)) err = 'Please enter the minutes you sat.';
    else if (min > 1440) err = 'That is more than a full day.';
    var start = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hm[0] || 0, hm[1] || 0).getTime() : 0;
    if (!err && start > Date.now() + 60000) err = 'That time is in the future.';
    if (err) { $('sdErr').textContent = err; return; }

    var q = Number($('sdQ').value);
    var rec = { start: start, minutes: Math.round(min * 10) / 10, quality: q, note: $('sdNote').value.trim() };
    var before = MC.completedHours();
    if (mode === 'edit') MC.sessions.update(editId, rec);
    else { rec.source = mode === 'timer' ? 'timer' : 'manual'; MC.sessions.add(rec); }
    MC.saveSettings({ lastQuality: q });
    MC.track(mode === 'edit' ? 'sitting_edited' : 'sitting_saved', { source: rec.source || 'edit', minBucket: rec.minutes < 15 ? '<15' : rec.minutes < 30 ? '15-29' : rec.minutes < 60 ? '30-59' : rec.minutes < 120 ? '60-119' : '120+' });
    closeDlg();

    var after = MC.completedHours();
    var crossed = (before != null && after != null) ? MC.milestoneCrossed(before, after) : null;
    if (crossed) MC.toast('🎉 Milestone reached: ' + crossed.toLocaleString() + ' effective hours!', 4500);
    else if (mode === 'edit') MC.toast('Sitting updated.');
    else MC.toast('Saved 🙏 +' + MC.fmtMin(rec.minutes * q / 100) + ' effective minutes');
    if (onDone) onDone('saved');
  });

  $('sdCancel').addEventListener('click', function () {
    if (mode === 'timer' && !window.confirm('Discard this sitting without saving?')) return;
    closeDlg();
    if (onDone) onDone('cancel');
  });
  $('sdDelete').addEventListener('click', function () {
    if (!window.confirm('Delete this sitting?')) return;
    MC.sessions.remove(editId);
    MC.track('sitting_deleted');
    closeDlg(); MC.toast('Sitting deleted.');
    if (onDone) onDone('deleted');
  });
  dlg.addEventListener('cancel', function (e) {   // Esc key
    if (mode === 'timer') { e.preventDefault(); $('sdCancel').click(); }
  });
})();
