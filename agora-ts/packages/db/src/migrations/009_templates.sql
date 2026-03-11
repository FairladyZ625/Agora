CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'seed',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
