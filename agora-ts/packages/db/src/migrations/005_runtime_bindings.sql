CREATE TABLE IF NOT EXISTS participant_bindings (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  binding_id TEXT REFERENCES task_context_bindings(id) ON DELETE SET NULL,
  agent_ref TEXT NOT NULL,
  runtime_provider TEXT,
  task_role TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'template',
  join_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  joined_at TEXT,
  left_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_participant_bindings_task
  ON participant_bindings(task_id, agent_ref);

CREATE INDEX IF NOT EXISTS idx_participant_bindings_binding
  ON participant_bindings(binding_id, join_status);

CREATE TABLE IF NOT EXISTS runtime_session_bindings (
  id TEXT PRIMARY KEY,
  participant_binding_id TEXT NOT NULL UNIQUE REFERENCES participant_bindings(id) ON DELETE CASCADE,
  runtime_provider TEXT NOT NULL,
  runtime_session_ref TEXT NOT NULL,
  runtime_actor_ref TEXT,
  continuity_ref TEXT,
  presence_state TEXT NOT NULL DEFAULT 'active',
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_runtime_session_bindings_runtime
  ON runtime_session_bindings(runtime_provider, runtime_session_ref);
