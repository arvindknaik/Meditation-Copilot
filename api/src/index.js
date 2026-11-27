/* Meditation Copilot — events API (Cloudflare Worker + D1)
 *
 * Portability: plain JavaScript + standard SQL behind simple JSON endpoints. To move to Azure
 * Functions later, keep `handle(request, env)` and swap the D1 calls for an Azure SQL client.
 *
 * Environment (wrangler.toml [vars] and secrets):
 *   DB                  D1 binding
 *   ALLOWED_ORIGINS     comma-separated web origins allowed to call the API
 *   GOOGLE_CLIENT_ID    Google OAuth client id (token audience check)
 *   MS_CLIENT_ID        Microsoft app (client) id (ID token audience check)
 *   SESSION_SECRET      secret  — signs our own session tokens (wrangler secret put SESSION_SECRET)
 *   ADMIN_EMAILS        secret  — comma-separated OWNER emails (wrangler secret put ADMIN_EMAILS).
 *                       Owners add other admins and hosts from the app (Admin → Team; table `staff`).
 *
 * Sign-in: the app sends the Google access token or Microsoft ID token it already has; we verify it
 * with Google / Microsoft, then issue our own signed session token (30 days). No passwords stored.
 */

const SESSION_DAYS = 30;
const STAFF_SESSION_HOURS = 12;   // admins and hosts sign in again after 12 hours
const MS_ISSUER = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'; // personal accounts
const MIN = 60000;

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e && e.stack || e);
      return json(request, env, { error: status === 500 ? 'Server error' : e.message }, status);
    }
  },
  // Cron trigger — email reminders arrive in the next phase (B5)
  async scheduled(event, env, ctx) {}
};

/* ---------------- helpers ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m);

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(request, env) } });
}
async function body(request) {
  try { return await request.json(); } catch { throw bad('Invalid JSON body'); }
}
const now = () => Date.now();
const str = (v, max) => (v == null ? null : String(v).trim().slice(0, max)) || null;

function b64url(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const enc = new TextEncoder();

/* ---- our session tokens (HS256 JWT) ---- */
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(env, payload) {
  if (!env.SESSION_SECRET) throw new HttpError(500, 'SESSION_SECRET not set');
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const pay = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(head + '.' + pay));
  return head + '.' + pay + '.' + b64url(sig);
}
async function readSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer (.+)$/.exec(auth);
  if (!m || !env.SESSION_SECRET) return null;
  const [h, p, s] = m[1].split('.');
  if (!h || !p || !s) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), b64urlDecode(s), enc.encode(h + '.' + p));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  if (!claims.exp || claims.exp < now()) return null;
  return claims;
}
/* ---- roles: owner (ADMIN_EMAILS secret) > admin > host (staff table) ---- */
async function roleOf(env, email) {
  if (!email) return null;
  const e = email.toLowerCase();
  if ((env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(e)) return 'owner';
  try {
    const r = await env.DB.prepare('SELECT role FROM staff WHERE email = ?1').bind(e).first();
    return r ? r.role : null;
  } catch { return null; }   // before migration 0006
}
const ADMIN_ROLES = ['owner', 'admin'], STAFF_ROLES = ['owner', 'admin', 'host'];
async function isAdmin(env, email) { return ADMIN_ROLES.includes(await roleOf(env, email)); }
// Record an admin action (never blocks the action itself)
async function logAdmin(env, s, action, target, detail) {
  try {
    await env.DB.prepare('INSERT INTO admin_log (at, by_user, by_email, action, target, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(now(), s && s.uid, s && s.email, action, target == null ? null : String(target).slice(0, 200), detail == null ? null : String(detail).slice(0, 500)).run();
  } catch (e) { console.error('admin_log', e && e.message); }
}
async function requireUser(request, env) {
  const s = await readSession(request, env);
  if (!s) throw new HttpError(401, 'Please sign in');
  return s;
}
async function requireRole(request, env, roles, msg) {
  const s = await requireUser(request, env);
  s.role = await roleOf(env, s.email);
  if (!roles.includes(s.role)) throw new HttpError(403, msg);
  return s;
}
const requireAdmin = (request, env) => requireRole(request, env, ADMIN_ROLES, 'Admins only');
const requireStaff = (request, env) => requireRole(request, env, STAFF_ROLES, 'Admins and hosts only');
const requireOwner = (request, env) => requireRole(request, env, ['owner'], 'Only the owner can change the team');

/* ---- verify identity with Google / Microsoft ---- */
async function verifyGoogle(env, accessToken) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
  if (!r.ok) throw new HttpError(401, 'Google sign-in could not be verified');
  const t = await r.json();
  if (t.aud !== env.GOOGLE_CLIENT_ID && t.azp !== env.GOOGLE_CLIENT_ID) throw new HttpError(401, 'Token was not issued to this app');
  if (!t.sub || !t.email) throw new HttpError(401, 'Google account email is required');
  let name = '';
  try {
    const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (u.ok) name = (await u.json()).name || '';
  } catch {}
  return { id: 'google:' + t.sub, provider: 'google', email: t.email.toLowerCase(), name: name || t.email.split('@')[0] };
}
let msKeys = null, msKeysAt = 0;
async function verifyMicrosoft(env, idToken) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid Microsoft token');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (!msKeys || now() - msKeysAt > 6 * 3600000) {
    const r = await fetch('https://login.microsoftonline.com/consumers/discovery/v2.0/keys');
    msKeys = (await r.json()).keys || []; msKeysAt = now();
  }
  const jwk = msKeys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new HttpError(401, 'Unknown Microsoft signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'Microsoft token signature is invalid');
  if (claims.aud !== env.MS_CLIENT_ID) throw new HttpError(401, 'Token was not issued to this app');
  if (claims.iss !== MS_ISSUER) throw new HttpError(401, 'Only personal Microsoft accounts are supported');
  if (!claims.exp || claims.exp * 1000 < now() - 5 * MIN) throw new HttpError(401, 'Microsoft sign-in has expired');
  const email = (claims.email || claims.preferred_username || '').toLowerCase();
  if (!email) throw new HttpError(401, 'Microsoft account email is required');
  return { id: 'microsoft:' + (claims.oid || claims.sub), provider: 'microsoft', email, name: claims.name || email.split('@')[0] };
}

/* ---------------- access levels and categories ---------------- */
const ACCESS_RANK = { public: 0, satsang: 1, initiates: 2 };
const CATEGORY_RANK = { seeker: 0, friend: 1, initiate: 2 };
const ACCESS_LEVELS = Object.keys(ACCESS_RANK), CATEGORIES = Object.keys(CATEGORY_RANK);
// Which access levels a person may see / attend. Admins see everything; guests only public events.
function levelsFor(u, admin) {
  if (admin) return ACCESS_LEVELS;
  const r = u ? CATEGORY_RANK[u.category] || 0 : 0;
  return ACCESS_LEVELS.filter((a) => ACCESS_RANK[a] <= r);
}
const sqlIn = (list) => '(' + list.map((x) => "'" + x + "'").join(',') + ')';
async function loadUser(db, uid) { return uid ? db.prepare('SELECT * FROM users WHERE id = ?1').bind(uid).first() : null; }
const BLOCKED_MSG = 'Your account can\u2019t take part in center events. Please contact MinneapolisCenter@sos.org.';
// A signed-in member who may take part in events (not blocked). Returns the user row.
async function requireMember(request, env, db) {
  const s = await requireUser(request, env);
  const u = await loadUser(db, s.uid);
  if (!u) throw new HttpError(401, 'Please sign in again');
  if (u.blocked_at) throw new HttpError(403, BLOCKED_MSG);
  return { s, u, admin: await isAdmin(env, s.email) };
}
function canAttend(e, u, admin) { return levelsFor(u, admin).includes(e.access || 'public'); }
async function meOf(s, u, env) {
  const role = await roleOf(env, s.email);
  return { id: s.uid, email: s.email, name: (u && u.name) || s.name, role: role || null, isAdmin: ADMIN_ROLES.includes(role), isStaff: STAFF_ROLES.includes(role),
    category: (u && u.category) || 'seeker', blocked: !!(u && u.blocked_at) };
}
const esc = (v) => String(v == null ? '' : v);
// Plain-text message: collapse whitespace, strip control characters, cap length
function cleanMessage(v) {
  const t = esc(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!t) throw bad('Write a short message first.');
  if (t.length > 280) throw bad('Messages can be up to 280 characters.');
  return t;
}
// YouTube link → video id (watch, youtu.be, shorts, embed, live)
function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(esc(url));
  return m ? m[1] : null;
}

/* ---------------- presence and buddies ---------------- */
const PRESENCE_WINDOW = 3 * 60 * 1000;      // seen within 3 minutes = on the app now
const MAX_BUDDIES = 10, INVITE_DAYS = 30;
function centerDay(t) {   // YYYY-MM-DD in the center's time zone
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
// Midnight today in the center's time zone, as epoch ms
function centerDayStart(t) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).forEach((x) => { p[x.type] = x.value; });
  const sinceMidnight = ((Number(p.hour) * 60 + Number(p.minute)) * 60 + Number(p.second)) * 1000 + (t % 1000);
  return t - sinceMidnight;
}
async function presenceCounts(db) {
  const t = now(), since = t - PRESENCE_WINDOW, day = centerDay(t);
  const r = await db.prepare(`SELECT SUM(CASE WHEN seen_at >= ?1 THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN seen_at >= ?1 AND state = 'meditating' THEN 1 ELSE 0 END) AS meditating,
    SUM(CASE WHEN meditated_on = ?2 THEN 1 ELSE 0 END) AS meditatedToday,
    SUM(CASE WHEN seen_at >= ?3 THEN 1 ELSE 0 END) AS activeToday FROM presence`).bind(since, day, centerDayStart(t)).first();
  return { active: r.active || 0, meditating: r.meditating || 0, meditatedToday: r.meditatedToday || 0, activeToday: r.activeToday || 0, at: t };
}
function presenceOf(p, t) {
  if (!p) return { state: 'offline', lastSeenAt: null };
  const on = t - p.seen_at <= PRESENCE_WINDOW;
  return { state: on ? p.state : 'offline', lastSeenAt: p.seen_at };
}
async function buddyLists(db, uid, email) {
  const t = now(), cutoff = t - INVITE_DAYS * 86400000;
  // Attach invites sent to my email before I first signed in
  await db.prepare('UPDATE buddies SET invitee_id = ?1 WHERE invitee_email = ?2 AND invitee_id IS NULL').bind(uid, email).run();
  const rows = (await db.prepare(`SELECT b.*, ui.name AS inviter_name, ui.email AS inviter_email, ue.name AS invitee_name,
      pi.state AS i_state, pi.seen_at AS i_seen, pe.state AS e_state, pe.seen_at AS e_seen
    FROM buddies b JOIN users ui ON ui.id = b.inviter_id LEFT JOIN users ue ON ue.id = b.invitee_id
    LEFT JOIN presence pi ON pi.user_id = b.inviter_id LEFT JOIN presence pe ON pe.user_id = b.invitee_id
    WHERE (b.inviter_id = ?1 OR b.invitee_id = ?1) AND b.status IN ('pending', 'accepted', 'declined') AND ui.blocked_at IS NULL AND (ue.id IS NULL OR ue.blocked_at IS NULL)
    ORDER BY b.created_at`).bind(uid).all()).results;
  const buddies = [], invitesIn = [], invitesOut = [];
  for (const b of rows) {
    const mineOut = b.inviter_id === uid;
    if (b.status === 'accepted') {
      const other = mineOut ? { id: b.invitee_id, name: b.invitee_name, state: b.e_state, seen: b.e_seen } : { id: b.inviter_id, name: b.inviter_name, state: b.i_state, seen: b.i_seen };
      buddies.push({ id: b.id, userId: other.id, name: other.name, ...presenceOf(other.seen ? { state: other.state, seen_at: other.seen } : null, t), since: b.updated_at });
    } else if (mineOut) {
      if (b.created_at >= cutoff) invitesOut.push({ id: b.id, email: b.invitee_email, status: 'waiting', sentAt: b.created_at });   // declined looks the same as waiting
    } else if (b.status === 'pending' && b.created_at >= cutoff) {
      invitesIn.push({ id: b.id, name: b.inviter_name, email: b.inviter_email, sentAt: b.created_at });
    }
  }
  return { buddies, invitesIn, invitesOut, max: MAX_BUDDIES };
}

/* ---------------- events helpers ---------------- */
// Self check-in: from 1 hour before the start until the end of that day (center time).
function windowFor(ev) {
  return [ev.starts_at - 60 * MIN, Math.max(ev.ends_at, centerDayStart(ev.starts_at) + 24 * 3600000)];
}
// Admin/host check-in: any time on the event day and the day after.
function hostWindowFor(ev) {
  const d = centerDayStart(ev.starts_at);
  return [d, d + 48 * 3600000];
}
const MAX_GUESTS = 20;
function guestsOf(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(MAX_GUESTS, Math.max(0, n)) : 0; }
function publicEvent(ev, opts = {}) {
  const out = {
    id: ev.id, centerId: ev.center_id, title: ev.title, description: ev.description, format: ev.format,
    venue: ev.venue, address: ev.address, startsAt: ev.starts_at, endsAt: ev.ends_at, timezone: ev.timezone,
    access: ev.access || 'public', status: ev.status, going: ev.going || 0, checkedIn: ev.checked_in || 0,
    seriesId: ev.series_id || null, repeats: ev.series_freq || null, flyerId: ev.flyer_id || null,
    likes: ev.likes || 0, messages: ev.message_count || 0, hero: !!ev.is_hero,
    kind: ev.kind || 'workshop', children: !!ev.children
  };
  if (opts.signedIn) out.onlineUrl = ev.online_url || null;
  if (opts.admin) out.checkinCode = ev.checkin_code;
  out.guests = ev.going_guests || 0;                       // people coming with those who said Going
  out.headcount = (ev.going || 0) + (ev.going_guests || 0);
  out.checkedInGuests = ev.checked_in_guests || 0;
  if (opts.admin) out.views = ev.view_count || 0;
  if (opts.myGuests !== undefined) out.myGuests = opts.myGuests;
  if (opts.myRsvp !== undefined) out.myRsvp = opts.myRsvp;
  if (opts.myCheckin !== undefined) out.myCheckin = opts.myCheckin;
  return out;
}
const EVENT_COLS = `e.*, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
  (SELECT COALESCE(SUM(r.guests), 0) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going_guests,
  (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) AS checked_in,
  (SELECT COALESCE(SUM(c.guests), 0) FROM checkins c WHERE c.event_id = e.id) AS checked_in_guests,
  (SELECT freq FROM series sr WHERE sr.id = e.series_id) AS series_freq,
  (SELECT COUNT(*) FROM likes l WHERE l.event_id = e.id) AS likes,
  (SELECT COUNT(*) FROM messages mg WHERE mg.event_id = e.id AND mg.deleted_at IS NULL) AS message_count`;
