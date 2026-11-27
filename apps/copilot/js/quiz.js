/* Meditation Copilot — Quizzes (v0.22): check your understanding of a topic.
 *
 *  10 questions (multiple choice up to 4 options, or yes/no), shuffled on every attempt; one question at a time.
 *  Pass mark: 8 of 10 (set per quiz by the admin). Passing shows every answer with a short explanation.
 *  Not passing shows the score and the questions to review (not the answers), suggests something related to read or
 *  watch, and opens "Try again" after a wait (10 minutes, set per quiz). After 3 tries without passing, all answers
 *  are shown; later tries still earn the points for trying.
 *  Points (decided 2026-11-27): trying 5 (first try) then 2 per try · passing 25 on the 1st try, 15 on the 2nd, 10 on the 3rd,
 *  nothing more after the answers have been shown or after passing once.
 *  Results are kept with the person's own data (collection 'quizzes'); only an anonymous "passed" count reaches the center.
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var col = MC.collection('quizzes');
  var TRY = [5, 2], PASS = [25, 15, 10], REVEAL_AFTER = 3;
  var run = null;   // the attempt in progress: { quiz, order, picks, i }

  function rec(id) { return col.get('quiz:' + id); }
  function quizOf(id) { var x = MC.learn ? MC.learn.item(id) : null; return x && x.kind === 'quiz' ? x : null; }
  function state(id) {
    var r = rec(id), q = quizOf(id), total = q && q.quiz ? q.quiz.questions.length : 10, at = (r && r.attempts) || [];
    var fails = at.filter(function (a) { return !a.passed; }).length;
    return { attempts: at.length, passed: !!(r && r.passedAt), passedAt: r && r.passedAt, best: at.reduce(function (m, a) { return Math.max(m, a.score); }, 0), total: total,
      revealed: !(r && r.passedAt) && fails >= REVEAL_AFTER, last: at[at.length - 1] || null };
  }
  function waitLeft(q) {   // ms until "Try again" opens
    var s = state(q.id);
    if (!s.last || s.passed || s.last.passed) return 0;
    return Math.max(0, s.last.at + (q.retryMinutes == null ? 10 : q.retryMinutes) * 60000 - Date.now());
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function start(q) {
    var qs = q.quiz.questions;
    run = { quiz: q, i: 0, picks: [], order: shuffle(qs.map(function (_, i) { return i; })).map(function (qi) {
      var opts = qs[qi].options.map(function (_, k) { return k; }), yn = qs[qi].options.length === 2 && /^(yes|no|true|false)$/i.test(qs[qi].options[0]);
      return { qi: qi, opts: yn ? opts : shuffle(opts) };   // keep Yes/No in their usual order
    }) };
  }
  function finish(el) {
    var q = run.quiz, qs = q.quiz.questions, score = 0;
    run.order.forEach(function (o, n) { if (run.picks[n] === qs[o.qi].answer) score++; });
    var before = state(q.id), passed = score >= (q.passMark || 8), n = before.attempts + 1;
    var pts = n === 1 ? TRY[0] : TRY[1];
    if (passed && !before.passed && !before.revealed && n <= PASS.length) pts += PASS[n - 1];
    var attempt = { at: Date.now(), score: score, total: qs.length, passed: passed, pts: before.passed ? 0 : pts, picks: run.order.map(function (o, k) { return [o.qi, run.picks[k]]; }) };
    var r = rec(q.id);
    if (r) col.update(r.id, { attempts: r.attempts.concat([attempt]), passedAt: r.passedAt || (passed ? attempt.at : null) });
    else col.add({ id: 'quiz:' + q.id, quiz: q.id, title: q.title, attempts: [attempt], passedAt: passed ? attempt.at : null });
    if (passed && !before.passed && MC.library) MC.library.hit(q.id, 'pass');
    MC.track('quiz', { passed: passed });
    run = null; MC.emit('data');
    renderResult(el, q, attempt);
  }

  /* ---------- screens ---------- */
  function head(q, extra) {
    return '<div class="k-top"><button class="link" id="artBack" style="padding:6px 0">‹ Back</button></div><div class="card article quiz"><div class="k-head"><span class="cat">🧩 Quiz</span>' +
      (MC.learn ? MC.learn.saveBtn(q) : '') + '</div><h1>' + MC.esc(q.title) + '</h1>' + (extra || '');
  }
  function bindBack(el) { $('artBack').addEventListener('click', function () { run = null; history.length > 1 ? history.back() : MC.go('learn'); }); }
  function suggestions(q) {
    var ids = (q.quiz && q.quiz.related) || [], items = ids.map(function (id) { return MC.learn.item(id); }).filter(Boolean);
    if (!items.length) items = MC.learn.all().filter(function (y) { return y.kind !== 'quiz' && (y.topics || []).some(function (t) { return (q.topics || []).indexOf(t) >= 0; }); }).slice(0, 3);
    return items.length ? '<div class="section-title k-sec">While you wait, read or watch</div><div class="card k-list">' + items.slice(0, 3).map(MC.learn.rowHTML).join('') + '</div>' : '';
  }
  function answersHTML(q, picks) {
    var qs = q.quiz.questions, mine = {};
    (picks || []).forEach(function (p) { mine[p[0]] = p[1]; });
    return '<ol class="q-review">' + qs.map(function (z, i) {
      var ok = mine[i] === z.answer;
      return '<li class="' + (picks ? (ok ? 'ok' : 'no') : '') + '"><b>' + MC.esc(z.q) + '</b><span class="q-ans">✓ ' + MC.esc(z.options[z.answer]) + '</span>' +
        (picks && !ok && mine[i] != null ? '<span class="q-mine">Your answer: ' + MC.esc(z.options[mine[i]]) + '</span>' : '') +
        (z.explain ? '<span class="small">' + MC.esc(z.explain) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function renderIntro(el, q) {
    var s = state(q.id), n = q.quiz.questions.length, wait = waitLeft(q);
    var intro = '<p class="muted">' + MC.esc(q.summary || '') + '</p><ul class="q-facts"><li>' + n + ' questions, one at a time</li><li>Pass with ' + (q.passMark || 8) + ' or more correct</li>' +
      '<li>Points: ' + (s.attempts ? '2 for trying' : '5 for trying') + (s.passed || s.revealed ? '' : ', +' + (PASS[s.attempts] || 0) + ' for passing now') + '</li></ul>';
    if (s.passed) intro = '<p class="q-badge ok">✓ Passed with ' + s.best + '/' + s.total + '</p>' + intro;
    else if (s.attempts) intro = '<p class="q-badge">◐ Tried ' + s.attempts + '×, best ' + s.best + '/' + s.total + '</p>' + intro;
    var action = wait ? waitHTML(wait) : '<button class="btn btn-primary btn-block btn-xl" id="qStart">' + (s.attempts ? (s.passed ? 'Take it again for practice' : 'Try again') : 'Start the quiz') + '</button>';
    var reveal = (s.passed || s.revealed) ? '<details class="q-all"><summary>Show all answers</summary>' + answersHTML(q, null) + '</details>' : '';
    el.innerHTML = head(q, intro + action + reveal) + '</div>' + (wait ? suggestions(q) : '');
    bindBack(el);
    if ($('qStart')) $('qStart').onclick = function () { start(q); renderQuestion(el); };
    if (wait) tick(el, q);
  }
  function waitHTML(ms) {
    return '<div class="q-wait"><p>Take a short break before trying again. 🙏</p><button class="btn btn-ghost btn-block" disabled id="qWait">Try again in <b id="qLeft">' + fmtLeft(ms) + '</b></button></div>';
  }
  function fmtLeft(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  var timer = null;
  function tick(el, q) {
    clearInterval(timer);
    timer = setInterval(function () {
      if (!document.body.contains(el) || !$('qLeft')) { clearInterval(timer); return; }
      var left = waitLeft(q);
      if (left <= 0) { clearInterval(timer); renderIntro(el, q); return; }
      $('qLeft').textContent = fmtLeft(left);
    }, 1000);
  }
  function renderQuestion(el) {
    var q = run.quiz, o = run.order[run.i], z = q.quiz.questions[o.qi], n = run.order.length, pick = run.picks[run.i];
    el.innerHTML = head(q, '<div class="q-prog"><span>Question ' + (run.i + 1) + ' of ' + n + '</span><div class="bar"><div class="fill" style="width:' + Math.round(run.i / n * 100) + '%"></div></div></div>' +
      '<p class="q-q">' + MC.esc(z.q) + '</p><div class="q-opts" role="radiogroup">' + o.opts.map(function (k) {
        return '<button type="button" class="q-opt' + (pick === k ? ' on' : '') + '" role="radio" aria-checked="' + (pick === k) + '" data-k="' + k + '">' + MC.esc(z.options[k]) + '</button>'; }).join('') + '</div>' +
      '<div class="actions"><button class="btn btn-ghost" id="qPrev"' + (run.i ? '' : ' disabled') + '>‹ Back</button><button class="btn btn-primary" id="qNext"' + (pick == null ? ' disabled' : '') + '>' + (run.i === n - 1 ? 'Finish' : 'Next ›') + '</button></div></div>');
    bindBack(el);
    el.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { run.picks[run.i] = Number(b.dataset.k); renderQuestion(el); }; });
    $('qPrev').onclick = function () { run.i--; renderQuestion(el); };
    $('qNext').onclick = function () { if (run.i === n - 1) finish(el); else { run.i++; renderQuestion(el); } };
  }
  function renderResult(el, q, a) {
    var s = state(q.id), html;
    if (a.passed) {
      html = '<div class="q-result ok"><div class="q-score">' + a.score + '<small>/' + a.total + '</small></div><p><b>🎉 You passed!</b>' + (a.pts ? ' +' + a.pts + ' points' : '') + '</p></div>' +
        '<div class="section-title k-sec">All the answers</div>' + answersHTML(q, a.picks);
    } else if (s.revealed) {
      html = '<div class="q-result"><div class="q-score">' + a.score + '<small>/' + a.total + '</small></div><p>Not passed this time.' + (a.pts ? ' +' + a.pts + ' points for trying.' : '') + '</p>' +
        '<p class="small">After ' + REVEAL_AFTER + ' tries, here are all the answers with explanations. You can take the quiz again any time for practice.</p></div>' + answersHTML(q, a.picks);
    } else {
      var missed = a.picks.filter(function (p) { return p[1] !== q.quiz.questions[p[0]].answer; }).map(function (p) { return q.quiz.questions[p[0]].q; });
      html = '<div class="q-result"><div class="q-score">' + a.score + '<small>/' + a.total + '</small></div><p>Almost! You need ' + (q.passMark || 8) + ' to pass.' + (a.pts ? ' +' + a.pts + ' points for trying.' : '') + '</p></div>' +
        '<div class="section-title k-sec">Questions to review</div><ul class="q-missed">' + missed.map(function (m) { return '<li>' + MC.esc(m) + '</li>'; }).join('') + '</ul>' +
        '<p class="small muted">The answers are shown when you pass, or after ' + REVEAL_AFTER + ' tries.</p>' + waitHTML(waitLeft(q));
    }
    el.innerHTML = head(q, html + '<button class="btn btn-ghost btn-block" id="qDone" style="margin-top:12px">Back to quizzes</button>') + '</div>' + (!a.passed && !s.revealed ? suggestions(q) : MC.learn.related(q));
    bindBack(el);
    $('qDone').onclick = function () { location.hash = 'learn?list=quiz'; };
    if (!a.passed && !s.revealed) tick(el, q);
    window.scrollTo(0, 0);
  }

  function render(el, id) {
    var q = quizOf(id);
    if (!q || !q.quiz || !(q.quiz.questions || []).length) { el.innerHTML = '<div class="k-top"><button class="link" id="artBack">‹ Back</button></div><div class="card"><p>This quiz is not available.</p></div>'; bindBack(el); return; }
    if (run && run.quiz.id === id) renderQuestion(el); else { run = null; renderIntro(el, q); }
  }

  /* ---------- points (Rewards) ---------- */
  function attempts() { return col.all().reduce(function (l, r) { return l.concat((r.attempts || []).map(function (a) { return a; })); }, []); }
  if (MC.rewards && MC.rewards.addRule) {
    MC.rewards.addRule({ id: 'quiz_try', category: 'learning', icon: '🧩', name: 'Quiz Taken', desc: '5 points for your first try at a quiz, 2 for each try after', points: 5, repeat: true,
      count: function () { return attempts().length; },
      total: function () { return col.all().reduce(function (n, r) { return n + (r.attempts || []).reduce(function (m, a, i) { return m + (r.passedAt && a.at > r.passedAt ? 0 : (i ? TRY[1] : TRY[0])); }, 0); }, 0); } });
    MC.rewards.addRule({ id: 'quiz_pass', category: 'learning', icon: '🏅', name: 'Quiz Passed', desc: 'Pass a quiz: 25 points on the first try, 15 on the second, 10 on the third', points: 25, repeat: true,
      count: function () { return col.all().filter(function (r) { return r.passedAt; }).length; },
      total: function () { return col.all().reduce(function (n, r) { var i = (r.attempts || []).findIndex(function (a) { return a.passed; }); return n + (i >= 0 && i < PASS.length ? PASS[i] : 0); }, 0); } });
  }

  MC.quiz = { render: render, state: state,
    passedCount: function () { return col.all().filter(function (r) { return r.passedAt; }).length; },
    passesBetween: function (from, to) { return col.all().filter(function (r) { return r.passedAt && r.passedAt >= from && r.passedAt < to; }).length; } };
})();
