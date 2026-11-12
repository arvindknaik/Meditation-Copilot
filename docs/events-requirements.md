# Meditation Copilot — Calendar & Events Requirements

> **Status:** Draft for review · **Owner:** Arvind Naik · **Last updated:** 10 Nov 2026
> **Prototype only. Not an official or approved Science of Spirituality (SOS) app.**

## 1. Goals
1. Help each person **keep a regular meditation schedule** (their own sitting times, possibly several a day).
2. Help people **find, join and attend SOS-hosted meditation events**, in person or online, and invite friends.
3. Give event **hosts/admins** simple tools to create events, see RSVPs and check-ins, and send reminders.
4. **Reward** showing up, with more points for hosted events and the most for in-person events.

## 2. People (roles)
| Role | Who | Can do |
|---|---|---|
| **Member** | Signed-in user: New Seeker or Initiated Member | Own schedule; browse hosted events; RSVP; check in; share; earn points |
| **Guest** | Not signed in (device-only data) | Own schedule; browse public events. To RSVP/check in, must sign in (or give name + email — *decision D6*) |
| **Friend** | Someone who receives a shared event link | Open the event page; join the app to RSVP |
| **Host / Admin** | Approved organizers (e.g. Minneapolis Center) | Create/edit/cancel events; see RSVP and check-in lists with names; check people in; send reminders; export attendance |

## 3. Event types

### 3.1 Personal schedule (self-created) — *Part 1, building now*
- **Sitting times:** a time, a duration, and the days of the week. There can be **several a day** (e.g. 5:00 am × 60 min daily; 9:00 pm × 30 min on weekdays). Optional title and reminder (at the time, or 5/10/15 min before).
- **Calendar view:** a month grid shaded by how much was practiced each day. Tapping a day shows its agenda: scheduled sittings with status (✓ kept / missed / upcoming / *Start now*) and other sittings logged that day.
- **"Kept" (self check-in):** a scheduled sitting counts as kept when a sitting **starts between 30 minutes before and 60 minutes after** its scheduled time. Each logged sitting can satisfy only one scheduled time.
- **Start from the schedule:** the Timer opens preset to that sitting's duration.
- **Reminders:**
  - **Reliable:** "Add to my phone's calendar" (a `.ics` file with weekly repeats and alarms) works on iPhone, Android, Google, Outlook and Apple calendars.
  - **In-app:** a reminder message (and a system notification if allowed) while the app is open.
  - **True push to a closed app:** needs the server (Part 2).
- **Sync:** schedules sync across devices with the user's Drive/OneDrive data.

### 3.2 SOS-hosted events — *Part 2, needs decisions*
**Event details:**
- title, description, **format** (in person · online · hybrid)
- venue name + address + map link (in person); join link, e.g. Zoom/YouTube (online)
- start/end date-time with time zone; optional repeat (e.g. weekly group meditation)
- host/center; capacity (optional); RSVP deadline (optional)
- visibility: public, or members only
- image (optional); status: scheduled · cancelled · completed

**Members can:**
- **Browse** upcoming events, either merged into the Calendar or as a list, filtered by in-person/online and near me/center.
- **RSVP:** Going / Maybe / Can't go, with number of guests (*D7*), change or cancel, and an optional waitlist when full.
- **Add to calendar** (.ics), and get **reminders** (e.g. 1 day and 1 hour before).
- **Share** with friends via the share sheet or WhatsApp, using a link that opens the event page.
- **Check in** on arrival:
  - **In person:** scan the event's **QR code** at the venue, enter a **4-digit event code** announced by the host, or be checked in by the host from the list.
  - **Online:** tapping **Join** during the event window (from 15 min before to the end) counts as check-in.
- **Earn points** for check-ins (§6).