const MAX_OCCURRENCES = 120;   // about two years of weekly events

/* ---- contact details ---- */
// Phone: optional. US numbers may be typed any way (612-555-1234); others need a leading +.
function normPhone(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) { if (d.length >= 8 && d.length <= 15) return '+' + d; }
  else if (d.length === 10) return '+1' + d;
  else if (d.length === 11 && d[0] === '1') return '+' + d;
  throw bad('Please enter a valid phone number (e.g. 612-555-1234).');
}
function contactOf(u) {
  return { email: u.email, phone: u.phone || null, smsOk: !!u.sms_ok, confirmedAt: u.contact_ack_at || null,
    name: u.name, providerName: u.provider_name || u.name, zip: u.zip || null, noMessages: !!u.declined_at };
}
function normZip(v) {
  const z = String(v == null ? '' : v).trim();
  if (!z) return null;
  if (!/^\d{5}(-\d{4})?$/.test(z)) throw bad('ZIP code should be 5 digits, e.g. 55421');
  return z.slice(0, 5);
}
// RSVP and check-in need the contact details confirmed once (shows the notice; email is required, phone optional)
async function requireContact(db, uid) {
  const u = await db.prepare('SELECT contact_ack_at FROM users WHERE id = ?1').bind(uid).first();
  if (!u || !u.contact_ack_at) throw new HttpError(428, 'Please confirm your contact details first.');
}
// guests: people who came along; when not given, the number from the person's RSVP is used
async function checkInUser(db, e, uid, method, t, guests, byUser) {
  const existing = await db.prepare('SELECT checked_in_at FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(e.id, uid).first();
  if (guests === undefined || guests === null) {
    const r = await db.prepare('SELECT guests FROM rsvps WHERE event_id = ?1 AND user_id = ?2').bind(e.id, uid).first();
    guests = r ? r.guests || 0 : 0;
  } else guests = guestsOf(guests);
  if (!existing) {
    await db.batch([
      db.prepare('INSERT INTO checkins (event_id, user_id, method, checked_in_at, by_user, guests) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(e.id, uid, method, t, byUser || null, guests),
      db.prepare(`INSERT INTO rsvps (event_id, user_id, status, updated_at, guests) VALUES (?1, ?2, 'going', ?3, ?4)
        ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'going', updated_at = ?3`).bind(e.id, uid, t, guests)
    ]);
  } else await db.prepare('UPDATE checkins SET guests = ?3 WHERE event_id = ?1 AND user_id = ?2').bind(e.id, uid, guests).run();
  return existing;
}
// Find a person by email, or add them (manual RSVP / check-in by an admin). Merged into their account when they sign in.
async function personByEmail(db, email, name, phone) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
  const u = await db.prepare('SELECT id FROM users WHERE lower(email) = ?1 ORDER BY (provider = \'manual\'), last_seen_at DESC LIMIT 1').bind(email).first();
  if (u) return u.id;
  const id = 'manual:' + email, t = now();
  await db.prepare('INSERT INTO users (id, provider, email, name, phone, created_at, last_seen_at) VALUES (?1, \'manual\', ?2, ?3, ?4, ?5, ?5)')
    .bind(id, email, str(name, 80) || email.split('@')[0], normPhone(phone), t).run();
  return id;
}

function validateEvent(b, partial) {
  const o = {};
  if (!partial || b.title !== undefined) { o.title = str(b.title, 120); if (!o.title) throw bad('Title is required'); }
  if (b.description !== undefined) o.description = str(b.description, 4000);
  if (!partial || b.format !== undefined) {
    if (!['in_person', 'online', 'hybrid'].includes(b.format)) throw bad('Format must be in_person, online or hybrid');
    o.format = b.format;
  }
  if (b.venue !== undefined) o.venue = str(b.venue, 120);
  if (b.address !== undefined) o.address = str(b.address, 300);
  if (b.onlineUrl !== undefined) {
    o.online_url = str(b.onlineUrl, 500);
    if (o.online_url && !/^https:\/\//i.test(o.online_url)) throw bad('Online link must start with https://');
  }
  if (!partial || b.startsAt !== undefined) { o.starts_at = Number(b.startsAt); if (!Number.isFinite(o.starts_at)) throw bad('Start time is required'); }
  if (!partial || b.endsAt !== undefined) { o.ends_at = Number(b.endsAt); if (!Number.isFinite(o.ends_at)) throw bad('End time is required'); }
  if (o.starts_at && o.ends_at && o.ends_at <= o.starts_at) throw bad('End time must be after the start time');
  if (b.timezone !== undefined) o.timezone = str(b.timezone, 60) || 'America/Chicago';
  if (b.access !== undefined) { if (!ACCESS_LEVELS.includes(b.access)) throw bad('Access must be public, satsang or initiates'); o.access = b.access; }
  if (b.kind !== undefined) { if (!EVENT_KINDS.includes(b.kind)) throw bad('Type must be one of: ' + EVENT_KINDS.join(', ')); o.kind = b.kind; }
  if (b.children !== undefined) o.children = b.children ? 1 : 0;
  return o;
}
/* ---------- SRM: event types, people stages and status (see SOSMN-SRM.md) ---------- */
const EVENT_KINDS = ['intro', 'workshop', 'satsang', 'retreat', 'darshan', 'festival', 'celebration'];
const STAGES = ['potential', 'new', 'seeker', 'satsangi', 'initiate'];
const SET_STAGES = ['potential', 'new', 'seeker'];         // the stages an admin can hand-set; Satsangi / Initiate come from category
const STATUSES = ['active', 'drifted', 'dropped', 'passive', 'declined'];
const MILESTONES = ['challenge_done', 'questions_clear', 'met_master'];
const ORIENTATION = { workshops: 5, challenges: 2 };        // a Seeker's orientation: 5 workshops and 2 challenges
const SATSANGI_HINT = 6;                                     // satsangs in 90 days that suggest flagging someone as Satsangi
const DAY_MS = 86400000;
// Stage (only moves up): Potential = we only have their details · New = signed up for an event, not come yet ·
// Seeker = has come · Satsangi = flagged by an admin (sees Community events) · Initiate = permanent
function calcStage(r) {
  if (r.category === 'initiate') return 'initiate';
  if (r.category === 'friend') return 'satsangi';
  if (r.visits) return 'seeker';
  if (r.rsvps) return 'new';
  return 'potential';
}
// Status: Declined and Passive are chosen; the others follow the last visit
function calcStatus(r, t) {
  if (r.declinedAt) return 'declined';
  if (r.passiveAt) return 'passive';
  if (!r.lastVisitAt) return null;
  if (r.lastVisitAt >= t - 60 * DAY_MS) return 'active';
  if (r.lastVisitAt >= t - 365 * DAY_MS) return 'drifted';
  return 'dropped';
}
const calcJourney = calcStage;   // older name, kept for tests and callers
async function journeyRows(db, t, userId) {
  const res = await db.prepare(`SELECT u.id AS userId, u.name, u.email, u.phone, u.category, u.created_at AS createdAt, u.last_seen_at AS lastSeenAt,
      u.blocked_at AS blockedAt, u.journey_level AS override, u.mentor_id AS mentorId, (SELECT m.name FROM users m WHERE m.id = u.mentor_id) AS mentorName,
      u.provider_name AS providerName, u.name_edited AS nameEdited, u.zip, u.declined_at AS declinedAt, u.passive_at AS passiveAt, u.passive_reason AS passiveReason, u.sevadar,
      (SELECT COUNT(*) FROM challenge_shares cs WHERE cs.user_id = u.id) AS shares,
      COUNT(c.event_id) AS visits, MIN(c.checked_in_at) AS firstVisitAt, MAX(c.checked_in_at) AS lastVisitAt,
      COALESCE(SUM(c.guests), 0) AS guestsBrought,
      COALESCE(SUM(e.kind = 'intro'), 0) AS intros, COALESCE(SUM(e.kind = 'workshop'), 0) AS workshops,
      COALESCE(SUM(e.kind = 'workshop' AND c.checked_in_at >= ?1), 0) AS workshops90,
      COALESCE(SUM(e.kind = 'satsang'), 0) AS satsangs, COALESCE(SUM(e.kind = 'satsang' AND c.checked_in_at >= ?1), 0) AS satsangs90,
      COALESCE(SUM(e.kind = 'darshan'), 0) AS darshans, COALESCE(SUM(e.kind = 'retreat'), 0) AS retreats,
      (SELECT group_concat(ms.kind) FROM milestones ms WHERE ms.user_id = u.id) AS milestones,
      (SELECT COUNT(*) FROM rsvps r WHERE r.user_id = u.id AND r.status IN ('going', 'maybe')) AS rsvps,
      (SELECT COUNT(*) FROM event_views v WHERE v.user_id = u.id) AS viewed
    FROM users u LEFT JOIN checkins c ON c.user_id = u.id LEFT JOIN events e ON e.id = c.event_id
    ${userId ? 'WHERE u.id = ?2' : ''} GROUP BY u.id`).bind(...(userId ? [t - 90 * DAY_MS, userId] : [t - 90 * DAY_MS])).all();
  return res.results.map((r) => {
    r.milestones = String(r.milestones || '').split(',').filter(Boolean);
    r.computed = calcStage(r);
    // A hand-set Potential / New / Seeker is used until the calculated stage goes past it (stages only move up)
    r.level = SET_STAGES.includes(r.override) && STAGES.indexOf(r.override) > STAGES.indexOf(r.computed) ? r.override : r.computed;
    r.stage = r.level;
    r.status = calcStatus(r, t);
    r.drifting = r.status === 'drifted';
    r.challenges = (r.shares || 0) + (r.milestones.includes('challenge_done') && !r.shares ? 1 : 0);
    r.orientationDone = r.workshops >= ORIENTATION.workshops && r.challenges >= ORIENTATION.challenges;
    return r;
  });
}
function validateChallenge(b, partial) {
  const o = {};
  const int = (v, lo, hi, name) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) throw bad(name + ' must be between ' + lo + ' and ' + hi); return n; };
  if (!partial || b.title !== undefined) { o.title = str(b.title, 100); if (!o.title) throw bad('Title is required'); }
  if (b.description !== undefined) o.description = str(b.description, 600);
  if (!partial || b.kind !== undefined) { if (!['daily_sitting', 'checkins', 'education'].includes(b.kind)) throw bad('Type must be daily_sitting, checkins or education'); o.kind = b.kind; }
  if (b.minutesChoices !== undefined) {
    const ch = String(b.minutesChoices || '').split(/[,\s]+/).filter(Boolean).map((x) => Math.round(Number(x)));
    if (ch.some((x) => !(x >= 1 && x <= 180))) throw bad('Minute choices must be numbers between 1 and 180, e.g. 10, 15, 20');
    o.minutes_choices = [...new Set(ch)].sort((a, c) => a - c).join(',');
  }
  if (b.rampTo !== undefined) o.ramp_to = int(b.rampTo || 0, 0, 180, 'Grow to (minutes)');
  if (b.material !== undefined) { if (!['', 'quote', 'article', 'book', 'video', 'quiz'].includes(b.material)) throw bad('Material must be quote, article, book, video or quiz'); o.material = b.material; }
  if (b.cadence !== undefined) { if (!['', 'day', 'week', 'month'].includes(b.cadence)) throw bad('How often must be day, week or month'); o.cadence = b.cadence; }
  if (b.perPeriod !== undefined) o.per_period = int(b.perPeriod || 0, 0, 50, 'Items per period');
  if (b.itemPoints !== undefined) o.item_points = int(b.itemPoints || 0, 0, 1000, 'Points per item');
  if (b.signup !== undefined) o.signup = b.signup ? 1 : 0;
  if (b.nextOf !== undefined) o.next_of = b.nextOf ? str(b.nextOf, 60) : null;
  if (b.days !== undefined) o.days = int(b.days, 1, 365, 'Days');
  if (b.minutes !== undefined) o.minutes = int(b.minutes, 0, 600, 'Minutes');
  if (b.target !== undefined) o.target = int(b.target, 0, 1000, 'Target');
  if (b.audience !== undefined) { if (!['all', 'seeker', 'initiate'].includes(b.audience)) throw bad('Audience must be all, seeker or initiate'); o.audience = b.audience; }
  if (b.points !== undefined) o.points = int(b.points, 0, 10000, 'Points');
  if (b.priority !== undefined) o.priority = int(b.priority, 0, 10000, 'Priority');
  if (b.active !== undefined) o.active = b.active ? 1 : 0;
  return o;
}
function challengeOut(r) {
  return { id: r.id, title: r.title, description: r.description, kind: r.kind, days: r.days, minutes: r.minutes, target: r.target,
    minutesChoices: r.minutes_choices ? String(r.minutes_choices).split(',').map(Number) : [], rampTo: r.ramp_to || 0,
    material: r.material || '', cadence: r.cadence || '', perPeriod: r.per_period || 0, itemPoints: r.item_points || 0,
    signup: !!r.signup, nextOf: r.next_of || null,
    audience: r.audience, points: r.points, priority: r.priority, active: !!r.active, updatedAt: r.updated_at };
}
/* ---------------- Library (v0.20): the center's approved articles, books and videos ---------------- */
// Topics for the knowledge library (Learn): filters, related items and search
const TOPICS = { basics: 'Meditation basics', science: 'The science of meditation', masters: 'The Masters', satsang: 'Satsang & community', ethics: 'Ethical living',
  health: 'Health & wellbeing', peace: 'Inner & outer peace', seva: 'Seva', family: 'Family & youth' };
