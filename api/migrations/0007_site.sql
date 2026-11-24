-- sosmn.org events site + admin.sosmn.org (v0.16): guests, event views, challenges

-- People coming along with the person who RSVPs / checks in (family, friends)
ALTER TABLE rsvps ADD COLUMN guests INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkins ADD COLUMN guests INTEGER NOT NULL DEFAULT 0;

-- Who opened an event's details (signed-in people), and how often it was opened (everyone)
ALTER TABLE events ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS event_views (
  event_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  first_at   INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  views      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (event_id, user_id)
);

-- Challenges shown in Meditation Copilot, managed in Admin (lowest priority number = shown and recommended first)
CREATE TABLE IF NOT EXISTS challenges (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('daily_sitting', 'checkins')),
  days         INTEGER NOT NULL DEFAULT 7,          -- length of the challenge, in days
  minutes      INTEGER NOT NULL DEFAULT 0,          -- daily_sitting: minutes per day
  target       INTEGER NOT NULL DEFAULT 0,          -- checkins: number of center events to attend within `days`
  audience     TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'seeker', 'initiate')),
  points       INTEGER NOT NULL DEFAULT 50,
  priority     INTEGER NOT NULL DEFAULT 100,
  active       INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_order ON challenges(active, priority);
