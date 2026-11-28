/* Meditation Copilot — Learn: one place for all knowledge content (v0.22; see SOSMN-SRM.md section 11)
 *
 *  Types: articles, videos (talks), books and quizzes come from the center's Library (/api/library, cached by
 *  js/library.js); quotes (js/quotes.js) only appear in search results. The articles that used to be built into
 *  the app (js/knowledge.js) moved into the Library with the same ids; knowledge.js is still used before the Library
 *  has loaded the first time (offline) and for the app's own help articles.
 *
 *  Routes: #learn (hub) · #learn?list=article|video|book|quiz|saved · #learn?a=id · #learn?v=id · #learn?b=id · #learn?q=id
 *  Marks: ✓ done · ◐ in progress (book partly read, quiz tried) · ★ saved by the person (their own list, kept until they unsave)
 */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var K = window.MC_KNOWLEDGE || { featured: [], articles: [] };
  var saved = MC.collection('saved');
  var TYPES = { article: ['Articles', 'article', '📰'], video: ['Talks & videos', 'video', '▶️'], book: ['Books', 'book', '📖'], quiz: ['Quizzes', 'quiz', '🧩'] };
  var ORDER = ['article', 'video', 'book', 'quiz'];
  var TOPICS = { basics: 'Meditation basics', science: 'The science of meditation', masters: 'The Masters', satsang: 'Satsang & community', ethics: 'Ethical living',
    health: 'Health & wellbeing', peace: 'Inner & outer peace', seva: 'Seva', family: 'Family & youth' };
  var K_TOPIC = { 'Getting started': 'basics', Practice: 'basics', 'Why meditate': 'health', 'Science of Spirituality': 'masters' };
  var PAGE = 20;
  var STOP = ('a an and are as at be by can do does for from how i in is it me my of on or should the to what when '
    + 'where which who why will with you your about get am this that there their did').split(' ');
  var state = { q: '', type: '' }, listState = {};

  /* ---------- the content ---------- */
  function isHelp(a) { return a.category === 'Using this app'; }
  function fromK(a) {   // a built-in article in the same shape as a Library item
    var body = (a.body || []).join('\n\n') + ((a.links || []).length ? '\n\n**Read more**\n' + a.links.map(function (l) { return '- [' + l.label + '](' + l.url + ')'; }).join('\n') : '');
    return { id: a.id, kind: 'article', title: a.title, summary: a.summary, author: 'Science of Spirituality', icon: a.icon, topics: [K_TOPIC[a.category] || 'basics'],
      body: a.pending ? '' : body, url: a.pending && a.links && a.links[0] ? a.links[0].url : '', pinned: K.featured.indexOf(a.id) >= 0, priority: 100, keywords: a.keywords || '' };
  }
  function all() {
    var lib = MC.library ? MC.library.items() : [], have = {};
    lib.forEach(function (x) { have[x.id] = 1; });
    return lib.concat(K.articles.filter(function (a) { return !isHelp(a) && !have[a.id]; }).map(fromK));
  }
  function item(id) {
    var x = all().filter(function (i) { return i.id === id; })[0];
    if (x) return x;
    var h = K.articles.filter(function (a) { return a.id === id; })[0];   // app help articles
    return h ? fromK(h) : null;
  }
  function ofType(kind) { return all().filter(function (x) { return x.kind === kind; }); }

  /* ---------- marks: done / in progress / saved ---------- */
  function status(x) {
    var L = MC.library;
    if (!L) return '';
    if (x.kind === 'article') return L.has('article', x.id) ? 'done' : '';
    if (x.kind === 'video') return L.has('video', x.id) ? 'done' : '';
    if (x.kind === 'book') { var s = L.bookState(x.id); return s.finished ? 'done' : s.reading ? 'progress' : ''; }
    if (x.kind === 'quiz' && MC.quiz) { var q = MC.quiz.state(x.id); return q.passed ? 'done' : q.attempts ? 'progress' : ''; }
    return '';
  }
  function progressText(x) {
    if (x.kind === 'book' && MC.library) { var s = MC.library.bookState(x.id); return s.done.length + ' of ' + (s.chapters || '?') + ' chapters'; }
    if (x.kind === 'quiz' && MC.quiz) { var q = MC.quiz.state(x.id); return q.passed ? 'Passed ' + q.best + '/' + q.total : 'Tried ' + q.attempts + '×, best ' + q.best + '/' + q.total; }
    return '';
  }
  function isSaved(id) { return !!saved.get('s:' + id); }
  function toggleSave(x) {
    if (isSaved(x.id)) { saved.remove('s:' + x.id); MC.toast('Removed from Saved'); }
    else { saved.add({ id: 's:' + x.id, item: x.id, kind: x.kind, title: x.title, at: Date.now() }); MC.toast('★ Saved. Find it under Saved in Learn.'); }
    MC.emit('data');
  }
  function saveBtn(x) { var on = isSaved(x.id); return '<button type="button" class="save-btn' + (on ? ' on' : '') + '" data-save="' + MC.esc(x.id) + '" aria-pressed="' + on + '" title="' + (on ? 'Saved' : 'Save for later') + '">' + (on ? '★ Saved' : '☆ Save') + '</button>'; }
  function mark(x) {
    var s = status(x);
    return s === 'done' ? '<span class="mk done" title="Done">✓</span>' : s === 'progress' ? '<span class="mk prog" title="In progress">◐</span>' : '';
  }

  // Recommended order: pinned first, then the center's order, with things not yet done before finished ones
  function recommended(list) {
    return list.slice().sort(function (a, b) {
      var da = status(a) === 'done' ? 1 : 0, db = status(b) === 'done' ? 1 : 0;
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || da - db || (a.priority || 100) - (b.priority || 100) || a.title.localeCompare(b.title);
    });
  }

  /* ---------- rows and cards ---------- */
  function ytId(u) { var m = String(u || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
  function pic(x) {
    if (x.kind === 'book' && x.image) return '<img class="lib-thumb" src="' + MC.esc(x.image) + '" alt="" loading="lazy">';
    if (x.kind === 'video' && (x.image || ytId(x.url))) return '<img class="vid-thumb" src="' + MC.esc(x.image || 'https://i.ytimg.com/vi/' + ytId(x.url) + '/mqdefault.jpg') + '" alt="" loading="lazy">';
    return '<span class="ti" aria-hidden="true">' + (x.icon || TYPES[x.kind][2]) + '</span>';
  }
  function sub(x) {
    var p = status(x) === 'progress' || (x.kind === 'quiz' && status(x) === 'done') ? progressText(x) : '';
    var bits = x.kind === 'book' ? [x.author, p || (x.chapters ? x.chapters + ' chapters' : '')] : x.kind === 'video' ? [x.author, x.minutes ? x.minutes + ' min' : ''] :
      x.kind === 'quiz' ? [p || ((x.quiz && x.quiz.questions ? x.quiz.questions.length : 10) + ' questions')] : [(x.topics || []).map(function (t) { return TOPICS[t]; }).filter(Boolean)[0] || ''];
    return bits.filter(Boolean).join(' · ');
  }
  function rowHTML(x) {
    return '<button class="topic-row lib-item k-row" data-open="' + MC.esc(x.id) + '">' + pic(x) +
      '<span><b>' + MC.esc(x.title) + '</b><small>' + MC.esc(sub(x)) + '</small></span>' +
      '<span class="k-marks">' + (isSaved(x.id) ? '<span class="mk sv" title="Saved">★</span>' : '') + mark(x) + '</span></button>';
  }
  function open(id) {
    var x = item(id); if (!x) return;
    location.hash = 'learn?' + ({ article: 'a', video: 'v', book: 'b', quiz: 'q' }[x.kind]) + '=' + encodeURIComponent(id);
  }

  /* ---------- the hub ---------- */
  function renderBrowse() {
    var items = all(), html = '';
    // Continue: books being read, quizzes not yet passed, saved things not done yet
    var cont = items.filter(function (x) { return status(x) === 'progress'; })
      .concat(items.filter(function (x) { return isSaved(x.id) && !status(x); })).slice(0, 5);
    if (cont.length) html += '<div class="section-title k-sec">Continue</div><div class="card k-list">' + cont.map(rowHTML).join('') + '</div>';
    ORDER.forEach(function (k) {
      var list = recommended(items.filter(function (x) { return x.kind === k; }));
      if (!list.length) return;
      var done = list.filter(function (x) { return status(x) === 'done'; }).length;
      html += '<div class="section-title k-sec"><span>' + TYPES[k][0] + ' <small class="muted">' + (done ? done + ' of ' + list.length + ' done' : list.length) + '</small></span>' +
        '<a class="link small" href="#learn?list=' + k + '">See all ›</a></div>' +
        '<div class="card k-list">' + list.slice(0, 5).map(rowHTML).join('') + '</div>';
    });
    var ns = saved.all().length;
    html += '<div class="k-links"><a class="btn btn-soft btn-sm" href="#learn?list=saved">★ Saved' + (ns ? ' (' + ns + ')' : '') + '</a>' +
      '<a class="btn btn-ghost btn-sm" href="#learn?a=effective-time">❔ Help with the app</a><button class="btn btn-ghost btn-sm" type="button" onclick="MC.tour()">🧭 Take the tour</button></div>';
    if (MC.library) html += MC.library.readingSummary();
    $('learnBrowse').innerHTML = html;
  }

  /* ---------- "See all" lists: filter by topic and status, sort, 20 at a time ---------- */
  function renderList(kind) {
    var st = listState[kind] = listState[kind] || { topic: '', status: '', sort: 'rec', n: PAGE };
    var items = kind === 'saved' ? saved.all().map(function (s) { return item(s.item); }).filter(Boolean) : ofType(kind);
    var list = items.filter(function (x) {
      if (st.topic && (x.topics || []).indexOf(st.topic) < 0) return false;
      var s = status(x);
      return !st.status || (st.status === 'new' ? !s : s === st.status);
    });
    list = st.sort === 'az' ? list.sort(function (a, b) { return a.title.localeCompare(b.title); })
      : st.sort === 'new' ? list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }) : recommended(list);
    var used = {}; items.forEach(function (x) { (x.topics || []).forEach(function (t) { used[t] = 1; }); });
    var title = kind === 'saved' ? '★ Saved' : TYPES[kind][0];
    $('learnList').innerHTML = '<button class="link" id="listBack" style="padding:6px 0">‹ Learn</button><h1 class="greet" style="margin-top:4px">' + title + '</h1>' +
      (kind === 'saved' ? '<p class="small muted" style="margin-top:-6px">Your own list. Things stay here until you unsave them, even after you finish them.</p>' : '') +
      '<div class="k-filters">' +
        '<select class="input sm" id="lfTopic" aria-label="Topic"><option value="">All topics</option>' + Object.keys(TOPICS).filter(function (t) { return used[t]; }).map(function (t) { return '<option value="' + t + '"' + (st.topic === t ? ' selected' : '') + '>' + TOPICS[t] + '</option>'; }).join('') + '</select>' +
        '<select class="input sm" id="lfStatus" aria-label="Status"><option value="">Any status</option><option value="new"' + (st.status === 'new' ? ' selected' : '') + '>Not started</option><option value="progress"' + (st.status === 'progress' ? ' selected' : '') + '>In progress</option><option value="done"' + (st.status === 'done' ? ' selected' : '') + '>Done</option></select>' +
        '<select class="input sm" id="lfSort" aria-label="Sort"><option value="rec">Recommended</option><option value="new"' + (st.sort === 'new' ? ' selected' : '') + '>Newest</option><option value="az"' + (st.sort === 'az' ? ' selected' : '') + '>A–Z</option></select></div>' +
      '<p class="small muted">' + list.length + ' ' + (list.length === 1 ? 'item' : 'items') + '</p>' +
      (list.length ? '<div class="card k-list">' + list.slice(0, st.n).map(rowHTML).join('') + '</div>' : '<div class="card"><p class="muted" style="margin:0">' + (kind === 'saved' ? 'Nothing saved yet. Tap ☆ Save on any article, talk, book or quiz.' : 'Nothing here with these filters.') + '</p></div>') +
      (list.length > st.n ? '<button class="btn btn-ghost btn-block" id="lfMore" style="margin-top:10px">Show more (' + (list.length - st.n) + ')</button>' : '');
    $('listBack').onclick = function () { MC.go('learn'); };
    $('lfTopic').onchange = function () { st.topic = this.value; st.n = PAGE; renderList(kind); };
    $('lfStatus').onchange = function () { st.status = this.value; st.n = PAGE; renderList(kind); };
    $('lfSort').onchange = function () { st.sort = this.value; renderList(kind); };
    if ($('lfMore')) $('lfMore').onclick = function () { st.n += PAGE; renderList(kind); };
  }

  /* ---------- search: top results of each type, quotes included in "All" ---------- */
  function tokens(q) {
    return String(q).toLowerCase().replace(/[^a-z0-9À-ɏ\s'-]/g, ' ').split(/\s+/)
      .filter(function (t) { return t.length > 1 && STOP.indexOf(t) < 0; }).map(function (t) { return t.replace(/'s$/, ''); });
  }
  function stem(t) { return t.length > 4 ? t.replace(/(ing|ies|es|s|ed)$/, '') : t; }
  function plain(md) { return String(md || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*_>-]/g, ' '); }
  function score(fields, toks, phrase) {
    var s = 0, matched = 0;
    toks.forEach(function (t) {
      var st = stem(t), hit = false;
      fields.forEach(function (f) { if (!f[0]) return; var n = f[0].split(st).length - 1; if (n) { s += f[1] * Math.min(n, 3); hit = true; } });
      if (hit) matched++;
    });
    if (phrase.length > 3 && fields.some(function (f) { return f[0].indexOf(phrase) >= 0; })) s += 5;
    return s * matched / toks.length;
  }
  function search(q) {
    var toks = tokens(q), phrase = q.trim().toLowerCase(), out = { article: [], video: [], book: [], quiz: [], quote: [] };
    if (!toks.length) return out;
    all().forEach(function (x) {
      var qs = x.quiz && x.quiz.questions ? x.quiz.questions.map(function (z) { return z.q; }).join(' ') : '';
      var sc = score([[x.title.toLowerCase(), 6], [(x.keywords || '').toLowerCase(), 4], [(x.topics || []).map(function (t) { return TOPICS[t] || ''; }).join(' ').toLowerCase(), 3],
        [(x.summary || '').toLowerCase(), 3], [(x.author || '').toLowerCase(), 2], [plain(x.body).toLowerCase(), 1], [qs.toLowerCase(), 1]], toks, phrase);
      if (sc > 0) out[x.kind].push({ x: x, s: sc });
    });
    var mq = window.MC_QUOTES || {};
    (mq.quotes || []).forEach(function (z, i) {
      var sc = score([[String(z.text).toLowerCase(), 2], [String(z.author || mq.author || '').toLowerCase(), 3], [String(z.source || '').toLowerCase(), 2]], toks, phrase);
      if (sc > 0) out.quote.push({ x: { id: 'quote-' + i, text: z.text, author: z.author || mq.author || '', source: z.source || '' }, s: sc });
    });
    Object.keys(out).forEach(function (k) {
      out[k].sort(function (a, b) { return b.s - a.s; });
      var top = out[k][0] ? out[k][0].s : 0;
      out[k] = out[k].filter(function (r) { return r.s >= top * 0.25; }).map(function (r) { return r.x; });
    });
    return out;
  }
  function quoteHTML(z) {
    return '<div class="k-quote">“' + MC.esc(z.text) + '”<cite>— ' + MC.esc(z.author || 'Unknown') + (z.source ? ', <i>' + MC.esc(z.source) + '</i>' : '') + '</cite></div>';
  }
  function renderResults() {
    var box = $('learnResults'), q = state.q.trim();
    if (!q) { box.hidden = true; $('learnBrowse').hidden = false; return; }
    box.hidden = false; $('learnBrowse').hidden = true;
    var r = search(q), total = ORDER.reduce(function (n, k) { return n + r[k].length; }, 0) + r.quote.length;
    var chips = '<div class="k-chips" role="group" aria-label="Show">' + [['', 'All']].concat(ORDER.map(function (k) { return [k, TYPES[k][0]]; })).map(function (c) {
      var n = c[0] ? r[c[0]].length : total;
      return '<button type="button" class="chip' + (state.type === c[0] ? ' on' : '') + '" data-type="' + c[0] + '"' + (c[0] && !n ? ' disabled' : '') + '>' + c[1] + ' (' + n + ')</button>'; }).join('') + '</div>';
    var html = '<div class="section-title" style="margin-bottom:6px"><span>Results for “' + MC.esc(q) + '”</span><button class="link" id="clearSearch" style="padding:0">Clear</button></div>' + chips;
    if (!total) html += '<div class="card"><p style="margin:0">Nothing found. Try other words, or browse below.</p></div>';
    else if (state.type) html += '<div class="card k-list">' + r[state.type].slice(0, 30).map(rowHTML).join('') + '</div>';
    else {
      ORDER.forEach(function (k) { if (r[k].length) html += '<div class="section-title k-sec"><span>' + TYPES[k][0] + '</span>' + (r[k].length > 5 ? '<button class="link small" data-type="' + k + '">All ' + r[k].length + ' ›</button>' : '') + '</div><div class="card k-list">' + r[k].slice(0, 5).map(rowHTML).join('') + '</div>'; });
      if (r.quote.length) html += '<div class="section-title k-sec">Quotes</div><div class="card">' + r.quote.slice(0, 5).map(quoteHTML).join('') + '</div>';
    }
    box.innerHTML = html;
  }
  $('learnForm').addEventListener('submit', function (e) { e.preventDefault(); state.q = $('learnQ').value; state.type = ''; renderResults(); $('learnQ').blur(); });
  var debounce;
  $('learnQ').addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { var q = $('learnQ').value; if (q.trim().length >= 2 || !q.trim()) { state.q = q; state.type = ''; renderResults(); } }, 300);
  });
  $('learnResults').addEventListener('click', function (e) {
    var t = e.target.closest('[data-type]');
    if (t && !t.disabled) { state.type = t.dataset.type; renderResults(); return; }
    if (e.target.id === 'clearSearch') { $('learnQ').value = ''; state.q = ''; renderResults(); }
  });
  // Opening an item, and saving, from any list
  document.getElementById('v-learn').addEventListener('click', function (e) {
    var s = e.target.closest('[data-save]');
    if (s) { e.preventDefault(); e.stopPropagation(); var x = item(s.dataset.save); if (x) { toggleSave(x); s.outerHTML = saveBtn(x); } return; }
    var o = e.target.closest('[data-open]');
    if (o) open(o.dataset.open);
  });

  /* ---------- article text: simple, safe formatting ---------- */
  function inline(t) {
    return MC.esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, function (m, label, url) { return '<a href="' + url + '" target="_blank" rel="noopener">' + label + ' ↗</a>'; });
  }
  function md(text) {
    return String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(function (blk) {
      var b = blk.trim(); if (!b) return '';
      if (/^##\s/.test(b)) return '<h2>' + inline(b.replace(/^##\s*/, '')) + '</h2>';
      var lines = b.split('\n');
      if (lines.every(function (l) { return /^- /.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^- /, '')) + '</li>'; }).join('') + '</ul>';
      if (/^- /.test(lines[1] || '') && !/^- /.test(lines[0])) return '<p>' + inline(lines[0]) + '</p><ul>' + lines.slice(1).map(function (l) { return '<li>' + inline(l.replace(/^- /, '')) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  MC.md = md;

  function backBtn() { return '<div class="k-top"><button class="link" id="artBack" style="padding:6px 0">‹ Back</button></div>'; }
  function bindBack() { $('artBack').addEventListener('click', function () { history.length > 1 ? history.back() : MC.go('learn'); }); }
  function related(x) {
    var mine = x.topics || [], list = all().filter(function (y) { return y.id !== x.id && y.kind !== 'quiz' && (y.topics || []).some(function (t) { return mine.indexOf(t) >= 0; }) && status(y) !== 'done'; });
    var quiz = all().filter(function (y) { return y.kind === 'quiz' && ((y.quiz && y.quiz.related) || []).indexOf(x.id) >= 0; })[0];
    list = recommended(list).slice(0, 3);
    if (quiz) list.unshift(quiz);
    return list.length ? '<div class="section-title k-sec">Related</div><div class="card k-list">' + list.map(rowHTML).join('') + '</div>' : '';
  }
  function renderArticle(x) {
    var read = MC.library && MC.library.has('article', x.id), help = !!K.articles.filter(function (a) { return a.id === x.id && isHelp(a); })[0];
    var html = backBtn() + '<div class="card article"><div class="k-head"><span class="cat">' + MC.esc((x.icon || '📰') + ' ' + ((x.topics || []).map(function (t) { return TOPICS[t]; })[0] || 'Article')) + '</span>' + (help ? '' : saveBtn(x)) + '</div>' +
      '<h1>' + MC.esc(x.title) + '</h1>' + (x.summary ? '<p class="muted">' + MC.esc(x.summary) + '</p>' : '') +
      (x.body ? md(x.body) : '') +
      (x.url ? '<p class="note">' + (x.body ? 'Read the full article on the website.' : 'Read this article on the website, then come back here.') + '</p><button class="btn btn-soft btn-block" id="artLink">Open the article ↗</button>' : '');
    if (MC.library && !help) html += '<div class="art-end" id="artEnd">' + (read ? '<span class="read-btn done">✓ Read</span>' :
      '<button type="button" class="btn btn-primary btn-block" id="artRead"' + (x.body ? ' disabled' : '') + '>Mark as read</button>' + (x.body ? '<p class="small muted center" id="artReadHint" style="margin:6px 0 0">Read to the end to mark it as read.</p>' : '')) + '</div>';
    html += '</div>' + (help ? '' : related(x));
    $('learnArticle').innerHTML = html; bindBack();
    if ($('artLink')) $('artLink').onclick = function () { MC.library.openLink({ id: x.id, kind: 'article', title: x.title, url: x.url }); };
    var btn = $('artRead');
    if (btn) {
      var enable = function () { btn.disabled = false; var h = $('artReadHint'); if (h) h.remove(); };
      if (btn.disabled && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { enable(); io.disconnect(); } });
        io.observe($('artEnd'));
      } else enable();
      btn.addEventListener('click', function () { MC.library.mark('article', x.id, { title: x.title }); MC.library.hit(x.id, 'done'); $('artEnd').innerHTML = '<span class="read-btn done">✓ Read</span>'; });
    }
  }
  function renderVideo(x) {
    var seen = MC.library.has('video', x.id), id = ytId(x.url);
    $('learnArticle').innerHTML = backBtn() + '<div class="card article"><div class="k-head"><span class="cat">▶️ Talk</span>' + saveBtn(x) + '</div>' +
      (id || x.image ? '<button class="vid-hero" id="vidGo" aria-label="Watch"><img src="' + MC.esc(x.image || 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg') + '" alt=""><span aria-hidden="true">▶</span></button>' : '') +
      '<h1>' + MC.esc(x.title) + '</h1><p class="muted">' + MC.esc([x.author, x.minutes ? x.minutes + ' min' : ''].filter(Boolean).join(' · ')) + '</p>' + (x.summary ? '<p>' + MC.esc(x.summary) + '</p>' : '') +
      '<button class="btn btn-primary btn-block" id="vidWatch">Watch ↗</button>' +
      '<div class="art-end" id="artEnd">' + (seen ? '<span class="read-btn done">✓ Watched</span>' : '<button type="button" class="btn btn-ghost btn-block" id="vidDone">✓ I watched it</button>') + '</div></div>' + related(x);
    bindBack();
    var go = function () { MC.library.openLink(x); };
    $('vidWatch').onclick = go; if ($('vidGo')) $('vidGo').onclick = go;
    if ($('vidDone')) $('vidDone').onclick = function () { MC.library.mark('video', x.id, { title: x.title }); MC.library.hit(x.id, 'done'); $('artEnd').innerHTML = '<span class="read-btn done">✓ Watched</span>'; };
  }

  function param(name) {
    var m = (location.hash.split('?')[1] || '').match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  var opened = {};
  function hitOpen(id) { if (!opened[id] && MC.library) { opened[id] = 1; MC.library.hit(id, 'open'); } }

  MC.on('library', function () { if (MC.current === 'learn') MC.views.learn.show(); });
  MC.on('data', function () { if (MC.current === 'learn' && !$('learnHome').hidden) { renderBrowse(); if (state.q) renderResults(); } });
  MC.views.learn = {
    show: function () {
      var a = param('a'), v = param('v'), b = param('b'), q = param('q'), list = param('list');
      var detail = a || v || b || q;
      $('learnHome').hidden = !!(detail || list); $('learnArticle').hidden = !detail; $('learnList').hidden = !list || !!detail;
      if (list) { renderList(list); window.scrollTo(0, 0); return; }
      if (detail) {
        window.scrollTo(0, 0); hitOpen(detail);
        if (b && MC.library) { MC.library.renderBook($('learnArticle'), b, saveBtn); return; }
        if (q && MC.quiz) { MC.quiz.render($('learnArticle'), q); return; }
        var x = item(detail);
        if (!x) { $('learnArticle').innerHTML = backBtn() + '<div class="card"><p>This item is no longer available.</p></div>'; bindBack(); return; }
        if (v) renderVideo(x); else renderArticle(x);
        return;
      }
      renderBrowse(); $('learnQ').value = state.q; renderResults();
    }
  };
  MC.learn = { all: all, item: item, status: status, rowHTML: rowHTML, related: related, isSaved: isSaved, saveBtn: saveBtn, TOPICS: TOPICS, search: search };
})();
