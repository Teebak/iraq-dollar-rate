-- Telegram redelivers an update when it thinks the first delivery failed; remembering update_ids
-- makes the bot answer each one exactly once. Rows older than a day are pruned by the alert cron.
CREATE TABLE processed_updates (
  update_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);
