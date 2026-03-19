CREATE TABLE IF NOT EXISTS project_brain_index_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_kind  TEXT NOT NULL,
  document_slug  TEXT NOT NULL,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  started_at     TEXT,
  completed_at   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_brain_index_jobs_document
  ON project_brain_index_jobs(project_id, document_kind, document_slug);

CREATE INDEX IF NOT EXISTS idx_project_brain_index_jobs_status
  ON project_brain_index_jobs(status, updated_at DESC);
