import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskContextBindingService, TaskConversationService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-conversation-server-'));
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

describe('task conversation routes', () => {
  it('ingests and lists task conversation entries', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-960',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-1',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-1',
      now: () => new Date('2026-03-10T12:00:01.000Z'),
    });
    const task = taskService.createTask({
      title: 'Route conversation task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-1',
    });

    const app = buildApp({
      db,
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
    });

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/conversations/ingest',
      payload: {
        provider: 'discord',
        thread_ref: 'thread-1',
        provider_message_ref: 'msg-1',
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Lizeyu',
        body: 'hello route',
        occurred_at: '2026-03-10T12:00:00.000Z',
      },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/conversation`,
    });

    expect(ingest.statusCode).toBe(201);
    expect(ingest.json()).toMatchObject({
      id: 'entry-1',
      task_id: task.id,
      body: 'hello route',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      entries: [
        expect.objectContaining({
          id: 'entry-1',
          body: 'hello route',
        }),
      ],
    });
  });

  it('returns a summary-first conversation payload for a task', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-961',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-2',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-2',
      now: () => new Date('2026-03-10T12:05:01.000Z'),
    });
    const task = taskService.createTask({
      title: 'Route conversation summary task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-2',
    });

    conversations.ingest({
      provider: 'discord',
      thread_ref: 'thread-2',
      provider_message_ref: 'msg-2',
      direction: 'outbound',
      author_kind: 'agent',
      display_name: 'Agora Bot',
      body: 'latest route message',
      occurred_at: '2026-03-10T12:05:00.000Z',
    });

    const app = buildApp({
      db,
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
    });

    const summary = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/conversation/summary`,
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      task_id: task.id,
      total_entries: 1,
      latest_provider: 'discord',
      latest_direction: 'outbound',
      latest_body_excerpt: 'latest route message',
    });
  });
});
