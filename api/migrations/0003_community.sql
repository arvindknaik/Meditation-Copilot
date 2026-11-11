-- v0.12: member categories, event access levels, People admin (block), flyers, featured video, likes and messages.
ALTER TABLE users ADD COLUMN category TEXT NOT NULL DEFAULT 'seeker';   -- 'seeker' | 'friend' | 'initiate'
ALTER TABLE users ADD COLUMN category_at INTEGER;                         -- when category last changed
ALTER TABLE users ADD COLUMN blocked_at INTEGER;                          -- set while blocked
ALTER TABLE users ADD COLUMN block_reason TEXT;                           -- admins only

-- Who can attend: 'public' (everyone) | 'satsang' (initiates + seeker friends) | 'initiates'.
-- Replaces `visibility` (kept, unused). The old 'members' level becomes Satsang.
ALTER TABLE events ADD COLUMN access TEXT NOT NULL DEFAULT 'public';
UPDATE events SET access = CASE WHEN visibility = 'members' THEN 'satsang' ELSE 'public' END;
ALTER TABLE events ADD COLUMN flyer_id TEXT;

CREATE TABLE IF NOT EXISTS flyers (
  id          TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,            -- image/jpeg or image/png
  full        BLOB NOT NULL,            -- up to 1600 px on the long side (resized on the phone)
  thumb       BLOB NOT NULL,            -- 320 px thumbnail (also made on the phone)
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
