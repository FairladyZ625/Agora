CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  summary     TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  owner       TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, created_at);
