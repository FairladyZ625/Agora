ALTER TABLE participant_bindings ADD COLUMN desired_exposure TEXT NOT NULL DEFAULT 'hidden';
ALTER TABLE participant_bindings ADD COLUMN exposure_reason TEXT;
ALTER TABLE participant_bindings ADD COLUMN exposure_stage_id TEXT;
ALTER TABLE participant_bindings ADD COLUMN reconciled_at TEXT;

ALTER TABLE runtime_session_bindings ADD COLUMN binding_reason TEXT;
