import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TodoRepository } from '@agora-ts/db';
import { createInboxServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-inbox-service-'));
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

describe('inbox service', () => {
  it('promotes inbox items to todo or task and blocks duplicate promotion', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-700',
    });
    const inboxService = createInboxServiceFromDb(db, taskService);
    const todos = new TodoRepository(db);

    const todoInbox = inboxService.createInboxItem({
      text: '整理 dashboard authoring backlog',
      source: 'dashboard',
      tags: ['triage'],
    });
    const promotedTodo = inboxService.promoteInboxItem(todoInbox.id, {
      target: 'todo',
      type: 'quick',
      creator: 'archon',
      priority: 'normal',
    });

    const taskInbox = inboxService.createInboxItem({
      text: '为 workflow editor 增加保存接口',
      source: 'prd',
      tags: ['backend'],
    });
    const promotedTask = inboxService.promoteInboxItem(taskInbox.id, {
      target: 'task',
      type: 'coding',
      creator: 'archon',
      priority: 'high',
    });

    expect(promotedTodo).toMatchObject({
      inbox: {
        id: todoInbox.id,
        promoted_to_type: 'todo',
        status: 'promoted',
      },
      todo: {
        text: '整理 dashboard authoring backlog',
      },
    });
    expect(todos.listTodos()).toHaveLength(1);
    expect(promotedTask).toMatchObject({
      inbox: {
        id: taskInbox.id,
        promoted_to_type: 'task',
        promoted_to_id: 'OC-700',
      },
      task: {
        id: 'OC-700',
        title: '为 workflow editor 增加保存接口',
      },
    });
    expect(() =>
      inboxService.promoteInboxItem(taskInbox.id, {
        target: 'task',
        type: 'coding',
        creator: 'archon',
        priority: 'high',
      }),
    ).toThrow('already promoted');
  });
});
