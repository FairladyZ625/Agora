CREATE TABLE IF NOT EXISTS project_write_locks (
  project_id TEXT PRIMARY KEY,
  holder_task_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
