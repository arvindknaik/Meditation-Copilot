-- v0.23: several featured events, favourites (events and series), the visitor log (one private note per check-in),
-- suggestions marked as reviewed, and initiate status confirmed or revoked by an admin.

-- Initiate status: people declare it themselves (the app trusts them); an admin can confirm it, or revoke it (back to Seeker,
-- and they can't declare it again themselves until an admin sets it).
ALTER TABLE users ADD COLUMN initiate_confirmed_at INTEGER;
ALTER TABLE users ADD COLUMN initiate_revoked_at INTEGER;

-- Favourites: a single event, or a whole series (every date of a repeating event). Personal; the center sees no names.
CREATE TABLE IF NOT EXISTS favorites (
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('event', 'series')),
  ref_id      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, ref_id)
);

-- Visitor log: one note per person per event, written after checking in (until 7 days after the event).
-- Only the center team reads them. share_ok = the person allows the center to share it publicly (first name only);
-- is_public = an admin chose to share it (only possible with share_ok). Where public notes appear is decided later.
CREATE TABLE IF NOT EXISTS event_notes (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  share_ok     INTEGER NOT NULL DEFAULT 0,
  is_public    INTEGER NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'note',      -- note | reflection (moved over from the old public reflections)
  reviewed_at  INTEGER,
  reviewed_by  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_notes_created ON event_notes(created_at);

-- The old public reflections move into the visitor log (not shareable; the original messages are kept, hidden)
INSERT OR IGNORE INTO event_notes (id, event_id, user_id, body, share_ok, is_public, source, created_at, updated_at)
  SELECT 'msg-' || MIN(id), event_id, user_id, group_concat(body, char(10) || char(10)), 0, 0, 'reflection', MIN(created_at), MAX(created_at)
  FROM messages WHERE deleted_at IS NULL GROUP BY event_id, user_id;

-- Suggestions: mark as reviewed in admin
ALTER TABLE feedback ADD COLUMN reviewed_at INTEGER;
