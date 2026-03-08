CREATE TABLE IF NOT EXISTS inbox_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  text              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  source            TEXT,
  notes             TEXT,
  tags              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_to_type  TEXT,
  promoted_to_id    TEXT,
  metadata          TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_status_created ON inbox_items(status, created_at);
