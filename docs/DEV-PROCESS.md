# Development, test and release process

**Minneapolis Meditation Center apps** · repository `arvindknaik/mn-meditation-center` · agreed 2026-11-25, built 2026-11-25 · owner: Arvind

Covers sosmn.org (events site), sosmn.org/copilot (Meditation Copilot), admin.sosmn.org (admin site) and the events server.

---

## 1. Repository

- **One public repository** on Arvind's personal GitHub account: `mn-meditation-center` (the existing `Meditation-Copilot` repo renamed, keeping its history).
- Kept **outside OneDrive**: `C:\Users\arvin\Dev\mn-meditation-center` (OneDrive locks files and breaks Git). GitHub is the backup.
- **Public for the pilot (3–6 months)**, then moved to an SOS organization and made private.
  - Visibility can be changed any time (Settings → General → Danger Zone). A repo can also be deleted, but copies made while it was public can't be recalled.
  - Rule: **nothing confidential is ever committed** — no passwords, keys, member data, backups or `RecoveryKey.txt`. Secrets live only in Cloudflare and GitHub secrets.
- The old address `arvindknaik.github.io/Meditation-Copilot` is retired (decided 2026-11-25): GitHub Pages is off and the team uses sosmn.org/copilot. Printed check-in posters must use `sosmn.org/checkin/`.

### Layout
```
mn-meditation-center/
  apps/copilot/          Meditation Copilot (PWA)
  apps/site/             sosmn.org pages, partials, styles, images
  apps/admin/            admin site
  api/                   events server (Cloudflare Worker) + database migrations
  content/news/          News & About (already built from the old WordPress site; no backup needed)
  centers/mpls.json      everything specific to this center (name, address, contacts, links, time zone, domains)
  deploy/                Cloudflare settings for local, test and prod
  tests/                 unit/, api/, e2e/, acceptance/ (checklists per feature)
  tools/                 build and release scripts (Node; work on Windows and Mac)
  docs/                  DEV-PROCESS.md, SOSMN-SRM.md, feature specs
  reports/               latest test report, BUILDS.md (build log)
  releases.json          release notes shown in the apps ("What's new")
  release.bat / release.command   double-click wrappers (Windows / Mac)
```

### Everyday commands
| Command | Does |
|---|---|
| `npm install` then `npm run setup` | once after cloning: local settings + local database with made-up data |
| `npm run dev` | run everything locally (8000 site + Copilot, 8001 admin, 8787 server) |
| `npm test` | all tests → `reports/latest.md` |
| `release.bat` / `release.command` | Build → Test → Prod (Arvind) |
| `node tools/release.mjs status` | what is built, on test, live |
| `node tools/github-setup.mjs` | one-time: labels, milestones, backlog issues (needs GitHub CLI) |

### Ready for more centers later
- Center details move into `centers/<id>.json`; code reads them instead of hard-coding "Minneapolis".
- The database already tags events with a center (`mpls`).
- Either path stays open: copy the repo for another center, or run several centers from one app.

---

## 2. Work items (GitHub Issues)

| Label | Meaning | Released on its own |
|---|---|---|
| `epic` | A large goal (e.g. Challenge Program) | Yes, as its features finish |
| `feature` | A user-visible capability (sub-issue of an epic) | Yes |
| `sub-feature` | A part of a feature (sub-issue of a feature) | No — ships with its feature |
| `bug` | Something broken | Yes |

