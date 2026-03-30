CREATE TABLE IF NOT EXISTS project_memberships (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id          INTEGER NOT NULL REFERENCES human_accounts(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  added_by_account_id INTEGER REFERENCES human_accounts(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(project_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_project
  ON project_memberships(project_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_project_memberships_account
  ON project_memberships(account_id, status, created_at);
