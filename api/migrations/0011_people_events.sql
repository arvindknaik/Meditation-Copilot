-- v0.20: event types and audience, children's program; profile (ZIP, edited name, no messages);
-- people stages (Potential, New, Seeker, Satsangi, Initiate) and status (Active, Drifted, Dropped, Passive, Declined). See SOSMN-SRM.md.

-- Events: types Public Intro, Workshop, Satsang, Retreat, Darshan, Festival, Celebration (no more Seva / Community / Other)
ALTER TABLE events ADD COLUMN children INTEGER NOT NULL DEFAULT 0;   -- 1 = a children's program is offered
UPDATE events SET kind = 'retreat'     WHERE kind = 'darshan' AND (lower(title) LIKE '%retreat%' OR lower(title) LIKE '%conference%');
UPDATE events SET kind = 'festival'    WHERE kind IN ('community', 'seva', 'other') AND (lower(title) LIKE '%fest%' OR lower(title) LIKE '%diwali%' OR lower(title) LIKE '%yoga day%' OR lower(title) LIKE '%holi%');
UPDATE events SET kind = 'celebration' WHERE kind IN ('community', 'seva', 'other');
-- One "Audience" (events.access): public = Public · satsang = Community (by invitation) · initiates = Initiates. "Mainly for" (events.level) is retired.
UPDATE events SET level = 'all';

-- Profile
ALTER TABLE users ADD COLUMN provider_name TEXT;                     -- the name from Google / Microsoft (admins see it next to an edited name)
ALTER TABLE users ADD COLUMN name_edited INTEGER NOT NULL DEFAULT 0;  -- 1 = the person chose the name we show
UPDATE users SET provider_name = name;
ALTER TABLE users ADD COLUMN zip TEXT;                               -- 5-digit ZIP code (optional): roughly where people come from
ALTER TABLE users ADD COLUMN declined_at INTEGER;                    -- asked for no messages from the center at all

-- People: stage and status
-- Satsangi = users.category 'friend' (set by an admin; sees Community events) · Initiate = category 'initiate' (permanent)
-- journey_level now only holds a hand-set Potential / New / Seeker; old L2–L4 values become calculated again
UPDATE users SET category = 'initiate' WHERE journey_level = 'initiate';
UPDATE users SET journey_level = NULL;
ALTER TABLE users ADD COLUMN passive_at INTEGER;                     -- Passive: away for a known reason, staying gently in touch
ALTER TABLE users ADD COLUMN passive_reason TEXT;
ALTER TABLE users ADD COLUMN sevadar INTEGER NOT NULL DEFAULT 0;     -- contributes to running the center

-- Challenges a person chose to share from Copilot when they finished them (only the title and date)
CREATE TABLE IF NOT EXISTS challenge_shares (
  user_id     TEXT NOT NULL,
  ref         TEXT NOT NULL,          -- Copilot's id for that challenge run
  title       TEXT NOT NULL,
  finished_on TEXT,                   -- YYYY-MM-DD
  at          INTEGER NOT NULL,
  PRIMARY KEY (user_id, ref)
);
