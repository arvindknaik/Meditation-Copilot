# Test report — v0.19-b0 — ✅ passed

Nov 25, 2026, 9:20 PM · commit 618f3f3 · suites: unit, api, e2e

| Suite | Passed | Failed | Time |
|---|---|---|---|
| unit | 15 | 0 | 1 s |
| api | 8 | 0 | 10 s |
| e2e | 4 | 0 | 24 s |

| Feature | Passed | Failed |
|---|---|---|
| admin | 1 | 0 |
| challenges | 12 | 0 |
| events | 2 | 0 |
| release | 6 | 0 |
| site | 1 | 0 |
| srm | 5 | 0 |



<details><summary>All tests</summary>

- ✅ [release] local build: pages, settings and version (unit)
- ✅ [release] test build: pages, settings and version (unit)
- ✅ [release] prod build: pages, settings and version (unit)
- ✅ [challenges] Foundation: day 1 target is the chosen minutes (unit)
- ✅ [challenges] Foundation completes after 21 days with no more than 2 misses (unit)
- ✅ [challenges] a third miss ends the 21-day challenge (unit)
- ✅ [challenges] Advance grows from the base to 30 minutes by day 21 (unit)
- ✅ [challenges] the original 42-day challenge keeps its rules (unit)
- ✅ [challenges] starter program has Foundation and Attendance at sign-up, Advance after Foundation (unit)
- ✅ [release] no passwords, keys or secrets in tracked or new files (unit)
- ✅ [srm] journey levels follow check-ins by event type (unit)
- ✅ [challenges] minute choices are cleaned and sorted (unit)
- ✅ [challenges] bad values are refused (unit)
- ✅ [challenges] output shape used by Copilot (unit)
- ✅ [events] event type and audience are validated (unit)
- ✅ [release] health check answers with a version (api)
- ✅ [challenges] starter program is listed in priority order (api)
- ✅ [challenges] admins can change a challenge; others are refused (api)
- ✅ [srm] journey levels and counts (api)
- ✅ [srm] follow-ups list the right people (api)
- ✅ [admin] hosts cannot see journeys, notes or follow-ups (api)
- ✅ [srm] notes, mentor and milestones on a person (api)
- ✅ [events] new events keep their type and audience (api)
- ✅ [site] home page shows upcoming events on a phone (e2e)
- ✅ [challenges] a new Copilot user must choose a first challenge (e2e)
- ✅ [srm] admin: local test sign-in, follow-ups and journey (e2e)
- ✅ [release] What’s new pages open on the site and the admin site (e2e)

</details>

Screenshots: reports/artifacts/ (4 files, kept on this computer).
