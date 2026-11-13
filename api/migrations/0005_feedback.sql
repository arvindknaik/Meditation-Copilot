-- v0.14: suggestions and ratings from users (signed in or guests).
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),   -- NULL for guests
  kind        TEXT NOT NULL CHECK (kind IN ('suggestion', 'rating')),
  rating      INTEGER,                     -- 1–5 for ratings
  body        TEXT,                        -- up to 1000 characters
  contact     TEXT,                        -- optional email a guest typed
  version     TEXT,                        -- app version
  platform    TEXT,                        -- short user-agent summary
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
