CREATE TABLE IF NOT EXISTS runtime_target_overlays (
  runtime_target_ref TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  display_name TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  allowed_projects TEXT NOT NULL DEFAULT '[]',
  default_roles TEXT NOT NULL DEFAULT '[]',
  presentation_mode TEXT NOT NULL DEFAULT 'headless',
  presentation_provider TEXT,
  presentation_identity_ref TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
