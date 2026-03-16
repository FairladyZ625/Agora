CREATE TABLE IF NOT EXISTS citizens (
  citizen_id                 TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL REFERENCES projects(id),
  role_id                    TEXT NOT NULL REFERENCES role_definitions(id),
  display_name               TEXT NOT NULL,
  persona                    TEXT,
  boundaries                 TEXT,
  skills_ref                 TEXT,
  channel_policies           TEXT,
  brain_scaffold_mode        TEXT NOT NULL DEFAULT 'role_default',
  runtime_projection_adapter TEXT NOT NULL,
  runtime_projection_auto    INTEGER NOT NULL DEFAULT 0,
  runtime_projection_meta    TEXT,
  status                     TEXT NOT NULL DEFAULT 'active',
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_citizens_project_status ON citizens(project_id, status, created_at);
