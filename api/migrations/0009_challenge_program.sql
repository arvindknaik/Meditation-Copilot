-- v0.18: Copilot Challenge Program, step 1 (see SOSMN-SRM.md section 10)
-- The old table only allowed two kinds; SQLite can't change that rule in place, so the table is rebuilt.
-- New: meditation challenges with a choice of daily minutes and an optional ramp (21-Day Advance), a "next" link,
-- challenges offered at sign-up, a completion bonus, and the Education fields used in step 2.

CREATE TABLE challenges_new (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('daily_sitting', 'checkins', 'education')),
  days           INTEGER NOT NULL DEFAULT 7,          -- fixed length, in days
  minutes        INTEGER NOT NULL DEFAULT 0,          -- daily_sitting: minutes a day (or the default choice)
  minutes_choices TEXT NOT NULL DEFAULT '',           -- daily_sitting: e.g. '10,15,20' lets the seeker choose
  ramp_to        INTEGER NOT NULL DEFAULT 0,          -- daily_sitting: grow from their minutes to this by the last day (0 = no ramp)
  target         INTEGER NOT NULL DEFAULT 0,          -- checkins: events to attend; education: items in total
  material       TEXT NOT NULL DEFAULT '',            -- education: quote | article | book | video
  cadence        TEXT NOT NULL DEFAULT '',            -- education: day | week | month
  per_period     INTEGER NOT NULL DEFAULT 0,          -- education: items per day/week/month (guide; catch-up allowed)
  item_points    INTEGER NOT NULL DEFAULT 0,          -- education: points per item
  audience       TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'seeker', 'initiate')),
  points         INTEGER NOT NULL DEFAULT 50,         -- bonus for completing the challenge
  priority       INTEGER NOT NULL DEFAULT 100,
  signup         INTEGER NOT NULL DEFAULT 0,          -- offered in Copilot's "choose your first challenge" step
  next_of        TEXT,                                -- offered as a next step when this challenge (id) is completed
  active         INTEGER NOT NULL DEFAULT 1,
  created_by     TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
INSERT INTO challenges_new (id, title, description, kind, days, minutes, target, audience, points, priority, active, created_by, created_at, updated_at)
  SELECT id, title, description, kind, days, minutes, target, audience, points, priority, active, created_by, created_at, updated_at FROM challenges;
DROP TABLE challenges;
ALTER TABLE challenges_new RENAME TO challenges;
CREATE INDEX IF NOT EXISTS idx_challenges_order ON challenges(active, priority);

-- Starter program (admins can edit, reorder or switch these off)
INSERT OR IGNORE INTO challenges (id, title, description, kind, days, minutes, minutes_choices, ramp_to, target, audience, points, priority, signup, next_of, active, created_at, updated_at) VALUES
 ('c21-foundation', '21-Day Foundation', 'Sit every day for 21 days at the same length: 10, 15 or 20 minutes. All your sittings in a day add up.',
   'daily_sitting', 21, 15, '10,15,20', 0, 0, 'all', 100, 10, 1, NULL, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('c21-advance', '21-Day Advance', 'Grow your daily sitting by about a minute a day, reaching 30 minutes by day 21. More is welcome; reaching 30 is celebrated.',
   'daily_sitting', 21, 15, '', 30, 0, 'all', 150, 20, 0, 'c21-foundation', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('c-attend6', 'Attend 6 sessions in 3 months', 'Join 6 center sessions (workshops, satsangs or other programs) in the next 3 months. Check in at each one.',
   'checkins', 90, 0, '', 0, 6, 'all', 150, 30, 1, NULL, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000);
