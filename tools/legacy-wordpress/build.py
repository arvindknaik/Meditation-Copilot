#!/usr/bin/env python3
"""Build the new sosmn.org static site: Meditation Copilot at /, News archive at /news/, About at /about/.

Usage: python3 build.py <pages.json> <uploads-zip-dir> <app-repo-dir> <out-dir>
"""
import sys, os, re, json, html, shutil, zipfile, glob, io, datetime
from bs4 import BeautifulSoup, Comment
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from articles import ARTICLES, EXTERNAL, ABOUT, HUBS_TO_NEWS, EDITS, PARA_REPLACE

PAGES_JSON, ZIPDIR, APPDIR, OUT = sys.argv[1:5]
SRC = sys.argv[5] if len(sys.argv) > 5 else None          # site source: web/ (events site) and admin/ (admin site)
OUT_ADMIN = sys.argv[6] if len(sys.argv) > 6 else None    # where to build admin.sosmn.org
SITE_URL = "https://sosmn.org"
pages = {p["link"].replace("https://www.sosmn.org", ""): p for p in json.load(open(PAGES_JSON))}

# The center phone is reached by WhatsApp for now: show "WhatsApp" (linked) instead of the number everywhere
WHATSAPP = '<a href="https://wa.me/16122164444" target="_blank" rel="noopener">WhatsApp</a>'
_PHONE = re.compile(r'(?:\b(?:Phone|Ph|[Cc]all)\s*:?\s*)?(<strong>)?(?:1[-.\s])?\(?612\)?[-.\s]216[-.\s]4444\s*(</strong>)?(?=(\w)?)')
def whatsapp_phone(html_text):
    html_text = re.sub(r'<a[^>]+href="tel:[^"]*2164444[^"]*"[^>]*>[^<]*</a>', WHATSAPP, html_text)
    return _PHONE.sub(lambda m: (m.group(1) or '') + WHATSAPP + (m.group(2) or '') + (' ' if m.group(3) else ''), html_text)
for _p in pages.values():
    _p["html"] = whatsapp_phone(_p["html"])

# ---------------------------------------------------------------- URL map (old path -> new path)
urlmap = {}
for slug, old, *_rest, related in ARTICLES:
    urlmap[old] = f"/news/{slug}/"
    for r in related:
        urlmap[r] = f"/news/{slug}/#{r.strip('/').split('/')[-1]}"
for a in ABOUT:
    urlmap[a] = "/about/" + ("#directions" if "directions" in a else "")
for h in HUBS_TO_NEWS:
    urlmap[h] = "/news/"
for path in pages:
    if path not in urlmap:
        urlmap[path] = "/news/" if path.startswith("/speakers/") else "/"   # "/" is the events home page

UPLOAD_RE = re.compile(r"https?://(?:i\d\.wp\.com/)?(?:www\.)?sosmn\.org(?:/wp)?/wp-content/uploads/([^\"'\s?<>)\]]+)", re.I)
used_media = set()

def map_href(href):
    if not href:
        return href
    m = UPLOAD_RE.match(href)
    if m:
        used_media.add(m.group(1))
        return "/news/media/" + m.group(1)
    m = re.match(r"https?://(?:www\.)?sosmn\.org(?:/wp)?(/[^#?]*)?(#.*)?$", href, re.I)
    if m:
        p = m.group(1) or "/"
        if not p.endswith("/") and "." not in p.split("/")[-1]:
            p += "/"
        return urlmap.get(p, urlmap.get(p.lower(), "/news/" if p != "/" else "/"))
    return href

YT = re.compile(r"^(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]{6,})\S*$")
BLOCK = re.compile(r"^\s*<(?:p|div|table|ul|ol|h\d|figure|blockquote|iframe|hr|pre|section|dl|form|center)\b|^\s*\[caption", re.I)

