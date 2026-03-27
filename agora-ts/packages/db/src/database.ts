import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export interface AgoraDatabase {
  raw: DatabaseSync;
  close: () => void;
  prepare: DatabaseSync['prepare'];
  exec: DatabaseSync['exec'];
}

export interface CreateAgoraDatabaseOptions {
  dbPath: string;
  busyTimeoutMs?: number;
}

function resolveMigrationsDir() {
  const compiledDir = fileURLToPath(new URL('./migrations', import.meta.url));
  if (existsSync(join(compiledDir, '001_initial.sql'))) {
    return compiledDir;
  }
  return fileURLToPath(new URL('../src/migrations', import.meta.url));
}

export function createAgoraDatabase(options: CreateAgoraDatabaseOptions): AgoraDatabase {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
  const raw = new DatabaseSync(options.dbPath, {
    timeout: busyTimeoutMs,
  });
  raw.exec('PRAGMA journal_mode=WAL;');
  raw.exec('PRAGMA foreign_keys=ON;');
  raw.exec(`PRAGMA busy_timeout=${busyTimeoutMs};`);
  raw.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return {
    raw,
    close: () => raw.close(),
    prepare: raw.prepare.bind(raw),
    exec: raw.exec.bind(raw),
  };
}

export function listAppliedMigrations(db: AgoraDatabase): string[] {
  const rows = db
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function hasColumn(db: AgoraDatabase, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function shouldSkipMigrationSql(db: AgoraDatabase, fileName: string): boolean {
  if (fileName === '020_task_skill_policy.sql') {
    return hasColumn(db, 'tasks', 'skill_policy');
  }
  return false;
}

export function runMigrations(db: AgoraDatabase): void {
  const applied = new Set(listAppliedMigrations(db));
  const migrationFiles = [
    '001_initial.sql',
    '002_inbox.sql',
    '003_craftsman_executions.sql',
    '004_context_bindings.sql',
    '005_runtime_bindings.sql',
    '006_human_accounts.sql',
    '007_task_conversation.sql',
    '008_task_conversation_read_cursors.sql',
    '009_templates.sql',
    '010_role_pack_bindings.sql',
    '011_task_brain_bindings.sql',
    '012_approval_requests.sql',
    '013_task_control.sql',
    '014_task_locale.sql',
    '015_projects.sql',
    '016_todo_projects.sql',
    '017_citizens.sql',
    '018_binding_reconcile_reasoning.sql',
    '019_runtime_session_reconcile_state.sql',
    '020_task_skill_policy.sql',
    '021_project_brain_index_jobs.sql',
    '022_task_state_normalization.sql',
  ];
  const migrationsDir = resolveMigrationsDir();

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) continue;
    if (!shouldSkipMigrationSql(db, fileName)) {
      const sql = readFileSync(join(migrationsDir, fileName), 'utf8');
      db.exec(sql);
    }
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(fileName);
  }
}
