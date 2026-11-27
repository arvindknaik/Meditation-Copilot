# Test report — v0.22-b0 — ✅ passed

Nov 27, 2026, 6:32 PM · commit c22b8d6 · suites: unit, api, e2e

| Suite | Passed | Failed | Time |
|---|---|---|---|
| unit | 22 | 0 | 2 s |
| api | 12 | 0 | 11 s |
| e2e | 10 | 0 | 53 s |

| Feature | Passed | Failed |
|---|---|---|
| admin | 1 | 0 |
| challenges | 13 | 0 |
| events | 2 | 0 |
| library | 12 | 0 |
| release | 6 | 0 |
| site | 3 | 0 |
| srm | 7 | 0 |



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
- ✅ [library] a thought read later still counts for its own day (catch-up), not for days outside the challenge (unit)
- ✅ [library] weekly pace only counts weeks that are over; chapters count for the chosen book only (unit)
- ✅ [library] each item is counted once and earns its points (unit)
- ✅ [library] book links, ISBNs and titles are recognised (unit)
- ✅ [library] look-up results are turned into book details (unit)
- ✅ [library] items are checked before they are saved or approved (unit)
- ✅ [release] no passwords, keys or secrets in tracked or new files (unit)
- ✅ [srm] stages: Potential, New, Seeker, Satsangi, Initiate (unit)
- ✅ [srm] status: Active, Drifted, Dropped, Passive, Declined (unit)
- ✅ [challenges] minute choices are cleaned and sorted (unit)
- ✅ [challenges] bad values are refused (unit)
- ✅ [challenges] output shape used by Copilot (unit)
- ✅ [events] event type, audience and children’s program are validated (unit)
- ✅ [release] health check answers with a version (api)
- ✅ [challenges] starter program is listed in priority order (api)
- ✅ [challenges] admins can change a challenge; others are refused (api)
- ✅ [srm] stages and status for each person (api)
- ✅ [srm] follow-ups list the right people (api)
- ✅ [admin] hosts cannot see journeys, notes or follow-ups (api)
- ✅ [srm] notes, mentor, stage, Passive and Sevadar on a person (api)
- ✅ [srm] profile: edited name, ZIP, no messages; challenges shared from Copilot (api)
- ✅ [events] new events keep their type, audience and children’s program (api)
- ✅ [library] only approved items reach Copilot; admins add, approve and remove (api)
- ✅ [challenges] education challenges need something to read or watch (api)
- ✅ [library] knowledge: Learn articles moved in, quizzes arrive as drafts, anonymous counts (api)
- ✅ [site] home page shows upcoming events on a phone (e2e)
- ✅ [site] the header stays in the same place on every page (e2e)
- ✅ [site] event page says FREE and explains children and guidelines (e2e)
- ✅ [challenges] a new Copilot user must choose a first challenge (e2e)
- ✅ [srm] admin: local test sign-in, follow-ups and journey (e2e)
- ✅ [library] Daily Thought: read today’s thought and it counts toward the challenge (e2e)
- ✅ [library] books: choose a book, tick chapters, finish it; mark an article as read (e2e)
- ✅ [library] Learn hub: top 5 of each type, search with quotes, Saved, and a quiz (e2e)
- ✅ [library] admin: Library tab lists books and opens the form (e2e)
- ✅ [release] What’s new pages open on the site and the admin site (e2e)

</details>

Screenshots: reports/artifacts/ (17 files, kept on this computer).