def autop(raw):
    raw = raw.replace("\r\n", "\n")
    out = []
    for chunk in re.split(r"\n\s*\n", raw):
        c = chunk.strip()
        if not c:
            continue
        if BLOCK.match(c) or re.match(r"\s*</", c) or re.search(r"</?(?:table|tbody|thead|tr|td|th|ul|ol|li|dl|dt|dd)\b", c, re.I):
            out.append(c)
        else:
            out.append("<p>" + c.replace("\n", "<br>\n") + "</p>")
    return "\n".join(out)

def bare_urls(raw):
    def rep(m):
        u = m.group(1).strip()
        y = YT.match(u)
        if y:
            return f'\n\n<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/{y.group(1)}" title="Video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>\n\n'
        label = "Read the press release (PDF)" if u.lower().endswith(".pdf") else u
        return f'\n\n<p><a href="{u}">{label}</a></p>\n\n'
    return re.sub(r"(?m)^\s*(https?://\S+)\s*$", rep, raw)

REG_TEXT = re.compile(r"regist|sign ?up|pre-?register|add to (your )?calendar|rsvp|click here for", re.I)
REG_HREF = re.compile(r"forms\.gle|docs\.google\.com/forms|calendar\.google|/register|registration|public-talk|/hsmn|/mhmm|eventbrite", re.I)
KEEP_ATTR = {"a": {"href"}, "img": {"src", "alt"}, "iframe": {"src", "title", "allow", "allowfullscreen", "loading"},
             "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan"}, "ol": {"start"}}

def clean(path, raw):
    for a, b in EDITS.get(path, []):
        assert a in raw, (path, a)
        raw = raw.replace(a, b)
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
    raw = re.sub(r"\[caption[^\]]*\](.*?)\[/caption\]",
                 lambda m: "<figure>" + re.sub(r"(<img[^>]*>(?:\s*</a>)?)\s*(.*)$", r"\1<figcaption>\2</figcaption>", m.group(1).strip(), flags=re.S) + "</figure>",
                 raw, flags=re.S)
    raw = re.sub(r"\[/?[a-z_]+(?:\s[^\]]*)?\]", "", raw)
    raw = bare_urls(raw)
    if "<p" not in raw:
        raw = autop(raw)
    else:
        raw = autop(raw) if raw.count("<p") < 2 else raw
    s = BeautifulSoup(raw, "html.parser")
    for c in s.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for t in s.find_all(["script", "style", "form", "input", "button", "noscript"]):
        t.decompose()
    for t in s.find_all(["g", "font", "span", "center"]):
        t.unwrap()
    for f in s.find_all("iframe"):
        src = f.get("src", "")
        if "youtube" in src:
            f["src"] = re.sub(r"https?://(?:www\.)?youtube\.com/embed/", "https://www.youtube-nocookie.com/embed/", src)
            if not (f.parent and f.parent.name == "div" and "video" in (f.parent.get("class") or [])):
                f.wrap(s.new_tag("div", attrs={"class": "video"}))
        elif "google.com/maps" in src:
            f["title"] = "Map"
        else:
            f.decompose()   # calendars, registration forms, documents
    for a in s.find_all("a"):
        href = a.get("href", "")
        text = a.get_text(" ", strip=True)
        if REG_HREF.search(href) or (REG_TEXT.search(text) and not UPLOAD_RE.match(href)):
            a.decompose()
            continue
        a["href"] = map_href(href)
        if re.match(r"(https?://)?(www\.)?sosmn\.org", text, re.I) and not a.find("img"):
            a.string = "the related page" if "#" in a["href"] else ("this page" if a["href"] != "/" else "sosmn.org")
        if a["href"].startswith("http"):
            a["target"] = "_blank"; a["rel"] = "noopener"
    for img in s.find_all("img"):
        src = map_href(img.get("src", ""))
        if not src.startswith("/news/media/"):
            img.decompose(); continue   # hot-linked or tracking images from other sites
        img["src"] = src
        img["loading"] = "lazy"
        if not img.get("alt"):
            img["alt"] = ""
    for t in s.find_all(True):
        keep = KEEP_ATTR.get(t.name, set()) | {"target", "rel", "loading", "class"}
        cls = [c for c in (t.get("class") or []) if c in ("alignleft", "alignright", "aligncenter", "video")]
        for k in list(t.attrs):
            if k not in keep:
                del t[k]
        if cls:
            t["class"] = cls
        elif "class" in t.attrs:
            del t["class"]
        if t.name == "figure" and t.parent and t.parent.name == "div":
            t.parent.unwrap()
    for key, new in PARA_REPLACE.get(path, []):
        hit = [p for p in s.find_all("p") if key in p.get_text()]
        assert hit, (path, key)
        hit[0].replace_with(BeautifulSoup(new, "html.parser"))
    # tidy: drop empty paragraphs / leftover "Here are the registration forms:" lines
    for p in s.find_all(["p", "h2", "h3", "h4", "li", "div"]):
        if not p.get_text(strip=True) and not p.find(["img", "iframe"]):
            p.decompose()
    for p in s.find_all(["p", "div"]):
        if p.find(["img", "iframe", "p", "div"]):
            continue
        t = p.get_text(" ", strip=True)
        if re.fullmatch(r"(here are the registration forms:?|please register (here|below)\.?|register here.*|online registration.*|family pre-register here|adult only registration|adults are welcome to register below\.?|a ?dd to your calendar:?|a)", t, re.I):
            p.decompose()
    for br in s.find_all("br"):
        if br.parent and br.parent.name in ("table", "tbody", "thead", "tr"):
            br.decompose()
    for h in s.find_all("h1"):
        h.name = "h2"
    return str(s).strip()

