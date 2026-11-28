/* Meditation Copilot — desktop / mobile layout switch.
 * The starting layout is set by the small script in <head> (see index.html).
 * This file adds the switch buttons and keeps "Auto" in step when a window is resized. */
(function () {
  var MC = window.MC || {};
  var KEY = 'mc.layout';
  var root = document.documentElement;

  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function mode() { return root.getAttribute('data-layout') || 'mobile'; }
  function isPhone() {
    var ua = navigator.userAgent || '';
    return (navigator.userAgentData && navigator.userAgentData.mobile) || /iPhone|iPod|Android.+Mobile|Windows Phone|Mobi/i.test(ua);
  }

  function set(next) {
    try { if (next === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch (e) {}
    // Leaving or entering a phone's "desktop site" view needs a fresh page so the zoom resets.
    var needsReload = root.classList.contains('mc-forced-desktop') || (next === 'desktop' && window.innerWidth < 900);
    if (needsReload) {
      var u = new URL(location.href);
      u.searchParams.set('view', next);
      location.replace(u.toString());
      return;
    }
    var m = next === 'auto' ? autoMode() : next;
    apply(m, next);
  }

  function autoMode() { return (!isPhone() && window.matchMedia('(min-width: 900px)').matches) ? 'desktop' : 'mobile'; }

  function apply(m, p) {
    root.setAttribute('data-layout', m);
    root.setAttribute('data-layout-pref', p || pref());
    root.classList.toggle('mc-desktop', m === 'desktop');
    render();
    window.scrollTo(0, 0);
  }

  function seg() {
    var p = pref(), m = mode();
    return '<span class="vs-label">View</span>' +
      '<button type="button" data-view="mobile" aria-pressed="' + (m === 'mobile') + '">📱 Mobile</button>' +
      '<button type="button" data-view="desktop" aria-pressed="' + (m === 'desktop') + '">🖥️ Desktop</button>' +
      (p !== 'auto' ? '<button type="button" class="vs-auto" data-view="auto" title="Let the app choose for this device">Auto</button>' : '');
  }

  function render() {
    document.querySelectorAll('.view-switch').forEach(function (el) { el.innerHTML = seg(); });
    var hb = document.getElementById('viewBtn');
    if (hb) {
      var toDesk = mode() !== 'desktop';
      hb.textContent = toDesk ? '🖥️' : '📱';
      hb.setAttribute('aria-label', toDesk ? 'Switch to desktop view' : 'Switch to mobile view');
      hb.title = hb.getAttribute('aria-label');
    }
  }

  function build() {
    // 1) Footer switch (every screen size)
    var footer = document.querySelector('.wrap > footer');
    if (footer && !footer.querySelector('.view-switch')) {
      var p = document.createElement('p');
      p.className = 'view-switch';
      p.setAttribute('role', 'group');
      p.setAttribute('aria-label', 'Choose layout');
      footer.insertBefore(p, footer.firstChild);
      var links = document.createElement('p');
      links.className = 'site-links';
      var site = MC.siteUrl || function (x) { return 'https://sosmn.org' + x; };
      links.innerHTML = '<a href="' + site('/') + '">← Back to sosmn.org</a>';
      footer.appendChild(links);
    }
    // 2) Sidebar switch (desktop layout only, shown by CSS)
    var inner = document.querySelector('.tabbar .inner');
    if (inner && !inner.querySelector('.side-foot')) {
      var sf = document.createElement('div');
      sf.className = 'side-foot';
      sf.innerHTML = '<p class="view-switch" role="group" aria-label="Choose layout"></p>' +
        '<p class="side-note">Science of Spirituality<br>Minneapolis Meditation Center</p>';
      inner.appendChild(sf);
    }
    // 3) Header button (quick switch), next to the points and Account
    var vb = document.getElementById('viewBtn');
    if (vb) vb.addEventListener('click', function () { set(mode() === 'desktop' ? 'mobile' : 'desktop'); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.view-switch button[data-view]');
      if (t) set(t.getAttribute('data-view'));
    });
    render();
  }

  // Auto mode follows the window size on computers (e.g. a narrowed browser window).
  try {
    window.matchMedia('(min-width: 900px)').addEventListener('change', function () {
      if (pref() === 'auto' && !root.classList.contains('mc-forced-desktop')) apply(autoMode(), 'auto');
    });
  } catch (e) {}

  window.MCLayout = { set: set, mode: mode, pref: pref };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
