/* Meditation Copilot — "Let the center know you finished?" (v0.20)
 * When someone signed in with Google or Microsoft finishes a challenge, Copilot asks once whether to tell the
 * Minneapolis Center. Only the challenge's name and the date are sent (POST /api/me/challenge-done), never sittings.
 * It counts toward a Seeker's orientation (2 challenges) on the admin site. */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var KEY = 'meditation-copilot:share-asked', dlg = null, busy = false;

  function finished() {
    var out = [], since = MC.toISO(MC.addDays(MC.today(), -30));
    try {
      (MC.challenge ? MC.challenge.all() : []).forEach(function (c) {
        if (c.done && c.completedOn && c.completedOn >= since) out.push({ ref: 'run:' + c.run.startedOn + ':' + (c.run.cid || '42'), title: c.run.title || '42-Day Challenge', on: c.completedOn });
      });
      (MC.goals ? MC.goals.all() : []).forEach(function (o) {
        var on = o.c.endedOn || o.c.endOn;
        if (o.status === 'done' && on >= since) out.push({ ref: 'goal:' + o.c.id, title: o.c.title || (o.kind && o.kind.name) || 'Challenge', on: on });
      });
    } catch (e) { /* not ready yet */ }
    return out;
  }
  function ask() {
    if (busy || !(MC.events && MC.events.enabled() && MC.events.signedInMode())) return;
    var asked = MC.store.get(KEY, {}) || {};
    var f = finished().filter(function (x) { return !asked[x.ref]; })[0];
    if (!f) return;
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'sheet'; dlg.id = 'shareDlg'; document.body.appendChild(dlg); }
    dlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">🏅 You finished “' + MC.esc(f.title) + '”!</h2>' +
      '<p>Would you like to let the Minneapolis Center know? It helps the volunteers celebrate with you and suggest a next step.</p>' +
      '<p class="small muted">Only the challenge’s name and the date are shared, never your sittings.</p>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" id="shNo">No, thanks</button><button type="button" class="btn btn-primary" id="shYes">Let them know</button></div></div>';
    var done = function (v) { asked[f.ref] = v; MC.store.set(KEY, asked); dlg.close(); busy = false; };
    $('shNo').addEventListener('click', function () { done('no'); });
    $('shYes').addEventListener('click', function () {
      $('shYes').disabled = true;
      MC.events.withSession(function () { return MC.events.api('POST', '/api/me/challenge-done', { ref: f.ref, title: f.title, finishedOn: f.on }); })
        .then(function () { done('yes'); MC.toast('🙏 Shared with the center. Congratulations!'); }, function () { $('shYes').disabled = false; MC.toast('Couldn’t share right now. Please try again later.'); });
    });
    busy = true;
    dlg.addEventListener('close', function () { busy = false; }, { once: true });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  MC.on('view', function (n) { if (n === 'roadmap' || n === 'home') setTimeout(ask, 1200); });
  MC.share = { finished: finished, ask: ask };
})();