def text_of(h):
    s = BeautifulSoup(h, "html.parser")
    for f in s.find_all(["figcaption", "iframe"]):
        f.decompose()
    return re.sub(r"\s+", " ", s.get_text(" ")).strip()

def first_img(h):
    m = re.search(r'<img[^>]*src="(/news/media/[^"]+)"', h)
    return m.group(1) if m else None

# ---------------------------------------------------------------- build article data
items = []
for slug, old, date, when, title, cat, related in ARTICLES:
    body = clean(old, pages[old]["html"])
    rel = []
    for r in related:
        rb = clean(r, pages[r]["html"])
        rel.append(dict(anchor=r.strip("/").split("/")[-1], title=html.unescape(pages[r]["title"]).replace("_", " "), body=rb))
    excerpt = text_of(body)
    if len(excerpt) < 60:
        excerpt = (excerpt + " " + " ".join(text_of(x["body"]) for x in rel)).strip()
    if len(excerpt) > 190:
        excerpt = excerpt[:190].rsplit(" ", 1)[0] + "…"
    thumb = first_img(body) or next((first_img(x["body"]) for x in rel if first_img(x["body"])), None)
    items.append(dict(kind="article", slug=slug, old=old, date=date, when=when, title=title, cat=cat,
                      body=body, related=rel, excerpt=excerpt, thumb=thumb))
for date, when, title, source, url, summary, cat in EXTERNAL:
    items.append(dict(kind="external", date=date, when=when, title=title, source=source, url=url, excerpt=summary, cat=cat, thumb=None))
items.sort(key=lambda x: x["date"], reverse=True)
arts = [x for x in items if x["kind"] == "article"]

