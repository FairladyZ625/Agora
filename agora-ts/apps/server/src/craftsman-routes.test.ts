import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository } from '@agora-ts/db';
import { CraftsmanDispatcher, StubCraftsmanAdapter, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-craftsman-routes-'));
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

describe('craftsman routes', () => {
  it('dispatches craftsmen subtasks, loads execution status, and accepts callbacks', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-route-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-08T14:00:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-980',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const app = buildApp({ taskService });

    taskService.createTask({
      title: 'craftsman route test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-980',
      stage_id: 'discuss',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    const dispatchResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/dispatch',
      payload: {
        task_id: 'OC-980',
        subtask_id: 'sub-codex',
        adapter: 'codex',
        mode: 'task',
        workdir: '/tmp/codex',
      },
    });
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/craftsmen/executions/exec-route-1',
    });
    const historyBeforeCallback = await app.inject({
      method: 'GET',
      url: '/api/craftsmen/tasks/OC-980/subtasks/sub-codex/executions',
    });
    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/callback',
      payload: {
        execution_id: 'exec-route-1',
        status: 'succeeded',
        session_id: 'codex:exec-route-1',
        payload: {
          summary: 'implemented feature',
        },
        error: null,
        finished_at: '2026-03-08T14:03:00.000Z',
      },
    });

    expect(dispatchResponse.statusCode).toBe(200);
    expect(dispatchResponse.json()).toMatchObject({
      execution: {
        execution_id: 'exec-route-1',
        adapter: 'codex',
        status: 'running',
      },
      subtask: {
        id: 'sub-codex',
        dispatch_status: 'running',
      },
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      execution_id: 'exec-route-1',
      adapter: 'codex',
      status: 'running',
    });
    expect(historyBeforeCallback.statusCode).toBe(200);
    expect(historyBeforeCallback.json()).toEqual([
      expect.objectContaining({
        execution_id: 'exec-route-1',
        subtask_id: 'sub-codex',
        status: 'running',
      }),
    ]);
    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.json()).toMatchObject({
      execution: {
        execution_id: 'exec-route-1',
        status: 'succeeded',
      },
      subtask: {
        id: 'sub-codex',
        status: 'done',
      },
    });
  });
});
