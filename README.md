# 🙏 Meditation Copilot

*Small moments. Daily practice. Inner transformation.*

A mobile-first app that maps your path to a fixed spiritual goal of **10,000 effective meditation hours**.
Plain HTML, CSS and JavaScript. No frameworks, no build step, no tracking. Answers are stored only in the browser's localStorage.

Live: https://arvindknaik.github.io/Meditation-Copilot/

## Files

```
index.html            The whole app (Phase 1: works by double-clicking it)
manifest.json         PWA manifest (name, colors, icons, standalone display)
sw.js                 Service worker: offline support + caching
icons/                SVG sources + PNG icons (192, 512, maskable 512, Apple touch 180)
.github/workflows/icons.yml  Renders the PNG icons from the SVGs whenever an SVG changes
.nojekyll             Tells GitHub Pages to serve files as-is
```

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
- **When you change any file, bump `CACHE_VERSION` in `sw.js`** (e.g. `v2` → `v3`) and add any new files to its `ASSETS` list so installed copies refresh.
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