# About page: written fresh (the old WordPress pages had the logo, a 2015 brochure scan, old maps and personal phone numbers)
used_media.add("2013/04/SRS_1.jpg")
MAPS = "https://www.google.com/maps/search/?api=1&query=4054+Van+Buren+St+NE+Columbia+Heights+MN+55421"
about_html = f"""<figure class="about-photo"><img src="/img/center-front.jpg" srcset="/img/center-front-800.jpg 800w, /img/center-front.jpg 1299w" sizes="(min-width: 760px) 720px, 100vw" alt="The Science of Spirituality Meditation Center building on Van Buren Street NE in Columbia Heights" width="1299" height="609"></figure>
<section id="aboutus">
<h2>Science of Spirituality</h2>
<p><img alt="Sant Rajinder Singh Ji Maharaj" class="alignleft" loading="lazy" src="/news/media/2013/04/SRS_1.jpg" width="115" height="290"><strong>Science of Spirituality</strong> is a global, nonprofit, spiritual organization dedicated to personal transformation through meditation, under the direction of Sant Rajinder Singh Ji Maharaj.</p>
<p>From its centers in countries all over the world, Science of Spirituality strives to help individuals and communities achieve deeper, richer inner lives with a stronger sense of meaning and purpose.</p>
<p>We are a global, nonprofit, spiritual organization. But we are much more than that. We are millions of individuals, of all nationalities, races, and faiths, who are deeply committed to bettering ourselves and our world through a spiritual way of living based on meditation, ethical values, and regard for life.</p>
<p>We welcome you to join us at our conferences, meetings (<em>satsangs</em>), workshops, talks, retreats, and meditation seminars, always held free of charge at our center.</p>
<p>Through Sant Rajinder Singh Ji Maharaj’s teachings, his guidance, and his example, millions of people around the world are discovering the beauty and power of the soul.</p>
<p>Learn more at <a href="https://www.sos.org" target="_blank" rel="noopener">sos.org</a>.</p>
</section>
<section id="contactus">
<h2>Visit the center</h2>
<p><strong>Science of Spirituality Minneapolis Meditation Center</strong><br>4054 Van Buren St NE, Columbia Heights, MN 55421<br>½ block west of 41st Ave NE &amp; Central Ave · <a href="{MAPS}" target="_blank" rel="noopener">Open in Google Maps ↗</a></p>
<p>Park in the lot next to the building and use the door next to the parking lot.</p>
<p><strong>Contact:</strong> <a href="mailto:MinneapolisCenter@sos.org">MinneapolisCenter@sos.org</a> · {WHATSAPP}</p>
<p><strong>Follow us:</strong> <a href="https://www.facebook.com/ScienceOfSpiritualityMinnesota/" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.meetup.com/ScienceofSpirituality-MeditationCenter-Minneapolis" target="_blank" rel="noopener">Meetup</a></p>
</section>
<section id="directions">
<h2>Directions</h2>
<h3>From the north (I-694 east or west)</h3>
<ol>
<li>Take exit 38 for Central Avenue (MN-65).</li>
<li>Go south on Central Avenue to 41st Avenue NE.</li>
<li>Turn right onto 41st Avenue and go one block.</li>
<li>Turn left onto Van Buren Street, then right into the parking lot. The center is on your left.</li>
</ol>
<h3>From the south (I-35W north)</h3>
<ol>
<li>Take exit 21B for Johnson Street in Northeast Minneapolis and continue north on Johnson Street.</li>
<li>Turn left onto 27th Avenue NE, then right onto Central Avenue (MN-65).</li>
<li>Turn left onto 40th Avenue NE, then take the first right onto Van Buren Street NE (a very short block).</li>
<li>The center is on your left at the end of the block. Turn left into the parking lot.</li>
</ol>
</section>"""

# ---------------------------------------------------------------- templates
E = html.escape
CATS = ["Center News", "Talks & Retreats", "Youth & Family", "Peace Fest", "Interfaith", "Celebrations", "Press"]
ICON = {"Center News": "🏛️", "Talks & Retreats": "🪷", "Youth & Family": "👨‍👩‍👧", "Peace Fest": "🕊️",
        "Interfaith": "🤝", "Celebrations": "🪔", "Press": "📰"}

def page(title, desc, body, canonical, extra_head=""):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{SITE_URL}{canonical}">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{SITE_URL}{canonical}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#043a5b">
<link rel="icon" href="/img/favicon-64.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="stylesheet" href="/news/news.css?v=2">
{extra_head}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="site-inner">
    <a class="org" href="/"><span class="org-mark"><img src="/img/sos-logo.png" srcset="/img/sos-logo.png 1x, /img/sos-logo-192.png 2x" alt="Science of Spirituality logo" width="54" height="34"></span><span><b>Science of Spirituality</b><small>Minneapolis Meditation Center</small></span></a>
    <nav aria-label="Site">
      <a href="/">Events</a>
      <a href="/calendar/">Calendar</a>
      <a href="/news/"{' aria-current="page"' if canonical.startswith('/news') else ''}>News</a>
      <a href="/about/"{' aria-current="page"' if canonical.startswith('/about') else ''}>About</a>
    </nav>
  </div>