// A quiz: 5–20 questions (10 recommended), each with 2–4 options (yes/no is just two options), the right answer and a short explanation
function validateQuiz(raw) {
  let z = raw; if (typeof z === 'string') { try { z = JSON.parse(z || '{}'); } catch { throw bad('The quiz could not be read'); } }
  const qs = Array.isArray(z && z.questions) ? z.questions : [];
  if (qs.length > 20) throw bad('A quiz can have up to 20 questions');
  const questions = qs.map((x, i) => {
    const q = str(x && x.q, 300), options = (Array.isArray(x && x.options) ? x.options : []).map((o) => str(o, 160)).filter(Boolean), answer = Number(x && x.answer);
    if (!q) throw bad('Question ' + (i + 1) + ' has no text');
    if (options.length < 2 || options.length > 4) throw bad('Question ' + (i + 1) + ' needs 2 to 4 options');
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw bad('Question ' + (i + 1) + ': choose the correct option');
    return { q, options, answer, explain: str(x.explain, 400) || '', source: str(x.source, 200) || '' };
  });
  const related = (Array.isArray(z && z.related) ? z.related : []).map((r) => str(r, 80)).filter(Boolean).slice(0, 6);
  return { questions, related, reviewNote: str(z && z.reviewNote, 300) || '' };
}
function validateLibrary(b, partial) {
  const o = {};
  const int = (v, lo, hi, name) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) throw bad(name + ' must be between ' + lo + ' and ' + hi); return n; };
  if (!partial || b.kind !== undefined) { if (!['article', 'book', 'video', 'quiz'].includes(b.kind)) throw bad('Type must be article, book, video or quiz'); o.kind = b.kind; }
  if (!partial || b.title !== undefined) { o.title = str(b.title, 200); if (!o.title) throw bad('Title is required'); }
  if (b.author !== undefined) o.author = str(b.author, 120) || '';
  if (b.url !== undefined) {
    const u = str(b.url, 600) || '';
    if (u && !/^https:\/\/[^\s]+$/i.test(u)) throw bad('Links must start with https://');
    const yt = u && youtubeId(u); o.url = yt ? 'https://www.youtube.com/watch?v=' + yt : u;
  }
  if (b.summary !== undefined) o.summary = str(b.summary, 800) || '';
  if (b.image !== undefined) { const im = (str(b.image, 600) || '').replace(/^http:\/\//i, 'https://'); if (im && !/^https:\/\//i.test(im)) throw bad('The picture link must start with https://'); o.image = im; }
  if (b.isbn !== undefined) { const i = String(b.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase(); if (i && i.length !== 10 && i.length !== 13) throw bad('ISBN must have 10 or 13 digits'); o.isbn = i; }
  if (b.chapters !== undefined) o.chapters = int(b.chapters || 0, 0, 300, 'Chapters');
  if (b.minutes !== undefined) o.minutes = int(b.minutes || 0, 0, 1000, 'Minutes');
  if (b.status !== undefined) { if (!['draft', 'approved'].includes(b.status)) throw bad('Status must be draft or approved'); o.status = b.status; }
  if (b.priority !== undefined) o.priority = int(b.priority, 0, 10000, 'Priority');
  if (b.body !== undefined) o.body = String(b.body == null ? '' : b.body).replace(/\r\n/g, '\n').slice(0, 30000);
  if (b.icon !== undefined) o.icon = str(b.icon, 8) || '';
  if (b.topics !== undefined) {
    const t = (Array.isArray(b.topics) ? b.topics : String(b.topics || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
    const badT = t.find((x) => !TOPICS[x]); if (badT) throw bad('Unknown topic: ' + badT);
    o.topics = [...new Set(t)].slice(0, 3).join(',');
  }
  if (b.pinned !== undefined) o.pinned = b.pinned ? 1 : 0;
  if (b.quiz !== undefined) o.quiz = JSON.stringify(validateQuiz(b.quiz));
  if (b.passMark !== undefined) o.pass_mark = int(b.passMark, 1, 20, 'Pass mark');
  if (b.retryMinutes !== undefined) o.retry_minutes = int(b.retryMinutes, 0, 1440, 'Minutes before trying again');
  return o;
}
function checkApproval(row) {   // what an item needs before seekers can see it
  if (row.status !== 'approved') return;
  if (row.kind === 'book' && !row.chapters) throw bad('Add the number of chapters before approving a book');
  if (row.kind === 'video' && !row.url) throw bad('Add the link before approving');
  if (row.kind === 'article' && !row.url && !String(row.body || '').trim()) throw bad('Add the article text or a link before approving');
  if (row.kind === 'quiz') {
    const n = (validateQuiz(row.quiz || '{}').questions || []).length;
    if (n < 5) throw bad('A quiz needs at least 5 questions before approving (10 recommended)');
    if ((row.pass_mark || 8) > n) throw bad('The pass mark is higher than the number of questions');
  }
}
function libraryOut(r, admin, stats) {
  let quiz = null; if (r.kind === 'quiz') { try { quiz = JSON.parse(r.quiz || '{}'); } catch { quiz = { questions: [] }; } }
  const o = { id: r.id, kind: r.kind, title: r.title, author: r.author || '', url: r.url || '', summary: r.summary || '', image: r.image || '',
    isbn: r.isbn || '', chapters: r.chapters || 0, minutes: r.minutes || 0, priority: r.priority, updatedAt: r.updated_at,
    body: r.body || '', icon: r.icon || '', topics: String(r.topics || '').split(',').filter(Boolean), pinned: !!r.pinned };
  if (quiz) { o.quiz = admin ? quiz : { questions: quiz.questions || [], related: quiz.related || [] }; o.passMark = r.pass_mark || 8; o.retryMinutes = r.retry_minutes ?? 10; }
  if (admin) { o.status = r.status; o.stats = stats || { open: 0, done: 0, pass: 0 }; }
  return o;
}
// Book look-up: a purchase link (Amazon and others), an ISBN or a title → details from Google Books / Open Library.
// Amazon pages can't be read automatically, but their links carry the ISBN-10 (the "/dp/" number) and usually the title.
function isbn10ok(x) { if (!/^\d{9}[\dX]$/.test(x)) return false; let s = 0; for (let i = 0; i < 10; i++) s += (x[i] === 'X' ? 10 : Number(x[i])) * (10 - i); return s % 11 === 0; }
function isbn13ok(x) { if (!/^97[89]\d{10}$/.test(x)) return false; let s = 0; for (let i = 0; i < 13; i++) s += Number(x[i]) * (i % 2 ? 3 : 1); return s % 10 === 0; }
function bookRef(input) {
  const raw = String(input || '').trim(), out = { isbn: '', title: '' };
  const digits = raw.replace(/[-\s]/g, '').toUpperCase();
  if (isbn13ok(digits) || isbn10ok(digits)) { out.isbn = digits; return out; }
  let u = null; try { u = new URL(raw); } catch { /* not a link */ }
  if (!u) { out.title = raw.slice(0, 200); return out; }
  const p = decodeURIComponent(u.pathname);
  const cands = [...p.matchAll(/(?:^|\/)(97[89]\d{10}|\d{9}[\dX])(?=\/|$|\?)/gi)].map((m) => m[1].toUpperCase())
    .concat([...p.matchAll(/\/(?:dp|gp\/product|product|ASIN)\/([0-9X]{10})/gi)].map((m) => m[1].toUpperCase()));
  const q = u.searchParams.get('isbn') || u.searchParams.get('ean'); if (q) cands.unshift(q.replace(/[^0-9X]/gi, '').toUpperCase());
  out.isbn = cands.find((c) => isbn13ok(c) || isbn10ok(c)) || '';
  const slug = p.split('/').filter(Boolean).find((x) => /[a-z].*-.*[a-z]/i.test(x) && !/^(dp|gp|product|books?|ref=)/i.test(x));
  if (slug) out.title = slug.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return out;
}
function fromGoogleBooks(j) {
  const v = j && j.items && j.items[0] && j.items[0].volumeInfo; if (!v) return null;
  const ids = v.industryIdentifiers || [], isbn = ((ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier) || '';
  const img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '';
  return { title: [v.title, v.subtitle].filter(Boolean).join(': '), author: (v.authors || []).join(', '), isbn,
    image: img.replace(/^http:\/\//, 'https://').replace(/&edge=curl/, ''), pages: v.pageCount || 0, about: String(v.description || '').replace(/<[^>]+>/g, '').slice(0, 600), source: 'Google Books' };
}
function fromOpenLibrary(j) {
  const d = j && j.docs && j.docs[0]; if (!d) return null;
  const isbn = (d.isbn || []).find((x) => x.length === 13) || (d.isbn || [])[0] || '';
  return { title: d.title || '', author: (d.author_name || []).join(', '), isbn,
    image: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg' : '', pages: d.number_of_pages_median || 0, about: '', source: 'Open Library' };
}
async function lookupBook(input) {
  const ref = bookRef(input);
  if (!ref.isbn && !ref.title) throw bad('Paste a book link, an ISBN or a title');
  const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'sosmn.org library (MinneapolisCenter@sos.org)' } }); return r.ok ? await r.json() : null; } catch { return null; } };
  const q = ref.isbn ? 'isbn:' + ref.isbn : 'intitle:' + ref.title;
  let found = fromGoogleBooks(await get('https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' + encodeURIComponent(q)));
  if (!found) found = fromOpenLibrary(await get('https://openlibrary.org/search.json?limit=1&' + (ref.isbn ? 'isbn=' + ref.isbn : 'title=' + encodeURIComponent(ref.title))));
  if (found && !found.image && (found.isbn || ref.isbn)) found.image = 'https://covers.openlibrary.org/b/isbn/' + (found.isbn || ref.isbn) + '-M.jpg';
  return { ref, found };
}
const code4 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
// Which events an admin change applies to: this one, this and following in the series, or the whole series
function scopeWhere(url, cur) {
  const sc = url.searchParams.get('scope');
  if (cur.series_id && sc === 'all') return { where: 'series_id = ?1', args: [cur.series_id] };
  if (cur.series_id && sc === 'future') return { where: 'series_id = ?1 AND starts_at >= ?2', args: [cur.series_id, cur.starts_at] };
  return { where: 'id = ?1', args: [cur.id] };
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ---------------- router ---------------- */
async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const db = env.DB;
  const J = (b, s) => json(request, env, b, s);
  let m;

  if (path === '/api/health') return J({ ok: true, time: now(), version: env.APP_VERSION || 'dev' });

  /* ---- sign in: exchange a Google/Microsoft token for our session ---- */
  if (path === '/api/session' && request.method === 'POST') {
    const b = await body(request);
    let u;
    if (b.provider === 'google') u = await verifyGoogle(env, b.accessToken);
    else if (b.provider === 'microsoft') u = await verifyMicrosoft(env, b.idToken);
    // Local development only: enabled solely by DEV_LOGIN=true in .dev.vars (never set in production)
    else if (b.provider === 'dev' && env.DEV_LOGIN === 'true') u = { id: 'dev:' + String(b.email).toLowerCase(), provider: 'dev', email: String(b.email).toLowerCase(), name: str(b.name, 80) || String(b.email).split('@')[0] };
    else throw bad('Unknown provider');
    const t = now();
    await db.prepare(`INSERT INTO users (id, provider, email, name, provider_name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5)
      ON CONFLICT(id) DO UPDATE SET email = ?3, name = CASE WHEN name_edited = 1 THEN name ELSE ?4 END, provider_name = ?4, last_seen_at = ?5`).bind(u.id, u.provider, u.email, u.name, t).run();
    // An admin may have added this person by email before they ever signed in: move those RSVPs and check-ins over
    const manual = 'manual:' + u.email;
    if (u.id !== manual && await db.prepare('SELECT 1 FROM users WHERE id = ?1').bind(manual).first()) {
      await db.batch([
        db.prepare('UPDATE OR IGNORE rsvps SET user_id = ?2 WHERE user_id = ?1').bind(manual, u.id),
        db.prepare('UPDATE OR IGNORE checkins SET user_id = ?2 WHERE user_id = ?1').bind(manual, u.id),
        db.prepare('UPDATE OR IGNORE event_views SET user_id = ?2 WHERE user_id = ?1').bind(manual, u.id),
        db.prepare('UPDATE users SET phone = COALESCE(phone, (SELECT phone FROM users WHERE id = ?1)) WHERE id = ?2').bind(manual, u.id),
        db.prepare('DELETE FROM rsvps WHERE user_id = ?1').bind(manual),
        db.prepare('DELETE FROM checkins WHERE user_id = ?1').bind(manual),
        db.prepare('DELETE FROM event_views WHERE user_id = ?1').bind(manual),
        db.prepare('DELETE FROM users WHERE id = ?1').bind(manual)
      ]);
    }
    const role = await roleOf(env, u.email);
    const exp = t + (STAFF_ROLES.includes(role) ? STAFF_SESSION_HOURS * 3600000 : SESSION_DAYS * 86400000);
    const token = await signSession(env, { uid: u.id, email: u.email, name: u.name, exp });
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(u.id).first();
    if (role) await logAdmin(env, { uid: u.id, email: u.email }, 'sign_in', role);
    return J({ token, exp, user: await meOf({ uid: u.id, email: u.email, name: u.name }, row, env), contact: contactOf(row) });
  }

  if (path === '/api/me' && request.method === 'GET') {
    const s = await requireUser(request, env);
    const rows = await db.prepare(`SELECT c.event_id AS eventId, c.method, c.checked_in_at AS checkedInAt, e.format, e.title, e.starts_at AS startsAt
      FROM checkins c JOIN events e ON e.id = c.event_id WHERE c.user_id = ?1 ORDER BY c.checked_in_at`).bind(s.uid).all();
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    const msgs = (await db.prepare('SELECT DISTINCT event_id AS eventId FROM messages WHERE user_id = ?1 AND deleted_at IS NULL').bind(s.uid).all()).results;
    return J({ user: await meOf(s, row, env), contact: row ? contactOf(row) : null, checkins: rows.results, messageEvents: msgs.map((x) => x.eventId) });
  }

  // Self-declared Seeker / Initiate from the phone's profile (only the word; initiation details never come here).
  // Seeker Friend is set by an admin and is kept when the phone says 'seeker'.
  if (path === '/api/me/category' && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const c = (await body(request)).category;
    if (!['seeker', 'initiate'].includes(c)) throw bad('Category must be seeker or initiate');
    const u = await loadUser(db, s.uid);
    if (!u) throw new HttpError(401, 'Please sign in again');
    const next = (c === 'seeker' && u.category === 'friend') ? 'friend' : c;
    if (next !== u.category) await db.prepare('UPDATE users SET category = ?2, category_at = ?3 WHERE id = ?1').bind(s.uid, next, now()).run();
    return J({ category: next });
  }

  // Copilot: the person chose to let the center know they finished a challenge (title and date only)
  if (path === '/api/me/challenge-done' && request.method === 'POST') {
    const s = await requireUser(request, env);
    const b = await body(request), ref = str(b.ref, 80), title = str(b.title, 100);
    if (!ref || !title) throw bad('Which challenge?');
    const on = /^\d{4}-\d{2}-\d{2}$/.test(String(b.finishedOn || '')) ? b.finishedOn : null;
    await db.prepare('INSERT OR IGNORE INTO challenge_shares (user_id, ref, title, finished_on, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(s.uid, ref, title, on, now()).run();
    return J({ ok: true });
  }

  /* ---- presence: counts only (names are never shown) ---- */
  if (path === '/api/presence/counts' && request.method === 'GET') {
    return new Response(JSON.stringify(await presenceCounts(db)), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', ...cors(request, env) } });
  }
  if (path === '/api/presence' && request.method === 'POST') {
    const { s, u } = await requireMember(request, env, db);
    const pb = await body(request);
    const st = pb.state === 'meditating' ? 'meditating' : 'active';
    const t = now();
    const pts = Number(pb.points);
    const ptsStmt = Number.isFinite(pts) && pts >= 0 && pts <= 10000000
      ? [db.prepare('UPDATE users SET points = ?2, points_level = ?3, points_at = ?4 WHERE id = ?1').bind(s.uid, Math.round(pts), str(pb.level, 40), t)] : [];
    await db.batch([...ptsStmt,
      db.prepare(`INSERT INTO presence (user_id, state, seen_at, meditated_on) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(user_id) DO UPDATE SET state = ?2, seen_at = ?3, meditated_on = COALESCE(?4, meditated_on)`).bind(s.uid, st, t, st === 'meditating' ? centerDay(t) : null),
      db.prepare('UPDATE users SET last_seen_at = ?2 WHERE id = ?1').bind(s.uid, t),
      db.prepare('DELETE FROM presence WHERE seen_at < ?1 AND (meditated_on IS NULL OR meditated_on < ?2)').bind(t - 7 * 86400000, centerDay(t))   // tidy old rows
    ]);
    const counts = await presenceCounts(db);
    const pend = (await db.prepare(`SELECT COUNT(*) AS n FROM buddies WHERE status = 'pending' AND (invitee_id = ?1 OR invitee_email = ?2) AND created_at >= ?3`).bind(s.uid, u.email, t - INVITE_DAYS * 86400000).first()).n;
    return J({ ...counts, invitesIn: pend });
  }

  /* ---- meditation buddies ---- */
  if (path === '/api/buddies' && request.method === 'GET') {
    const { s, u } = await requireMember(request, env, db);
    return J(await buddyLists(db, s.uid, u.email));
  }
  if (path === '/api/buddies/invite' && request.method === 'POST') {
    const { s, u } = await requireMember(request, env, db);
    const email = esc((await body(request)).email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
    if (email === (u.email || '').toLowerCase()) throw bad('That\u2019s your own email.');
    const lists = await buddyLists(db, s.uid, u.email);
    if (lists.buddies.length >= MAX_BUDDIES) throw bad(`You can have up to ${MAX_BUDDIES} buddies.`);
    if (lists.invitesOut.some((i) => i.email === email)) throw bad('You\u2019ve already invited them.');
    const other = await db.prepare('SELECT id, blocked_at FROM users WHERE lower(email) = ?1').bind(email).first();
    if (other && other.blocked_at) throw bad('That person can\u2019t be invited.');
    if (other) {
      const existing = await db.prepare(`SELECT id, status, inviter_id FROM buddies WHERE status IN ('pending','accepted') AND ((inviter_id = ?1 AND invitee_id = ?2) OR (inviter_id = ?2 AND invitee_id = ?1))`).bind(s.uid, other.id).first();
      if (existing && existing.status === 'accepted') throw bad('You\u2019re already buddies.');
      if (existing && existing.inviter_id === other.id) {   // they invited me first: accept it
        await db.prepare('UPDATE buddies SET status = ?2, updated_at = ?3 WHERE id = ?1').bind(existing.id, 'accepted', now()).run();
        return J({ accepted: true, ...(await buddyLists(db, s.uid, u.email)) });
      }
      if (existing) throw bad('You\u2019ve already invited them.');
      const theirs = (await db.prepare(`SELECT COUNT(*) AS n FROM buddies WHERE status = 'accepted' AND (inviter_id = ?1 OR invitee_id = ?1)`).bind(other.id).first()).n;
      if (theirs >= MAX_BUDDIES) throw bad('They already have the maximum number of buddies.');
    }
    const t = now();
    await db.prepare('INSERT INTO buddies (id, inviter_id, invitee_email, invitee_id, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
      .bind(crypto.randomUUID(), s.uid, email, other ? other.id : null, 'pending', t).run();
    return J({ accepted: false, ...(await buddyLists(db, s.uid, u.email)) }, 201);
  }
  if ((m = /^\/api\/buddies\/([\w-]+)\/(accept|decline)$/.exec(path)) && request.method === 'POST') {
    const { s, u } = await requireMember(request, env, db);
    const b = await db.prepare(`SELECT * FROM buddies WHERE id = ?1 AND status = 'pending' AND (invitee_id = ?2 OR invitee_email = ?3)`).bind(m[1], s.uid, (u.email || '').toLowerCase()).first();
    if (!b) throw new HttpError(404, 'Invite not found');
    if (m[2] === 'accept') {
      const mine = (await db.prepare(`SELECT COUNT(*) AS n FROM buddies WHERE status = 'accepted' AND (inviter_id = ?1 OR invitee_id = ?1)`).bind(s.uid).first()).n;
      if (mine >= MAX_BUDDIES) throw bad(`You can have up to ${MAX_BUDDIES} buddies. Remove one first.`);
    }
    await db.prepare('UPDATE buddies SET status = ?2, invitee_id = ?3, updated_at = ?4 WHERE id = ?1').bind(b.id, m[2] === 'accept' ? 'accepted' : 'declined', s.uid, now()).run();
    return J(await buddyLists(db, s.uid, u.email));
  }
  if ((m = /^\/api\/buddies\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {   // remove a buddy or withdraw an invite
    const { s, u } = await requireMember(request, env, db);
    const b = await db.prepare('SELECT * FROM buddies WHERE id = ?1 AND (inviter_id = ?2 OR invitee_id = ?2)').bind(m[1], s.uid).first();
    if (!b) throw new HttpError(404, 'Not found');
    await db.prepare('UPDATE buddies SET status = ?2, updated_at = ?3 WHERE id = ?1').bind(b.id, 'removed', now()).run();
    return J(await buddyLists(db, s.uid, u.email));
  }

  /* ---- feedback: suggestions and ratings (guests allowed) ---- */
  if (path === '/api/feedback' && request.method === 'POST') {
    const sess = await readSession(request, env);
    const b = await body(request);
    const kind = b.kind === 'rating' ? 'rating' : 'suggestion';
    const rating = kind === 'rating' ? Number(b.rating) : null;
    if (kind === 'rating' && !(rating >= 1 && rating <= 5)) throw bad('Rating must be 1 to 5');
    const text = esc(b.body).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 1000);
    if (kind === 'suggestion' && !text) throw bad('Please write your suggestion first.');
    const contact = str(b.contact, 120);
    const ua = request.headers.get('User-Agent') || '';
    const platform = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'other';
    // Light limits: 10 an hour per signed-in person; guests share a pool of 30 an hour (no IP addresses are stored)
    const recent = sess
      ? (await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?1 AND created_at > ?2').bind(sess.uid, now() - 3600000).first()).n
      : (await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id IS NULL AND created_at > ?1').bind(now() - 3600000).first()).n;
    if (recent >= (sess ? 10 : 30)) throw bad('Thank you! Please wait a little before sending more.');
    await db.prepare('INSERT INTO feedback (id, user_id, kind, rating, body, contact, version, platform, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(crypto.randomUUID(), sess ? sess.uid : null, kind, rating, text || null, contact || null, str(b.version, 20) || null, platform, now()).run();
    return J({ ok: true }, 201);
  }
  if (path === '/api/admin/feedback' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = (await db.prepare(`SELECT f.id, f.kind, f.rating, f.body, f.contact, f.version, f.platform, f.created_at AS createdAt, u.name, u.email
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 500`).all()).results;
    const avg = await db.prepare(`SELECT AVG(rating) AS avg, COUNT(*) AS n FROM feedback WHERE kind = 'rating'`).first();
    if (url.searchParams.get('format') === 'csv') {
      const lines = [['date', 'kind', 'rating', 'comment', 'name', 'email', 'contact', 'version', 'platform']].concat(rows.map((r) =>
        [new Date(r.createdAt).toISOString(), r.kind, r.rating || '', r.body || '', r.name || '', r.email || '', r.contact || '', r.version || '', r.platform || '']));
      return new Response(lines.map((l) => l.map(csvCell).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="feedback.csv"', ...cors(request, env) } });
    }
    return J({ feedback: rows, averageRating: avg.avg ? Math.round(avg.avg * 10) / 10 : null, ratings: avg.n });
  }

  /* ---- center settings (featured content on Today) ---- */
  if ((m = /^\/api\/centers\/([\w-]+)\/settings$/.exec(path)) && request.method === 'GET') {
    const rows = (await db.prepare('SELECT key, value FROM settings WHERE center_id = ?1').bind(m[1]).all()).results;
    const out = {}; rows.forEach((r) => { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = null; } });
    return new Response(JSON.stringify({ settings: out }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...cors(request, env) } });
  }
  if ((m = /^\/api\/admin\/centers\/([\w-]+)\/settings$/.exec(path)) && request.method === 'PUT') {
    const s = await requireAdmin(request, env);
    const b = await body(request);
    const stmts = [];
    // Featured content: a short list; the app shows a different item each day. YouTube links get a thumbnail; sos.org pages are allowed too.
    if (b.featuredVideos !== undefined) {
      if (!Array.isArray(b.featuredVideos) || b.featuredVideos.length > 14) throw bad('Up to 14 featured items');
      const list = b.featuredVideos.map((x) => {
        const raw = esc(x.url).trim(), id = youtubeId(raw);
        let url, host = null;
        if (id) url = 'https://www.youtube.com/watch?v=' + id;
        else {
          try { const u = new URL(raw); host = u.hostname.toLowerCase(); if (u.protocol !== 'https:' || !(host === 'sos.org' || host.endsWith('.sos.org'))) throw 0; url = u.toString(); }
          catch { throw bad('Use a YouTube link or a page on sos.org.'); }
        }
        return { url, videoId: id || null, title: str(x.title, 120) || 'Featured today', caption: str(x.caption, 200) };
      });
      stmts.push(db.prepare('INSERT INTO settings (center_id, key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(center_id, key) DO UPDATE SET value = ?3, updated_at = ?4, updated_by = ?5')
        .bind(m[1], 'featuredVideos', JSON.stringify(list), now(), s.uid));
    }
    // Hero article on Today: a page on sosmn.org (News & Archive)
    if (b.heroArticle !== undefined) {
      const a = b.heroArticle || null;
      let val = null;
      if (a) {
        const okUrl = (v) => { v = esc(v).trim(); if (/^\/news\//.test(v)) return v; try { const u = new URL(v); if (u.protocol === 'https:' && /(^|\.)sosmn\.org$/.test(u.hostname)) return u.toString(); } catch {} return null; };
        const url = okUrl(a.url);
        if (!url) throw bad('The article must be a page on sosmn.org (for example /news/ten-year-anniversary-2025/).');
        const title = str(a.title, 160);
        if (!title) throw bad('The article needs a title.');
        val = { url, title, image: a.image ? okUrl(a.image) : null, summary: str(a.summary, 300), date: str(a.date, 40) };
      }
      stmts.push(db.prepare('INSERT INTO settings (center_id, key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(center_id, key) DO UPDATE SET value = ?3, updated_at = ?4, updated_by = ?5')
        .bind(m[1], 'heroArticle', JSON.stringify(val), now(), s.uid));
    }
    if (stmts.length) { await db.batch(stmts); await logAdmin(env, s, 'settings', m[1], Object.keys(b).join(', ')); }
    const rows = (await db.prepare('SELECT key, value FROM settings WHERE center_id = ?1').bind(m[1]).all()).results;
    const out = {}; rows.forEach((r) => { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = null; } });
    return J({ settings: out });
  }

  /* ---- flyer images (public; flyers follow the event's access level, so the id is unguessable) ---- */
  if ((m = /^\/api\/flyers\/([\w-]+)$/.exec(path)) && request.method === 'GET') {
    const thumb = url.searchParams.get('size') === 'thumb';
    const f = await db.prepare(`SELECT mime, ${thumb ? 'thumb' : 'full'} AS data FROM flyers WHERE id = ?1`).bind(m[1]).first();
    if (!f) throw new HttpError(404, 'Not found');
    const data = Array.isArray(f.data) ? Uint8Array.from(f.data) : f.data;   // D1 returns BLOBs as ArrayBuffer (or an array locally)
    return new Response(data, { headers: { 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable', ...cors(request, env) } });
  }

  // Contact details: email comes from sign-in (required); phone and text reminders are optional
  if (path === '/api/me/contact' && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const b = await body(request);
    const phone = normPhone(b.phone);
    const noMessages = b.noMessages === undefined ? undefined : !!b.noMessages;
    const smsOk = !!b.smsOk && !noMessages;
    const zip = b.zip === undefined ? undefined : normZip(b.zip);
    const name = b.name === undefined ? undefined : str(b.name, 80);
    if (name !== undefined && !name) throw bad('Please enter your name');
    if (smsOk && !phone) throw bad('Add a phone number to get text reminders.');
    const u = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    if (!u) throw new HttpError(404, 'Please sign in again');
    const t = now();
    const consentAt = smsOk ? (u.sms_ok && u.phone === phone ? u.sms_consent_at : t) : null;
    const st = [db.prepare('UPDATE users SET phone = ?2, sms_ok = ?3, sms_consent_at = ?4, contact_ack_at = ?5 WHERE id = ?1')
      .bind(s.uid, phone, smsOk ? 1 : 0, consentAt, u.contact_ack_at || t)];
    if (zip !== undefined) st.push(db.prepare('UPDATE users SET zip = ?2 WHERE id = ?1').bind(s.uid, zip));
    if (noMessages !== undefined) st.push(db.prepare('UPDATE users SET declined_at = ?2 WHERE id = ?1').bind(s.uid, noMessages ? (u.declined_at || t) : null));
    if (name !== undefined && name !== u.name) st.push(db.prepare('UPDATE users SET name = ?2, name_edited = CASE WHEN ?2 = COALESCE(provider_name, name) THEN 0 ELSE 1 END WHERE id = ?1').bind(s.uid, name));
    await db.batch(st);
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    return J({ contact: contactOf(row) });
  }

  if (path === '/api/me/name' && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const name = str((await body(request)).name, 80);
    if (!name) throw bad('Name is required');
    await db.prepare('UPDATE users SET name = ?2, name_edited = CASE WHEN ?2 = COALESCE(provider_name, name) THEN 0 ELSE 1 END WHERE id = ?1').bind(s.uid, name).run();
    const token = await signSession(env, { ...s, name });
    return J({ ok: true, token });
  }

  /* ---- public: list and view events ---- */
  if (path === '/api/events' && request.method === 'GET') {
    const s = await readSession(request, env);
    const u = s ? await loadUser(db, s.uid) : null;
    const admin = !!(s && await isAdmin(env, s.email));
    if (u && u.blocked_at) return J({ events: [], blocked: true, message: BLOCKED_MSG });
    const from = Number(url.searchParams.get('from')) || now() - 86400000;
    const to = Number(url.searchParams.get('to')) || now() + 120 * 86400000;
    // People see only events they can attend (seekers: public; seeker friends: + satsang; initiates: all)
    const vis = sqlIn(levelsFor(u, admin));
    const rows = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.ends_at >= ?1 AND e.starts_at <= ?2 AND e.access IN ${vis} ORDER BY e.starts_at LIMIT 200`).bind(from, to).all();
    let mine = {}, myCk = {}, myG = {};
    if (s) {
      (await db.prepare('SELECT event_id, status, guests FROM rsvps WHERE user_id = ?1').bind(s.uid).all()).results.forEach((r) => { mine[r.event_id] = r.status; myG[r.event_id] = r.guests || 0; });
      (await db.prepare('SELECT event_id, checked_in_at FROM checkins WHERE user_id = ?1').bind(s.uid).all()).results.forEach((r) => { myCk[r.event_id] = r.checked_in_at; });
    }
    return J({ events: rows.results.map((e) => publicEvent(e, { signedIn: !!s, admin, myRsvp: s ? mine[e.id] || null : undefined, myCheckin: s ? myCk[e.id] || null : undefined, myGuests: s ? myG[e.id] || 0 : undefined })) });
  }

  if ((m = /^\/api\/events\/([\w-]+)$/.exec(path)) && request.method === 'GET') {
    const s = await readSession(request, env);
    const u = s ? await loadUser(db, s.uid) : null;
    const admin = !!(s && await isAdmin(env, s.email));
    if (u && u.blocked_at) throw new HttpError(403, BLOCKED_MSG);
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    let myRsvp, myCheckin, myLike, myGuests;
    if (s) {
      const rv = await db.prepare('SELECT status, guests FROM rsvps WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first();
      myRsvp = rv ? rv.status : null; myGuests = rv ? rv.guests || 0 : 0;
      myCheckin = (await db.prepare('SELECT checked_in_at FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first())?.checked_in_at || null;
      myLike = !!(await db.prepare('SELECT 1 FROM likes WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first());
    }
    const out = publicEvent(e, { signedIn: !!s, admin, myRsvp, myCheckin, myGuests });
    if (s) out.myLike = myLike;
    return J({ event: out });
  }

  /* ---- likes and messages (signed-in members who can see the event) ---- */
  if ((m = /^\/api\/events\/([\w-]+)\/messages$/.exec(path)) && request.method === 'GET') {
    const { s, u, admin } = await requireMember(request, env, db);
    const e = await db.prepare('SELECT id, access FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    const rows = (await db.prepare(`SELECT mg.id, mg.user_id AS userId, u.name, mg.body, mg.created_at AS createdAt FROM messages mg JOIN users u ON u.id = mg.user_id
      WHERE mg.event_id = ?1 AND mg.deleted_at IS NULL AND u.blocked_at IS NULL ORDER BY mg.created_at DESC LIMIT 200`).bind(e.id).all()).results;
    const likes = (await db.prepare('SELECT COUNT(*) AS n FROM likes WHERE event_id = ?1').bind(e.id).first()).n;
    const myLike = !!(await db.prepare('SELECT 1 FROM likes WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first());
    return J({ messages: rows.map((r) => ({ ...r, mine: r.userId === s.uid })), likes, myLike });
  }
  if ((m = /^\/api\/events\/([\w-]+)\/messages$/.exec(path)) && request.method === 'POST') {
    const { s, u, admin } = await requireMember(request, env, db);
    const e = await db.prepare('SELECT id, access FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    const text = cleanMessage((await body(request)).body);
    const recent = (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id = ?1 AND created_at > ?2').bind(s.uid, now() - 10 * MIN).first()).n;
    if (recent >= 5) throw bad('Please wait a few minutes before posting more.');
    const id = crypto.randomUUID(), t = now();
    const first = !(await db.prepare('SELECT 1 FROM messages WHERE event_id = ?1 AND user_id = ?2 AND deleted_at IS NULL').bind(e.id, s.uid).first());
    await db.prepare('INSERT INTO messages (id, event_id, user_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, e.id, s.uid, text, t).run();
    return J({ message: { id, userId: s.uid, name: u.name, body: text, createdAt: t, mine: true }, firstOnEvent: first }, 201);
  }
  if ((m = /^\/api\/events\/([\w-]+)\/messages\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {
    const { s, admin } = await requireMember(request, env, db);
    const mg = await db.prepare('SELECT id, user_id FROM messages WHERE id = ?1 AND event_id = ?2').bind(m[2], m[1]).first();
    if (!mg) throw new HttpError(404, 'Message not found');
    if (mg.user_id !== s.uid && !admin) throw new HttpError(403, 'You can only delete your own messages');
    await db.prepare('UPDATE messages SET deleted_at = ?2, deleted_by = ?3 WHERE id = ?1').bind(mg.id, now(), s.uid).run();
    return J({ ok: true });
  }
  if ((m = /^\/api\/events\/([\w-]+)\/like$/.exec(path)) && (request.method === 'PUT' || request.method === 'DELETE')) {
    const { s, u, admin } = await requireMember(request, env, db);
    const e = await db.prepare('SELECT id, access FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    if (request.method === 'PUT') await db.prepare('INSERT OR IGNORE INTO likes (event_id, user_id, created_at) VALUES (?1, ?2, ?3)').bind(e.id, s.uid, now()).run();
    else await db.prepare('DELETE FROM likes WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).run();
    const likes = (await db.prepare('SELECT COUNT(*) AS n FROM likes WHERE event_id = ?1').bind(e.id).first()).n;
    return J({ likes, myLike: request.method === 'PUT' });
  }

  /* ---- members: RSVP and check in ---- */
  if ((m = /^\/api\/events\/([\w-]+)\/rsvp$/.exec(path)) && request.method === 'PUT') {
    const { s, u, admin } = await requireMember(request, env, db);
    const rb = await body(request);
    const st = rb.status, guests = st === 'no' ? 0 : guestsOf(rb.guests);
    if (!['going', 'maybe', 'no'].includes(st)) throw bad('Status must be going, maybe or no');
    const e = await db.prepare('SELECT id, status, ends_at, access FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    await requireContact(db, s.uid);
    if (e.status === 'cancelled') throw bad('This event was cancelled');
    if (e.ends_at < now()) throw bad('This event has ended');
    await db.prepare(`INSERT INTO rsvps (event_id, user_id, status, updated_at, guests) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = ?3, updated_at = ?4, guests = ?5`).bind(e.id, s.uid, st, now(), guests).run();
    return J({ ok: true, status: st, guests });
  }

  if ((m = /^\/api\/events\/([\w-]+)\/checkin$/.exec(path)) && request.method === 'POST') {
    const { s, u, admin } = await requireMember(request, env, db);
    const b = await body(request);
    const method = b.method;
    if (!['code', 'qr', 'online'].includes(method)) throw bad('Unknown check-in method');
    const e = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e || !canAttend(e, u, admin)) throw new HttpError(404, 'Event not found');
    if (e.status === 'cancelled') throw bad('This event was cancelled');
    if (method === 'online' && e.format === 'in_person') throw bad('This is an in-person event. Please use the code at the venue.');
    if (method !== 'online' && e.format === 'online') throw bad('This is an online event. Tap Join to check in.');
    const [a, z] = windowFor(e), t = now();
    if (t < a) throw bad('Check-in opens 1 hour before the start.');
    if (t > z) throw bad('Check-in for this event closed at the end of the day.');
    if (method !== 'online' && String(b.code || '').trim() !== e.checkin_code) throw bad('That check-in code is not correct.');
    await requireContact(db, s.uid);
    const existing = await checkInUser(db, e, s.uid, method, t, b.guests);
    return J({ ok: true, checkedInAt: existing ? existing.checked_in_at : t, already: !!existing, format: e.format, onlineUrl: method === 'online' ? e.online_url : undefined });
  }

  /* ---- center QR (printed poster): check in to whichever in-person event is open now ---- */
  if ((m = /^\/api\/centers\/([\w-]+)\/checkin$/.exec(path)) && request.method === 'POST') {
    const { s, u, admin } = await requireMember(request, env, db);
    const b = await body(request);
    const t = now();
    const all = (await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.center_id = ?1 AND e.status = 'scheduled'
      AND e.format IN ('in_person', 'hybrid') AND e.starts_at - ?3 <= ?2 AND (e.ends_at >= ?2 OR e.starts_at >= ?4) ORDER BY e.starts_at`).bind(m[1], t, 60 * MIN, centerDayStart(t)).all()).results;
    const open = all.filter((e) => canAttend(e, u, admin));
    if (!open.length) {
      if (all.length) return J({ open: false, seeHost: true });    // an event is on, but not one this person can attend
      const vis = sqlIn(levelsFor(u, admin));
      const next = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.center_id = ?1 AND e.status = 'scheduled' AND e.format IN ('in_person', 'hybrid')
        AND e.starts_at > ?2 AND e.access IN ${vis} ORDER BY e.starts_at LIMIT 1`).bind(m[1], t).first();
      return J({ open: false, next: next ? publicEvent(next, {}) : null });
    }
    let e = open.length === 1 ? open[0] : open.find((x) => x.id === b.eventId);
    if (!e) return J({ open: true, choose: open.map((x) => publicEvent(x, {})) });
    await requireContact(db, s.uid);
    const existing = await checkInUser(db, e, s.uid, 'qr', t, b.guests);
    return J({ open: true, ok: true, already: !!existing, checkedInAt: existing ? existing.checked_in_at : t, event: publicEvent(e, { signedIn: true }) });
  }

  /* ---- admins ---- */
  if (path === '/api/admin/events' && request.method === 'POST') {
    const s = await requireAdmin(request, env);
    const b = await body(request);
    const o = validateEvent(b, false);
    const t = now();
    // Repeating: the app works out the dates in the center's local time (so daylight saving is right)
    // and sends them as `occurrences`; skipped dates are simply left out.
    let occ = [{ startsAt: o.starts_at, endsAt: o.ends_at }], seriesId = null;
    if (b.repeat) {
      if (!['weekly', 'biweekly', 'monthly'].includes(b.repeat.freq)) throw bad('Repeat must be weekly, biweekly or monthly');
      if (!Array.isArray(b.occurrences) || !b.occurrences.length) throw bad('Pick at least one date');
      if (b.occurrences.length > MAX_OCCURRENCES) throw bad(`At most ${MAX_OCCURRENCES} dates at a time. Choose an earlier end date.`);
      occ = b.occurrences.map((x) => ({ startsAt: Number(x.startsAt), endsAt: Number(x.endsAt) }));
      if (occ.some((x) => !Number.isFinite(x.startsAt) || !Number.isFinite(x.endsAt) || x.endsAt <= x.startsAt)) throw bad('One of the dates has an invalid time');
      occ.sort((a, z) => a.startsAt - z.startsAt);
      seriesId = crypto.randomUUID();
    }
    const ins = db.prepare(`INSERT INTO events (id, center_id, title, description, format, venue, address, online_url, starts_at, ends_at, timezone, access, status, checkin_code, created_by, created_at, updated_at, series_id, flyer_id, kind, children)
      VALUES (?1, 'mpls', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'scheduled', ?12, ?13, ?14, ?14, ?15, ?16, ?17, ?18)`);
    const ids = occ.map(() => crypto.randomUUID());
    const flyerId = b.flyerId ? str(b.flyerId, 60) : null;
    const stmts = occ.map((x, i) => ins.bind(ids[i], o.title, o.description || null, o.format, o.venue || null, o.address || null, o.online_url || null,
      x.startsAt, x.endsAt, o.timezone || 'America/Chicago', o.access || 'public', code4(), s.uid, t, seriesId, flyerId, o.kind || 'workshop', o.children || 0));
    if (seriesId) stmts.unshift(db.prepare('INSERT INTO series (id, center_id, freq, until_at, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(seriesId, 'mpls', b.repeat.freq, occ[occ.length - 1].startsAt, s.uid, t));
    await db.batch(stmts);
    await logAdmin(env, s, 'event_create', ids[0], o.title + (ids.length > 1 ? ' (' + ids.length + ' dates)' : ''));
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(ids[0]).first();
    return J({ event: publicEvent(e, { signedIn: true, admin: true }), count: ids.length }, 201);
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)$/.exec(path)) && request.method === 'PATCH') {
    const sAdm = await requireAdmin(request, env);
    const o = validateEvent(await body(request), true);
    const cur = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    const st = o.starts_at !== undefined ? o.starts_at : cur.starts_at, en = o.ends_at !== undefined ? o.ends_at : cur.ends_at;
    if (en <= st) throw bad('End time must be after the start time');
    // Series scope: same field changes on each event; a time change moves each by the same amount
    const dS = st - cur.starts_at, dE = en - cur.ends_at;
    delete o.starts_at; delete o.ends_at;
    const keys = Object.keys(o), t = now();
    const sw = scopeWhere(url, cur), where = sw.where, whereArgs = sw.args;
    const n = whereArgs.length;
    const sets = keys.map((k, i) => `${k} = ?${n + i + 1}`).concat([`starts_at = starts_at + ?${n + keys.length + 1}`, `ends_at = ends_at + ?${n + keys.length + 2}`, `updated_at = ?${n + keys.length + 3}`]).join(', ');
    const res = await db.prepare(`UPDATE events SET ${sets} WHERE ${where}`).bind(...whereArgs, ...keys.map((k) => o[k]), dS, dE, t).run();
    await logAdmin(env, sAdm, 'event_edit', m[1], (url.searchParams.get('scope') || 'this') + ': ' + keys.concat(dS || dE ? ['time'] : []).join(', '));
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    return J({ event: publicEvent(e, { signedIn: true, admin: true }), count: res.meta ? res.meta.changes : 1 });
  }

  // Flyer: upload once, then attach to the event (or this and following).  Body: { mime, full, thumb } base64 (resized on the phone).
  if (path === '/api/admin/flyers' && request.method === 'POST') {
    const s = await requireAdmin(request, env);
    const b = await body(request);
    if (!['image/jpeg', 'image/png'].includes(b.mime)) throw bad('Flyers must be JPG or PNG images');
    const full = b64urlDecode(esc(b.full)), thumb = b64urlDecode(esc(b.thumb));
    if (full.length < 100 || thumb.length < 100) throw bad('The image could not be read');
    if (full.length > 900000) throw bad('The flyer image is too large (max 900 KB after resizing)');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO flyers (id, mime, full, thumb, bytes, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(id, b.mime, full.buffer, thumb.buffer, full.length, s.uid, now()).run();
    return J({ flyerId: id }, 201);
  }
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/flyer$/.exec(path)) && (request.method === 'PUT' || request.method === 'DELETE')) {
    await requireAdmin(request, env);
    const cur = await db.prepare('SELECT id, series_id, starts_at FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    let flyerId = null;
    if (request.method === 'PUT') {
      flyerId = str((await body(request)).flyerId, 60);
      if (!flyerId || !(await db.prepare('SELECT 1 FROM flyers WHERE id = ?1').bind(flyerId).first())) throw bad('Upload the flyer first');
    }
    const sw = scopeWhere(url, cur), n = sw.args.length;
    const res = await db.prepare(`UPDATE events SET flyer_id = ?${n + 1}, updated_at = ?${n + 2} WHERE ${sw.where}`).bind(...sw.args, flyerId, now()).run();
    return J({ ok: true, flyerId, count: res.meta ? res.meta.changes : 1 });
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)\/(cancel|restore|new-code)$/.exec(path)) && request.method === 'POST') {
    const sAdm = await requireAdmin(request, env);
    await logAdmin(env, sAdm, 'event_' + m[2].replace('-', '_'), m[1], url.searchParams.get('scope') || 'this');
    const cur = await db.prepare('SELECT id, series_id, starts_at FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    if (m[2] === 'new-code') await db.prepare('UPDATE events SET checkin_code = ?2, updated_at = ?3 WHERE id = ?1').bind(m[1], code4(), now()).run();
    else {   // cancelled events stay on the calendar, marked Cancelled
      const sw = scopeWhere(url, cur), n = sw.args.length;
      await db.prepare(`UPDATE events SET status = ?${n + 1}, updated_at = ?${n + 2} WHERE ${sw.where}`).bind(...sw.args, m[2] === 'cancel' ? 'cancelled' : 'scheduled', now()).run();
    }
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    if (!e) throw new HttpError(404, 'Event not found');
    return J({ event: publicEvent(e, { signedIn: true, admin: true }) });
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)\/attendees$/.exec(path)) && request.method === 'GET') {
    const sSt = await requireStaff(request, env);
    const hostOnly = sSt.role === 'host';
    const rows = await db.prepare(`SELECT u.id AS userId, u.name, u.email, u.phone, u.sms_ok AS smsOk, u.category, u.provider, r.status AS rsvp, r.updated_at AS rsvpAt,
        COALESCE(r.guests, 0) AS guests, c.checked_in_at AS checkedInAt, c.method, COALESCE(c.guests, 0) AS checkedInGuests,
        v.first_at AS viewedAt, v.views
      FROM users u
      LEFT JOIN event_views v ON v.user_id = u.id AND v.event_id = ?1
      LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?1
      LEFT JOIN checkins c ON c.user_id = u.id AND c.event_id = ?1
      WHERE r.event_id IS NOT NULL OR c.event_id IS NOT NULL
      ORDER BY (c.checked_in_at IS NULL), u.name COLLATE NOCASE`).bind(m[1]).all();
    if (hostOnly) rows.results.forEach((r) => { r.email = null; r.phone = null; r.smsOk = 0; });
    if (url.searchParams.get('purpose')) await logAdmin(env, sSt, 'contact_list', m[1], url.searchParams.get('purpose'));
    if (url.searchParams.get('format') === 'csv') {
      if (hostOnly) throw new HttpError(403, 'Admins only');
      await logAdmin(env, sSt, 'export_csv', m[1], 'attendees');
      const lines = [['name', 'email', 'phone', 'texts_ok', 'category', 'rsvp', 'guests', 'rsvp_at', 'checked_in_at', 'guests_checked_in', 'method']].concat(rows.results.map((r) =>
        [r.name, r.email, r.phone || '', r.smsOk ? 'yes' : 'no', r.category || 'seeker', r.rsvp || '', r.guests || 0, r.rsvpAt ? new Date(r.rsvpAt).toISOString() : '', r.checkedInAt ? new Date(r.checkedInAt).toISOString() : '', r.checkedInAt ? r.checkedInGuests || 0 : '', r.method || '']));
      return new Response('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n',
        { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...cors(request, env) } });
    }
    return J({ attendees: rows.results });
  }

  // Host check-in / undo:  POST|DELETE /api/admin/events/:id/checkin?user=<user id>
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/checkin$/.exec(path)) && (request.method === 'POST' || request.method === 'DELETE')) {
    const s = await requireStaff(request, env);
    let userId = url.searchParams.get('user') || '';
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!ev) throw new HttpError(404, 'Event not found');
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(m[1], userId).run();
    } else {
      let hb = {}; try { hb = await request.json(); } catch {}
      const [a, z] = hostWindowFor(ev), t = now();
      if (t < a) throw bad('Admins can check people in from the start of the event day.');
      if (t > z) throw bad('Check-in for this event closed at the end of the day after the event.');
      if (!userId && hb.email) userId = await personByEmail(db, hb.email, hb.name, hb.phone);
      const u = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(userId).first();
      if (!u) throw new HttpError(404, 'Person not found');
      await checkInUser(db, ev, userId, 'host', t, hb.guests, s.uid);
    }
    await logAdmin(env, s, request.method === 'DELETE' ? 'checkin_undo' : 'checkin', m[1], userId);
    return J({ ok: true });
  }

  // Find registered people by name/email (for manual check-in of walk-ins who registered on the spot)
  if (path === '/api/admin/users' && request.method === 'GET') {
    const sSt = await requireStaff(request, env);
    const q = '%' + (url.searchParams.get('q') || '').trim().toLowerCase() + '%';
    const rows = await db.prepare(`SELECT u.id AS userId, u.name, u.email, u.phone, u.category, u.blocked_at AS blockedAt, u.block_reason AS blockReason, u.created_at AS createdAt, u.last_seen_at AS lastSeenAt,
        (SELECT COUNT(*) FROM checkins c WHERE c.user_id = u.id) AS visits,
        (SELECT MAX(checked_in_at) FROM checkins c WHERE c.user_id = u.id) AS lastVisitAt
      FROM users u WHERE lower(u.name) LIKE ?1 OR lower(u.email) LIKE ?1 OR u.phone LIKE ?2 ORDER BY u.name COLLATE NOCASE LIMIT 30`)
      .bind(q, (() => { const d = (url.searchParams.get('q') || '').replace(/\D/g, '').slice(-10); return d.length >= 4 ? '%' + d + '%' : '\u0000'; })()).all();
    if (sSt.role === 'host') rows.results.forEach((r) => { r.email = null; r.phone = null; r.blockReason = null; });
    return J({ users: rows.results });
  }

  // People admin: set category (seeker ↔ friend; initiate is self-declared but can be corrected) and block / unblock
  if (path === '/api/admin/users' && request.method === 'PATCH') {
    const s = await requireAdmin(request, env);
    const userId = url.searchParams.get('user') || '';
    const u = await loadUser(db, userId);
    if (!u) throw new HttpError(404, 'Person not found');
    if (userId === s.uid) throw bad('You can\u2019t change your own account here');
    const b = await body(request), t = now(), stmts = [];
    if (b.category !== undefined) {
      if (!CATEGORIES.includes(b.category)) throw bad('Category must be seeker, friend or initiate');
      stmts.push(db.prepare('UPDATE users SET category = ?2, category_at = ?3 WHERE id = ?1').bind(userId, b.category, t));
    }
    if (b.blocked !== undefined) {
      if (b.blocked) stmts.push(db.prepare('UPDATE users SET blocked_at = ?2, block_reason = ?3 WHERE id = ?1').bind(userId, t, str(b.reason, 200)));
      else stmts.push(db.prepare('UPDATE users SET blocked_at = NULL, block_reason = NULL WHERE id = ?1').bind(userId));
    }
    if (stmts.length) { await db.batch(stmts); await logAdmin(env, s, 'person_edit', userId, Object.keys(b).filter((k) => k !== 'reason').join(', ')); }
    const row = await loadUser(db, userId);
    return J({ user: { userId: row.id, name: row.name, email: row.email, category: row.category, blockedAt: row.blocked_at, blockReason: row.block_reason } });
  }

  /* ---------------- v0.16: events site + admin site ---------------- */

  // Someone opened an event's details (anyone: a count; signed-in people: who and when)
  if ((m = /^\/api\/events\/([\w-]+)\/view$/.exec(path)) && request.method === 'POST') {
    const s = await readSession(request, env);
    const t = now();
    const stmts = [db.prepare('UPDATE events SET view_count = view_count + 1 WHERE id = ?1').bind(m[1])];
    if (s) stmts.push(db.prepare(`INSERT INTO event_views (event_id, user_id, first_at, last_at, views) VALUES (?1, ?2, ?3, ?3, 1)
      ON CONFLICT(event_id, user_id) DO UPDATE SET last_at = ?3, views = views + 1`).bind(m[1], s.uid, t));
    await db.batch(stmts);
    return J({ ok: true });
  }
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/views$/.exec(path)) && request.method === 'GET') {
    await requireAdmin(request, env);
    const ev = await db.prepare('SELECT view_count FROM events WHERE id = ?1').bind(m[1]).first();
    if (!ev) throw new HttpError(404, 'Event not found');
    const rows = (await db.prepare(`SELECT u.id AS userId, u.name, u.email, v.first_at AS firstAt, v.last_at AS lastAt, v.views, r.status AS rsvp
      FROM event_views v JOIN users u ON u.id = v.user_id LEFT JOIN rsvps r ON r.event_id = v.event_id AND r.user_id = v.user_id
      WHERE v.event_id = ?1 ORDER BY v.last_at DESC LIMIT 500`).bind(m[1]).all()).results;
    return J({ total: ev.view_count || 0, viewers: rows });
  }

  // Admin adds a person to an event (Going or Maybe, with guests); people are found or added by email
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/rsvp$/.exec(path)) && request.method === 'PUT') {
    const s = await requireAdmin(request, env);
    const b = await body(request);
    if (!['going', 'maybe', 'no'].includes(b.status)) throw bad('Status must be going, maybe or no');
    const ev = await db.prepare('SELECT id, title, status FROM events WHERE id = ?1').bind(m[1]).first();
    if (!ev) throw new HttpError(404, 'Event not found');
    if (ev.status === 'cancelled') throw bad('This event was cancelled');
    const uid = b.userId ? str(b.userId, 200) : await personByEmail(db, b.email, b.name, b.phone);
    if (!await db.prepare('SELECT 1 FROM users WHERE id = ?1').bind(uid).first()) throw new HttpError(404, 'Person not found');
    const guests = b.status === 'no' ? 0 : guestsOf(b.guests);
    await db.prepare(`INSERT INTO rsvps (event_id, user_id, status, updated_at, guests) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = ?3, updated_at = ?4, guests = ?5`).bind(ev.id, uid, b.status, now(), guests).run();
    await logAdmin(env, s, 'rsvp_manual', ev.id, uid + ' · ' + b.status + (guests ? ' +' + guests : ''));
    return J({ ok: true, userId: uid });
  }

  // Remove an event completely (only when nobody has responded; otherwise cancel it so people are not left wondering)
  if ((m = /^\/api\/admin\/events\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {
    const s = await requireAdmin(request, env);
    const cur = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    const { where, args } = scopeWhere(url, cur);
    const ids = (await db.prepare(`SELECT id FROM events WHERE ${where}`).bind(...args).all()).results.map((r) => r.id);
    const inList = sqlIn(ids);
    const used = await db.prepare(`SELECT (SELECT COUNT(*) FROM rsvps WHERE event_id IN ${inList}) + (SELECT COUNT(*) FROM checkins WHERE event_id IN ${inList}) AS n`).first();
    if (used.n) throw new HttpError(409, 'People have already responded to this event. Cancel it instead, so they can see it is not happening.');
    await db.batch([
      db.prepare(`DELETE FROM likes WHERE event_id IN ${inList}`), db.prepare(`DELETE FROM messages WHERE event_id IN ${inList}`),
      db.prepare(`DELETE FROM event_views WHERE event_id IN ${inList}`), db.prepare(`DELETE FROM events WHERE id IN ${inList}`)
    ]);
    await logAdmin(env, s, 'event_delete', cur.id, cur.title + (ids.length > 1 ? ' (' + ids.length + ' dates)' : ''));
    return J({ ok: true, deleted: ids.length });
  }

  // Challenges for Meditation Copilot: anyone can read the active ones; admins manage them
  if (path === '/api/challenges' && request.method === 'GET') {
    const rows = (await db.prepare('SELECT * FROM challenges WHERE active = 1 ORDER BY priority, created_at').all()).results;
    return J({ challenges: rows.map(challengeOut) });
  }
  if (path === '/api/admin/challenges' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = (await db.prepare('SELECT * FROM challenges ORDER BY active DESC, priority, created_at').all()).results;
    return J({ challenges: rows.map(challengeOut) });
  }
  if ((path === '/api/admin/challenges' && request.method === 'POST') || ((m = /^\/api\/admin\/challenges\/([\w-]+)$/.exec(path)) && request.method === 'PATCH')) {
    const s = await requireAdmin(request, env);
    const b = await body(request), t = now();
    const c = validateChallenge(b, request.method === 'PATCH');
    if (c.kind === 'education' && !c.material) throw bad('Choose what is read or watched: quote, article, book or video');
    if (request.method === 'POST') {
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO challenges (id, title, description, kind, days, minutes, minutes_choices, ramp_to, target, material, cadence, per_period, item_points,
          audience, points, priority, signup, next_of, active, created_by, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)`).bind(id, c.title, c.description || null, c.kind, c.days ?? 7,
        c.minutes ?? 0, c.minutes_choices || '', c.ramp_to ?? 0, c.target ?? 0, c.material || '', c.cadence || '', c.per_period ?? 0, c.item_points ?? 0,
        c.audience || 'all', c.points ?? 50, c.priority ?? 100, c.signup ?? 0, c.next_of ?? null, c.active ?? 1, s.uid, t).run();
      await logAdmin(env, s, 'challenge_create', id, c.title);
      return J({ challenge: challengeOut(await db.prepare('SELECT * FROM challenges WHERE id = ?1').bind(id).first()) }, 201);
    }
    const keys = Object.keys(c);
    if (keys.length) await db.prepare(`UPDATE challenges SET ${keys.map((k, i) => k + ' = ?' + (i + 2)).join(', ')}, updated_at = ?${keys.length + 2} WHERE id = ?1`).bind(m[1], ...keys.map((k) => c[k]), t).run();
    await logAdmin(env, s, 'challenge_edit', m[1], keys.join(', '));
    const row = await db.prepare('SELECT * FROM challenges WHERE id = ?1').bind(m[1]).first();
    if (!row) throw new HttpError(404, 'Challenge not found');
    return J({ challenge: challengeOut(row) });
  }
  if ((m = /^\/api\/admin\/challenges\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {
    const s = await requireAdmin(request, env);
    await db.prepare('DELETE FROM challenges WHERE id = ?1').bind(m[1]).run();
    await logAdmin(env, s, 'challenge_delete', m[1]);
    return J({ ok: true });
  }

  /* ---- Library (v0.20): approved items for Copilot; admins manage and look up books ---- */
  if (path === '/api/library' && request.method === 'GET') {
    const rows = (await db.prepare("SELECT * FROM library WHERE status = 'approved' ORDER BY kind, pinned DESC, priority, created_at").all()).results;
    return J({ items: rows.map((r) => libraryOut(r)), topics: TOPICS });
  }
  // Anonymous counts (no person, device or address is stored): opened, finished, quiz passed
  if (path === '/api/library/hit' && request.method === 'POST') {
    const b = await body(request), id = str(b.id, 80), action = String(b.action || '');
    if (!id || !['open', 'done', 'pass'].includes(action)) throw bad('Which item and what happened?');
    const ok = await db.prepare("SELECT 1 FROM library WHERE id = ?1 AND status = 'approved'").bind(id).first();
    if (ok) await db.prepare('INSERT INTO library_stats (item_id, action, day, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(item_id, action, day) DO UPDATE SET n = n + 1').bind(id, action, centerDay(now())).run();
    return J({ ok: true });
  }
  if (path === '/api/admin/library' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = (await db.prepare('SELECT * FROM library ORDER BY kind, pinned DESC, priority, created_at').all()).results;
    const st = {}; (await db.prepare('SELECT item_id, action, SUM(n) AS n FROM library_stats GROUP BY item_id, action').all()).results
      .forEach((x) => { (st[x.item_id] = st[x.item_id] || { open: 0, done: 0, pass: 0 })[x.action] = x.n; });
    return J({ items: rows.map((r) => libraryOut(r, true, st[r.id])), topics: TOPICS });
  }
  if (path === '/api/admin/library/lookup' && request.method === 'POST') {
    await requireAdmin(request, env);
    const b = await body(request);
    return J(await lookupBook(b.query || b.url || b.isbn || b.title));
  }
  if ((path === '/api/admin/library' && request.method === 'POST') || ((m = /^\/api\/admin\/library\/([\w-]+)$/.exec(path)) && request.method === 'PATCH')) {
    const s = await requireAdmin(request, env);
    const b = await body(request), t = now(), patch = request.method === 'PATCH';
    if (patch) {
      const cur = await db.prepare('SELECT * FROM library WHERE id = ?1').bind(m[1]).first();
      if (!cur) throw new HttpError(404, 'Item not found');
      const c = validateLibrary(b, true); checkApproval({ ...cur, ...c });
      const keys = Object.keys(c);
      if (keys.length) await db.prepare(`UPDATE library SET ${keys.map((k, i) => k + ' = ?' + (i + 2)).join(', ')}, updated_at = ?${keys.length + 2} WHERE id = ?1`).bind(m[1], ...keys.map((k) => c[k]), t).run();
      await logAdmin(env, s, 'library_edit', m[1], keys.join(', '));
      return J({ item: libraryOut(await db.prepare('SELECT * FROM library WHERE id = ?1').bind(m[1]).first(), true) });
    }
    const c = validateLibrary(b), id = crypto.randomUUID(); checkApproval({ chapters: 0, url: '', ...c });
    await db.prepare(`INSERT INTO library (id, kind, title, author, url, summary, image, isbn, chapters, minutes, status, priority, created_by, created_at, updated_at,
      body, icon, topics, pinned, quiz, pass_mark, retry_minutes)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`).bind(id, c.kind, c.title, c.author || '', c.url || '', c.summary || '', c.image || '', c.isbn || '',
      c.chapters || 0, c.minutes || 0, c.status || 'draft', c.priority ?? 100, s.uid, t, c.body || '', c.icon || '', c.topics || '', c.pinned || 0, c.quiz || '', c.pass_mark || 8, c.retry_minutes ?? 10).run();
    await logAdmin(env, s, 'library_create', id, c.title);
    return J({ item: libraryOut(await db.prepare('SELECT * FROM library WHERE id = ?1').bind(id).first(), true) }, 201);
  }
  if ((m = /^\/api\/admin\/library\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {
    const s = await requireAdmin(request, env);
    await db.prepare('DELETE FROM library WHERE id = ?1').bind(m[1]).run();
    await logAdmin(env, s, 'library_delete', m[1]);
    return J({ ok: true });
  }

  /* ---------------- admin area (v0.15) ---------------- */

  // Hero event on Today: one at a time
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/hero$/.exec(path)) && (request.method === 'POST' || request.method === 'DELETE')) {
    const s = await requireAdmin(request, env);
    const ev = await db.prepare('SELECT id, center_id, title FROM events WHERE id = ?1').bind(m[1]).first();
    if (!ev) throw new HttpError(404, 'Event not found');
    if (request.method === 'POST') {
      await db.batch([
        db.prepare('UPDATE events SET is_hero = 0 WHERE center_id = ?1 AND is_hero = 1').bind(ev.center_id),
        db.prepare('UPDATE events SET is_hero = 1 WHERE id = ?1').bind(ev.id)
      ]);
    } else await db.prepare('UPDATE events SET is_hero = 0 WHERE id = ?1').bind(ev.id).run();
    await logAdmin(env, s, request.method === 'POST' ? 'hero_set' : 'hero_clear', ev.id, ev.title);
    return J({ ok: true, hero: request.method === 'POST' });
  }

  // Analytics from the events server (personal sittings are never on the server)
  if (path === '/api/admin/stats' && request.method === 'GET') {
    await requireAdmin(request, env);
    const t = now(), D = 86400000, dayStart = centerDayStart(t);
    const people = await db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS new7, SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS new30,
        SUM(CASE WHEN last_seen_at >= ?3 THEN 1 ELSE 0 END) AS activeToday, SUM(CASE WHEN last_seen_at >= ?1 THEN 1 ELSE 0 END) AS active7,
        SUM(CASE WHEN last_seen_at >= ?2 THEN 1 ELSE 0 END) AS active30,
        SUM(CASE WHEN category = 'seeker' THEN 1 ELSE 0 END) AS seekers, SUM(CASE WHEN category = 'friend' THEN 1 ELSE 0 END) AS friends,
        SUM(CASE WHEN category = 'initiate' THEN 1 ELSE 0 END) AS initiates, SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
        SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS withPhone, SUM(CASE WHEN sms_ok = 1 THEN 1 ELSE 0 END) AS messagesOk
      FROM users`).bind(t - 7 * D, t - 30 * D, dayStart).first();
    const weeks = (await db.prepare(`SELECT CAST((?1 - created_at) / ?2 AS INTEGER) AS ago, COUNT(*) AS n FROM users WHERE created_at >= ?1 - 8 * ?2 GROUP BY ago`).bind(t, 7 * D).all()).results;
    const signups = Array.from({ length: 8 }, (_, i) => { const w = weeks.find((x) => x.ago === 7 - i); return w ? w.n : 0; });
    const activity = await db.prepare(`SELECT
        (SELECT COUNT(*) FROM rsvps WHERE updated_at >= ?1 AND status = 'going') AS rsvps30,
        (SELECT COUNT(*) FROM checkins WHERE checked_in_at >= ?1) AS checkins30,
        (SELECT COUNT(*) FROM events WHERE starts_at >= ?2 AND status = 'scheduled') AS upcoming,
        (SELECT COUNT(*) FROM messages WHERE created_at >= ?1 AND deleted_at IS NULL) AS messages30,
        (SELECT COUNT(*) FROM buddies WHERE status = 'accepted') AS buddyPairs,
        (SELECT ROUND(AVG(rating), 1) FROM feedback WHERE kind = 'rating') AS rating,
        (SELECT COUNT(*) FROM feedback WHERE created_at >= ?1) AS feedback30`).bind(t - 30 * D, t).first();
    const recent = (await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.starts_at < ?1 AND e.starts_at >= ?2 AND e.status = 'scheduled' ORDER BY e.starts_at DESC LIMIT 12`).bind(t, t - 120 * D).all()).results
      .map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, format: e.format, going: e.going || 0, checkedIn: e.checked_in || 0 }));
    const points = await db.prepare(`SELECT COUNT(*) AS n, ROUND(AVG(points)) AS avg, MAX(points) AS max FROM users WHERE points_at >= ?1`).bind(t - 30 * D).first();
    return J({ people, signups, activity, recent, points, presence: await presenceCounts(db), at: t });
  }

  // One person: contact, reward points, event history (viewing is logged)
  if ((m = /^\/api\/admin\/users\/([^/]+)$/.exec(path)) && request.method === 'GET') {
    const s = await requireAdmin(request, env);
    const uid = decodeURIComponent(m[1]);
    const u = await loadUser(db, uid);
    if (!u) throw new HttpError(404, 'Person not found');
    const history = (await db.prepare(`SELECT e.id, e.title, e.starts_at AS startsAt, e.format, e.status, r.status AS rsvp, r.updated_at AS rsvpAt, c.checked_in_at AS checkedInAt, c.method
      FROM events e LEFT JOIN rsvps r ON r.event_id = e.id AND r.user_id = ?1 LEFT JOIN checkins c ON c.event_id = e.id AND c.user_id = ?1
      WHERE r.user_id IS NOT NULL OR c.user_id IS NOT NULL ORDER BY e.starts_at DESC LIMIT 200`).bind(uid).all()).results;
    const extra = await db.prepare(`SELECT (SELECT COUNT(*) FROM messages WHERE user_id = ?1 AND deleted_at IS NULL) AS messages,
        (SELECT COUNT(*) FROM feedback WHERE user_id = ?1) AS feedback,
        (SELECT COUNT(*) FROM buddies WHERE status = 'accepted' AND (inviter_id = ?1 OR invitee_id = ?1)) AS buddies`).bind(uid).first();
    await logAdmin(env, s, 'person_view', uid, u.name);
    return J({ person: { userId: u.id, name: u.name, email: u.email, phone: u.phone || null, smsOk: !!u.sms_ok, provider: u.provider,
      category: u.category, createdAt: u.created_at, lastSeenAt: u.last_seen_at, blockedAt: u.blocked_at, blockReason: u.block_reason,
      points: u.points, pointsLevel: u.points_level, pointsAt: u.points_at, role: await roleOf(env, u.email), ...extra }, history });
  }

  /* ---------------- v0.17: Seeker Relationship Management (admins only) ---------------- */
  const pubJ = (r) => ({ userId: r.userId, name: r.name, providerName: r.nameEdited && r.providerName !== r.name ? r.providerName : null, email: r.email, phone: r.phone || null, zip: r.zip || null,
    category: r.category, level: r.level, stage: r.stage, computed: r.computed, status: r.status, sevadar: !!r.sevadar, passiveReason: r.passiveReason || null, declined: !!r.declinedAt,
    override: r.override || null, drifting: r.drifting, visits: r.visits, firstVisitAt: r.firstVisitAt, lastVisitAt: r.lastVisitAt, guestsBrought: r.guestsBrought,
    intros: r.intros, workshops: r.workshops, workshops90: r.workshops90, satsangs: r.satsangs, satsangs90: r.satsangs90, darshans: r.darshans, retreats: r.retreats,
    challenges: r.challenges, orientationDone: r.orientationDone, orientation: ORIENTATION,
    rsvps: r.rsvps, viewed: r.viewed, milestones: r.milestones, mentorId: r.mentorId || null, mentorName: r.mentorName || null,
    createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, blocked: !!r.blockedAt });

  // Journey overview: how many people at each level, who is drifting; optional filtered list
  if (path === '/api/admin/journey' && request.method === 'GET') {
    await requireAdmin(request, env);
    const t = now(), rows = (await journeyRows(db, t)).filter((r) => !r.blockedAt);
    const counts = Object.fromEntries(STAGES.map((k) => [k, 0])), statusCounts = Object.fromEntries(STATUSES.map((k) => [k, 0]));
    rows.forEach((r) => { counts[r.level]++; if (r.status) statusCounts[r.status]++; });
    const monthStart = (() => { const d = centerDayStart(t); const dt = new Date(d + 12 * 3600000); return d - (Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', day: 'numeric' }).format(dt)) - 1) * DAY_MS; })();
    const lv = url.searchParams.get('level') || url.searchParams.get('stage') || '', st = url.searchParams.get('status') || '', q = (url.searchParams.get('q') || '').trim().toLowerCase(),
      dr = url.searchParams.get('drifting') === '1', nm = url.searchParams.get('nomentor') === '1', sv = url.searchParams.get('sevadar') === '1';
    let list = rows;
    if (STAGES.includes(lv)) list = list.filter((r) => r.level === lv);
    if (STATUSES.includes(st)) list = list.filter((r) => r.status === st);
    if (sv) list = list.filter((r) => r.sevadar);
    if (dr) list = list.filter((r) => r.drifting);
    if (nm) list = list.filter((r) => !r.mentorId && r.level !== 'initiate');
    if (q) list = list.filter((r) => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || (r.providerName || '').toLowerCase().includes(q) || (r.zip || '') === q);
    list.sort((a, b) => (b.lastVisitAt || b.createdAt || 0) - (a.lastVisitAt || a.createdAt || 0));
    return J({ counts, statusCounts, total: rows.length, drifting: rows.filter((r) => r.drifting).length, sevadars: rows.filter((r) => r.sevadar).length,
      firstVisitsThisMonth: rows.filter((r) => r.firstVisitAt >= monthStart).length,
      noMentor: rows.filter((r) => !r.mentorId && r.visits >= 2 && r.level !== 'initiate').length,
      people: list.slice(0, 500).map(pubJ), at: t });
  }

  // One person's journey: signals, milestones, mentor, notes and a timeline of everything they did
  if ((m = /^\/api\/admin\/users\/([^/]+)\/journey$/.exec(path)) && request.method === 'GET') {
    await requireAdmin(request, env);
    const uid = decodeURIComponent(m[1]), t = now();
    const r = (await journeyRows(db, t, uid))[0];
    if (!r) throw new HttpError(404, 'Person not found');
    const ms = (await db.prepare('SELECT kind, at, by_email AS byEmail FROM milestones WHERE user_id = ?1').bind(uid).all()).results;
    const notes = (await db.prepare('SELECT id, body, by_email AS byEmail, at FROM person_notes WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY at DESC LIMIT 100').bind(uid).all()).results;
    const ev = (sql) => db.prepare(sql).bind(uid).all().then((x) => x.results);
    const [views, rsvps, checks, shares] = await Promise.all([
      ev(`SELECT v.first_at AS at, v.views, e.id AS eventId, e.title, e.kind, e.starts_at AS startsAt FROM event_views v JOIN events e ON e.id = v.event_id WHERE v.user_id = ?1`),
      ev(`SELECT r.updated_at AS at, r.status, r.guests, e.id AS eventId, e.title, e.kind, e.starts_at AS startsAt FROM rsvps r JOIN events e ON e.id = r.event_id WHERE r.user_id = ?1`),
      ev(`SELECT c.checked_in_at AS at, c.method, c.guests, e.id AS eventId, e.title, e.kind, e.starts_at AS startsAt FROM checkins c JOIN events e ON e.id = c.event_id WHERE c.user_id = ?1`),
      ev(`SELECT at, title, finished_on AS finishedOn FROM challenge_shares WHERE user_id = ?1`)]);
    const timeline = [{ type: 'joined', at: r.createdAt }]
      .concat(views.map((x) => ({ type: 'viewed', ...x })), rsvps.map((x) => ({ type: 'rsvp', ...x })), checks.map((x) => ({ type: 'checkin', ...x })), shares.map((x) => ({ type: 'challenge', ...x })),
        ms.map((x) => ({ type: 'milestone', kind: x.kind, at: x.at, byEmail: x.byEmail })))
      .filter((x) => x.at).sort((a, b) => b.at - a.at).slice(0, 300);
    return J({ journey: { ...pubJ(r), milestoneDetail: ms }, notes, timeline });
  }

  // Set level override, mentor or a milestone
  if ((m = /^\/api\/admin\/users\/([^/]+)\/journey$/.exec(path)) && request.method === 'PATCH') {
    const s = await requireAdmin(request, env);
    const uid = decodeURIComponent(m[1]), b = await body(request), t = now(), stmts = [], what = [];
    if (!(await loadUser(db, uid))) throw new HttpError(404, 'Person not found');
    const stage = b.stage !== undefined ? b.stage : b.level;
    if (stage !== undefined) {
      // Satsangi and Initiate are the person's category (they decide which events they see); the others are a hand-set stage
      if (stage !== null && !STAGES.includes(stage)) throw bad('Stage must be one of: ' + STAGES.join(', '));
      const cat = stage === 'satsangi' ? 'friend' : stage === 'initiate' ? 'initiate' : 'seeker';
      stmts.push(db.prepare('UPDATE users SET category = ?2, category_at = ?3 WHERE id = ?1 AND category != ?2').bind(uid, cat, t));
      stmts.push(db.prepare('UPDATE users SET journey_level = ?2, journey_set_by = ?3, journey_set_at = ?4 WHERE id = ?1').bind(uid, SET_STAGES.includes(stage) ? stage : null, s.email, t));
      what.push('stage ' + (stage || 'auto'));
    }
    if (b.passive !== undefined) {
      const reason = b.passive ? str(b.passiveReason || '', 200) : null;
      stmts.push(db.prepare('UPDATE users SET passive_at = ?2, passive_reason = ?3 WHERE id = ?1').bind(uid, b.passive ? t : null, reason)); what.push(b.passive ? 'passive' : 'not passive');
    }
    if (b.sevadar !== undefined) { stmts.push(db.prepare('UPDATE users SET sevadar = ?2 WHERE id = ?1').bind(uid, b.sevadar ? 1 : 0)); what.push(b.sevadar ? 'sevadar' : 'not sevadar'); }
    if (b.declined !== undefined) {   // e.g. they asked in person or by email to receive nothing
      stmts.push(db.prepare('UPDATE users SET declined_at = ?2, sms_ok = CASE WHEN ?2 IS NULL THEN sms_ok ELSE 0 END WHERE id = ?1').bind(uid, b.declined ? t : null)); what.push(b.declined ? 'declined' : 'not declined');
    }
    if (b.mentorId !== undefined) {
      if (b.mentorId !== null) { if (b.mentorId === uid) throw bad('A person can’t be their own mentor'); if (!(await loadUser(db, b.mentorId))) throw bad('Mentor not found'); }
      stmts.push(db.prepare('UPDATE users SET mentor_id = ?2 WHERE id = ?1').bind(uid, b.mentorId)); what.push('mentor');
    }
    if (b.milestone !== undefined) {
      if (!MILESTONES.includes(b.milestone)) throw bad('Milestone must be one of: ' + MILESTONES.join(', '));
      stmts.push(b.done ? db.prepare('INSERT OR REPLACE INTO milestones (user_id, kind, at, by_email) VALUES (?1, ?2, ?3, ?4)').bind(uid, b.milestone, t, s.email)
        : db.prepare('DELETE FROM milestones WHERE user_id = ?1 AND kind = ?2').bind(uid, b.milestone));
      what.push(b.milestone + (b.done ? '' : ' (removed)'));
    }
    if (stmts.length) { await db.batch(stmts); await logAdmin(env, s, 'journey_edit', uid, what.join(', ')); }
    const r = (await journeyRows(db, t, uid))[0];
    return J({ journey: pubJ(r) });
  }

  // Notes (short, never sensitive)
  if ((m = /^\/api\/admin\/users\/([^/]+)\/notes$/.exec(path)) && request.method === 'POST') {
    const s = await requireAdmin(request, env);
    const uid = decodeURIComponent(m[1]), b = await body(request), txt = str(b.body, 500);
    if (!txt) throw bad('Write a note first');
    if (!(await loadUser(db, uid))) throw new HttpError(404, 'Person not found');
    const id = crypto.randomUUID(), t = now();
    await db.prepare('INSERT INTO person_notes (id, user_id, body, by_email, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, uid, txt, s.email, t).run();
    await logAdmin(env, s, 'note_add', uid, null);
    return J({ note: { id, body: txt, byEmail: s.email, at: t } });
  }
  if ((m = /^\/api\/admin\/notes\/([\w-]+)$/.exec(path)) && request.method === 'DELETE') {
    const s = await requireAdmin(request, env);
    const n = await db.prepare('SELECT user_id FROM person_notes WHERE id = ?1 AND deleted_at IS NULL').bind(m[1]).first();
    if (!n) throw new HttpError(404, 'Note not found');
    await db.prepare('UPDATE person_notes SET deleted_at = ?2 WHERE id = ?1').bind(m[1], now()).run();
    await logAdmin(env, s, 'note_delete', n.user_id, null);
    return J({ ok: true });
  }

  // Follow-ups: who to reach out to, worked out from what people did; handled ones drop off
  if (path === '/api/admin/followups' && request.method === 'GET') {
    await requireAdmin(request, env);
    const t = now(), rows = (await journeyRows(db, t)).filter((r) => !r.blockedAt), by = Object.fromEntries(rows.map((r) => [r.userId, r]));
    const handled = new Set((await db.prepare('SELECT user_id, kind, ref FROM followups').all()).results.map((x) => x.user_id + '|' + x.kind + '|' + x.ref));
    const items = [];
    const add = (kind, ref, uid, extra) => { const r = by[uid]; if (!r || handled.has(uid + '|' + kind + '|' + ref)) return;
      items.push({ kind, ref: String(ref), userId: uid, name: r.name, email: r.email, phone: r.phone || null, level: r.level, status: r.status, visits: r.visits, lastVisitAt: r.lastVisitAt, mentorName: r.mentorName || null,
        workshops: r.workshops, challenges: r.challenges, satsangs90: r.satsangs90, ...extra }); };
    // 1. First visit in the last 14 days → thank them
    (await db.prepare(`SELECT c.user_id, c.event_id, c.checked_in_at, e.title, e.kind FROM checkins c JOIN events e ON e.id = c.event_id
        WHERE c.checked_in_at >= ?1 AND c.checked_in_at = (SELECT MIN(c2.checked_in_at) FROM checkins c2 WHERE c2.user_id = c.user_id)`).bind(t - 14 * DAY_MS).all()).results
      .forEach((x) => add('first_visit', x.event_id, x.user_id, { eventId: x.event_id, eventTitle: x.title, at: x.checked_in_at }));
    // 2. Said Going but didn't come (events that ended in the last 14 days)
    (await db.prepare(`SELECT r.user_id, e.id AS event_id, e.title, e.starts_at FROM rsvps r JOIN events e ON e.id = r.event_id
        LEFT JOIN checkins c ON c.event_id = r.event_id AND c.user_id = r.user_id
        WHERE r.status = 'going' AND c.user_id IS NULL AND e.status != 'cancelled' AND e.ends_at < ?1 AND e.ends_at >= ?2`).bind(t, t - 14 * DAY_MS).all()).results
      .forEach((x) => add('no_show', x.event_id, x.user_id, { eventId: x.event_id, eventTitle: x.title, at: x.starts_at }));
    rows.forEach((r) => {
      // 3. Drifted: came 2+ times, nothing for 60 days to 12 months (Passive and Declined people are left alone)
      if (r.status === 'drifted' && r.visits >= 2) add('drifting', r.lastVisitAt, r.userId, { at: r.lastVisitAt });
      // 4. Finished the Seeker orientation (5 workshops, 2 challenges) → congratulate, talk about satsang
      if (r.level === 'seeker' && r.orientationDone && r.status === 'active') add('orientation', '', r.userId, { at: r.lastVisitAt });
      // 5. Comes to satsang regularly but isn't flagged Satsangi yet → an admin decides
      if (r.level === 'seeker' && r.satsangs90 >= SATSANGI_HINT) add('satsangi', '', r.userId, { at: r.lastVisitAt });
      // 6. Coming regularly but has no mentor yet
      if (r.visits >= 2 && !r.mentorId && r.level !== 'initiate' && r.status === 'active') add('mentor', '', r.userId, { at: r.lastVisitAt });
    });
    for (let i = items.length - 1; i >= 0; i--) { const r = by[items[i].userId]; if (r.declinedAt || (r.passiveAt && items[i].kind !== 'first_visit')) items.splice(i, 1); }
    const order = { first_visit: 0, no_show: 1, orientation: 2, satsangi: 3, mentor: 4, drifting: 5 };
    items.sort((a, b) => order[a.kind] - order[b.kind] || (b.at || 0) - (a.at || 0));
    const counts = {}; items.forEach((x) => { counts[x.kind] = (counts[x.kind] || 0) + 1; });
    return J({ items, counts, at: t });
  }
  if (path === '/api/admin/followups' && (request.method === 'POST' || request.method === 'DELETE')) {
    const s = await requireAdmin(request, env);
    const b = request.method === 'POST' ? await body(request) : { userId: url.searchParams.get('userId'), kind: url.searchParams.get('kind'), ref: url.searchParams.get('ref') };
    const kinds = ['first_visit', 'no_show', 'drifting', 'orientation', 'satsangi', 'mentor', 'level_up'];
    if (!kinds.includes(b.kind) || !b.userId) throw bad('Unknown follow-up');
    const ref = str(b.ref == null ? '' : String(b.ref), 100) || '';
    if (request.method === 'DELETE') { await db.prepare('DELETE FROM followups WHERE user_id = ?1 AND kind = ?2 AND ref = ?3').bind(b.userId, b.kind, ref).run(); return J({ ok: true }); }
    const st = b.status === 'skipped' ? 'skipped' : 'done';
    await db.prepare('INSERT OR REPLACE INTO followups (user_id, kind, ref, status, at, by_email) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(b.userId, b.kind, ref, st, now(), s.email).run();
    await logAdmin(env, s, 'followup_' + st, b.userId, b.kind);
    return J({ ok: true });
  }

  // Event insight: opened → RSVP → came, first-timers, came back within 30 days, who came by level
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/insight$/.exec(path)) && request.method === 'GET') {
    await requireAdmin(request, env);
    const e = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e) throw new HttpError(404, 'Event not found');
    const t = now();
    const one = (sql, ...a) => db.prepare(sql).bind(m[1], ...a).first();
    const f = await one(`SELECT (SELECT COUNT(*) FROM event_views WHERE event_id = ?1) AS viewers,
        (SELECT COALESCE(SUM(views), 0) FROM event_views WHERE event_id = ?1) AS views,
        (SELECT COUNT(*) FROM rsvps WHERE event_id = ?1 AND status = 'going') AS going,
        (SELECT COUNT(*) FROM rsvps WHERE event_id = ?1 AND status = 'maybe') AS maybe,
        (SELECT COUNT(*) FROM rsvps WHERE event_id = ?1 AND status = 'no') AS cant,
        (SELECT COUNT(*) FROM checkins WHERE event_id = ?1) AS came,
        (SELECT COALESCE(SUM(guests), 0) FROM checkins WHERE event_id = ?1) AS guests,
        (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = ?1 AND r.status = 'going' AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.event_id = ?1 AND c.user_id = r.user_id)) AS noShows,
        (SELECT COUNT(*) FROM checkins c WHERE c.event_id = ?1 AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.event_id = ?1 AND r.user_id = c.user_id AND r.status IN ('going','maybe'))) AS walkIns,
        (SELECT COUNT(*) FROM checkins c WHERE c.event_id = ?1 AND NOT EXISTS (SELECT 1 FROM checkins c2 WHERE c2.user_id = c.user_id AND c2.checked_in_at < c.checked_in_at)) AS firstTimers,
        (SELECT COUNT(DISTINCT c.user_id) FROM checkins c WHERE c.event_id = ?1 AND EXISTS (SELECT 1 FROM checkins c2 JOIN events e2 ON e2.id = c2.event_id
            WHERE c2.user_id = c.user_id AND e2.id != ?1 AND e2.starts_at > ?2 AND e2.starts_at <= ?2 + 30 * 86400000)) AS returned30`, e.starts_at);
    const attendees = new Set((await db.prepare('SELECT user_id FROM checkins WHERE event_id = ?1').bind(m[1]).all()).results.map((x) => x.user_id));
    const byLevel = Object.fromEntries(STAGES.map((k) => [k, 0]));
    if (attendees.size) (await journeyRows(db, t)).forEach((r) => { if (attendees.has(r.userId)) byLevel[r.level]++; });
    return J({ insight: { ...f, byLevel, kind: e.kind, access: e.access, ended: e.ends_at < t, returnWindowOpen: t < e.starts_at + 30 * DAY_MS } });
  }

  // Team (owner only): admins and hosts
  if (path === '/api/admin/staff' && request.method === 'GET') {
    const s = await requireAdmin(request, env);
    const rows = (await db.prepare(`SELECT s.email, s.role, s.added_at AS addedAt, u.name, u.last_seen_at AS lastSeenAt FROM staff s LEFT JOIN users u ON lower(u.email) = s.email ORDER BY s.role, s.email`).all()).results;
    const owners = (env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    return J({ owners, staff: rows, canEdit: s.role === 'owner' });
  }
  if (path === '/api/admin/staff' && request.method === 'POST') {
    const s = await requireOwner(request, env);
    const b = await body(request);
    const email = esc(b.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address.');
    if (!['admin', 'host'].includes(b.role)) throw bad('Role must be admin or host');
    if ((await roleOf(env, email)) === 'owner') throw bad('That person is already an owner.');
    await db.prepare(`INSERT INTO staff (email, role, added_by, added_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(email) DO UPDATE SET role = ?2, added_by = ?3, added_at = ?4`).bind(email, b.role, s.uid, now()).run();
    await logAdmin(env, s, 'team_add', email, b.role);
    return J({ ok: true });
  }
  if (path === '/api/admin/staff' && request.method === 'DELETE') {
    const s = await requireOwner(request, env);
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    await db.prepare('DELETE FROM staff WHERE email = ?1').bind(email).run();
    await logAdmin(env, s, 'team_remove', email);
    return J({ ok: true });
  }

  // Activity log: read (admins); the app also reports actions done outside the server (opening an email to RSVPs)
  if (path === '/api/admin/log' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = (await db.prepare('SELECT id, at, by_email AS byEmail, action, target, detail FROM admin_log ORDER BY at DESC LIMIT 300').all()).results;
    return J({ log: rows });
  }
  if (path === '/api/admin/log' && request.method === 'POST') {
    const s = await requireStaff(request, env);
    const b = await body(request);
    const action = esc(b.action);
    if (!['email_rsvps', 'copy_emails', 'whatsapp_demo', 'invite_email', 'invite_copy'].includes(action)) throw bad('Unknown action');
    await logAdmin(env, s, action, str(b.target, 100), str(b.detail, 300));
    return J({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

// For unit tests (tests/unit). Not used by the Worker runtime.
export { calcJourney, calcStage, calcStatus, validateChallenge, challengeOut, validateEvent, centerDayStart, windowFor, validateLibrary, validateQuiz, checkApproval, libraryOut, TOPICS, bookRef, fromGoogleBooks, fromOpenLibrary };
