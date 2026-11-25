/* News & Archive: search and topic filter; opens a related page linked by #anchor. */
(function () {
  var q = document.getElementById('q');
  var chips = document.querySelectorAll('.chip');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  var cat = '';

  function apply() {
    var term = (q && q.value || '').trim().toLowerCase();
    var shown = 0;
    document.querySelectorAll('.card').forEach(function (c) {
      var ok = (!cat || c.getAttribute('data-cat') === cat) && (!term || c.textContent.toLowerCase().indexOf(term) !== -1);
      c.hidden = !ok;
      if (ok) shown++;
    });
    document.querySelectorAll('.year').forEach(function (y) {
      y.hidden = !y.querySelector('.card:not([hidden])');
    });
    if (count) count.textContent = shown + (shown === 1 ? ' article' : ' articles');
    if (empty) empty.hidden = shown !== 0;
  }

  if (q) q.addEventListener('input', apply);
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      cat = b.getAttribute('data-cat') || '';
      chips.forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      apply();
    });
  });

  function openHash() {
    if (!location.hash) return;
    var el = document.getElementById(location.hash.slice(1));
    if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView(); }
  }
  openHash();
  window.addEventListener('hashchange', openHash);
})();
