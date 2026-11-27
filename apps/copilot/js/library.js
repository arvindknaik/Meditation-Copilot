/* Meditation Copilot — Library and Education challenges (v0.20, Challenge Program step 2; see SOSMN-SRM.md section 10)
 *
 *  What people read and watch:
 *    quote    the Thought for today            "✓ I read it" on Today; earlier days can be read later (catch-up)
 *    article  Learn articles and center links  "Mark as read" at the end of an article; outside links on return
 *    chapter  chapters of a book               choose a book → "I'm reading this" → tick chapters → "Finished" (+100)
 *    video    recommended talks and satsangs   opens the video → "✓ Watched" on return
 *  Each one is a record in the person's own synced data (collection 'reads'), like their sittings: the center
 *  never sees it. The center's Library (approved books, videos and article links) comes from /api/library.
 *  Education challenges (kind 'education') run in js/goals.js and count these records with countFor().
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var reads = MC.collection('reads');
  var LIB_KEY = 'meditation-copilot:library', PENDING_KEY = 'meditation-copilot:open-link', libAt = 0;
  var PTS = { quote: 2, article: 10, chapter: 15, video: 10, book_done: 100 };
  var ICON = { quote: '💭', article: '📰', book: '📖', chapter: '📖', video: '▶️' };
  var UNIT = { quote: ['thought', 'thoughts'], article: ['article', 'articles'], book: ['chapter', 'chapters'], video: ['talk', 'talks'], quiz: ['quiz', 'quizzes'] };

  /* ---------- the center's Library ---------- */
  function items(kind) { var l = (MC.store.get(LIB_KEY, null) || {}).items || []; return kind ? l.filter(function (x) { return x.kind === kind; }) : l; }
  function item(id) { return items().filter(function (x) { return x.id === id; })[0] || null; }
  function load(force) {
    if (!(MC.events && MC.events.enabled()) || (!force && Date.now() - libAt < 10 * 60000)) return Promise.resolve(items());
    libAt = Date.now();
    return MC.events.api('GET', '/api/library').then(function (j) {
      MC.store.set(LIB_KEY, { items: j.items || [], at: Date.now() }); MC.emit('library'); return items();
    }).catch(function () { libAt = 0; return items(); });
  }

  /* ---------- reads ---------- */
  function key(kind, ref) { return kind + ':' + ref; }
  function has(kind, ref) { return !!reads.get(key(kind, ref)); }
  // Points for one item: the active education challenge for that material can set its own; otherwise the defaults
  function pointsFor(kind) {
    var mat = kind === 'chapter' ? 'book' : kind, c = activeRuns().filter(function (r) { return r.material === mat && r.itemPoints >= 0; })[0];
    return kind !== 'book_done' && c && c.itemPoints !== undefined ? Number(c.itemPoints) : PTS[kind];
  }
  function mark(kind, ref, extra) {
    if (has(kind, ref)) return null;
    var pts = pointsFor(kind);
    var r = reads.add(Object.assign({ id: key(kind, ref), kind: kind, ref: String(ref), at: Date.now(), day: MC.toISO(MC.today()), pts: pts }, extra || {}));
    MC.track('read', { kind: kind });
    if (kind !== 'book_done') MC.toast(ICON[kind] + ' ' + ({ quote: 'Thought read', article: 'Article read', chapter: 'Chapter read', video: 'Video watched' }[kind]) + ' · +' + pts + ' points');
    MC.emit('data');
    return r;
  }
  // Anonymous counts for the admin site (opened / finished / quiz passed): only the item's id is sent, never who
  function hit(id, action) {
    if (!(MC.events && MC.events.enabled()) || !id || /^(quote|chapter)/.test(id)) return;
    try { MC.events.api('POST', '/api/library/hit', { id: id, action: action }).catch(function () {}); } catch (e) { /* offline */ }
  }
  function unmark(kind, ref) { if (has(kind, ref)) { reads.remove(key(kind, ref)); MC.emit('data'); } }
  function all(kind) { return reads.all().filter(function (r) { return !kind || r.kind === kind; }); }

  /* ---------- books ---------- */
  function bookState(id) {
    var b = item(id) || {}, n = Number(b.chapters) || 0, done = [];
    for (var i = 1; i <= Math.max(n, 300); i++) { if (has('chapter', id + '#' + i)) done.push(i); else if (i > n) break; }
    return { book: b, chapters: n, done: done, finished: has('book_done', id), reading: has('book_start', id) || done.length > 0 };
  }
  function finishBook(id) {
    var s = bookState(id);
    if (s.finished) return;
    mark('book_done', id, { title: s.book.title || '', pts: PTS.book_done }); hit(id, 'done');
    MC.toast('🎉 You finished “' + (s.book.title || 'the book') + '”! +' + PTS.book_done + ' points', 5000);
    MC.track('book_finished', {});
  }

  /* ---------- counting for education challenges (js/goals.js) ---------- */
  function activeRuns() {
    return (MC.goals && MC.goals.allRaw ? MC.goals.allRaw() : []).filter(function (c) { return c.type === 'center' && c.kind === 'education' && c.status === 'active'; });
  }
  function countFor(c) {
    var from = MC.parseDate(c.startOn).getTime(), to = MC.addDays(MC.parseDate(c.endOn), 1).getTime();
    if (c.material === 'quote') {
      // The thoughts of the challenge's own days; reading an earlier day's thought later still counts (catch-up)
      return all('quote').filter(function (r) { return r.ref >= c.startOn && r.ref <= c.endOn && r.at < to; }).length;
    }
    if (c.material === 'quiz') return MC.quiz ? MC.quiz.passesBetween(from, to) : 0;
    if (c.material === 'book') return all('chapter').filter(function (r) { return r.bookId === c.bookId && r.at >= from && r.at < to; }).length;
    return all(c.material).filter(function (r) { return r.at >= from && r.at < to; }).length;
  }
  // How many should be done by now at the suggested pace, counting only periods that are over (a guide only: catching up is always allowed)
  function expectedBy(c, total) {
    var past = MC.daysBetween(MC.parseDate(c.startOn), MC.today()), per = Number(c.perPeriod) || 0;   // whole days before today
    if (!per || past <= 0) return 0;
    var periods = c.cadence === 'day' ? past : c.cadence === 'month' ? Math.floor(past / 30) : Math.floor(past / 7);
    return Math.min(total, periods * per);
  }
  function unit(c, n) { var u = UNIT[c.material] || ['item', 'items']; return n === 1 ? u[0] : u[1]; }

  /* ---------- Thought for today ---------- */
  function quoteButton(dayKey) {
    var done = has('quote', dayKey);
    return '<button type="button" class="read-btn' + (done ? ' done' : '') + '" data-quote="' + MC.esc(dayKey) + '"' + (done ? ' aria-pressed="true"' : '') + '>' + (done ? '✓ Read' : '✓ I read it') + '</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quote]'); if (!b) return;
    var k = b.dataset.quote;
    if (has('quote', k)) return;
    var q = MC.thoughtFor ? MC.thoughtFor(MC.parseDate(k)) : null;
    mark('quote', k, { title: q ? q.text.slice(0, 80) : '' });
    b.outerHTML = quoteButton(k);
    if ($('cuList') && b.closest('#cuList')) renderCatchUp();
  });

  // Catch up on earlier days' thoughts (for the Daily Thought challenge)
  var cuDlg = null, cuRun = null;
  function missedQuoteDays(c) {
    var out = [], last = MC.today() < MC.parseDate(c.endOn) ? MC.today() : MC.parseDate(c.endOn);
    for (var d = MC.parseDate(c.startOn); d <= last; d = MC.addDays(d, 1)) { var k = MC.toISO(d); if (!has('quote', k)) out.push(k); }
    return out;
  }
  function renderCatchUp() {
    var days = missedQuoteDays(cuRun);
    $('cuList').innerHTML = days.length ? days.map(function (k) {
      var q = MC.thoughtFor(MC.parseDate(k));
      return '<div class="cu-item"><span class="small muted">' + MC.esc(MC.fmtDate(MC.parseDate(k), { weekday: 'short', month: 'short', day: 'numeric' })) + '</span>' +
        '<blockquote class="quote flat">“' + MC.esc(q.text) + '”<cite>— ' + MC.esc(q.author || 'Unknown') + '</cite></blockquote>' + quoteButton(k) + '</div>';
    }).join('') : '<p>You are all caught up. 🙏</p>';
  }
  function openCatchUp(c) {
    cuRun = c;
    if (!cuDlg) { cuDlg = document.createElement('dialog'); cuDlg.className = 'sheet'; cuDlg.id = 'cuDlg'; document.body.appendChild(cuDlg); }
    cuDlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">Catch up</h2><p class="small" style="margin:-4px 0 12px">Thoughts from the days you missed. Read each one slowly, then tick it.</p>' +
      '<div id="cuList"></div><div class="actions"><button type="button" class="btn btn-primary" id="cuDone">Done</button></div></div>';
    renderCatchUp();
    $('cuDone').addEventListener('click', function () { cuDlg.close(); MC.emit('data'); });
    if (cuDlg.showModal) cuDlg.showModal(); else cuDlg.setAttribute('open', '');
  }

  /* ---------- outside links (videos, center articles): "did you watch/read it?" on return ---------- */
  function openLink(x) {
    MC.store.set(PENDING_KEY, { id: x.id, kind: x.kind, title: x.title, at: Date.now() });
    window.open(x.url, '_blank', 'noopener');
  }
  var askDlg = null;
  function askOnReturn() {
    var p = MC.store.get(PENDING_KEY, null);
    if (!p || document.visibilityState !== 'visible' || Date.now() - p.at < 15000) return;
    MC.store.del(PENDING_KEY);
    if (Date.now() - p.at > 12 * 3600000 || has(p.kind === 'video' ? 'video' : 'article', p.id)) return;
    if (!askDlg) { askDlg = document.createElement('dialog'); askDlg.className = 'sheet'; askDlg.id = 'askDlg'; document.body.appendChild(askDlg); }
    var v = p.kind === 'video';
    askDlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">' + (v ? 'Did you watch it?' : 'Did you read it?') + '</h2><p>“' + MC.esc(p.title) + '”</p>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" id="askNo">Not yet</button><button type="button" class="btn btn-primary" id="askYes">' + (v ? '✓ Watched' : '✓ I read it') + '</button></div></div>';
    $('askNo').addEventListener('click', function () { askDlg.close(); });
    $('askYes').addEventListener('click', function () { mark(v ? 'video' : 'article', p.id, { title: p.title, lib: true }); hit(p.id, 'done'); askDlg.close(); if (MC.current === 'learn') MC.views.learn.show(); });
    if (askDlg.showModal) askDlg.showModal(); else askDlg.setAttribute('open', '');
  }
  document.addEventListener('visibilitychange', askOnReturn);
  window.addEventListener('focus', askOnReturn);

  /* ---------- Learn: reading list, books, videos ---------- */
  function readingSummary() {
    var n = { quote: all('quote').length, article: all('article').length, chapter: all('chapter').length, video: all('video').length, book: all('book_done').length,
      quiz: MC.quiz ? MC.quiz.passedCount() : 0 };
    if (!n.quote && !n.article && !n.chapter && !n.video && !n.quiz) return '';
    return '<div class="card reading-card"><div class="section-title" style="margin-bottom:6px">Your reading</div><div class="rd-grid rd-5">' +
      [['💭', n.quote, 'thoughts'], ['📰', n.article, 'articles'], ['📖', n.chapter, 'chapters'], ['▶️', n.video, 'talks'], ['🧩', n.quiz, 'quizzes']].map(function (x) {
        return '<span><b>' + x[0] + ' ' + x[1] + '</b><small>' + x[2] + '</small></span>'; }).join('') + '</div>' +
      (n.book ? '<p class="small" style="margin:8px 0 0">🎉 Books finished: ' + n.book + '</p>' : '') +
      '<p class="small muted" style="margin:8px 0 0">Kept with your own data, like your sittings. The center doesn’t see it.</p></div>';
  }
  function browseHTML() {
    var books = items('book'), videos = items('video'), arts = items('article'), html = readingSummary();
    if (books.length) html += '<div class="section-title" style="margin-top:20px">Books by the Masters</div>' + books.map(function (b) {
      var s = bookState(b.id);
      return '<button class="topic-row lib-item" data-book="' + MC.esc(b.id) + '">' + (b.image ? '<img class="lib-thumb" src="' + MC.esc(b.image) + '" alt="" loading="lazy">' : '<span class="ti" aria-hidden="true">📖</span>') +
        '<span><b>' + MC.esc(b.title) + '</b><small>' + MC.esc(b.author || '') + (s.finished ? ' · ✓ Finished' : s.done.length ? ' · ' + s.done.length + ' of ' + s.chapters + ' chapters' : '') + '</small></span></button>';
    }).join('');
    if (videos.length) html += '<div class="section-title" style="margin-top:20px">Talks and satsangs</div>' + videos.map(function (v) {
      var seen = has('video', v.id);
      return '<button class="topic-row lib-item" data-link="' + MC.esc(v.id) + '"><span class="ti" aria-hidden="true">' + (seen ? '✅' : '▶️') + '</span><span><b>' + MC.esc(v.title) + '</b><small>' +
        MC.esc([v.author, v.minutes ? v.minutes + ' min' : '', seen ? 'Watched' : ''].filter(Boolean).join(' · ')) + '</small></span><span class="ext" aria-hidden="true">↗</span></button>';
    }).join('');
    if (arts.length) html += '<div class="section-title" style="margin-top:20px">Recommended reading</div>' + arts.map(function (a) {
      var seen = has('article', a.id);
      return '<button class="topic-row lib-item" data-link="' + MC.esc(a.id) + '"><span class="ti" aria-hidden="true">' + (seen ? '✅' : '📰') + '</span><span><b>' + MC.esc(a.title) + '</b><small>' +
        MC.esc([a.summary ? a.summary.slice(0, 90) + (a.summary.length > 90 ? '…' : '') : a.author, seen ? 'Read' : ''].filter(Boolean).join(' · ')) + '</small></span><span class="ext" aria-hidden="true">↗</span></button>';
    }).join('');
    return html;
  }
  function bindBrowse(el) {
    el.querySelectorAll('[data-book]').forEach(function (b) { b.addEventListener('click', function () { location.hash = 'learn?b=' + encodeURIComponent(b.dataset.book); }); });
    el.querySelectorAll('[data-link]').forEach(function (b) { b.addEventListener('click', function () { var x = item(b.dataset.link); if (x) openLink(x); }); });
  }
  function bookHTML(id, saveBtn) {
    var s = bookState(id), b = s.book;
    if (!b.id) return '<button class="link" id="artBack" style="padding:6px 0">‹ Back</button><div class="card"><p>This book is no longer on the reading list.</p></div>';
    var grid = '';
    for (var i = 1; i <= s.chapters; i++) grid += '<button type="button" class="ch-btn' + (s.done.indexOf(i) >= 0 ? ' on' : '') + '" data-ch="' + i + '" aria-pressed="' + (s.done.indexOf(i) >= 0) + '">' + i + '</button>';
    var allDone = s.chapters && s.done.length >= s.chapters;
    return '<button class="link" id="artBack" style="padding:6px 0">‹ Back</button>' +
      '<div class="card article book">' + (b.image ? '<img class="book-cover" src="' + MC.esc(b.image) + '" alt="Cover of ' + MC.esc(b.title) + '">' : '') +
      '<div class="k-head"><span class="cat">📖 Book</span>' + (saveBtn ? saveBtn(b) : '') + '</div><h1>' + MC.esc(b.title) + '</h1><p class="muted" style="margin-top:-4px">' + MC.esc(b.author || '') + '</p>' +
      (b.summary ? '<p>' + MC.esc(b.summary) + '</p>' : '') +
      (b.url ? '<a class="btn btn-soft btn-sm" href="' + MC.esc(b.url) + '" target="_blank" rel="noopener">Get the book ↗</a>' : '') +
      (s.finished ? '<div class="book-done">🎉 Finished. Beautiful work.</div>' :
        !s.reading ? '<button class="btn btn-primary btn-block" id="bkStart" style="margin-top:16px">I’m reading this</button>' :
        '<div class="section-title" style="margin-top:18px">Chapters read <span class="small muted">' + s.done.length + ' of ' + s.chapters + '</span></div>' +
        '<div class="ch-grid-btns">' + grid + '</div><p class="small muted">Tick each chapter when you’ve read it. A chapter or two a week is a lovely pace.</p>' +
        (allDone ? '<button class="btn btn-gold btn-block btn-xl" id="bkFinish" style="margin-top:12px">🎉 I finished the book</button>' : '')) + '</div>';
  }
  function bindBook(el, id, saveBtn) {
    $('artBack').addEventListener('click', function () { history.length > 1 ? history.back() : MC.go('learn'); });
    if ($('bkStart')) $('bkStart').addEventListener('click', function () { reads.add({ id: key('book_start', id), kind: 'book_start', ref: id, at: Date.now(), pts: 0 }); MC.emit('data'); render(); });
    el.querySelectorAll('[data-ch]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.dataset.ch), ref = id + '#' + n;
        if (has('chapter', ref)) { if (window.confirm('Untick chapter ' + n + '?')) unmark('chapter', ref); }
        else mark('chapter', ref, { bookId: id, n: n, title: (item(id) || {}).title || '' });
        render();
      });
    });
    if ($('bkFinish')) $('bkFinish').addEventListener('click', function () { finishBook(id); render(); });
    function render() { el.innerHTML = bookHTML(id, saveBtn) + (MC.learn && bookState(id).book.id ? MC.learn.related(bookState(id).book) : ''); bindBook(el, id, saveBtn); }
  }
  function renderBook(el, id, saveBtn) { el.innerHTML = bookHTML(id, saveBtn) + (MC.learn && bookState(id).book.id ? MC.learn.related(bookState(id).book) : ''); bindBook(el, id, saveBtn); }

  // Choose a book for the book challenge
  var bkDlg = null;
  function chooseBook(done) {
    var books = items('book');
    if (!books.length) { MC.toast('The center’s reading list is loading. Please try again in a moment.'); load(true); return; }
    if (!bkDlg) { bkDlg = document.createElement('dialog'); bkDlg.className = 'sheet'; bkDlg.id = 'bkDlg'; document.body.appendChild(bkDlg); }
    bkDlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">Choose a book</h2><p class="small" style="margin:-4px 0 12px">Books by the Masters of Science of Spirituality.</p>' +
      books.map(function (b) { var s = bookState(b.id);
        return '<button class="topic-row lib-item" data-pick="' + MC.esc(b.id) + '"' + (s.finished ? ' disabled' : '') + '>' + (b.image ? '<img class="lib-thumb" src="' + MC.esc(b.image) + '" alt="">' : '<span class="ti">📖</span>') +
          '<span><b>' + MC.esc(b.title) + '</b><small>' + MC.esc((b.author || '') + ' · ' + b.chapters + ' chapters' + (s.finished ? ' · already finished' : '')) + '</small></span></button>'; }).join('') +
      '<div class="actions"><button type="button" class="btn btn-ghost" id="bkCancel">Cancel</button></div></div>';
    bkDlg.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { bkDlg.close(); done(item(b.dataset.pick)); }); });
    $('bkCancel').addEventListener('click', function () { bkDlg.close(); });
    if (bkDlg.showModal) bkDlg.showModal(); else bkDlg.setAttribute('open', '');
  }

  /* ---------- the challenge card's buttons (js/goals.js) ---------- */
  function actionsFor(o) {
    var c = o.c;
    if (o.status !== 'active' || o.upcoming) return '';
    var behind = Math.max(0, expectedBy(c, o.total) - o.done);
    if (c.material === 'quote') return behind && missedQuoteDays(c).length > (has('quote', MC.toISO(MC.today())) ? 0 : 1) ? '<button class="btn btn-soft btn-sm" data-eact="catchup" data-gid="' + MC.esc(c.id) + '">Catch up</button>' : '<a class="btn btn-soft btn-sm" href="#home">Today’s thought</a>';
    if (c.material === 'book') return '<a class="btn btn-soft btn-sm" href="#learn?b=' + encodeURIComponent(c.bookId || '') + '">Open the book</a>';
    if (c.material === 'video') return '<a class="btn btn-soft btn-sm" href="#learn?list=video">Talks</a>';
    if (c.material === 'quiz') return '<a class="btn btn-soft btn-sm" href="#learn?list=quiz">Take a quiz</a>';
    return '<a class="btn btn-soft btn-sm" href="#learn?list=article">Read an article</a>';
  }
  function bindActions(card) {
    card.querySelectorAll('[data-eact="catchup"]').forEach(function (b) {
      b.addEventListener('click', function () { var c = (MC.goals.allRaw() || []).filter(function (x) { return x.id === b.dataset.gid; })[0]; if (c) openCatchUp(c); });
    });
  }

  /* ---------- rewards ---------- */
  if (MC.rewards && MC.rewards.addRule) {
    var R = [['quote', '💭', 'Thought for Today Read', 'Each Thought for today you read'], ['article', '📰', 'Article Read', 'Each article you read'],
      ['chapter', '📖', 'Chapter Read', 'Each chapter of a book by the Masters'], ['video', '▶️', 'Talk Watched', 'Each recommended talk or satsang you watch'],
      ['book_done', '🎉', 'Book Finished', 'Finish a book by the Masters']];
    R.forEach(function (x) {
      MC.rewards.addRule({ id: 'read_' + x[0], category: 'learning', icon: x[1], name: x[2], desc: x[3] + ' · ' + PTS[x[0]] + ' points', points: PTS[x[0]], repeat: true,
        count: function () { return all(x[0]).length; }, total: function () { return all(x[0]).reduce(function (a, r) { return a + (Number(r.pts) || 0); }, 0); } });
    });
  }

  MC.library = { load: load, items: items, item: item, has: has, mark: mark, unmark: unmark, all: all, bookState: bookState, finishBook: finishBook,
    countFor: countFor, expectedBy: expectedBy, unit: unit, quoteButton: quoteButton, openCatchUp: openCatchUp, missedQuoteDays: missedQuoteDays,
    browseHTML: browseHTML, bindBrowse: bindBrowse, readingSummary: readingSummary, hit: hit, renderBook: renderBook, chooseBook: chooseBook, actionsFor: actionsFor, bindActions: bindActions, openLink: openLink, PTS: PTS };
  MC.on('view', function (n) { if (n === 'learn' || n === 'roadmap') load(); });
  setTimeout(function () { load(); }, 1500);
})();
