#!/usr/bin/env node
/* Builds the websites for one environment.
 *   node tools/build.mjs [local|test|prod] [--center mpls]
 * Output: dist/site (sosmn.org: events site, News, About, What's new, /copilot/) and dist/admin (admin site).
 * No Python, no WordPress backup needed: News & About come from content/ (exported once from the old site).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ENV = args.find((a) => !a.startsWith('--')) || 'local';
const CENTER_ID = (args[args.indexOf('--center') + 1] && args.includes('--center')) ? args[args.indexOf('--center') + 1] : 'mpls';
const OUT = path.join(ROOT, 'dist', 'site'), OUT_ADMIN = path.join(ROOT, 'dist', 'admin');

const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const env = readJSON(`deploy/env/${ENV}.json`);
const center = readJSON(`centers/${CENTER_ID}.json`);
const ver = readJSON('version.json');
const releases = fs.existsSync(path.join(ROOT, 'releases.json')) ? readJSON('releases.json') : { releases: [] };

/* ---------- version ---------- */
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
const short = ver.version.replace(/\.0$/, '');                                   // 0.19.0 -> 0.19, 0.19.1 stays
const buildId = `${ver.version}-b${ver.build}`;
const dateLabel = new Date(ver.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const versionLabel = ENV === 'prod' ? `v${short} · ${dateLabel}` : `v${short}-b${ver.build} · ${env.label}`;
const cacheKey = `${ver.version}-${ver.build}-${commit}`.replace(/[^\w.-]/g, '');

/* ---------- helpers ---------- */
const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
function clearDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    for (let i = 0; i < 5; i++) { try { fs.rmSync(p, { recursive: true, force: true }); break; } catch (e) { if (i === 4) throw new Error(`Could not clear ${p} (is a preview server or OneDrive using it?)`); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); } }
  }
}
const write = (base, rel, content) => { const p = path.join(base, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
const copyDir = (src, dst) => fs.cpSync(src, dst, { recursive: true });
const tokens = {
  'center.name': center.name, 'center.shortName': center.shortName, 'center.org': center.org, 'center.address': center.address,
  'center.email': center.email, 'center.whatsapp': center.whatsapp, 'center.sosPage': center.sosPage,
  version_label: versionLabel, version: ver.version, build: buildId, v: cacheKey
};
const render = (html, extra = {}) => html.replace(/\{\{([\w.]+)\}\}/g, (m, k) => (k in extra ? extra[k] : k in tokens ? tokens[k] : m));
// Environment settings inside the apps' config files (source files hold the prod values)
function applyEnv(js) {
  return js.replace(/https:\/\/meditation-copilot-api\.aknaik\.workers\.dev/g, env.apiBase)
    .replace(/(['"])https:\/\/sosmn\.org\/copilot\/\1/g, `$1${env.siteUrl}/copilot/$1`)
    .replace(/siteUrl: (['"])https:\/\/sosmn\.org\1/g, `siteUrl: $1${env.siteUrl}$1`)
    .replace(/analyticsEndpoint: '[^']*'/, env.analytics ? '$&' : "analyticsEndpoint: ''");
}
const WHATSAPP = `<a href="https://wa.me/${center.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>`;

/* ---------- Shared partials (head, header, footer) for every sosmn.org page ---------- */
const SITE_PARTS = path.join(ROOT, 'apps/site/partials');
const sitePart = (n) => fs.readFileSync(path.join(SITE_PARTS, n + '.html'), 'utf8');
const SP = { head: render(sitePart('head'), { layout_boot: render(sitePart('layout-boot')) }), header: render(sitePart('header')), footer: render(sitePart('footer')) };

/* ---------- News & About pages ---------- */
const news = readJSON('content/news/news.json');
const items = news.items, arts = items.filter((x) => x.kind === 'article'), ICON = news.icons, CATS = news.categories;
const SITE = env.siteUrl;
function page(title, desc, body, canonical, extraHead = '') {
  // Same head, header and footer as the events pages (apps/site/partials), so the header never moves between pages
  const nav = canonical.startsWith('/news') ? 'news' : canonical.startsWith('/about') ? 'about' : canonical.startsWith('/guidelines') ? 'about' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
${SP.head}
<title>${E(title)}</title>
<meta name="description" content="${E(desc)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:title" content="${E(title)}">
<meta property="og:description" content="${E(desc)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/news/news.css?v=${cacheKey}">
${extraHead}</head>
<body data-page="${nav}">
${SP.header}
<main id="main">
${body}
</main>
${SP.footer}
</body>
</html>
`;
}
function card(x) {
  const year = x.date.slice(0, 4);
  const thumb = x.thumb ? `<img src="${x.thumb}" alt="" loading="lazy">` : `<span class="ph" aria-hidden="true">${ICON[x.cat] || '🪷'}</span>`;
  if (x.kind === 'external') {
    return `<article class="card ext" data-cat="${E(x.cat)}" data-year="${year}">
  <a class="card-link" href="${E(x.url)}" target="_blank" rel="noopener">
    <div class="thumb">${thumb}</div>
    <div class="card-body">
      <p class="meta"><time datetime="${x.date}">${E(x.when)}</time> · <span class="tag">${E(x.source)} ↗</span></p>
      <h3>${E(x.title)}</h3>
      <p class="excerpt">${E(x.excerpt)}</p>
    </div>
  </a>
</article>`;
  }
  const more = x.related && x.related.length ? `<p class="more">Includes ${x.related.length} related page${x.related.length > 1 ? 's' : ''}</p>` : '';
  return `<article class="card" data-cat="${E(x.cat)}" data-year="${year}">
  <a class="card-link" href="/news/${x.slug}/">
    <div class="thumb">${thumb}</div>
    <div class="card-body">
      <p class="meta"><time datetime="${x.date}">${E(x.when)}</time> · <span class="tag">${E(x.cat)}</span></p>
      <h3>${E(x.title)}</h3>
      <p class="excerpt">${E(x.excerpt)}</p>
      ${more}
    </div>
  </a>
</article>`;
}
function buildIndex() {
  const years = [];
  for (const x of items) { const y = x.date.slice(0, 4); if (!years.length || years[years.length - 1][0] !== y) years.push([y, []]); years[years.length - 1][1].push(x); }
  const chips = '<button class="chip on" data-cat="">All</button>' + CATS.filter((c) => items.some((i) => i.cat === c)).map((c) => `<button class="chip" data-cat="${E(c)}">${ICON[c]} ${E(c)}</button>`).join('');
  const jump = years.map(([y]) => `<a href="#y${y}">${y}</a>`).join(' ');
  const groups = years.map(([y, xs]) => `<section class="year" id="y${y}" data-year="${y}"><h2 class="year-h">${y}</h2><div class="cards">${xs.map(card).join('')}</div></section>`).join('');
  const body = `<section class="hero">
  <div class="hero-inner">
    <p class="eyebrow">News &amp; Archive</p>
    <h1>Two decades of meditation in the Twin Cities</h1>
    <p class="lead">Stories, talks, retreats, family camps, Peace Fests and press coverage from the ${E(center.name)} community, newest first.</p>
    <div class="tools">
      <label class="search"><span class="sr">Search articles</span><input type="search" id="q" placeholder="Search articles…" autocomplete="off"></label>
      <div class="chips" role="group" aria-label="Filter by topic">${chips}</div>
    </div>
    <p class="jump" aria-label="Jump to year">${jump}</p>
  </div>
</section>
<div class="wrap">
  <p class="count" id="count" aria-live="polite">${items.length} articles</p>
  ${groups}
  <p class="empty" id="empty" hidden>No articles match your search.</p>
</div>
<script src="/news/news.js?v=${cacheKey}" defer></script>`;
  return page(`News & Archive · ${center.name}`, `News, talks, retreats, family camps, Peace Fests and press coverage from the ${center.name}.`, body, '/news/');
}
function buildArticle(i, x) {
  const newer = i > 0 ? arts[i - 1] : null, older = i + 1 < arts.length ? arts[i + 1] : null;
  const rel = x.related && x.related.length ? '<section class="related"><h2>More from this event</h2>' + x.related.map((r) => `<details id="${E(r.anchor)}"><summary>${E(r.title)}</summary><div class="prose">${r.body}</div></details>`).join('') + '</section>' : '';
  let nav = '<nav class="pager" aria-label="More articles">';
  nav += newer ? `<a class="newer" href="/news/${newer.slug}/"><small>← Newer</small>${E(newer.title)}</a>` : '<span></span>';
  nav += older ? `<a class="older" href="/news/${older.slug}/"><small>Older →</small>${E(older.title)}</a>` : '<span></span>';
  nav += '</nav>';
  const body = `<div class="wrap narrow">
  <p class="crumbs"><a href="/news/">News</a> › <a href="/news/#y${x.date.slice(0, 4)}">${x.date.slice(0, 4)}</a></p>
  <article class="post">
    <header>
      <p class="meta"><time datetime="${x.date}">${E(x.when)}</time> · <span class="tag">${E(x.cat)}</span></p>
      <h1>${E(x.title)}</h1>
      <p class="note">From the sosmn.org archive. Dates, times and sign-up details are historical. For current programs, see <a href="https://www.sos.org/find-local-programs/" target="_blank" rel="noopener">sos.org</a>.</p>
    </header>
    <div class="prose">${x.body}</div>
    ${rel}
  </article>
  ${nav}
</div>
<script src="/news/news.js?v=${cacheKey}" defer></script>`;
  return page(`${x.title} · ${center.name}`, x.excerpt, body, `/news/${x.slug}/`);
}
function buildAbout() {
  const about = fs.readFileSync(path.join(ROOT, 'content/pages/about.html'), 'utf8');
  const body = `<div class="wrap narrow">
  <article class="post">
    <header><h1>About the Meditation Center</h1></header>
    <div class="prose">${about}</div>
  </article>
</div>`;
  return page(`About · ${center.name}`, `About the ${center.name}.`, body, '/about/');
}
function buildGuidelines() {
  const g = fs.readFileSync(path.join(ROOT, 'content/pages/guidelines.html'), 'utf8');
  return page(`Visitor guidelines · ${center.name}`, 'Guidelines for visiting the Science of Spirituality Minneapolis Meditation Center.',
    `<div class="wrap narrow"><article class="post"><header><h1>Visitor guidelines</h1></header><div class="prose">${g}</div></article></div>`, '/guidelines/');
}
function build404() {
  return page('Page not found', 'Page not found', `<div class="wrap narrow center" style="padding:72px 0">
  <h1>Page not found</h1>
  <p class="lead">That page may have moved when the website was refreshed.</p>
  <p><a class="btn btn-primary" href="/">Upcoming events</a> <a class="btn btn-ghost" href="/news/">News &amp; archive</a></p>
</div>`, '/404');
}
// What's new: user-facing items on sosmn.org; everything (incl. admin-only) on the admin site
function whatsNew(audience) {
  const list = (releases.releases || []).map((r) => ({ ...r, items: (r.items || []).filter((i) => audience === 'admin' || i.audience !== 'admin') })).filter((r) => r.items.length);
  const GROUP = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
  return list.map((r) => `<section class="rel"><h2>v${E(r.version.replace(/\.0$/, ''))} <small>${E(new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</small></h2>` +
    (r.summary ? `<p>${E(r.summary)}</p>` : '') +
    // People see only the brief highlights (when the release has them); the admin site shows the detailed notes
    (audience !== 'admin' && r.highlights && r.highlights.length ? `<ul>${r.highlights.map((x) => `<li>${E(x)}</li>`).join('')}</ul>` : Object.keys(GROUP).map((g) => { const xs = r.items.filter((i) => i.type === g); return xs.length ? `<h3>${GROUP[g]}</h3><ul>${xs.map((i) => `<li>${E(i.text)}${audience === 'admin' && i.audience === 'admin' ? ' <span class="tag">Admin</span>' : ''}</li>`).join('')}</ul>` : ''; }).join('')) + '</section>').join('') ||
    '<p>No release notes yet.</p>';
}

/* ---------- build ---------- */
const t0 = Date.now();
clearDir(OUT);
write(OUT, 'news/index.html', buildIndex());
arts.forEach((x, i) => write(OUT, `news/${x.slug}/index.html`, buildArticle(i, x)));
write(OUT, 'about/index.html', buildAbout());
write(OUT, 'guidelines/index.html', buildGuidelines());
write(OUT, '404.html', build404());
write(OUT, 'whats-new/index.html', page(`What’s new · ${center.name}`, 'How sosmn.org and Meditation Copilot have changed over time.',
  `<div class="wrap narrow"><article class="post"><header><h1>What’s new</h1><p class="note">Changes to sosmn.org and Meditation Copilot, newest first. You are using ${E(versionLabel)}.</p></header><div class="prose whats-new">${whatsNew('user')}</div></article></div>`, '/whats-new/'));
for (const f of ['news.css', 'news.js']) fs.copyFileSync(path.join(ROOT, 'content/news', f), path.join(OUT, 'news', f));
copyDir(path.join(ROOT, 'content/news/media'), path.join(OUT, 'news/media'));
write(OUT, 'news/articles.json', JSON.stringify({ articles: arts.map((x) => ({ url: `/news/${x.slug}/`, title: x.title, date: x.when, image: x.thumb, summary: x.excerpt, category: x.cat })) }, null, 1));

// Events site pages (apps/site) with shared partials
const SITE_SRC = path.join(ROOT, 'apps/site');
const part = (n) => fs.readFileSync(path.join(SITE_SRC, 'partials', n + '.html'), 'utf8');
const P = { layout_boot: part('layout-boot'), header: render(part('header')), footer: render(part('footer')) };
P.head = render(part('head'), { layout_boot: P.layout_boot });
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, f.name), rel = path.relative(SITE_SRC, src);
    if (f.isDirectory()) { if (f.name !== 'partials') walk(src); continue; }
    const dst = path.join(OUT, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (f.name.endsWith('.html')) fs.writeFileSync(dst, render(render(fs.readFileSync(src, 'utf8'), { head: P.head, header: P.header, footer: P.footer })));
    else if (f.name.endsWith('.js')) fs.writeFileSync(dst, applyEnv(fs.readFileSync(src, 'utf8')));
    else fs.copyFileSync(src, dst);
  }
})(SITE_SRC);

// Meditation Copilot at /copilot/
const CP = path.join(OUT, 'copilot');
copyDir(path.join(ROOT, 'apps/copilot'), CP);
fs.rmSync(path.join(CP, 'README-copilot-history.md'), { force: true });
const cpEdit = (rel, fn) => { const p = path.join(CP, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
cpEdit('js/config.js', applyEnv);
cpEdit('js/core.js', (s) => s.replace(/MC\.VERSION = '[^']*'/, `MC.VERSION = '${versionLabel}'`));
cpEdit('sw.js', (s) => s.replace(/const CACHE_VERSION = '[^']*'/, `const CACHE_VERSION = '${cacheKey}'`));
cpEdit('index.html', (s) => s.replace(/\?v=\d+/g, `?v=${cacheKey}`).replace(/https:\/\/sosmn\.org\/copilot\//g, `${env.siteUrl}/copilot/`)
  .replace('<title>', ENV === 'prod' ? '<title>' : `<meta name="robots" content="noindex">\n<title>`));

// Redirects, headers, robots, sitemap, build info
const redirects = fs.readFileSync(path.join(ROOT, 'content/redirects.txt'), 'utf8');
write(OUT, '_redirects', redirects);
write(OUT, '_headers', `/news/media/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()${env.robots ? '' : '\n  X-Robots-Tag: noindex, nofollow'}
/sw.js
  Cache-Control: no-cache
/copilot/sw.js
  Cache-Control: no-cache
/news/articles.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300
`);
write(OUT, 'robots.txt', env.robots ? `User-agent: *\nAllow: /\nDisallow: /checkin/\nSitemap: ${SITE}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
const urls = ['/', '/calendar/', '/news/', '/about/', '/privacy/', '/whats-new/', ...arts.map((x) => `/news/${x.slug}/`)];
write(OUT, 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>\n`).join('') + '</urlset>\n');
const info = { version: ver.version, build: ver.build, buildId, label: versionLabel, env: ENV, center: CENTER_ID, commit, builtAt: new Date().toISOString() };
write(OUT, 'build-info.json', JSON.stringify(info, null, 1));

// Admin site
clearDir(OUT_ADMIN);
copyDir(path.join(ROOT, 'apps/admin'), OUT_ADMIN);
fs.copyFileSync(path.join(SITE_SRC, 'css/site.css'), path.join(OUT_ADMIN, 'css/site.css'));
write(OUT_ADMIN, 'js/auth.js', applyEnv(fs.readFileSync(path.join(SITE_SRC, 'js/auth.js'), 'utf8')));
fs.copyFileSync(path.join(SITE_SRC, 'js/types.js'), path.join(OUT_ADMIN, 'js/types.js'));
copyDir(path.join(SITE_SRC, 'img'), path.join(OUT_ADMIN, 'img'));
for (const f of ['index.html']) { const p = path.join(OUT_ADMIN, f); fs.writeFileSync(p, render(fs.readFileSync(p, 'utf8'))); }
write(OUT_ADMIN, 'js/admin.js', applyEnv(fs.readFileSync(path.join(OUT_ADMIN, 'js/admin.js'), 'utf8')));
write(OUT_ADMIN, 'whats-new.html', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>What’s new · Admin</title><link rel="stylesheet" href="/css/site.css?v=${cacheKey}"><link rel="stylesheet" href="/css/admin.css?v=${cacheKey}"></head>
<body><main class="adm-main" style="max-width:760px;margin:0 auto;padding:24px"><p><a href="/">‹ Admin</a></p><h1>What’s new</h1><p class="small muted">All changes, including admin-only ones. You are using ${E(versionLabel)}.</p><div class="card whats-new">${whatsNew('admin')}</div></main></body></html>`);
// The admin page itself is always re-checked, so a new release shows without a manual refresh (its scripts carry ?v=… and can be cached)
write(OUT_ADMIN, '_headers', '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  Referrer-Policy: same-origin\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/whats-new.html\n  Cache-Control: no-cache\n');
write(OUT_ADMIN, 'robots.txt', 'User-agent: *\nDisallow: /\n');
write(OUT_ADMIN, 'build-info.json', JSON.stringify(info, null, 1));

const count = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).length;
console.log(JSON.stringify({ env: ENV, center: CENTER_ID, version: versionLabel, buildId, commit, articles: arts.length, siteFiles: count(OUT), adminFiles: count(OUT_ADMIN), ms: Date.now() - t0 }));
