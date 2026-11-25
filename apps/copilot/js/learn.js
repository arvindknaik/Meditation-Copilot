/* Meditation Copilot — Learn: search over static knowledge content, paginated results, articles */
(function () {
  'use strict';
  var MC = window.MC, $ = MC.$;
  var K = window.MC_KNOWLEDGE || { featured: [], articles: [] };
  var PAGE = 4;
  var STOP = ('a an and are as at be by can do does for from how i in is it me my of on or should the to what when '
    + 'where which who why will with you your about get am this that there their do does did'). split(' ');
  var state = { q: '', page: 1, results: [] };

  function byId(id) { return K.articles.filter(function (a) { return a.id === id; })[0]; }
  function bodyText(a) { return (a.body || []).join(' ').replace(/(^|\n)- /g, ' '); }
  function tokens(q) {
    return String(q).toLowerCase().replace(/[^a-z0-9À-ɏ\s'-]/g, ' ').split(/\s+/)
      .filter(function (t) { return t.length > 1 && STOP.indexOf(t) < 0; })
      .map(function (t) { return t.replace(/'s$/, ''); });
  }
  function stem(t) { return t.length > 4 ? t.replace(/(ing|ies|es|s|ed)$/, '') : t; }

  /* ---------- Search ---------- */
  function search(q) {
    var toks = tokens(q), phrase = q.trim().toLowerCase();
    if (!toks.length) return [];
    return K.articles.map(function (a) {
      var title = a.title.toLowerCase(), sum = (a.summary || '').toLowerCase(),
          kw = (a.keywords || '').toLowerCase(), body = bodyText(a).toLowerCase(), cat = (a.category || '').toLowerCase();
      var score = 0, matched = 0;
      toks.forEach(function (t) {
        var s = stem(t), hit = false;
        if (title.indexOf(s) >= 0) { score += 6; hit = true; }
        if (kw.indexOf(s) >= 0) { score += 4; hit = true; }
        if (sum.indexOf(s) >= 0) { score += 3; hit = true; }
        if (cat.indexOf(s) >= 0) { score += 1; hit = true; }
        var n = body.split(s).length - 1;
        if (n) { score += Math.min(3, n); hit = true; }
        if (hit) matched++;
      });
      if (phrase.length > 3 && (title + ' ' + sum + ' ' + body).indexOf(phrase) >= 0) score += 5;
      score *= matched / toks.length;   // favour articles that match more of the words
      return { a: a, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (x, y) { return y.score - x.score; })
      .filter(function (r, i, arr) { return r.score >= arr[0].score * 0.3; })   // drop weak matches
      .map(function (r) { return r.a; });
  }

  function highlight(text, toks) {
    var html = MC.esc(text);
    if (!toks.length) return html;
    var re = new RegExp('(' + toks.map(function (t) { return stem(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    return html.replace(re, '<mark>$1</mark>');
  }
  function snippet(a, toks) {
    var text = (a.summary || '') + ' ' + bodyText(a), low = text.toLowerCase(), at = -1;
    toks.some(function (t) { var i = low.indexOf(stem(t)); if (i >= 0) { at = i; return true; } return false; });
    if (at < 0 || at < 120) return highlight(text.slice(0, 160) + (text.length > 160 ? '…' : ''), toks);
    var from = Math.max(0, at - 50);
    return '…' + highlight(text.slice(from, from + 160) + (text.length > from + 160 ? '…' : ''), toks);
  }

  function renderResults() {
    var box = $('learnResults'), toks = tokens(state.q);
    if (!state.q.trim()) { box.hidden = true; $('learnBrowse').hidden = false; return; }
    box.hidden = false; $('learnBrowse').hidden = true;
    var n = state.results.length, pages = Math.max(1, Math.ceil(n / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    var html = '<div class="section-title" style="margin-bottom:8px"><span>' + n + ' result' + (n === 1 ? '' : 's') +
      ' for “' + MC.esc(state.q.trim()) + '”</span><button class="link" id="clearSearch" style="padding:0">Clear</button></div>';
    if (!n) {
      html += '<div class="card"><p style="margin:0 0 10px">No matching articles yet. Try other words, browse the topics below, or ask the Minneapolis Center (contact at the bottom of this page).</p>' +
        '<button class="btn btn-soft btn-sm" id="browseAll">Browse all topics</button></div>';
    } else {
      state.results.slice((state.page - 1) * PAGE, state.page * PAGE).forEach(function (a) {
        html += '<button class="result" data-id="' + MC.esc(a.id) + '"><span class="cat">' + MC.esc(a.icon + ' ' + a.category) + '</span><br>' +
          '<b>' + highlight(a.title, toks) + '</b><p>' + snippet(a, toks) + '</p></button>';
      });
      if (pages > 1) {
        html += '<div class="pager"><button class="btn btn-ghost btn-sm" id="prevPage"' + (state.page === 1 ? ' disabled' : '') + '>‹ Previous</button>' +
          '<span class="small muted">Page ' + state.page + ' of ' + pages + '</span>' +
          '<button class="btn btn-ghost btn-sm" id="nextPage"' + (state.page === pages ? ' disabled' : '') + '>Next ›</button></div>';
      }
    }
    box.innerHTML = html;
  }

  $('learnForm').addEventListener('submit', function (e) {
    e.preventDefault();
    state.q = $('learnQ').value; state.page = 1; state.results = search(state.q);
    renderResults();
    $('learnQ').blur();
  });
  var debounce;
  $('learnQ').addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      var q = $('learnQ').value;
      if (q.trim().length >= 2 || !q.trim()) { state.q = q; state.page = 1; state.results = search(q); renderResults(); }
    }, 300);
  });
  $('learnResults').addEventListener('click', function (e) {
    var r = e.target.closest('.result');
    if (r) { location.hash = 'learn?a=' + encodeURIComponent(r.dataset.id); return; }
    if (e.target.id === 'prevPage') { state.page--; renderResults(); $('learnResults').scrollIntoView({ block: 'start' }); }
    if (e.target.id === 'nextPage') { state.page++; renderResults(); $('learnResults').scrollIntoView({ block: 'start' }); }
    if (e.target.id === 'clearSearch' || e.target.id === 'browseAll') { $('learnQ').value = ''; state.q = ''; renderResults(); }
  });

  /* ---------- Browse ---------- */
  function renderBrowse() {
    $('featuredGrid').innerHTML = K.featured.map(byId).filter(Boolean).map(function (a) {
      return '<button class="topic" data-id="' + MC.esc(a.id) + '"><span class="ti" aria-hidden="true">' + a.icon + '</span><b>' + MC.esc(a.title) + '</b><small>' + MC.esc(a.summary) + '</small></button>';
    }).join('');
    $('moreTopics').innerHTML = K.articles.filter(function (a) { return K.featured.indexOf(a.id) < 0; }).map(function (a) {
      return '<button class="topic-row" data-id="' + MC.esc(a.id) + '"><span class="ti" aria-hidden="true">' + a.icon + '</span><span><b>' + MC.esc(a.title) + '</b><small>' + MC.esc(a.category) + '</small></span></button>';
    }).join('');
  }
  $('learnBrowse').addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]'); if (b) location.hash = 'learn?a=' + encodeURIComponent(b.dataset.id);
  });

  /* ---------- Article ---------- */
  function paragraphHTML(p) {
    if (/^- /.test(p)) return '<ul>' + p.split('\n').map(function (l) { return '<li>' + MC.esc(l.replace(/^- /, '')) + '</li>'; }).join('') + '</ul>';
    return '<p>' + MC.esc(p) + '</p>';
  }
  function renderArticle(a) {
    var html = '<button class="link" id="artBack" style="padding:6px 0">‹ Back</button>' +
      '<div class="card article"><span class="cat">' + MC.esc(a.icon + ' ' + a.category) + '</span><h1>' + MC.esc(a.title) + '</h1>' +
      '<p class="muted">' + MC.esc(a.summary) + '</p>';
    if (a.body && a.body.length && !a.pending) html += a.body.map(paragraphHTML).join('');
    if (a.pending) html += '<p class="note">Read about this topic on the official Science of Spirituality website.</p>';
    if (a.links && a.links.length) {
      html += '<div class="stack" style="margin-top:6px">' + a.links.map(function (l) {
        return '<a class="btn btn-soft btn-sm" href="' + MC.esc(l.url) + '" target="_blank" rel="noopener">' + MC.esc(l.label) + ' ↗</a>';
      }).join('') + '</div>';
    }
    html += '</div>';
    $('learnArticle').innerHTML = html;
    $('artBack').addEventListener('click', function () { history.length > 1 ? history.back() : MC.go('learn'); });
  }

  function param(name) {
    var m = (location.hash.split('?')[1] || '').match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  MC.views.learn = {
    show: function () {
      var a = byId(param('a'));
      $('learnHome').hidden = !!a;
      $('learnArticle').hidden = !a;
      if (a) { renderArticle(a); return; }
      renderBrowse();
      $('learnQ').value = state.q;
      renderResults();
    }
  };
})();
