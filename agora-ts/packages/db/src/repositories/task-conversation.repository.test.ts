import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { TaskRepository } from './task.repository.js';
import { TaskContextBindingRepository } from './task-context-binding.repository.js';
import { TaskConversationRepository } from './task-conversation.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-conversation-db-'));
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

describe('TaskConversationRepository', () => {
  it('stores and lists entries for a task in occurred_at order', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const entries = new TaskConversationRepository(db);

    tasks.insertTask({
      id: 'OC-960',
      title: 'task conversation repo',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    bindings.insert({
      id: 'binding-1',
      task_id: 'OC-960',
      im_provider: 'discord',
      thread_ref: 'thread-1',
      status: 'active',
    });

    entries.insert({
      id: 'entry-2',
      task_id: 'OC-960',
      binding_id: 'binding-1',
      provider: 'discord',
      provider_message_ref: 'msg-2',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'later',
      body_format: 'plain_text',
      occurred_at: '2026-03-10T12:00:02.000Z',
    });
    entries.insert({
      id: 'entry-1',
      task_id: 'OC-960',
      binding_id: 'binding-1',
      provider: 'discord',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'earlier',
      body_format: 'plain_text',
      occurred_at: '2026-03-10T12:00:01.000Z',
    });

    expect(entries.listByTask('OC-960').map((item) => item.id)).toEqual(['entry-1', 'entry-2']);
  });

  it('supports idempotent insert by dedupe key', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const entries = new TaskConversationRepository(db);

    tasks.insertTask({
      id: 'OC-961',
      title: 'task conversation dedupe',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    bindings.insert({
      id: 'binding-2',
      task_id: 'OC-961',
      im_provider: 'discord',
      thread_ref: 'thread-2',
      status: 'active',
    });

    const first = entries.insert({
      id: 'entry-1',
      task_id: 'OC-961',
      binding_id: 'binding-2',
      provider: 'discord',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'same',
      body_format: 'plain_text',
      occurred_at: '2026-03-10T12:00:01.000Z',
      dedupe_key: 'discord:msg-1',
    });
    const second = entries.insert({
      id: 'entry-2',
      task_id: 'OC-961',
      binding_id: 'binding-2',
      provider: 'discord',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'same',
      body_format: 'plain_text',
      occurred_at: '2026-03-10T12:00:01.000Z',
      dedupe_key: 'discord:msg-1',
    });

    expect(second.id).toBe(first.id);
    expect(entries.listByTask('OC-961')).toHaveLength(1);
  });
});
