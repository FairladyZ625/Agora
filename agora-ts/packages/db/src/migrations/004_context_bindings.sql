CREATE TABLE IF NOT EXISTS task_context_bindings (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  im_provider   TEXT NOT NULL,
  conversation_ref TEXT,
  thread_ref    TEXT,
  message_root_ref TEXT,
  status        TEXT NOT NULL DEFAULT 'provisioning',
  created_at    TEXT NOT NULL,
  closed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_context_bindings_task
  ON task_context_bindings(task_id, status);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  event_type    TEXT NOT NULL,
  target_binding_id TEXT REFERENCES task_context_bindings(id),
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  sequence_no   INTEGER NOT NULL,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  max_retries   INTEGER NOT NULL DEFAULT 5,
  next_retry_at TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON notification_outbox(status, next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_outbox_task
  ON notification_outbox(task_id, created_at DESC);