</header>
<main id="main">
{body}
</main>
<footer class="site">
  <div class="site-inner">
    <p><b>Science of Spirituality Minneapolis Meditation Center</b><br>4054 Van Buren St NE, Columbia Heights, MN 55421 · <a href="mailto:MinneapolisCenter@sos.org">MinneapolisCenter@sos.org</a> · {WHATSAPP}</p>
    <p>Current programs: <a href="/">upcoming events</a> and the <a href="/calendar/">calendar</a>. More about us: <a href="https://sos.org/location/Minneapolis-StPaul/" target="_blank" rel="noopener">Minneapolis center on sos.org ↗</a>. All programs are free of charge.</p>
    <p class="fine"><a href="/privacy/">Privacy</a> · <a href="https://www.sos.org/terms-of-use" target="_blank" rel="noopener">sos.org terms</a> · Run by volunteers of the Science of Spirituality Minneapolis Meditation Center · © {datetime.date.today().year} Science of Spirituality.</p>
    <p class="fine" style="opacity:.8"><a href="/copilot/">Meditation Copilot</a> · prototype (not officially approved)</p>
  </div>
</footer>
</body>
</html>
"""

def card(x):
    year = x["date"][:4]
    thumb = (f'<img src="{x["thumb"]}" alt="" loading="lazy">' if x["thumb"]
             else f'<span class="ph" aria-hidden="true">{ICON.get(x["cat"], "🪷")}</span>')
    if x["kind"] == "external":
        return f"""<article class="card ext" data-cat="{E(x['cat'])}" data-year="{year}">
  <a class="card-link" href="{E(x['url'])}" target="_blank" rel="noopener">
    <div class="thumb">{thumb}</div>
    <div class="card-body">
      <p class="meta"><time datetime="{x['date']}">{E(x['when'])}</time> · <span class="tag">{E(x['source'])} ↗</span></p>
      <h3>{E(x['title'])}</h3>
      <p class="excerpt">{E(x['excerpt'])}</p>
    </div>
  </a>
</article>"""
    more = ""
    if x["related"]:
        more = f'<p class="more">Includes {len(x["related"])} related page{"s" if len(x["related"]) > 1 else ""}</p>'
    return f"""<article class="card" data-cat="{E(x['cat'])}" data-year="{year}">
  <a class="card-link" href="/news/{x['slug']}/">
    <div class="thumb">{thumb}</div>
    <div class="card-body">
      <p class="meta"><time datetime="{x['date']}">{E(x['when'])}</time> · <span class="tag">{E(x['cat'])}</span></p>
      <h3>{E(x['title'])}</h3>
      <p class="excerpt">{E(x['excerpt'])}</p>
      {more}
    </div>
  </a>
</article>"""

def build_index():
    years = []
    for x in items:
        y = x["date"][:4]
        if not years or years[-1][0] != y:
            years.append((y, []))
        years[-1][1].append(x)
    chips = '<button class="chip on" data-cat="">All</button>' + "".join(
        f'<button class="chip" data-cat="{E(c)}">{ICON[c]} {E(c)}</button>' for c in CATS if any(i["cat"] == c for i in items))
    jump = " ".join(f'<a href="#y{y}">{y}</a>' for y, _ in years)
    groups = "".join(f'<section class="year" id="y{y}" data-year="{y}"><h2 class="year-h">{y}</h2><div class="cards">{"".join(card(x) for x in xs)}</div></section>' for y, xs in years)
    body = f"""<section class="hero">
  <div class="hero-inner">
    <p class="eyebrow">News &amp; Archive</p>
    <h1>Two decades of meditation in the Twin Cities</h1>
    <p class="lead">Stories, talks, retreats, family camps, Peace Fests and press coverage from the Science of Spirituality Minneapolis Meditation Center community, newest first.</p>
    <div class="tools">
      <label class="search"><span class="sr">Search articles</span><input type="search" id="q" placeholder="Search articles…" autocomplete="off"></label>
      <div class="chips" role="group" aria-label="Filter by topic">{chips}</div>
    </div>
    <p class="jump" aria-label="Jump to year">{jump}</p>
  </div>
