CREATE TABLE IF NOT EXISTS task_conversation_entries (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL REFERENCES tasks(id),
  binding_id           TEXT NOT NULL REFERENCES task_context_bindings(id),
  provider             TEXT NOT NULL,
  provider_message_ref TEXT,
  parent_message_ref   TEXT,
  direction            TEXT NOT NULL,
  author_kind          TEXT NOT NULL,
  author_ref           TEXT,
  display_name         TEXT,
  body                 TEXT NOT NULL,
  body_format          TEXT NOT NULL DEFAULT 'plain_text',
  occurred_at          TEXT NOT NULL,
  ingested_at          TEXT NOT NULL,
  dedupe_key           TEXT,
  metadata             TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_conversation_entries_dedupe
  ON task_conversation_entries(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_conversation_entries_task
  ON task_conversation_entries(task_id, occurred_at, ingested_at);

CREATE INDEX IF NOT EXISTS idx_task_conversation_entries_binding
  ON task_conversation_entries(binding_id, occurred_at, ingested_at);
