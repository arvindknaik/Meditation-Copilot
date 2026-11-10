# 🙏 Meditation Copilot

*Small moments. Daily practice. Inner transformation.*

A mobile-first app that maps your path to a fixed spiritual goal of **10,000 effective meditation hours**.
Plain HTML, CSS and JavaScript. No frameworks, no build step, no tracking. Answers are stored only in the browser's localStorage.

Live: https://arvindknaik.github.io/Meditation-Copilot/

## Files

```
index.html            App shell: all screens and dialogs (also works by double-clicking it)
privacy.html          Privacy notice (draft for review)
css/styles.css        All styles, light + dark themes
js/config.js          Public settings: Google/Microsoft Client IDs, analytics endpoint, support contact
js/quotes.js          Master quote file for "Thought for today" (add approved quotes here)
js/core.js            Storage, dates, sessions, roadmap math, CSV format, sync snapshot/merge, router
js/diag.js            Private diagnostic log + anonymous usage events
js/roadmap.js         Roadmap: 5 questions, results, milestone track, what-if, sharing
js/sessions-ui.js     Save / add / edit / delete a sitting
js/timer.js           Timer: 10 s settle, start/end bells, countdown or open, pause, wake lock
js/insights.js        Totals, chart, patterns, session log, CSV export/import
js/home.js            Today screen
js/knowledge.js       Learn articles and sos.org links (draft for SOS review)
js/learn.js           Learn: search, paginated results, articles
js/sync.js            Google / Microsoft sign-in and Drive / OneDrive sync
js/calendar.js        Calendar: personal schedule, month view, reminders, phone-calendar export
js/events.js          SOS events: list, event page, RSVP, check-in (code/QR/online), admin tools
js/vendor/qrcode.js   QR code generator (qrcode-generator 1.5.2, MIT)
js/challenge.js       New Seekers' 42-day challenge (rules + screen)
js/rewards.js         Points, badges and levels (rules list, easy to extend)
js/account.js         Welcome / sign-in choice, guest mode, Account & settings, backup reminder
js/profile.js         New Seeker / Initiated Member, initiation date and Master
js/app.js             Startup and service-worker registration
manifest.json         PWA manifest (name, colors, icons, shortcuts)
sw.js                 Service worker: offline support + caching
icons/                SVG + PNG icons (192, 512, maskable 512, Apple touch 180)
docs/                 intent.md, tech-spec.md, product-status.md, setup-accounts.md, events-requirements.md, setup-cloudflare.md
api/                  Events server (Cloudflare Worker + D1): src/index.js, migrations/, schema.sql, wrangler.toml
push.bat              Windows: add, commit (asks for a message) and push
server-start.bat      Windows: start a local test server at http://localhost:8000/
server-stop.bat       Windows: stop the local test server
.nojekyll             Tells GitHub Pages to serve files as-is
```

## Features
- **Today, Timer, Insights, Roadmap, Learn:** see `docs/intent.md` and `docs/product-status.md`.
- **Guest mode:** data stays on this device only, with a warning and backup reminders. Google and Microsoft sign-in are coming next (`docs/setup-accounts.md`).
- **CSV export/import:** header must be exactly `date,start_time,minutes,quality_pct,effective_minutes,reflection,source`. Export writes dates as YYYY-MM-DD and times as HH:MM. Import also accepts Excel-style values: dates like `11/9/2026` (US month/day; day/month only when the first number is over 12), `9-Nov-2026` or `Nov 9, 2026`; times like `6:00`; quality like `75%`. Invalid files are rejected; rows overlapping existing sittings are skipped and listed.

**Prototype only. Not an official or approved Science of Spirituality app.**

## Phase 1: Run locally
Double-click `index.html`. Everything works except install/offline, which browsers only allow over http(s).

To test the PWA locally:
```bash
cd Meditation-Copilot
python3 -m http.server 8000
# open http://localhost:8000
```

## Phase 2: PWA
- `manifest.json` uses relative paths (`./`), so it works under the `/Meditation-Copilot/` sub-path.
- `sw.js` pre-caches the app shell. Pages load network-first (so updates arrive), with a cached fallback when offline. Icons and other assets load cache-first.
- **When you change any file:** bump `CACHE_VERSION` in `sw.js` (e.g. `v6` → `v7`) **and** the `?v=` number on the css/js links in `index.html` (e.g. `?v=6` → `?v=7`), and `MC.VERSION` in `js/core.js`. Add any new files to the `ASSETS` list in `sw.js`. This makes phones load the new code right away instead of a cached older copy.
- Android/Chrome shows an **Add to Home Screen** button on the results card. iPhone shows a "Share → Add to Home Screen" hint.

## Phase 3: Deploy to GitHub Pages
1. Create a public repo named **`Meditation-Copilot`** under `arvindknaik` (the name is case-sensitive and must match the URL).
2. Upload the *contents* of this folder to the repo root (`index.html` at the top level):
   ```bash
   cd Meditation-Copilot
   git init -b main
   git add .
   git commit -m "Meditation Copilot v1"
   git remote add origin https://github.com/arvindknaik/Meditation-Copilot.git
   git push -u origin main
   ```
   Or drag the files into the repo with GitHub's **Add file → Upload files**.
3. Go to **Settings → Pages → Build and deployment**, set *Source* to **Deploy from a branch**, then choose **main** and **/ (root)**, and save.
4. After a minute or two, open https://arvindknaik.github.io/Meditation-Copilot/

The share links and WhatsApp preview image (`og:image`) already point to that URL. If you deploy elsewhere, search for `arvindknaik.github.io` in `index.html` and update it.

## Calculation reference
| Item | Formula |
|---|---|
| Effective daily minutes | minutes/day × quality % |
| Hours completed | effective min/day × days since journey start ÷ 60 (capped at 10,000) |
| Hours remaining | 10,000 − completed (never below 0) |
| Required effective avg | remaining hours × 60 ÷ days until goal-age birthday |
| Ahead of schedule | current effective ≥ required → projected completion age + time ahead |
| Behind schedule | additional effective min/day = required − current (also shown as actual sitting minutes at your quality) |

Goal age must be a whole number, greater than your current age, and no more than 90. A projected completion past 90 is shown as "Beyond 90 at current pace" so the message stays encouraging.
