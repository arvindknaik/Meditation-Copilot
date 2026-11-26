-- v0.20: Copilot Challenge Program, step 2 (see SOSMN-SRM.md section 10): Library + Education challenges.
-- The Library holds the center's approved reading and watching list: articles (links), books and videos.
-- Seekers only see items marked approved. Their reading and watching history is kept in their own Copilot data, never here.

CREATE TABLE IF NOT EXISTS library (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('article', 'book', 'video')),
  title       TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',     -- article or video link; for a book, where to buy it
  summary     TEXT NOT NULL DEFAULT '',     -- a short summary in our own words
  image       TEXT NOT NULL DEFAULT '',     -- book cover or video picture
  isbn        TEXT NOT NULL DEFAULT '',
  chapters    INTEGER NOT NULL DEFAULT 0,   -- books: number of chapters
  minutes     INTEGER NOT NULL DEFAULT 0,   -- optional: video length or reading time
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  priority    INTEGER NOT NULL DEFAULT 100,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_list ON library(status, kind, priority);

-- Education challenges for the starter program (admins can edit, reorder or pause them).
-- Catch-up is allowed: anything read or watched before the end date counts, so there are no "misses".
INSERT OR IGNORE INTO challenges (id, title, description, kind, days, minutes, target, material, cadence, per_period, item_points, audience, points, priority, signup, active, created_at, updated_at) VALUES
 ('e-quote30', 'Daily Thought · 30 days', 'Read the Thought for today every day for 30 days. Missed a day? Read that day’s thought later to catch up.',
   'education', 30, 0, 30, 'quote', 'day', 1, 2, 'all', 30, 40, 0, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('e-article12', 'An article a week · 12 weeks', 'Read one or two articles a week from Learn or the center’s reading list. Catch up any time before the end.',
   'education', 84, 0, 12, 'article', 'week', 1, 10, 'all', 50, 50, 0, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('e-book', 'Read a book, a chapter a week', 'Choose a book by the Masters and read a chapter or two each week until you finish it. Finishing the book is celebrated.',
   'education', 182, 0, 0, 'book', 'week', 1, 15, 'all', 50, 60, 0, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('e-video4', 'Talks · 3 a week for 4 weeks', 'Watch 3 to 5 recommended talks or satsangs a week for 4 weeks.',
   'education', 28, 0, 12, 'video', 'week', 3, 10, 'all', 40, 70, 0, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- Draft books for the admin to check (look up the details, add the chapter count, then approve)
INSERT OR IGNORE INTO library (id, kind, title, author, summary, status, priority, created_at, updated_at) VALUES
 ('b-empowering-soul', 'book', 'Empowering Your Soul through Meditation', 'Sant Rajinder Singh Ji Maharaj', '', 'draft', 10, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('b-inner-outer-peace', 'book', 'Inner and Outer Peace through Meditation', 'Sant Rajinder Singh Ji Maharaj', '', 'draft', 20, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
 ('b-meditation-medicine', 'book', 'Meditation as Medicine', 'Sant Rajinder Singh Ji Maharaj', '', 'draft', 30, strftime('%s','now') * 1000, strftime('%s','now') * 1000);