</section>
<div class="wrap">
  <p class="count" id="count" aria-live="polite">{len(items)} articles</p>
  {groups}
  <p class="empty" id="empty" hidden>No articles match your search.</p>
</div>
<script src="/news/news.js?v=1" defer></script>"""
    return page("News & Archive · Science of Spirituality Minneapolis Meditation Center",
                "News, talks, retreats, family camps, Peace Fests and press coverage from the Science of Spirituality Minneapolis Meditation Center.",
                body, "/news/")

def build_article(i, x):
    newer = arts[i - 1] if i > 0 else None
    older = arts[i + 1] if i + 1 < len(arts) else None
    rel = ""
    if x["related"]:
        rel = '<section class="related"><h2>More from this event</h2>' + "".join(
            f'<details id="{E(r["anchor"])}"><summary>{E(r["title"])}</summary><div class="prose">{r["body"]}</div></details>' for r in x["related"]) + "</section>"
    nav = '<nav class="pager" aria-label="More articles">'
    nav += f'<a class="newer" href="/news/{newer["slug"]}/"><small>← Newer</small>{E(newer["title"])}</a>' if newer else "<span></span>"
    nav += f'<a class="older" href="/news/{older["slug"]}/"><small>Older →</small>{E(older["title"])}</a>' if older else "<span></span>"
    nav += "</nav>"
    body = f"""<div class="wrap narrow">
  <p class="crumbs"><a href="/news/">News</a> › <a href="/news/#y{x['date'][:4]}">{x['date'][:4]}</a></p>
  <article class="post">
    <header>
      <p class="meta"><time datetime="{x['date']}">{E(x['when'])}</time> · <span class="tag">{E(x['cat'])}</span></p>
      <h1>{E(x['title'])}</h1>
      <p class="note">From the sosmn.org archive. Dates, times and sign-up details are historical. For current programs, see <a href="https://www.sos.org/find-local-programs/" target="_blank" rel="noopener">sos.org</a>.</p>
    </header>
    <div class="prose">{x['body']}</div>
    {rel}
  </article>
  {nav}
</div>
<script src="/news/news.js?v=1" defer></script>"""
    return page(f"{x['title']} · Science of Spirituality Minneapolis Meditation Center", x["excerpt"], body, f"/news/{x['slug']}/")

def build_about():
    body = f"""<div class="wrap narrow">
  <article class="post">
    <header><h1>About the Meditation Center</h1></header>
    <div class="infobox">
      <p><b>Events:</b> <a href="/">Upcoming</a> · <a href="/calendar/">Calendar</a> · <a href="https://sos.org/location/Minneapolis-StPaul/" target="_blank" rel="noopener">Our page on sos.org ↗</a> · <a href="https://www.sos.org/find-local-programs/" target="_blank" rel="noopener">Programs worldwide ↗</a></p>
      <p><b>Contact:</b> <a href="mailto:MinneapolisCenter@sos.org">MinneapolisCenter@sos.org</a> · {WHATSAPP} · <a href="#directions">Directions</a></p>
    </div>
    <div class="prose">{about_html}</div>
  </article>
</div>"""
    return page("About · Science of Spirituality Minneapolis Meditation Center",
                "About the Science of Spirituality Minneapolis Meditation Center in Columbia Heights.", body, "/about/")

def build_404():
    body = """<div class="wrap narrow center" style="padding:72px 0">
  <h1>Page not found</h1>
  <p class="lead">That page may have moved when the website was refreshed.</p>
  <p><a class="btn" href="/">Upcoming events</a> <a class="btn ghost" href="/news/">News &amp; archive</a></p>
