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
- SMS requires explicit opt-in, STOP handling, and SOS as the registered sender.
- Admins see only what they need: name, RSVP and check-in status; contact details only for sending reminders through the system.

## 9. Decisions needed (Part 2)
| # | Decision | Recommendation |
|---|---|---|
| D1 | Backend | Supabase (you create a free project; I configure everything) |
| D2 | Who are admins? | A list of admin emails (start with yours); later per center |
| D3 | Centers | Start with **Minneapolis Center** only |
| D4 | Text messages now or later? | Email first; SMS after SOS approval and 10DLC registration |
| D5 | Check-in methods | In person: QR + 4-digit code + host manual; online: Join link in window |
| D6 | RSVP without sign-in? | Require sign-in (simpler, enables points); allow name + email later if needed |
| D7 | Guests (+1) and waitlist? | Guests count yes; waitlist only when capacity is set |
| D8 | Store seeker/initiate on the server? | No (not needed for events) |
| D9 | Events source | Created in our admin UI (no automatic import from sos.org) |

## 10. Phasing
| Phase | Scope |
|---|---|
| **B1 (now)** | Personal schedule, Calendar tab, day agenda, kept/missed, Today "next sitting", in-app reminders, `.ics` export, "schedule kept" points |
| B2 | Supabase setup; event browsing; RSVP; add to calendar; sharing links |
| B3 | Check-in (QR / code / online window); hosted-event points |
| B4 | Admin: create/edit events, RSVP and check-in lists, manual check-in, CSV export |
| B5 | Email reminders and announcements; then SMS and push |
