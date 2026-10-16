-- Some Telegram clients send the same command twice in a row (e.g. /start in a fresh chat).
-- Each chat's last message and arrival time let the bot skip an identical message a few seconds later.
CREATE TABLE chat_last_message (
  chat_id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);
