-- v0.24: "Thought for today" is now "Quote of the day". Renames the starter challenge only if admins haven't changed its wording.
UPDATE challenges
   SET title = 'Daily Quote · 30 days',
       description = 'Read the Quote of the day every day for 30 days. Missed a day? Read that day’s quote later to catch up.',
       updated_at = strftime('%s','now') * 1000
 WHERE id = 'e-quote30' AND title = 'Daily Thought · 30 days';
