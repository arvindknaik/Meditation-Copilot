-- Meditation Copilot — events database (Cloudflare D1 / SQLite).
-- Kept to standard SQL so it can move to Azure SQL / Postgres later with minor changes.
-- Times are stored as epoch milliseconds (INTEGER, UTC).

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
  last_seen_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members')),
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  checkin_code  TEXT NOT NULL,              -- 4-digit code shown/announced at the venue (also inside the QR)
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);

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

INSERT OR IGNORE INTO centers (id, name, timezone, address)
VALUES ('mpls', 'Minneapolis Center', 'America/Chicago', NULL);
