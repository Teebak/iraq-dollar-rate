-- Price alerts: one row per alert, deleted once it fires.
-- direction 'up' fires when the price reaches target or higher, 'down' when it reaches target or lower.
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  market TEXT NOT NULL DEFAULT 'b',
  side TEXT NOT NULL DEFAULT 'sell' CHECK (side IN ('sell', 'buy')),
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  target REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX alerts_chat ON alerts (chat_id);

-- Daily summary subscribers.
CREATE TABLE subscribers (
  chat_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);
