CREATE TABLE IF NOT EXISTS task_authorities (
  task_id               TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  requester_account_id  INTEGER REFERENCES human_accounts(id) ON DELETE SET NULL,
  owner_account_id      INTEGER REFERENCES human_accounts(id) ON DELETE SET NULL,
  assignee_account_id   INTEGER REFERENCES human_accounts(id) ON DELETE SET NULL,
  approver_account_id   INTEGER REFERENCES human_accounts(id) ON DELETE SET NULL,
  controller_agent_ref  TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_authorities_assignee
  ON task_authorities(assignee_account_id, updated_at);
