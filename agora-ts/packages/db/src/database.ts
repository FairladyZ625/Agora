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
  const raw = new DatabaseSync(options.dbPath);
  raw.exec('PRAGMA journal_mode=WAL;');
  raw.exec('PRAGMA foreign_keys=ON;');
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
  ];
  const migrationsDir = resolveMigrationsDir();

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) continue;
    const sql = readFileSync(join(migrationsDir, fileName), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(fileName);
  }
}
