CREATE TABLE IF NOT EXISTS human_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS human_identity_bindings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER NOT NULL,
  provider         TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES human_accounts(id) ON DELETE CASCADE,
  UNIQUE(provider, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_human_identity_bindings_account
  ON human_identity_bindings(account_id);
