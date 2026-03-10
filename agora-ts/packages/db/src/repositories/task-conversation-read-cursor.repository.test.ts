import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { HumanAccountRepository } from './human-account.repository.js';
import { TaskConversationReadCursorRepository } from './task-conversation-read-cursor.repository.js';
import { TaskRepository } from './task.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-conversation-read-db-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('TaskConversationReadCursorRepository', () => {
  it('upserts a per-task per-account read cursor', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const humans = new HumanAccountRepository(db);
    const cursors = new TaskConversationReadCursorRepository(db);

    tasks.insertTask({
      id: 'OC-970',
      title: 'task conversation read cursor',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const account = humans.insertAccount({
      username: 'lizeyu',
      password_hash: 'scrypt:test:test',
      role: 'admin',
      enabled: true,
    });

    cursors.upsert({
      task_id: 'OC-970',
      account_id: account.id,
      last_read_entry_id: 'entry-1',
      last_read_at: '2026-03-10T12:00:00.000Z',
      updated_at: '2026-03-10T12:00:00.000Z',
    });
    cursors.upsert({
      task_id: 'OC-970',
      account_id: account.id,
      last_read_entry_id: 'entry-2',
      last_read_at: '2026-03-10T12:05:00.000Z',
      updated_at: '2026-03-10T12:05:00.000Z',
    });

    expect(cursors.get('OC-970', account.id)).toMatchObject({
      task_id: 'OC-970',
      account_id: account.id,
      last_read_entry_id: 'entry-2',
      last_read_at: '2026-03-10T12:05:00.000Z',
    });
  });
});
