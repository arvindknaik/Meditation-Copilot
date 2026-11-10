-- v0.11: repeating events (series) and contact details with consent.
CREATE TABLE IF NOT EXISTS series (
  id          TEXT PRIMARY KEY,
  center_id   TEXT NOT NULL REFERENCES centers(id),
  freq        TEXT NOT NULL CHECK (freq IN ('weekly', 'biweekly', 'monthly')),
  until_at    INTEGER,                        -- last date the series runs to (epoch ms)
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);
ALTER TABLE events ADD COLUMN series_id TEXT REFERENCES series(id);
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id, starts_at);

ALTER TABLE users ADD COLUMN phone TEXT;                         -- optional, E.164 (+16125551234)
ALTER TABLE users ADD COLUMN sms_ok INTEGER NOT NULL DEFAULT 0;  -- agreed to text reminders
ALTER TABLE users ADD COLUMN sms_consent_at INTEGER;             -- when they agreed (cleared if withdrawn)
ALTER TABLE users ADD COLUMN contact_ack_at INTEGER;             -- when they confirmed contact details + saw the notice
