ALTER TABLE todos ADD COLUMN project_id TEXT REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS idx_todos_project_created ON todos(project_id, created_at);
