-- Rate-card images drawn by the Mini App and shared through Telegram (served at /cards/<id>.jpg).
-- Pruned after 7 days by the 5-minute cron; by then the shared message holds Telegram's own copy.
CREATE TABLE share_cards (
  id TEXT PRIMARY KEY,
  image BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
