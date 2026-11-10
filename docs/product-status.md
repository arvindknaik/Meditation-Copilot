# Meditation Copilot — Product Status

> **As of:** 9 Nov 2026 · **Release:** Prototype (v5) · **Live:** https://arvindknaik.github.io/Meditation-Copilot/
> **Prototype only. Not an official or approved Science of Spirituality app.**
> This document is updated only on request.

## Lifecycle stages
`💡 Idea` → `📋 Planned` → `🎨 Design` → `🛠 In development` → `🧪 Testing` → `🚀 Released (prototype)` → `✅ Approved / GA`

## Summary
| Area | Stage | Notes |
|---|---|---|
| Roadmap | 🚀 Released | Uses logged data; linear milestone track |
| Today | 🚀 Released | Quote content pending |
| Timer | 🚀 Released | |
| Insights + CSV | 🚀 Released | |
| Learn | 🚀 Released | Article text pending SOS review |
| PWA (install, offline) | 🚀 Released | Caching fix (v5) ready to push |
| Calendar (Phase B) | 📋 Planned | |
| Profile / Login (Phase C) | 💡 Idea → 📋 Planned | Needs backend decision |
| Buddy AI (Phase D) | 💡 Idea | Needs cost and privacy decision |
| SOS approval | ⏳ Not started | Required before wider sharing |

## Feature detail

### Released (prototype)
| Feature | Stage | Notes |
|---|---|---|
| 5-question Roadmap planner | 🚀 | DOB, journey start, minutes, quality, goal age (≤ 90) |
| Roadmap results and status | 🚀 | Ahead/behind, projected age, required average |
| Roadmap using logged sittings | 🚀 | Real hours + estimate before logging; 30-day pace |
| Linear milestone track | 🚀 | Evenly spaced stops 100 → 10k finish line |
| What-if slider | 🚀 | +0–120 min/day → projected completion |
| WhatsApp sharing | 🚀 | Share sheet with WhatsApp fallback; "Inspire a Friend" |
| Today screen | 🚀 | Daily ring, target, streak, week stats, journey card |
| Thought for today | 🚀 / ⏳ content | Shown first on Today; **awaiting approved quotes** for `js/quotes.js` |
| Timer | 🚀 | 10 s settle (skippable), start/end bells, preview, countdown/open, pause, overtime, screen-awake, resume after reload |
| Save sitting with Reflection & Experiences | 🚀 | Quality rating feeds the Quality Index |
| Insights: totals and patterns | 🚀 | Today/week/month/all; streaks, consistency, best time |
| Insights chart | 🚀 | 14 days / 12 weeks / all time, tap tooltips |
| Session log | 🚀 | Edit, delete, manual add |
| CSV export/import | 🚀 | Strict header and row validation; overlaps skipped and summarized |
| Learn tab | 🚀 / ⏳ content | Search, paginated results, 6 featured topics, sos.org links; **draft articles pending SOS review** |
| Help contact and disclaimer | 🚀 | Every screen; "Prototype" badge |
| Active-tab highlight | 🚀 | |
| Light/dark mode | 🚀 | |
| Install to home screen and offline | 🚀 | Caching fix (`?v=` versioning) **ready to push** |

### Planned
| Feature | Stage | Notes |
|---|---|---|
| Daily schedule (sittings by weekday) | 📋 Phase B | |
| Month view (practice heat map) | 📋 Phase B | |
| In-app reminders + export to phone calendar | 📋 Phase B | Reliable background notifications need Phase C push |
| Optional login and cloud sync | 📋 Phase C | Supabase or Firebase, to be decided |
| Account preferences, data export/delete | 📋 Phase C | |
| Push reminders | 📋 Phase C | Needs backend |
| Buddy AI companion | 💡 Phase D | Weekly reflections, encouragement, planning; needs server key, cost cap, privacy consent |

### Ideas backlog
| Idea | Stage |
|---|---|
| Multiple languages (e.g. Hindi, Spanish) | 💡 |
| Accessibility audit (screen reader, contrast) | 💡 |
| Opt-in, privacy-friendly usage metrics | 💡 |
| Content-Security-Policy and privacy notice | 💡 (recommended) |
| Automated tests in repo | 💡 (recommended) |

## Pending decisions and dependencies
| Item | Owner | Status |
|---|---|---|
| SOS review and approval of the app and its branding | Arvind / SOS | ⏳ Not started |
| Approved quotes for "Thought for today" | SOS Communications | ⏳ Needed |
| Review of Learn article drafts (`js/knowledge.js`) | SOS Communications | ⏳ Needed |
| Business model and funding for Phases C/D | Arvind | ❓ Open |
| Backend choice (Supabase vs Firebase) | Tech | ❓ Open |
| Target audience (personal / center / wider) | Arvind | ❓ Open |

## Recent changes
| Date | Change |
|---|---|
| 7 Nov 2026 | v1: single-file Roadmap planner, PWA, WhatsApp share, published to GitHub Pages |
| 8 Nov 2026 | Phase A: Today, Timer, Insights, Roadmap on logged data, milestones, what-if |
| 9 Nov 2026 | Reflection & Experiences; 10 s settle + start/end bells + preview; All-time chart; quote file; tab highlight; CSV export/import with validation; Learn tab; disclaimer + contact; linear track; caching fix; `push.bat` |