- Labels for now (GitHub's built-in issue *types* need an organization; they replace labels after the move).
- Each release is a **Milestone** (e.g. `v0.19`).
- Commits and pull requests mention their issue: `Fixes #42`.
- Extra labels: `user-facing` / `admin-only` (decides where release notes appear), `needs-migration`.
- Specs (the "why") stay in `docs/`; issues hold the "what".

---

## 3. Environments

| | Local | Test | Prod |
|---|---|---|---|
| Addresses | `localhost:8000` site + Copilot · `:8001` admin · `:8787` server | `test.sosmn.org` · `test-admin.sosmn.org` | `sosmn.org` · `admin.sosmn.org` |
| Database | local, with made-up seed data | separate test database, made-up data | real |
| Sign-in | test sign-in (any email, no Google needed) | Google / Microsoft | Google / Microsoft |
| Who | any developer | Arvind + testers, on phones | everyone |
| Deploy needs | nothing | **Arvind's approval** | **Arvind's approval** |

No real people's data is ever copied into local or test.

---

## 4. Testing

| Layer | Checks | Runs |
|---|---|---|
| Unit | single functions (level rules, challenge math, validators) | every build |
| API | server + database with seed data (permissions, follow-ups, challenges) | every build |
| End-to-end | real browser at phone and desktop sizes (sign-up step, admin forms) | every build |
| Smoke | the deployed site answers and key pages load | after each test/prod deploy |
| Acceptance | short checklist per feature, done by Arvind on test | before prod |

Every feature has named test cases (Given / When / Then) linked to its issue.

**Test report after every build:** build number, pass/fail per suite and per feature, failures, screenshots → `reports/latest.md` and a line in `reports/BUILDS.md`; each release's full report is attached to its GitHub Release.

---

## 5. Versions and builds

- **Version** shown to users with the date beside it: **v0.19 · Nov 25, 2026**.
- **Baseline:** `v0.16` = what is live today (summary of everything so far).
- **First release under this process: `v0.19`** — SRM Phase 1 (Follow-ups, Journey) and Challenge Program step 1 (21-day path), built as 0.17/0.18 but not yet deployed.
- Next releases: `v0.20`, `v0.21`… Bugfix-only releases: `v0.19.1`.
- **Build:** each tested check-in, e.g. `v0.19-b3`. Builds accumulate until released; the released build keeps its number through test and prod.
- The version shows in the app footer/Account, the sites' footers and the server's health check.

---

## 6. Release script

One script, three steps, each stopping on failure:

```
release build   commit, run all tests, number the build, write the test report, push to GitHub
release test    (Arvind approves) apply database changes to TEST, deploy the build, smoke test
release prod    (Arvind approves) show draft release notes to edit/approve, back up the real database,
                apply its changes, deploy server + sites, tag the GitHub Release, publish "What's new"
```

- **Contributors:** clone → run locally → pull request. Tests run automatically on GitHub for every pull request. Arvind reviews and merges.
- **Approvals:** test and prod deploys run as GitHub "environments" that wait for Arvind's approval; the Cloudflare deploy key is stored only there. Arvind can also run them from his own computer with his Cloudflare login.
- **Rollback:** one command returns the server or a site to its previous version; database backup taken before every prod release.
- **Database changes** only add things first; removals come in a later release, so a rollback is always safe.

---

## 7. Release notes

- Drafted from the milestone's closed issues, grouped **New / Improved / Fixed**, one line each; Arvind edits and approves.
- `user-facing` items → **"What's new"** in Copilot and on sosmn.org.
- `admin-only` items → "What's new" on the admin site and on GitHub.
- Full notes with issue links → GitHub Release.

---

## 8. Set-up steps (in order)

| # | Step | Who |
|---|---|---|
| 1 | Rename `Meditation-Copilot` → `mn-meditation-center` on GitHub (Settings → General); turn off GitHub Pages there | Arvind |
| 2 | ~~Redirect for the old Copilot address~~ — not needed (old address retired) | — |
| 3 | Restructure into the layout above in `C:\Users\arvin\Dev\mn-meditation-center`; add center config, tests, scripts, issue templates, labels list | Claude |
| 4 | Push; create labels, milestones `v0.19` / `v0.20` and the backlog issues | Arvind runs the script / Claude prepares |
| 5 | Test environment: test database, test server and sites, `test.sosmn.org` domains; add test addresses to Google/Microsoft sign-in | Arvind (guided) |
| 6 | GitHub environments `test` and `production` with Arvind as required reviewer; Cloudflare deploy key as a secret | Arvind (guided) |
| 7 | First run: `release build` → `release test` → `release prod` for **v0.19** | Arvind |

### Test environment — one-time set-up (step 5)
Run `release.bat` (Mac: `release.command`) → **6 First-time set-up of test.sosmn.org**. It signs you in to Cloudflare if needed, creates the test database and writes its id into `api/wrangler.toml`, creates the tables, saves the test secrets in Cloudflare (a new random `SESSION_SECRET`, and `ADMIN_EMAILS`), and can add made-up people and events. Then, once, in a browser:
1. Google Cloud → Clients → Authorized JavaScript origins: add `https://test.sosmn.org` and `https://test-admin.sosmn.org`.
2. Microsoft Entra → Redirect URIs: add `https://test.sosmn.org/`, `https://test.sosmn.org/copilot/`, `https://test-admin.sosmn.org/`.
3. Zero Trust → Access → Applications → **Admins** → add the hostname `test-admin.sosmn.org`.
`release test` creates `test.sosmn.org` and `test-admin.sosmn.org` automatically on the first deploy.

### GitHub approvals — one-time set-up (step 6, optional)
Settings → Environments → **test** and **production** → Required reviewers: you. In each, add secrets `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`. Then Actions → Deploy → Run workflow. Without this, `release.bat` on your computer does the same with your Cloudflare login.
