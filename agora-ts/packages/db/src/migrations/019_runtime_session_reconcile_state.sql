ALTER TABLE runtime_session_bindings ADD COLUMN desired_runtime_presence TEXT NOT NULL DEFAULT 'attached';
ALTER TABLE runtime_session_bindings ADD COLUMN reconcile_stage_id TEXT;
ALTER TABLE runtime_session_bindings ADD COLUMN reconciled_at TEXT;
