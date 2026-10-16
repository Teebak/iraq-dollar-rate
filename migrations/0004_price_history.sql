-- Shared price history, recorded by the 5-minute cron (IQD per $1).
-- A row is written when a market's price changes, and at least hourly so charts have a moving time axis.
CREATE TABLE price_history (
  market TEXT NOT NULL,
  at INTEGER NOT NULL,
  sell REAL NOT NULL,
  buy REAL NOT NULL,
  PRIMARY KEY (market, at)
);
