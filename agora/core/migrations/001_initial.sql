-- Agora V2 initial schema
-- tasks.db — WAL mode, optimistic locking via version field

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  version     INTEGER NOT NULL DEFAULT 1,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal',
  creator     TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'draft',
  current_stage TEXT,
  team        TEXT NOT NULL,
  workflow    TEXT NOT NULL,
  scheduler   TEXT,
  scheduler_snapshot TEXT,
  discord     TEXT,
  metrics     TEXT,
  error_detail TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  kind        TEXT NOT NULL DEFAULT 'flow',
  event       TEXT NOT NULL,
  stage_id    TEXT,
  from_state  TEXT,
  to_state    TEXT,
  detail      TEXT,
  actor       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_flow_task ON flow_log(task_id, created_at);

CREATE TABLE IF NOT EXISTS stage_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  stage_id    TEXT NOT NULL,
  entered_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  exited_at   DATETIME,
  exit_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_stage_history_task ON stage_history(task_id, stage_id, entered_at);

CREATE TABLE IF NOT EXISTS progress_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  kind        TEXT NOT NULL DEFAULT 'progress',
  stage_id    TEXT,
  subtask_id  TEXT,
  content     TEXT NOT NULL,
  artifacts   TEXT,
  actor       TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_progress_task ON progress_log(task_id, created_at);

CREATE TABLE IF NOT EXISTS archon_reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  stage_id     TEXT NOT NULL,
  decision     TEXT NOT NULL,
  comment      TEXT,
  reviewer_id  TEXT NOT NULL,
  reviewed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archon_reviews_task ON archon_reviews(task_id, stage_id, reviewed_at);

CREATE TABLE IF NOT EXISTS approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  stage_id      TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  approver_id   TEXT NOT NULL,
  comment       TEXT,
  approved_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id, stage_id, approver_role, approved_at);

CREATE TABLE IF NOT EXISTS quorum_votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  stage_id    TEXT NOT NULL,
  voter_id    TEXT NOT NULL,
  vote        TEXT NOT NULL DEFAULT 'approve',
  comment     TEXT,
  voted_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, stage_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_quorum_votes_task ON quorum_votes(task_id, stage_id, voted_at);

CREATE TABLE IF NOT EXISTS subtasks (
  id          TEXT NOT NULL,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  stage_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  assignee    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'not_started',
  output      TEXT,
  craftsman_type TEXT,
  craftsman_session TEXT,
  craftsman_workdir TEXT,
  craftsman_prompt TEXT,
  dispatch_status TEXT,
  dispatched_at TEXT,
  done_at     TEXT,
  PRIMARY KEY (task_id, id)
);

CREATE TABLE IF NOT EXISTS archive_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  target_path   TEXT NOT NULL,
  payload       TEXT NOT NULL,
  writer_agent  TEXT NOT NULL DEFAULT 'writer-agent',
  commit_hash   TEXT,
  requested_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_archive_jobs_status ON archive_jobs(status, requested_at);
