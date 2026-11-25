-- v0.17: Seeker Relationship Management, phase 1 (see SOSMN-SRM.md)
-- Event type and journey level tags; journey level override, mentor, milestones, notes, follow-ups. Admins only.

ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';     -- intro | workshop | satsang | darshan | seva | community | other
ALTER TABLE events ADD COLUMN level TEXT NOT NULL DEFAULT 'all';      -- who it is mainly for: all | new | seeker | initiate

-- Best guess for existing events from their titles (admins can correct them)
UPDATE events SET kind = 'satsang'   WHERE kind = 'other' AND lower(title) LIKE '%satsang%';
UPDATE events SET kind = 'workshop'  WHERE kind = 'other' AND (lower(title) LIKE '%workshop%' OR lower(title) LIKE '%class%');
UPDATE events SET kind = 'intro'     WHERE kind = 'other' AND (lower(title) LIKE '%intro%' OR lower(title) LIKE '%open house%' OR lower(title) LIKE '%learn to meditate%' OR lower(title) LIKE '%beginner%');
UPDATE events SET kind = 'darshan'   WHERE kind = 'other' AND (lower(title) LIKE '%darshan%' OR lower(title) LIKE '%conference%' OR lower(title) LIKE '%retreat%');
UPDATE events SET kind = 'seva'      WHERE kind = 'other' AND lower(title) LIKE '%seva%';
UPDATE events SET kind = 'community' WHERE kind = 'other' AND (lower(title) LIKE '%peace fest%' OR lower(title) LIKE '%diwali%' OR lower(title) LIKE '%yoga day%' OR lower(title) LIKE '%celebration%' OR lower(title) LIKE '%family%');
UPDATE events SET level = 'initiate' WHERE kind = 'satsang' AND access = 'initiates';

ALTER TABLE users ADD COLUMN journey_level TEXT;      -- admin override: new | l2 | l3 | l4 | initiate (NULL = calculated)
ALTER TABLE users ADD COLUMN journey_set_by TEXT;
ALTER TABLE users ADD COLUMN journey_set_at INTEGER;
ALTER TABLE users ADD COLUMN mentor_id TEXT;          -- users.id of the person's mentor (an initiate or team member)

CREATE TABLE IF NOT EXISTS milestones (               -- admin-recorded steps that the server cannot see by itself
  user_id   TEXT NOT NULL,
  kind      TEXT NOT NULL,                            -- challenge_done | questions_clear | met_master
  at        INTEGER NOT NULL,
  by_email  TEXT,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS person_notes (             -- short volunteer notes; never sensitive details
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL,                           -- up to 500 characters
  by_email   TEXT,
  at         INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_person_notes_user ON person_notes(user_id, at);

CREATE TABLE IF NOT EXISTS followups (                -- follow-ups an admin has handled (done or skipped)
  user_id   TEXT NOT NULL,
  kind      TEXT NOT NULL,                            -- first_visit | no_show | drifting | level_up | mentor
  ref       TEXT NOT NULL DEFAULT '',                 -- event id, level, or last-visit time, so a new occasion shows again
  status    TEXT NOT NULL CHECK (status IN ('done', 'skipped')),
  at        INTEGER NOT NULL,
  by_email  TEXT,
  PRIMARY KEY (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, starts_at);