**Hosts/admins can:**
- Create, edit, duplicate and cancel events (a cancellation notifies everyone who RSVP'd).
- See the **RSVP list** (name, status, guests) and the **check-in list** (name, time, method), with live counts.
- Check people in manually; show a **QR code / event code** screen for the door.
- Send **reminders and announcements** by email, and by text message where the person opted in (*D4*).
- **Export** attendance as CSV.
- Be limited to their own center's events (*D3*).

## 4. Notifications
| Channel | Use | Notes |
|---|---|---|
| Phone calendar (.ics) | Personal schedule and events | Works today; no server |
| In-app message | While the app is open | Works today |
| Email | Event reminders, changes, cancellations | Needs server + email service (e.g. Resend/Brevo, free tiers). Unsubscribe link required (CAN-SPAM) |
| Text message (SMS) | Event reminders (opt-in) | Needs server + Twilio (≈ $0.01/message), **US A2P 10DLC registration** (organization details, ≈ 1–3 weeks), explicit opt-in and "Reply STOP" (TCPA). Recommend after email |
| Push notification | Reminders even when the app is closed | Needs server; iPhone requires the app on the Home Screen (iOS 16.4+) |

## 5. Sharing
- Event link: `…/Meditation-Copilot/#event?e=<id>`, opened with the share sheet (fallback WhatsApp).
- Friends see the event page without signing in; RSVP requires sign-in (or name + email, *D6*).
- Optional "Invited by" tracking to reward inviting friends (future Community rewards).

## 6. Rewards (extends the rules list in `js/rewards.js`)
| Rule | Points | Part |
|---|---|---|
| Scheduled sitting kept (self check-in) | 10 each | 1 |
| Checked in: hosted **online** event | 25 each | 2 |
| Checked in: hosted **in-person** event | 50 each | 2 |
| RSVP'd and attended (bonus for following through) | +10 | 2 (proposed) |
| Invited a friend who checked in | 25 | 2 (proposed) |

Hosted check-ins are recorded by the server, so they can't be self-awarded.

## 7. Architecture
- **Part 1** stays as is: the static app plus the user's own Drive/OneDrive.
- **Part 2** needs a **shared backend**. Recommended: **Supabase** (free tier to start).
  - Postgres database with **row-level security**: members see only their own RSVPs; admins see their center's lists.
  - **Auth** with Google and Microsoft, so people keep the same sign-in buttons.
  - **Edge functions** for check-in validation (QR/code/time window), email/SMS sending, and **scheduled reminders** (cron).
  - **Realtime** updates for the admin check-in screen.
- **Admin UI:** a protected `#admin` area in the same app, visible only to admin accounts.
- Personal meditation data stays in the user's own drive. **Only event data** (RSVPs, check-ins, contact preferences) lives in the shared database.

### Data model (Part 2, draft)
- `centers(id, name, timezone, address)`
- `events(id, center_id, title, description, format, venue, address, online_url, starts_at, ends_at, tz, capacity, rsvp_deadline, visibility, status, checkin_code, created_by)`
- `profiles(user_id, display_name, email, phone?, sms_opt_in, email_opt_in, user_type)` (user type only if the person agrees, *D8*)
- `rsvps(event_id, user_id, status, guests, created_at, updated_at)`
- `checkins(event_id, user_id, method[qr|code|host|online], checked_in_at, by_admin?)`
- `admins(user_id, center_id, role)`
- `notifications(id, event_id, channel, audience, sent_at, count)`

## 8. Privacy and consent
- Part 2 stores **names and contact details centrally**. That requires an updated privacy notice, consent at RSVP, and data deletion on request. **SOS approval is recommended before collecting real attendee data.**
- SMS requires explicit opt-in, STOP handling, and SOS as the registered sender. The opt-in and its date are stored now (`users.sms_ok`, `sms_consent_at`).
- The contact form and `privacy.html#events` say details are used only for center event communication and never shared or sold. **Have SOS review this wording before real use.**
- Admins see only what they need: name, RSVP and check-in status; contact details only for sending reminders through the system.

## 9. Decisions (Part 2) — agreed
| # | Decision | Agreed |
|---|---|---|
| D1 | Backend | **Cloudflare Worker + D1** for the pilot (low cost, portable); Azure under the SOS account long term |
| D2 | Who are admins? | A list of admin emails (`ADMIN_EMAILS`), starting with Arvind's |
| D3 | Centers | **Minneapolis Center** only |
| D4 | Text messages now or later? | Email first; SMS later. Text consent is collected now so SMS can start without asking again |
| D5 | Check-in methods | In person: center QR poster, event code/QR, host check-in; online: Join & check in |
| D6 | RSVP without sign-in? | **Sign-in required** to RSVP and check in. Email sign-in for people without Google/Microsoft: later, if needed |
| D7 | Guests and waitlist | Each adult registers (signs in) before or at the event. **Waitlist on hold** |
| D8 | Store seeker/initiate on the server? | No (separate lookup of initiates exists) |
| D9 | Events source | Created in our own admin screen (SOS's existing event system is not used) |
| D10 | Repeating events | Weekly (most), every other week, monthly (same weekday, e.g. "2nd Sunday"); end date; skip dates when creating; edit or cancel "this event" or "this and following" |
| D11 | Cancelled events | **Stay on the calendar**, marked Cancelled (better communication than deleting) |
| D12 | RSVP scope | **Per event.** No "every week" RSVP, so each week's count stays meaningful |
| D13 | Printed QR | One permanent **center QR poster** (option a): checks in to whichever in-person event is open (30 min before start to 30 min after end). Add a code requirement only if misuse shows up |
| D14 | Contact details | Email **required** (from sign-in); phone **optional**; separate opt-in for text reminders; notice that details are used only for center event communication and never shared. Asked once, at the first RSVP or check-in; editable in Account |

## 10. Phasing
| Phase | Scope |
|---|---|
| **B1 (now)** | Personal schedule, Calendar tab, day agenda, kept/missed, Today "next sitting", in-app reminders, `.ics` export, "schedule kept" points |
| B2 | Supabase setup; event browsing; RSVP; add to calendar; sharing links |
| B3 | Check-in (QR / code / online window); hosted-event points |
| B4 | Admin: create/edit events, RSVP and check-in lists, manual check-in, CSV export |
| B4.1 (v0.11.0) | Repeating events, cancelled events visible, center QR poster, contact details with consent |
| B5 | Email reminders and announcements; then SMS and push |

## 11. Part 3 — Community features (requested 10 Nov 2026)

### 11.1 Member categories
| Category | Who | App experience | Event access |
|---|---|---|---|
| **Seeker** | New to meditation | 42-day challenge; no 10k roadmap (as today) | Public events |
| **Seeker Friend** | A seeker who has attended a few events (typically 4–8; the admin's judgement) | Same as Seeker | Public + Satsang events |
| **Initiate** | Initiated by one of the Masters | 10k roadmap; initiate point thresholds (as today) | All events |

- **Self-declared Seeker or Initiate**, on the phone, as today. Initiates give their initiation date and Master, which only a real initiate can; those details stay on the phone and are never sent to the server. The app sends the server only the word `seeker` or `initiate`.
- **Seeker Friend is set by an admin** from the new **People** screen (search by name or email), typically after a seeker has attended a few events. An admin can also set someone back to Seeker.
- New sign-ups are Seeker on the server until the app reports their choice (at the next connection).

### 11.2 Event access level (replaces "visibility")
| Level | Badge | Who sees it at all |
|---|---|---|
| **Public** | 🌍 Public | Everyone, including guests who aren't signed in |
| **Satsang** | 🪷 Satsang | Initiates and Seeker Friends |
| **Initiates only** | 🔒 Initiates | Initiates |

- **An event is shown only to people who can attend it.** Anyone else doesn't see it listed, can't open its page, and gets "Event not found" from a shared link. The badge is for those who can see it, so they know who the event is for.
- RSVP and check-in by code, QR or the center poster follow the same rule. **Host check-in does not** (the host is there and decides).
- Center poster: if the only open event is one the person can't attend, they see *"Please see the host at the welcome table."* with no further detail.
- Admins see every event.
- Existing events: `public` stays public; the old `members` level becomes Satsang.
- The access level can be changed later, for "this event" or "this and following".

### 11.3 Flyer image
- Admin can add a flyer when creating an event **or to any existing event** (edit → Flyer → choose image). Replace or remove at any time. For a series: "this event" or "this and following".
- Formats: JPG or PNG (what the phone camera and most flyers come as). The phone resizes before upload: full size up to 1600 px on the long side (≈ 300 KB) and a 320 px thumbnail. PDF flyers: save as an image first (phones and computers can do this with "Share → Save as image" or a screenshot).
- Storage: in the events database (one table `flyers`), served by the API with long caching. No extra Cloudflare product or payment method needed. Budget: 1,000 flyers ≈ 300 MB, well within the free 5 GB.
- Where it shows: thumbnail on the Calendar's event list and day agenda; full flyer at the top of the event page (tap to view full screen). Flyers follow the event's access level.

### 11.4 Featured video on the Today screen
- Admin sets a **YouTube link** plus a short title (and optional one-line caption) from the SOS events card → "Featured video". One video at a time; clear it to remove.
- Shown as a card on the Today screen for everyone (guests included), with the video's thumbnail. Tapping opens YouTube (app or new tab). No embedded player, so no YouTube cookies or tracking inside the app, and the page stays light.
- Only official Science of Spirituality / Sant Rajinder Singh Ji Maharaj channel videos should be featured (same rule as quotes).

### 11.5 Messages and likes on events
- Signed-in members who can open an event can **like** it (one per person, tap again to unlike) and post a **short message** (up to 280 characters, plain text). Messages show the name from the person's sign-in (editable in Account) and the time.
- Messages are shown newest first on the event page, with the like count and "Going" count. No replies, no editing: delete and post again.
- A member can delete their own messages. An admin can delete any message. No notifications for new messages in this phase.
- Rewards (in the spirit of "reward anything positive"): **+5 points for your first message on an event** (once per event). Likes earn nothing (too cheap to be meaningful).
- Not visible to guests who aren't signed in.

### 11.6 Blocking a member (low priority; built with the People screen)
- Admin → People → **Block** (with a reason kept for admins only) / **Unblock**.
- A blocked person can still use the app on their own phone, but on events they see *"Your account can't take part in center events. Please contact MinneapolisCenter@sos.org."* They can't RSVP, check in, like or post. Their existing RSVPs stay (hidden from counts), and their messages are hidden.

### 11.7 Decisions
| # | Decision | Agreed / proposed |
|---|---|---|
| D15 | Category source | Seeker / Initiate self-declared on the phone (only the word is sent to the server; initiation details stay on the phone). Seeker Friend set by an admin on the People screen. **Amends D8** |
| D16 | Seeker Friend app experience | Same as Seeker (challenge, thresholds); differs only in event access |
| D17 | Restricted events visible? | **No.** People see only events they can attend; shared links to others say "Event not found" |
| D18 | Flyer storage | In the database (no R2 / payment method); JPG/PNG only, resized on the phone |
| D19 | Video | One featured YouTube link at a time, opens in YouTube; official channels only |
| D20 | Messages | 280 chars, no replies/edits; own-delete and admin-delete; +5 points for first message per event |
| D21 | Blocking | Admin-only; blocked people lose events only |

### 11.8 Phasing
| Phase | Scope |
|---|---|
| C1–C4 (v0.12.0) | Built: categories, access levels, People screen with block/unblock, badges, flyers, featured video, likes and messages with the +5 reward |

## 12. Part 4 — Social: presence, buddies, challenges (requested 12 Nov 2026)

### 12.1 Group feeling (presence counts)
- While the app is open and the person is signed in, it sends a quiet heartbeat to the server every 60 seconds with one of two states: **active** or **meditating** (the Timer is running). Nothing else: no sitting details.
- The server keeps one row per person (`presence`: state, last seen) and counts people seen in the last 3 minutes. A person who closes the app drops out of the count within 3 minutes.
- Shown as counts only, never names: on **Today** ("🟢 12 on the app now · 🧘 3 meditating · 🌅 41 meditated today") and on the **Timer** while sitting ("3 others are meditating with you"). "Meditated today" counts people whose heartbeat showed *meditating* at any point today (Central time).
- Guests can see the counts but aren't counted (they have no identity on the server). Counts update every minute while the screen is open.
- Cost: ~1 small write per open app per minute, well within the free tier for hundreds of people.

### 12.2 Meditation Buddy
- From **Account → Buddies**, enter an email address to invite. Up to **10 buddies**.
- The invitee must have signed in to the app at least once with that email. If they haven't yet, the invite waits and appears when they first sign in (no email is sent; we have no email service yet).
- The invitee sees "Arvind invited you to be meditation buddies" on Today and in Account, with **Accept** / **Decline**. The inviter sees "Invited · waiting" until accepted; a declined invite simply stays "waiting" and expires after 30 days, so no one is embarrassed.
- Buddies see each other's **name**, whether they're **on the app / meditating right now**, and **last active** ("today", "3 days ago"). No minutes, streaks or sittings are shared.
- Either person can **remove** the buddy at any time; both lose visibility immediately. Blocked people can't invite or be invited.
- Later (not now): a "🙏 thinking of you" nudge, email notification of invites, optional sharing of weekly minutes.

### 12.3 Challenges (Roadmap tab)
Four types. At most **one active challenge per type**; different types may overlap. Once started, a challenge can't be changed; it can be **dropped** (0 points) or it may **fail** (see points). Challenges run on the phone's local dates and are stored in the person's own synced data (Drive/OneDrive), like sittings. The weekly-attendance type uses check-ins from the events server.

| Type | What counts | Length | Success | Fails when |
|---|---|---|---|---|
| **42-Day Challenge** (existing) | As today: phase 1 = 15 min/day, phase 2 builds to 30 | 42 days | Day 42 reached | As today |
| **Hours** | Minutes logged in the timeframe | 7–365 days, target hours chosen | Target reached (ends early with full points) | End date passes short of the target |
| **Amrit Vela** | **At least 15 minutes of a sitting between 4:00 and 7:00 am** (an earlier start is fine; only the part inside the window counts) | 7–365 days | Every day kept, within the allowance | Misses exceed the allowance: **1 missed day allowed per 10 days** (7 days → 0, 21 → 2, 42 → 4, 365 → 36) |
| **Weekly attendance** | **At least one SOS event check-in per calendar week** (Mon–Sun), in person or online | 2–52 weeks | Every week kept, within the allowance | Missed weeks exceed **1 per 10 weeks** (2–9 weeks → 0, 10–19 → 1 …) |

- The 42-Day Challenge becomes available to everyone (initiates opt in with "Start the 42-day challenge"); seekers keep getting it automatically.
- Start date: today or up to 30 days ahead. Not in the past.
- A challenge that fails ends at once; one that succeeds ends at once (Hours) or on its last day (others).

**Points**

| Type | Points on success | Example |
|---|---|---|
| Hours | **5 per target hour**, max 500 | 10 h in a month → 50; 60 h in 3 months → 300 |
| Amrit Vela | **5 per day** | 21 days → 105; 42 days → 210 |
| Weekly attendance | **15 per week** (on top of the check-in points themselves) | 12 weeks → 180 |
| 42-Day | As today: 50 at day 21, 100 at day 42 | |

- **Fail** → half of the prorated points, rounded down: `floor(points × done ÷ total ÷ 2)`, where *done* is hours logged, days kept or weeks kept. Example: 21-day Amrit Vela (105 points) failed after 15 kept days → floor(105 × 15/21 / 2) = **37**.
- **Drop out** → 0 points.
- Scale: for comparison, a day's target met is 5, an in-person check-in is 50 and the 42-Day Challenge is 150 in total.

**Display:** a **Challenges** card on Roadmap with each active challenge's progress bar, days/hours done, misses used of the allowance, and Drop; a **Start a challenge** sheet (type, length or dates, target hours); a history list with outcome and points. Rewards appear under *Goals* with the icons ⏳ 🌅 🗓.

### 12.4 Decisions
| # | Decision | Proposed |
|---|---|---|
| D22 | Presence | Heartbeat every 60 s, counted within 3 min; counts only; signed-in only; Today + Timer |
| D23 | Buddies | Up to 10; invite by sign-in email; pending shown as waiting, expires in 30 days; name + presence only; remove any time |
| D24 | Challenge storage | On the phone, synced with the person's own data; the server holds no challenge data |
| D25 | Amrit Vela rule | ≥ 15 min of a sitting inside 4:00–7:00 am local; 1 miss allowed per 10 days |
| D26 | Weekly attendance rule | ≥ 1 check-in per Mon–Sun week; 1 miss per 10 weeks; 2–52 weeks |
| D27 | Points | Hours 5/target hour (max 500); Amrit Vela 5/day; weekly 15/week; fail = floor(prorated ÷ 2); drop = 0 |
| D28 | 42-Day for everyone | Initiates can opt in; seekers automatic |

### 12.5 Phasing
| Phase | Scope |
|---|---|
| E1–E3 (v0.13.0) | Built: presence counts, buddies (max 10), Hours / Amrit Vela / Weekly challenges, 42-Day opt-in |
