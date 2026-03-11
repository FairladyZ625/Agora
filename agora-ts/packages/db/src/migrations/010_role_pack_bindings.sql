CREATE TABLE IF NOT EXISTS role_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  member_kind TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  summary TEXT NOT NULL,
  prompt_asset_path TEXT NOT NULL,
  default_model_preference TEXT,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_bindings (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_adapter TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  binding_mode TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES role_definitions(id) ON DELETE CASCADE,
  UNIQUE (scope, scope_ref, role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_bindings_scope
  ON role_bindings (scope, scope_ref);
