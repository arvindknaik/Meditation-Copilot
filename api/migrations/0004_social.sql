-- v0.13: presence counts and meditation buddies.
CREATE TABLE IF NOT EXISTS presence (
  user_id      TEXT PRIMARY KEY REFERENCES users(id),
  state        TEXT NOT NULL,            -- 'active' | 'meditating'
  seen_at      INTEGER NOT NULL,         -- last heartbeat (epoch ms)
  meditated_on TEXT                      -- last day (YYYY-MM-DD, center time) a heartbeat said 'meditating'
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
