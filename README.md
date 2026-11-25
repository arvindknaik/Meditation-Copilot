# Minneapolis Meditation Center apps

Code for the Science of Spirituality Minneapolis Meditation Center:

| App | Live | Source |
|---|---|---|
| Events site, News, About, What's new | [sosmn.org](https://sosmn.org) | `apps/site`, `content/` |
| Meditation Copilot (prototype) | [sosmn.org/copilot](https://sosmn.org/copilot/) | `apps/copilot` |
| Admin site | admin.sosmn.org (team only) | `apps/admin` |
| Events server (Cloudflare Worker + D1) | — | `api/` |

How we work — work items, environments, tests, versions and releases: **[docs/DEV-PROCESS.md](docs/DEV-PROCESS.md)**.

## Run it on your computer (Windows or Mac)

Needs [Node.js 20+](https://nodejs.org) and Git. Google Chrome is used for browser tests.

```
git clone https://github.com/arvindknaik/mn-meditation-center.git
cd mn-meditation-center
npm install
npm run setup        # local settings + a local database with made-up people and events
npm run dev          # http://localhost:8000 (site + /copilot/) · http://localhost:8001 (admin) · server on :8787
```

Sign in locally with **Local test sign-in** (any email). `owner@example.com` is the owner on the admin site.
No real data is ever used locally. Files rebuild when you save; refresh the browser.

## Test

```
npm test             # unit + API + browser tests → reports/latest.md
npm run test:unit    # just one suite (also test:api, test:e2e)
```

Name tests with the feature they cover, e.g. `test('[challenges] …')`, so the report groups them by feature.

## Contribute

1. Pick or create an issue (Epic › Feature › Sub-feature, or Bug).
2. Branch, change, `npm test`, open a pull request ("Fixes #12"). Tests run automatically on GitHub.
3. Arvind reviews and merges, then builds, deploys to test.sosmn.org, and releases to production.

Never commit passwords, keys, personal data or database backups.

## Release (Arvind)

`release.bat` (Windows) or `release.command` (Mac): **Build → Test → Prod**. See [docs/DEV-PROCESS.md](docs/DEV-PROCESS.md).

## Folders

```
apps/copilot  apps/site  apps/admin   the three web apps
api/          events server and database migrations
content/      News & About content (from the old WordPress site) and old-address redirects
centers/      settings for each center (mpls.json)
deploy/       Cloudflare settings: env/*.json (local, test, prod), site/, admin/
tests/        unit/, api/, e2e/ and acceptance/ checklists
tools/        build, dev, test, release, seed and GitHub set-up scripts
docs/         process, specs (SOSMN-SRM.md), backlog, set-up guides
releases/     release notes per version; releases.json feeds "What's new"
reports/      latest test report, build log, deployments
```
