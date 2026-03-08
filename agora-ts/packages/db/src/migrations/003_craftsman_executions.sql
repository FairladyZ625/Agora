CREATE TABLE IF NOT EXISTS craftsman_executions (
  execution_id     TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES tasks(id),
  subtask_id       TEXT NOT NULL,
  adapter          TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'task',
  session_id       TEXT,
  status           TEXT NOT NULL DEFAULT 'queued',
  brief_path       TEXT,
  workdir          TEXT,
  callback_payload TEXT,
  error            TEXT,
  started_at       TEXT,
  finished_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_craftsman_executions_subtask
  ON craftsman_executions(task_id, subtask_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_craftsman_executions_status
  ON craftsman_executions(status, created_at DESC);
