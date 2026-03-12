CREATE TABLE IF NOT EXISTS task_brain_bindings (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  brain_pack_ref TEXT NOT NULL,
  brain_task_id  TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  metadata       TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_brain_bindings_task_active
  ON task_brain_bindings(task_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_brain_bindings_task
  ON task_brain_bindings(task_id, status);
