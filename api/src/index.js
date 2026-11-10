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
 *   ADMIN_EMAILS        secret  — comma-separated admin emails (wrangler secret put ADMIN_EMAILS)
 *
 * Sign-in: the app sends the Google access token or Microsoft ID token it already has; we verify it
 * with Google / Microsoft, then issue our own signed session token (30 days). No passwords stored.
 */

const SESSION_DAYS = 30;
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
function isAdmin(env, email) {
  if (!email) return false;
  return (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
async function requireUser(request, env) {
  const s = await readSession(request, env);
  if (!s) throw new HttpError(401, 'Please sign in');
  return s;
}
async function requireAdmin(request, env) {
  const s = await requireUser(request, env);
  if (!isAdmin(env, s.email)) throw new HttpError(403, 'Admins only');
  return s;
}

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

/* ---------------- events helpers ---------------- */
function windowFor(ev, method) {
  if (method === 'online') return [ev.starts_at - 15 * MIN, ev.ends_at];
  return [ev.starts_at - 30 * MIN, ev.ends_at + 30 * MIN];
}
function publicEvent(ev, opts = {}) {
  const out = {
    id: ev.id, centerId: ev.center_id, title: ev.title, description: ev.description, format: ev.format,
    venue: ev.venue, address: ev.address, startsAt: ev.starts_at, endsAt: ev.ends_at, timezone: ev.timezone,
    visibility: ev.visibility, status: ev.status, going: ev.going || 0, checkedIn: ev.checked_in || 0,
    seriesId: ev.series_id || null, repeats: ev.series_freq || null
  };
  if (opts.signedIn) out.onlineUrl = ev.online_url || null;
  if (opts.admin) out.checkinCode = ev.checkin_code;
  if (opts.myRsvp !== undefined) out.myRsvp = opts.myRsvp;
  if (opts.myCheckin !== undefined) out.myCheckin = opts.myCheckin;
  return out;
}
const EVENT_COLS = `e.*, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
  (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) AS checked_in,
  (SELECT freq FROM series sr WHERE sr.id = e.series_id) AS series_freq`;
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
  return { email: u.email, phone: u.phone || null, smsOk: !!u.sms_ok, confirmedAt: u.contact_ack_at || null };
}
// RSVP and check-in need the contact details confirmed once (shows the notice; email is required, phone optional)
async function requireContact(db, uid) {
  const u = await db.prepare('SELECT contact_ack_at FROM users WHERE id = ?1').bind(uid).first();
  if (!u || !u.contact_ack_at) throw new HttpError(428, 'Please confirm your contact details first.');
}
async function checkInUser(db, e, uid, method, t) {
  const existing = await db.prepare('SELECT checked_in_at FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(e.id, uid).first();
  if (!existing) {
    await db.batch([
      db.prepare('INSERT INTO checkins (event_id, user_id, method, checked_in_at) VALUES (?1, ?2, ?3, ?4)').bind(e.id, uid, method, t),
      db.prepare(`INSERT INTO rsvps (event_id, user_id, status, updated_at) VALUES (?1, ?2, 'going', ?3)
        ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'going', updated_at = ?3`).bind(e.id, uid, t)
    ]);
  }
  return existing;
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
  if (b.visibility !== undefined) { if (!['public', 'members'].includes(b.visibility)) throw bad('Visibility must be public or members'); o.visibility = b.visibility; }
  return o;
}
const code4 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
function csvCell(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ---------------- router ---------------- */
async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const db = env.DB;
  const J = (b, s) => json(request, env, b, s);
  let m;

  if (path === '/api/health') return J({ ok: true, time: now() });

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
    await db.prepare(`INSERT INTO users (id, provider, email, name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(id) DO UPDATE SET email = ?3, name = ?4, last_seen_at = ?5`).bind(u.id, u.provider, u.email, u.name, t).run();
    const token = await signSession(env, { uid: u.id, email: u.email, name: u.name, exp: t + SESSION_DAYS * 86400000 });
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(u.id).first();
    return J({ token, user: { id: u.id, email: u.email, name: u.name, isAdmin: isAdmin(env, u.email) }, contact: contactOf(row) });
  }

  if (path === '/api/me' && request.method === 'GET') {
    const s = await requireUser(request, env);
    const rows = await db.prepare(`SELECT c.event_id AS eventId, c.method, c.checked_in_at AS checkedInAt, e.format, e.title, e.starts_at AS startsAt
      FROM checkins c JOIN events e ON e.id = c.event_id WHERE c.user_id = ?1 ORDER BY c.checked_in_at`).bind(s.uid).all();
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    return J({ user: { id: s.uid, email: s.email, name: s.name, isAdmin: isAdmin(env, s.email) }, contact: row ? contactOf(row) : null, checkins: rows.results });
  }

  // Contact details: email comes from sign-in (required); phone and text reminders are optional
  if (path === '/api/me/contact' && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const b = await body(request);
    const phone = normPhone(b.phone);
    const smsOk = !!b.smsOk;
    if (smsOk && !phone) throw bad('Add a phone number to get text reminders.');
    const u = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    if (!u) throw new HttpError(404, 'Please sign in again');
    const t = now();
    const consentAt = smsOk ? (u.sms_ok && u.phone === phone ? u.sms_consent_at : t) : null;
    await db.prepare('UPDATE users SET phone = ?2, sms_ok = ?3, sms_consent_at = ?4, contact_ack_at = ?5 WHERE id = ?1')
      .bind(s.uid, phone, smsOk ? 1 : 0, consentAt, u.contact_ack_at || t).run();
    const row = await db.prepare('SELECT * FROM users WHERE id = ?1').bind(s.uid).first();
    return J({ contact: contactOf(row) });
  }

  if (path === '/api/me/name' && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const name = str((await body(request)).name, 80);
    if (!name) throw bad('Name is required');
    await db.prepare('UPDATE users SET name = ?2 WHERE id = ?1').bind(s.uid, name).run();
    const token = await signSession(env, { ...s, name });
    return J({ ok: true, token });
  }

  /* ---- public: list and view events ---- */
  if (path === '/api/events' && request.method === 'GET') {
    const s = await readSession(request, env);
    const from = Number(url.searchParams.get('from')) || now() - 86400000;
    const to = Number(url.searchParams.get('to')) || now() + 120 * 86400000;
    const vis = s ? "('public','members')" : "('public')";
    const rows = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.ends_at >= ?1 AND e.starts_at <= ?2 AND e.visibility IN ${vis} ORDER BY e.starts_at LIMIT 200`).bind(from, to).all();
    let mine = {}, myCk = {};
    if (s) {
      (await db.prepare('SELECT event_id, status FROM rsvps WHERE user_id = ?1').bind(s.uid).all()).results.forEach((r) => { mine[r.event_id] = r.status; });
      (await db.prepare('SELECT event_id, checked_in_at FROM checkins WHERE user_id = ?1').bind(s.uid).all()).results.forEach((r) => { myCk[r.event_id] = r.checked_in_at; });
    }
    const admin = s && isAdmin(env, s.email);
    return J({ events: rows.results.map((e) => publicEvent(e, { signedIn: !!s, admin, myRsvp: s ? mine[e.id] || null : undefined, myCheckin: s ? myCk[e.id] || null : undefined })) });
  }

  if ((m = /^\/api\/events\/([\w-]+)$/.exec(path)) && request.method === 'GET') {
    const s = await readSession(request, env);
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    if (!e || (e.visibility === 'members' && !s)) throw new HttpError(404, 'Event not found');
    let myRsvp, myCheckin;
    if (s) {
      myRsvp = (await db.prepare('SELECT status FROM rsvps WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first())?.status || null;
      myCheckin = (await db.prepare('SELECT checked_in_at FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(e.id, s.uid).first())?.checked_in_at || null;
    }
    return J({ event: publicEvent(e, { signedIn: !!s, admin: s && isAdmin(env, s.email), myRsvp, myCheckin }) });
  }

  /* ---- members: RSVP and check in ---- */
  if ((m = /^\/api\/events\/([\w-]+)\/rsvp$/.exec(path)) && request.method === 'PUT') {
    const s = await requireUser(request, env);
    const st = (await body(request)).status;
    if (!['going', 'maybe', 'no'].includes(st)) throw bad('Status must be going, maybe or no');
    await requireContact(db, s.uid);
    const e = await db.prepare('SELECT id, status, ends_at FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e) throw new HttpError(404, 'Event not found');
    if (e.status === 'cancelled') throw bad('This event was cancelled');
    if (e.ends_at < now()) throw bad('This event has ended');
    await db.prepare(`INSERT INTO rsvps (event_id, user_id, status, updated_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(event_id, user_id) DO UPDATE SET status = ?3, updated_at = ?4`).bind(e.id, s.uid, st, now()).run();
    return J({ ok: true, status: st });
  }

  if ((m = /^\/api\/events\/([\w-]+)\/checkin$/.exec(path)) && request.method === 'POST') {
    const s = await requireUser(request, env);
    const b = await body(request);
    const method = b.method;
    if (!['code', 'qr', 'online'].includes(method)) throw bad('Unknown check-in method');
    const e = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!e) throw new HttpError(404, 'Event not found');
    if (e.status === 'cancelled') throw bad('This event was cancelled');
    if (method === 'online' && e.format === 'in_person') throw bad('This is an in-person event. Please use the code at the venue.');
    if (method !== 'online' && e.format === 'online') throw bad('This is an online event. Tap Join to check in.');
    const [a, z] = windowFor(e, method), t = now();
    if (t < a) throw bad(method === 'online' ? 'Check-in opens 15 minutes before the start.' : 'Check-in opens 30 minutes before the start.');
    if (t > z) throw bad('Check-in for this event has closed.');
    if (method !== 'online' && String(b.code || '').trim() !== e.checkin_code) throw bad('That check-in code is not correct.');
    await requireContact(db, s.uid);
    const existing = await checkInUser(db, e, s.uid, method, t);
    return J({ ok: true, checkedInAt: existing ? existing.checked_in_at : t, already: !!existing, format: e.format, onlineUrl: method === 'online' ? e.online_url : undefined });
  }

  /* ---- center QR (printed poster): check in to whichever in-person event is open now ---- */
  if ((m = /^\/api\/centers\/([\w-]+)\/checkin$/.exec(path)) && request.method === 'POST') {
    const s = await requireUser(request, env);
    const b = await body(request);
    const t = now();
    const open = (await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.center_id = ?1 AND e.status = 'scheduled'
      AND e.format IN ('in_person', 'hybrid') AND e.starts_at - ?3 <= ?2 AND e.ends_at + ?3 >= ?2 ORDER BY e.starts_at`).bind(m[1], t, 30 * MIN).all()).results;
    if (!open.length) {
      const next = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.center_id = ?1 AND e.status = 'scheduled' AND e.format IN ('in_person', 'hybrid')
        AND e.starts_at > ?2 AND e.visibility = 'public' ORDER BY e.starts_at LIMIT 1`).bind(m[1], t).first();
      return J({ open: false, next: next ? publicEvent(next, {}) : null });
    }
    let e = open.length === 1 ? open[0] : open.find((x) => x.id === b.eventId);
    if (!e) return J({ open: true, choose: open.map((x) => publicEvent(x, {})) });
    await requireContact(db, s.uid);
    const existing = await checkInUser(db, e, s.uid, 'qr', t);
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
    const ins = db.prepare(`INSERT INTO events (id, center_id, title, description, format, venue, address, online_url, starts_at, ends_at, timezone, visibility, status, checkin_code, created_by, created_at, updated_at, series_id)
      VALUES (?1, 'mpls', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'scheduled', ?12, ?13, ?14, ?14, ?15)`);
    const ids = occ.map(() => crypto.randomUUID());
    const stmts = occ.map((x, i) => ins.bind(ids[i], o.title, o.description || null, o.format, o.venue || null, o.address || null, o.online_url || null,
      x.startsAt, x.endsAt, o.timezone || 'America/Chicago', o.visibility || 'public', code4(), s.uid, t, seriesId));
    if (seriesId) stmts.unshift(db.prepare('INSERT INTO series (id, center_id, freq, until_at, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(seriesId, 'mpls', b.repeat.freq, occ[occ.length - 1].startsAt, s.uid, t));
    await db.batch(stmts);
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(ids[0]).first();
    return J({ event: publicEvent(e, { signedIn: true, admin: true }), count: ids.length }, 201);
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)$/.exec(path)) && request.method === 'PATCH') {
    await requireAdmin(request, env);
    const o = validateEvent(await body(request), true);
    const cur = await db.prepare('SELECT * FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    const future = url.searchParams.get('scope') === 'future' && cur.series_id;
    const st = o.starts_at !== undefined ? o.starts_at : cur.starts_at, en = o.ends_at !== undefined ? o.ends_at : cur.ends_at;
    if (en <= st) throw bad('End time must be after the start time');
    // This event and all later ones in the series: same field changes; a time change moves each by the same amount
    const dS = st - cur.starts_at, dE = en - cur.ends_at;
    delete o.starts_at; delete o.ends_at;
    const keys = Object.keys(o), t = now();
    const where = future ? 'series_id = ?1 AND starts_at >= ?2' : 'id = ?1';
    const whereArgs = future ? [cur.series_id, cur.starts_at] : [m[1]];
    const n = whereArgs.length;
    const sets = keys.map((k, i) => `${k} = ?${n + i + 1}`).concat([`starts_at = starts_at + ?${n + keys.length + 1}`, `ends_at = ends_at + ?${n + keys.length + 2}`, `updated_at = ?${n + keys.length + 3}`]).join(', ');
    const res = await db.prepare(`UPDATE events SET ${sets} WHERE ${where}`).bind(...whereArgs, ...keys.map((k) => o[k]), dS, dE, t).run();
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    return J({ event: publicEvent(e, { signedIn: true, admin: true }), count: res.meta ? res.meta.changes : 1 });
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)\/(cancel|restore|new-code)$/.exec(path)) && request.method === 'POST') {
    await requireAdmin(request, env);
    const cur = await db.prepare('SELECT id, series_id, starts_at FROM events WHERE id = ?1').bind(m[1]).first();
    if (!cur) throw new HttpError(404, 'Event not found');
    if (m[2] === 'new-code') await db.prepare('UPDATE events SET checkin_code = ?2, updated_at = ?3 WHERE id = ?1').bind(m[1], code4(), now()).run();
    else if (url.searchParams.get('scope') === 'future' && cur.series_id)   // cancelled events stay on the calendar, marked Cancelled
      await db.prepare('UPDATE events SET status = ?3, updated_at = ?4 WHERE series_id = ?1 AND starts_at >= ?2').bind(cur.series_id, cur.starts_at, m[2] === 'cancel' ? 'cancelled' : 'scheduled', now()).run();
    else await db.prepare('UPDATE events SET status = ?2, updated_at = ?3 WHERE id = ?1').bind(m[1], m[2] === 'cancel' ? 'cancelled' : 'scheduled', now()).run();
    const e = await db.prepare(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = ?1`).bind(m[1]).first();
    if (!e) throw new HttpError(404, 'Event not found');
    return J({ event: publicEvent(e, { signedIn: true, admin: true }) });
  }

  if ((m = /^\/api\/admin\/events\/([\w-]+)\/attendees$/.exec(path)) && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = await db.prepare(`SELECT u.id AS userId, u.name, u.email, u.phone, u.sms_ok AS smsOk, r.status AS rsvp, r.updated_at AS rsvpAt, c.checked_in_at AS checkedInAt, c.method
      FROM users u
      LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?1
      LEFT JOIN checkins c ON c.user_id = u.id AND c.event_id = ?1
      WHERE r.event_id IS NOT NULL OR c.event_id IS NOT NULL
      ORDER BY (c.checked_in_at IS NULL), u.name COLLATE NOCASE`).bind(m[1]).all();
    if (url.searchParams.get('format') === 'csv') {
      const lines = [['name', 'email', 'phone', 'texts_ok', 'rsvp', 'rsvp_at', 'checked_in_at', 'method']].concat(rows.results.map((r) =>
        [r.name, r.email, r.phone || '', r.smsOk ? 'yes' : 'no', r.rsvp || '', r.rsvpAt ? new Date(r.rsvpAt).toISOString() : '', r.checkedInAt ? new Date(r.checkedInAt).toISOString() : '', r.method || '']));
      return new Response('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n',
        { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...cors(request, env) } });
    }
    return J({ attendees: rows.results });
  }

  // Host check-in / undo:  POST|DELETE /api/admin/events/:id/checkin?user=<user id>
  if ((m = /^\/api\/admin\/events\/([\w-]+)\/checkin$/.exec(path)) && (request.method === 'POST' || request.method === 'DELETE')) {
    const s = await requireAdmin(request, env);
    const userId = url.searchParams.get('user') || '';
    const ev = await db.prepare('SELECT id FROM events WHERE id = ?1').bind(m[1]).first();
    if (!ev) throw new HttpError(404, 'Event not found');
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM checkins WHERE event_id = ?1 AND user_id = ?2').bind(m[1], userId).run();
    } else {
      const u = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(userId).first();
      if (!u) throw new HttpError(404, 'That person has not registered in the app yet');
      await db.prepare(`INSERT OR IGNORE INTO checkins (event_id, user_id, method, checked_in_at, by_user) VALUES (?1, ?2, 'host', ?3, ?4)`).bind(m[1], userId, now(), s.uid).run();
    }
    return J({ ok: true });
  }

  // Find registered people by name/email (for manual check-in of walk-ins who registered on the spot)
  if (path === '/api/admin/users' && request.method === 'GET') {
    await requireAdmin(request, env);
    const q = '%' + (url.searchParams.get('q') || '').trim().toLowerCase() + '%';
    const rows = await db.prepare(`SELECT id AS userId, name, email FROM users WHERE lower(name) LIKE ?1 OR lower(email) LIKE ?1 ORDER BY name COLLATE NOCASE LIMIT 20`).bind(q).all();
    return J({ users: rows.results });
  }

  throw new HttpError(404, 'Not found');
}
