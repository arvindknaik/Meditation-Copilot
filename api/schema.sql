-- Meditation Copilot — events database (Cloudflare D1 / SQLite).
-- Kept to standard SQL so it can move to Azure SQL / Postgres later with minor changes.
-- Times are stored as epoch milliseconds (INTEGER, UTC).
--
-- This file is the complete current schema, for reference (e.g. when moving to Azure).
-- To create or upgrade the live database, apply the files in migrations/ in order:
--   npm run db:remote     (= wrangler d1 migrations apply meditation-copilot --remote)

CREATE TABLE IF NOT EXISTS centers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'America/Chicago',
  address     TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- '<provider>:<subject id>'
  provider      TEXT NOT NULL,               -- 'google' | 'microsoft'
  email         TEXT,
  name          TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  phone         TEXT,                        -- optional, E.164 (+16125551234)
  sms_ok        INTEGER NOT NULL DEFAULT 0,  -- agreed to text reminders
  sms_consent_at INTEGER,                    -- when they agreed (cleared if withdrawn)
  contact_ack_at INTEGER,                    -- when they confirmed contact details and saw the notice
  category      TEXT NOT NULL DEFAULT 'seeker', -- 'seeker' | 'friend' | 'initiate' (seeker/initiate self-declared; friend set by an admin)
  category_at   INTEGER,
  blocked_at    INTEGER,                     -- set while blocked from events
  block_reason  TEXT                         -- admins only
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS series (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id),
  freq        TEXT NOT NULL CHECK (freq IN ('weekly', 'biweekly', 'monthly')),
  until_at    INTEGER,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  center_id     TEXT NOT NULL REFERENCES centers(id),
  title         TEXT NOT NULL,
  description   TEXT,
  format        TEXT NOT NULL CHECK (format IN ('in_person', 'online', 'hybrid')),
  venue         TEXT,
  address       TEXT,
  online_url    TEXT,
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'America/Chicago',
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members')),  -- unused since v0.12 (see access)
  access        TEXT NOT NULL DEFAULT 'public',  -- 'public' | 'satsang' (initiates + seeker friends) | 'initiates'
  flyer_id      TEXT,                            -- flyers.id
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  checkin_code  TEXT NOT NULL,              -- 4-digit code shown/announced at the venue (also inside the QR)
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  series_id     TEXT REFERENCES series(id)  -- set when the event repeats
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id, starts_at);

CREATE TABLE IF NOT EXISTS rsvps (
  event_id    TEXT NOT NULL REFERENCES events(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'no')),
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  event_id       TEXT NOT NULL REFERENCES events(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  method         TEXT NOT NULL CHECK (method IN ('code', 'qr', 'host', 'online')),
  checked_in_at  INTEGER NOT NULL,
  by_user        TEXT,                       -- admin who checked the person in (method = 'host')
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);

CREATE TABLE IF NOT EXISTS flyers (
  id          TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,            -- image/jpeg or image/png
  full        BLOB NOT NULL,            -- up to 1600 px on the long side (resized on the phone)
  thumb       BLOB NOT NULL,            -- 320 px thumbnail
  bytes       INTEGER NOT NULL,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (  -- per-center settings, e.g. the featured video on Today
  center_id   TEXT NOT NULL REFERENCES centers(id),
  key         TEXT NOT NULL,
  value       TEXT,                     -- JSON
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT,
  PRIMARY KEY (center_id, key)
);

CREATE TABLE IF NOT EXISTS likes (
  event_id    TEXT NOT NULL REFERENCES events(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,            -- plain text, up to 280 characters
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER,                  -- hidden, not removed (author or admin)
  deleted_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_event ON messages(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);

CREATE TABLE IF NOT EXISTS presence (   -- who is on the app right now (counts only are shown; buddies see each other)
  user_id      TEXT PRIMARY KEY REFERENCES users(id),
  state        TEXT NOT NULL,            -- 'active' | 'meditating'
  seen_at      INTEGER NOT NULL,
  meditated_on TEXT                      -- last day (YYYY-MM-DD, center time) seen meditating
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(seen_at);

CREATE TABLE IF NOT EXISTS buddies (
  id            TEXT PRIMARY KEY,
  inviter_id    TEXT NOT NULL REFERENCES users(id),
  invitee_email TEXT NOT NULL,           -- lower-case sign-in email; may not have signed in yet
  invitee_id    TEXT REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buddies_inviter ON buddies(inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_buddies_invitee ON buddies(invitee_email, status);
CREATE INDEX IF NOT EXISTS idx_buddies_invitee_id ON buddies(invitee_id, status);

CREATE TABLE IF NOT EXISTS feedback (   -- suggestions and ratings (guests allowed; user_id NULL)
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('suggestion', 'rating')),
  rating      INTEGER,                     -- 1–5 for ratings
  body        TEXT,                        -- up to 1000 characters
  contact     TEXT,                        -- optional email a guest typed
  version     TEXT,
  platform    TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

INSERT OR IGNORE INTO centers (id, name, timezone, address)
VALUES ('mpls', 'Minneapolis Center', 'America/Chicago', NULL);