</div>"""
    return page("Page not found · sosmn.org", "Page not found", body, "/404")

# ---------------------------------------------------------------- write news + about
def write(rel, content):
    p = os.path.join(OUT, rel.lstrip("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)


def clear_dir(path):
    """Empty a folder for a fresh build. Works inside OneDrive on Windows, where a synced folder can be briefly
    locked: files are removed (with a few retries), and a folder that can't be removed right now is left empty."""
    import time, stat
    if not os.path.exists(path):
        os.makedirs(path); return
    stuck = []
    for root, dirs, files in os.walk(path, topdown=False):
        for f in files:
            fp = os.path.join(root, f)
            for attempt in range(5):
                try:
                    os.chmod(fp, stat.S_IWRITE); os.remove(fp); break
                except FileNotFoundError:
                    break
                except OSError:
                    time.sleep(0.5)
            else:
                stuck.append(fp)
        for d in dirs:
            try: os.rmdir(os.path.join(root, d))
            except OSError: pass          # locked or not empty: left in place, harmless
    if stuck:
        sys.exit("Could not remove these files (is a preview server or another program using the folder?):\n  " + "\n  ".join(stuck[:10]))

clear_dir(OUT)
write("/news/index.html", build_index())
for i, x in enumerate(arts):
    write(f"/news/{x['slug']}/index.html", build_article(i, x))
write("/about/index.html", build_about())
write("/404.html", build_404())
here = os.path.dirname(os.path.abspath(__file__))
for f in ("news.css", "news.js"):
    shutil.copy(os.path.join(here, "assets", f), os.path.join(OUT, "news", f))

# ---------------------------------------------------------------- media
zips = [zipfile.ZipFile(z) for z in sorted(glob.glob(os.path.join(ZIPDIR, "*uploads*.zip")))]
index = {}
for z in zips:
    for n in z.namelist():
        if not n.endswith("/"):
            index[n.split("uploads/", 1)[-1]] = (z, n)
