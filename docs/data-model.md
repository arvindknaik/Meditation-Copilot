# Events database — data model and reporting

> Database: Cloudflare D1 (SQLite) named `meditation-copilot`, used only by the events server in `api/`.
> Full schema: `api/schema.sql`. Changes are applied with the numbered files in `api/migrations/`.
> Version: v0.14.0 (13 November 2026)

## What is and isn't in it

The database holds only what is needed to run SOS-hosted events. It does **not** hold anyone's sittings, reflections, challenge progress, seeker/initiate status or initiation details. Those stay in the person's own Google Drive or OneDrive (or on their device).

## Entities

```
centers 1 ──< series 1 ──< events 1 ──< rsvps     >── 1 users
   │                        │   │  └──< checkins  >── 1 users
   └──< settings            │   └─────< likes     >── 1 users
                            │   ┌─────< messages  >── 1 users
                            └── flyer_id ──> flyers
```

| Table | One row per | Key |
|---|---|---|
| `centers` | SOS center (only `mpls` for now) | `id` |
| `users` | Person who has signed in to events | `id` = `provider:subject`, e.g. `google:1057…` |
| `series` | Repeating event (weekly, every other week, monthly) | `id` (UUID) |
| `events` | Single occurrence of an event (each week of a series is its own row) | `id` (UUID) |
| `rsvps` | Person's answer for one event (going, maybe, no) | `event_id` + `user_id` |
| `checkins` | Person checked in to one event | `event_id` + `user_id` |
| `flyers` | Uploaded flyer image (full size and thumbnail) | `id` (UUID) |
| `likes` | Person liked an event | `event_id` + `user_id` |
| `messages` | Short message a person posted on an event (soft-deleted, never removed) | `id` (UUID) |
| `settings` | Per-center settings such as the featured video (JSON value) | `center_id` + `key` |
| `presence` | Who is on the app right now (state, last heartbeat, last day seen meditating). Only counts are shown | `user_id` |
| `buddies` | A buddy invitation and its status (pending, accepted, declined, removed) | `id` (UUID) |
| `feedback` | A suggestion or a 1–5 rating with optional comment; linked to the person if signed in | `id` (UUID) |

### `centers`
| Column | Meaning |
|---|---|
| `id` | Short code, `mpls` |
| `name` | "Minneapolis Center" |
| `timezone` | IANA zone, `America/Chicago` |
| `address` | Optional street address |

### `users`
| Column | Meaning |
|---|---|
| `id` | `google:<sub>` or `microsoft:<sub>`; never changes for a person |
| `provider` | `google` or `microsoft` |
| `email`, `name` | From the sign-in |
| `created_at` | First sign-in |
| `last_seen_at` | Last time the app connected to the server |
| `phone` | Optional, stored as `+16125551234` |
| `sms_ok` | 1 if they ticked "Text me reminders" |
| `sms_consent_at` | When they ticked it (cleared if withdrawn). Keep this: it's the proof of consent for texting |
| `contact_ack_at` | When they confirmed contact details and saw the privacy notice. RSVP and check-in require this |
| `category` | `seeker` (default), `friend` (Seeker Friend, set by an admin) or `initiate` (self-declared on the phone). Decides which events they can see |
| `category_at` | When the category last changed |
| `blocked_at`, `block_reason` | Set while blocked from events (admin only) |

### `series`
| Column | Meaning |
|---|---|
| `freq` | `weekly`, `biweekly` or `monthly` |
| `until_at` | Start time of the last event created for the series |
| `created_by` | Admin's user id |

### `events`
| Column | Meaning |
|---|---|
| `title`, `description` | What people see |
| `format` | `in_person`, `online` or `hybrid` |
| `venue`, `address` | For in-person and hybrid |
| `online_url` | Meeting link; shown only to signed-in users |
| `starts_at`, `ends_at` | Epoch milliseconds, UTC |
| `timezone` | Zone to display times in |
| `access` | `public` (everyone), `satsang` (initiates and seeker friends) or `initiates`. People only see events they can attend |
| `visibility` | Old column, unused since v0.12 |
| `flyer_id` | Flyer image, if any |
| `status` | `scheduled` or `cancelled`. Cancelled events are kept, never deleted |
| `checkin_code` | 4-digit code for the door; also inside the event QR. Admins only |
| `series_id` | Set when the event is part of a repeating series |
| `created_by`, `created_at`, `updated_at` | Audit |

### `rsvps`
| Column | Meaning |
|---|---|
| `status` | `going`, `maybe` or `no` |
| `updated_at` | Last change. A check-in sets the RSVP to `going` |

### `checkins`
| Column | Meaning |
|---|---|
| `method` | `code` (typed the 4-digit code), `qr` (event QR or the center poster), `host` (admin checked them in), `online` (Join & check in) |
| `checked_in_at` | When |
| `by_user` | Admin's user id, for `host` check-ins |

## Times

All times are **epoch milliseconds in UTC** (e.g. `1762800000000`). To read them in Central time in SQLite:

```sql
datetime(starts_at / 1000, 'unixepoch', '-6 hours')      -- CST (winter)
datetime(starts_at / 1000, 'unixepoch', '-5 hours')      -- CDT (summer)
```

Excel: `= starts_at / 86400000 + 25569` formatted as a date gives UTC; subtract `6/24` (or `5/24`) for Central.

## Running queries

There are three ways. All need the Cloudflare login you already have.

### 1. In the browser (easiest)
Cloudflare dashboard → **Storage & Databases → D1 SQL Database → meditation-copilot → Console**. Paste a query, run it, and download the result as CSV.

