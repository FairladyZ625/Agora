CREATE TABLE IF NOT EXISTS task_conversation_read_cursors (
  task_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  last_read_entry_id TEXT NULL,
  last_read_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, account_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES human_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_conversation_read_cursors_account
  ON task_conversation_read_cursors(account_id);
