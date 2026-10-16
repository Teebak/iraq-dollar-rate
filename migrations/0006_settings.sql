-- Small key/value store: admin_chat_id (who gets source-health messages) and source_status (JSON).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
