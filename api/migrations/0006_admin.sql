-- Admin area (v0.15): staff roles, admin activity log, hero event, reward points summary

-- Owner = the emails in the ADMIN_EMAILS secret. Others are added here by the owner from Admin → Team.
CREATE TABLE IF NOT EXISTS staff (
  email     TEXT PRIMARY KEY,                       -- lower-case sign-in email
  role      TEXT NOT NULL CHECK (role IN ('admin', 'host')),
  added_by  TEXT,
  added_at  INTEGER NOT NULL
);

-- Who did what in the admin area (check-ins, event changes, contact views, email lists, team changes)
CREATE TABLE IF NOT EXISTS admin_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  by_user   TEXT,
  by_email  TEXT,
  action    TEXT NOT NULL,
  target    TEXT,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_log_at ON admin_log(at);

-- The event shown large on Today (one per center; must be among the next three events to appear)
ALTER TABLE events ADD COLUMN is_hero INTEGER NOT NULL DEFAULT 0;

-- Reward points total and level, sent by the app with the presence heartbeat (sittings themselves never leave the device)
ALTER TABLE users ADD COLUMN points INTEGER;
ALTER TABLE users ADD COLUMN points_level TEXT;
ALTER TABLE users ADD COLUMN points_at INTEGER;
