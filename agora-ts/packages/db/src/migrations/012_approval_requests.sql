CREATE TABLE IF NOT EXISTS approval_requests (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL,
  stage_id            TEXT NOT NULL,
  gate_type           TEXT NOT NULL,
  requested_by        TEXT NOT NULL,
  status              TEXT NOT NULL,
  summary_path        TEXT,
  request_comment     TEXT,
  resolution_comment  TEXT,
  resolved_by         TEXT,
  requested_at        TEXT NOT NULL,
  resolved_at         TEXT,
  metadata            TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_task
  ON approval_requests(task_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_task_stage_status
  ON approval_requests(task_id, stage_id, status, requested_at DESC);
