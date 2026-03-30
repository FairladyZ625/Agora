CREATE TABLE IF NOT EXISTS project_agent_rosters (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_ref         TEXT NOT NULL,
  kind              TEXT NOT NULL,
  default_inclusion INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(project_id, agent_ref)
);

CREATE INDEX IF NOT EXISTS idx_project_agent_rosters_project
  ON project_agent_rosters(project_id, status, created_at);
