import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { InboxRepository } from './inbox.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-inbox-repo-'));
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

describe('inbox repository', () => {
  it('stores, updates, lists, and deletes inbox items', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new InboxRepository(db);

    const created = repository.insertInboxItem({
      text: '用 WebSocket 替代轮询',
      source: '主频道对话',
      notes: '需要评估 dashboard 连接数',
      tags: ['技术', '优化'],
    });
    const listed = repository.listInboxItems();
    const updated = repository.updateInboxItem(created.id, {
      status: 'promoted',
      promoted_to_type: 'todo',
      promoted_to_id: '17',
      metadata: { promoted_by: 'archon' },
    });
    const loaded = repository.getInboxItem(created.id);
    const deleted = repository.deleteInboxItem(created.id);

    expect(created).toMatchObject({
      text: '用 WebSocket 替代轮询',
      source: '主频道对话',
      status: 'open',
      tags: ['技术', '优化'],
    });
    expect(listed).toHaveLength(1);
    expect(updated).toMatchObject({
      status: 'promoted',
      promoted_to_type: 'todo',
      promoted_to_id: '17',
      metadata: { promoted_by: 'archon' },
    });
    expect(loaded).toMatchObject({
      id: created.id,
      status: 'promoted',
    });
    expect(deleted).toBe(true);
    expect(repository.listInboxItems()).toEqual([]);
  });
});