### 2. From the command line
In the `api` folder:
```
npx wrangler d1 execute meditation-copilot --remote --command "SELECT COUNT(*) AS people FROM users"
```
For a longer query, save it to a file and run:
```
npx wrangler d1 execute meditation-copilot --remote --file=report.sql
```
Add `--json` to get JSON instead of a table.

### 3. A full copy for Excel or Power BI
```
npx wrangler d1 export meditation-copilot --remote --output=events-backup.sql
```
This is also the backup. To work with it locally, install the free **DB Browser for SQLite** (sqlitebrowser.org), create a new database, and import the `.sql` file (File → Import → Database from SQL file). You can then browse the tables, run queries, and export any result to CSV for Excel.

> **Privacy:** every export contains names, emails and phone numbers. Keep exports in the SOS OneDrive, not on a personal device, and delete them when done. Reports that are shared should use counts, not names, unless the reader needs the names (e.g. a host's attendee list).

## Ready-made report queries

**Attendance per event (last 90 days)**
```sql
SELECT datetime(e.starts_at/1000,'unixepoch','-6 hours') AS starts_ct, e.title, e.format, e.status,
       SUM(CASE WHEN r.status='going' THEN 1 ELSE 0 END) AS going,
       SUM(CASE WHEN r.status='maybe' THEN 1 ELSE 0 END) AS maybe,
       (SELECT COUNT(*) FROM checkins c WHERE c.event_id=e.id) AS checked_in
FROM events e LEFT JOIN rsvps r ON r.event_id=e.id
WHERE e.starts_at > (strftime('%s','now')-90*86400)*1000
GROUP BY e.id ORDER BY e.starts_at DESC;
```

**Who attended a given event**
```sql
SELECT u.name, u.email, u.phone, c.method, datetime(c.checked_in_at/1000,'unixepoch','-6 hours') AS checked_in_ct
FROM checkins c JOIN users u ON u.id=c.user_id
WHERE c.event_id='PASTE-EVENT-ID' ORDER BY c.checked_in_at;
```
(The event id is in the event page's address: `#event?e=<id>`.)

**Regulars: people by number of check-ins**
```sql
SELECT u.name, u.email, COUNT(*) AS visits,
       datetime(MIN(c.checked_in_at)/1000,'unixepoch','-6 hours') AS first_visit,
       datetime(MAX(c.checked_in_at)/1000,'unixepoch','-6 hours') AS last_visit
FROM checkins c JOIN users u ON u.id=c.user_id
GROUP BY u.id ORDER BY visits DESC;
```

**New people each month (first check-in)**
```sql
SELECT strftime('%Y-%m', first_at/1000,'unixepoch','-6 hours') AS month, COUNT(*) AS new_people
FROM (SELECT user_id, MIN(checked_in_at) AS first_at FROM checkins GROUP BY user_id)
GROUP BY month ORDER BY month;
```

**RSVP'd but didn't come (for follow-up)**
```sql
SELECT e.title, datetime(e.starts_at/1000,'unixepoch','-6 hours') AS starts_ct, u.name, u.email
FROM rsvps r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id
WHERE r.status='going' AND e.ends_at < strftime('%s','now')*1000 AND e.status='scheduled'
  AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.event_id=e.id AND c.user_id=u.id)
ORDER BY e.starts_at DESC;
```

**Contact list for email or text (only people who agreed)**
```sql
SELECT name, email FROM users WHERE contact_ack_at IS NOT NULL ORDER BY name;          -- email
SELECT name, phone FROM users WHERE sms_ok=1 AND phone IS NOT NULL ORDER BY name;      -- text
```

**Most liked and discussed events**
```sql
SELECT e.title, datetime(e.starts_at/1000,'unixepoch','-6 hours') AS starts_ct,
       (SELECT COUNT(*) FROM likes l WHERE l.event_id=e.id) AS likes,
       (SELECT COUNT(*) FROM messages m WHERE m.event_id=e.id AND m.deleted_at IS NULL) AS messages
FROM events e ORDER BY likes DESC, messages DESC LIMIT 20;
```

**People by category**
```sql
SELECT category, COUNT(*) AS people FROM users WHERE blocked_at IS NULL GROUP BY category;
```

**People on the app right now**
```sql
SELECT COUNT(*) AS on_now, SUM(state='meditating') AS meditating FROM presence WHERE seen_at > (strftime('%s','now')-180)*1000;
```

**Feedback: average rating and latest suggestions**
```sql
SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS ratings FROM feedback WHERE kind='rating';
SELECT datetime(created_at/1000,'unixepoch','-6 hours') AS at_ct, kind, rating, body FROM feedback ORDER BY created_at DESC LIMIT 50;
```

**How people check in**
```sql
SELECT method, COUNT(*) AS n FROM checkins GROUP BY method ORDER BY n DESC;
```

**Upcoming events in a series**
```sql
SELECT datetime(starts_at/1000,'unixepoch','-6 hours') AS starts_ct, title, status
FROM events WHERE series_id='PASTE-SERIES-ID' ORDER BY starts_at;
```

## Later: Power BI or a reporting page

- A scheduled export (`wrangler d1 export`) into the SOS OneDrive would let Power BI or Excel refresh from it.
- Alternatively, the events server can grow an admin-only `/api/admin/reports` endpoint that returns these counts, and the app can show a simple **Reports** card for admins. Ask for this when you want it.

## Moving to Azure

The schema is standard SQL. On Azure SQL, change `INTEGER` time columns to `BIGINT`, `TEXT` to `NVARCHAR`, and `strftime`/`datetime` in the queries above to `DATEADD`/`FORMAT`. Everything else carries over.