missing, total = [], 0
for rel in sorted(used_media):
    if rel not in index:
        missing.append(rel); continue
    z, n = index[rel]
    data = z.read(n)
    dst = os.path.join(OUT, "news", "media", rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ext = rel.lower().rsplit(".", 1)[-1]
    if ext in ("jpg", "jpeg", "png"):
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
            if max(im.size) > 1600:
                im.thumbnail((1600, 1600))
            if ext == "png":
                im.save(dst, "PNG", optimize=True)
                if os.path.getsize(dst) > len(data):
                    open(dst, "wb").write(data)
            else:
                im.convert("RGB").save(dst, "JPEG", quality=80, optimize=True, progressive=True)
                if os.path.getsize(dst) > len(data):
                    open(dst, "wb").write(data)
        except Exception as e:
            open(dst, "wb").write(data)
    else:
        open(dst, "wb").write(data)
    total += os.path.getsize(dst)

# ---------------------------------------------------------------- app
APP_FILES = ["index.html", "privacy.html", "manifest.json", "sw.js", "css", "js", "icons"]
APP_OUT = os.path.join(OUT, "copilot")
os.makedirs(APP_OUT, exist_ok=True)
for f in APP_FILES:
    s = os.path.join(APPDIR, f)
    d = os.path.join(APP_OUT, f)
    if os.path.isdir(s): shutil.copytree(s, d, dirs_exist_ok=True)
    else: shutil.copy(s, d)
idx = open(os.path.join(APP_OUT, "index.html"), encoding="utf-8").read()
idx = idx.replace("https://arvindknaik.github.io/Meditation-Copilot/icons/icon-512.png", SITE_URL + "/copilot/icons/icon-512.png")
idx = idx.replace('<meta property="og:url" content="https://arvindknaik.github.io/Meditation-Copilot/">', f'<meta property="og:url" content="{SITE_URL}/copilot/">')
open(os.path.join(APP_OUT, "index.html"), "w", encoding="utf-8").write(idx)

# ---------------------------------------------------------------- redirects, headers, robots, sitemap
lines = ["# sosmn.org redirects (Cloudflare _redirects format). Old WordPress addresses -> new pages.",
         "/wp /news/ 301", "/home-2/ /news/ 301", "/feed/ /news/ 301"]
seen = set()
NEW_PATHS = ("/calendar", "/event", "/checkin", "/privacy", "/about", "/news", "/copilot")   # pages of the new site: never redirect them
for old, new in sorted(urlmap.items()):
    if old == "/" or old in seen or old.rstrip("/") in NEW_PATHS:
        continue
    seen.add(old)
    target = new.split("#")[0] if "#" in new else new
    lines.append(f"{old} {new} 301")
    lines.append(f"{old.rstrip('/')} {new} 301")
lines.append("/mhmm/ /news/ 301")
lines.append("/wp/* /:splat 301")
# Cloudflare rejects two rules for the same address: keep the first rule for each one
_src = set(); _out = []
for ln in lines:
    key = ln.split()[0] if ln and not ln.startswith("#") else None
    if key is not None:
        if key in _src: continue
        _src.add(key)
    _out.append(ln)
write("/_redirects", "\n".join(_out) + "\n")
write("/_headers", """/news/media/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
/sw.js
  Cache-Control: no-cache
/news/articles.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300
""")
write("/news/articles.json", json.dumps({"articles": [
    {"url": f"/news/{x['slug']}/", "title": x["title"], "date": x["when"], "image": x["thumb"], "summary": x["excerpt"], "category": x["cat"]} for x in arts]}, indent=1, ensure_ascii=False))
write("/robots.txt", f"User-agent: *\nAllow: /\nDisallow: /checkin/\nSitemap: {SITE_URL}/sitemap.xml\n")
urls = ["/", "/calendar/", "/news/", "/about/", "/privacy/"] + [f"/news/{x['slug']}/" for x in arts]
write("/sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "".join(f"  <url><loc>{SITE_URL}{u}</loc></url>\n" for u in urls) + "</urlset>\n")

# ---------------------------------------------------------------- events site (root) + admin site
VERSION = datetime.date.today().strftime("%Y%m%d")
def render(html, parts):
    for k, v in parts.items():
        html = html.replace("{{" + k + "}}", v)
    return html
if SRC:
    web = os.path.join(SRC, "web")
    pp = {k: open(os.path.join(web, "partials", k.replace("_", "-") + ".html"), encoding="utf-8").read() for k in ("head", "header", "footer", "layout_boot")}
    pp["head"] = render(pp["head"], {"layout_boot": pp["layout_boot"]})
    for root, dirs, files in os.walk(web):
        if "partials" in root:
            continue
        for f in files:
            src = os.path.join(root, f); rel = os.path.relpath(src, web); dst = os.path.join(OUT, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if f.endswith(".html"):
                h = render(open(src, encoding="utf-8").read(), {"head": pp["head"], "header": pp["header"], "footer": pp["footer"]})
                open(dst, "w", encoding="utf-8").write(render(h, {"v": VERSION}))
            else:
                shutil.copy(src, dst)
    if OUT_ADMIN:
        clear_dir(OUT_ADMIN)
        shutil.copytree(os.path.join(SRC, "admin"), OUT_ADMIN, dirs_exist_ok=True)
        shutil.copy(os.path.join(web, "css", "site.css"), os.path.join(OUT_ADMIN, "css", "site.css"))
        shutil.copy(os.path.join(web, "js", "auth.js"), os.path.join(OUT_ADMIN, "js", "auth.js"))
        shutil.copytree(os.path.join(web, "img"), os.path.join(OUT_ADMIN, "img"), dirs_exist_ok=True)
        ai = os.path.join(OUT_ADMIN, "index.html")
        txt = open(ai, encoding="utf-8").read()
        open(ai, "w", encoding="utf-8").write(render(txt, {"v": VERSION}))
        open(os.path.join(OUT_ADMIN, "_headers"), "w").write("/*\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  Referrer-Policy: same-origin\n")
        open(os.path.join(OUT_ADMIN, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")

nfiles = sum(len(f) for _, _, f in os.walk(OUT))
print(json.dumps(dict(articles=len(arts), external=len(EXTERNAL), media=len(used_media), media_missing=missing,
                      media_mb=round(total / 1e6, 1), files=nfiles, redirects=len(lines)), indent=1))
