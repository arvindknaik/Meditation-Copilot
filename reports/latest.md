# Test report — v0.23-b0 — ❌ FAILED

Nov 28, 2026, 12:51 AM · commit d3ddb71 · suites: unit, api, e2e

| Suite | Passed | Failed | Time |
|---|---|---|---|
| unit | 21 | 1 | 4 s |
| api | 15 | 0 | 13 s |
| e2e | 14 | 1 | 100 s |

| Feature | Passed | Failed |
|---|---|---|
| admin | 2 | 0 |
| calendar | 1 | 0 |
| challenges | 13 | 0 |
| copilot | 1 | 0 |
| events | 2 | 0 |
| library | 11 | 1 |
| release | 5 | 1 |
| site | 5 | 0 |
| srm | 7 | 0 |
| start | 1 | 0 |
| visitors | 2 | 0 |

## Failures
- **[release] local build: pages, settings and version** (unit)

  ```
  news/index.html exists
  ```
- **[library] books: choose a book, tick chapters, finish it; mark an article as read** (e2e)

  ```
  page.click: Timeout 30000ms exceeded.&#10;Call log:&#10;[2m  - waiting for locator('#artRead')[22m&#10;[2m    - locator resolved to <button id="artRead" type="button" class="btn btn-primary btn-block">Mark as read</button>[22m&#10;[2m  - attempting click action[22m&#10;[2m    - waiting for element to be visible, enabled and stable[22m&#10;[2m    - element is visible, enabled and stable[22m&#10;[2m    - scrolling into view if needed[22m&#10;[2m    - done scrolling[22m&#10;[2m    - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m  - retrying click action[22m&#10;[2m    - waiting for element to be visible, enabled and stable[22m&#10;[2m    - element is visible, enabled and stable[22m&#10;[2m    - scrolling into view if needed[22m&#10;[2m    - done scrolling[22m&#10;[2m    - <a class="tab" href="#calendar" data-tab="calendar">…</a> from <nav class="tabbar" aria-label="Main">…</nav> subtree intercepts pointer events[22m&#10;[2m  - retrying click action[22m&#10;[2m    - waiting 20ms[22m&#10;[2m    2 × waiting for element to be visible, enabled and stable[22m&#10;[2m      - element is visible, enabled and stable[22m&#10;[2m      - scrolling into view if needed[22m&#10;[2m      - done scrolling[22m&#10;[2m      - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m    - retrying click action[22m&#10;[2m      - waiting 100ms[22m&#10;[2m    14 × waiting for element to be visible, enabled and stable[22m&#10;[2m       - element is visible, enabled and stable[22m&#10;[2m       - scrolling into view if needed[22m&#10;[2m       - done scrolling[22m&#10;[2m       - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m     - retrying click action[22m&#10;[2m       - waiting 500ms[22m&#10;[2m       - waiting for element to be visible, enabled and stable[22m&#10;[2m       - element is visible, enabled and stable[22m&#10;[2m       - scrolling into view if needed[22m&#10;[2m       - done scrolling[22m&#10;[2m       - <a class="tab" href="#calendar" data-tab="calendar">…</a> from <nav class="tabbar" aria-label="Main">…</nav> subtree intercepts pointer events[22m&#10;[2m     - retrying click action[22m&#10;[2m       - waiting 500ms[22m&#10;[2m       - waiting for element to be visible, enabled and stable[22m&#10;[2m       - element is visible, enabled and stable[22m&#10;[2m       - scrolling into view if needed[22m&#10;[2m       - done scrolling[22m&#10;[2m       - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m     - retrying click action[22m&#10;[2m       - waiting 500ms[22m&#10;[2m       - waiting for element to be visible, enabled and stable[22m&#10;[2m       - element is visible, enabled and stable[22m&#10;[2m       - scrolling into view if needed[22m&#10;[2m       - done scrolling[22m&#10;[2m       - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m     - retrying click action[22m&#10;[2m       - waiting 500ms[22m&#10;[2m    - waiting for element to be visible, enabled and stable[22m&#10;[2m    - element is visible, enabled and stable[22m&#10;[2m    - scrolling into view if needed[22m&#10;[2m    - done scrolling[22m&#10;[2m    - <div id="artEnd" class="art-end">…</div> intercepts pointer events[22m&#10;[2m  - retrying click action[22m&#10;[2m    - waiting 500ms[22m
  ```

<details><summary>All tests</summary>

- ❌ [release] local build: pages, settings and version (unit)
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
- ✅ [visitors] v0.23: several featured events, favourites, one note per check-in, visitor log and suggestions (api)
- ✅ [visitors] v0.23: Initiate is one way; an admin confirms or revokes it (api)
- ✅ [calendar] v0.24: the next and previous event around a window (for "Show more") (api)
- ✅ [site] home page shows upcoming events on a phone (e2e)
- ✅ [site] the header stays in the same place on every page (e2e)
- ✅ [site] event page says FREE and explains children and guidelines (e2e)
- ✅ [start] a new user lands on Today: Getting started, the tour, a sitting time and a first challenge (e2e)
- ✅ [srm] admin: local test sign-in, follow-ups and journey (e2e)
- ✅ [library] Daily Quote: read the quote of the day and it counts toward the challenge (e2e)
- ❌ [library] books: choose a book, tick chapters, finish it; mark an article as read (e2e)
- ✅ [library] Learn hub: top 5 of each type, search with quotes, Saved, and a quiz (e2e)
- ✅ [library] admin: Library tab lists books and opens the form (e2e)
- ✅ [release] What’s new pages open on the site and the admin site (e2e)
- ✅ [site] calendar: Upcoming (yesterday + 30 days), Recent with Show earlier, Month; home upcoming and recent (e2e)
- ✅ [copilot] an initiate begins the 10,000-hour journey (target year, recommended daily time) (e2e)
- ✅ [admin] visitor log, suggestions and settings tabs (e2e)
- ✅ [site] after checking in: a private note for the center, and ☆ favourites (e2e)
- ✅ [challenges] "Create your own" uses the same kind of sheet (Amrit Vela) (e2e)

</details>

Screenshots: reports/artifacts/ (20 files, kept on this computer).
