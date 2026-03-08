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

  it('exposes tmux runtime status, doctor, send, task, and tail routes', async () => {
    const app = buildApp({
      tmuxRuntimeService: {
        up: () => ({
          session: 'agora-craftsmen',
          panes: [{ id: '%0', title: 'codex', currentCommand: 'bash', active: true }],
        }),
        status: () => ({
          session: 'agora-craftsmen',
          panes: [{ id: '%0', title: 'codex', currentCommand: 'bash', active: true }],
        }),
        send: () => {},
        task: () => ({
          status: 'running',
          session_id: 'tmux:agora-craftsmen:codex',
          started_at: '2026-03-08T23:00:00.000Z',
        }),
        tail: () => 'tmux tail output',
        doctor: () => ({
          session: 'agora-craftsmen',
          panes: [{ agent: 'codex', pane: '%0', command: 'bash', active: true, ready: true }],
        }),
        down: () => {},
      },
    });

    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/craftsmen/tmux/status',
    });
    const doctorResponse = await app.inject({
      method: 'GET',
      url: '/api/craftsmen/tmux/doctor',
    });
    const sendResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/tmux/send',
      payload: {
        agent: 'codex',
        command: 'echo hello',
      },
    });
    const taskResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/tmux/task',
      payload: {
        agent: 'codex',
        prompt: 'Implement via tmux api',
        workdir: '/tmp/codex',
      },
    });
    const tailResponse = await app.inject({
      method: 'GET',
      url: '/api/craftsmen/tmux/tail/codex?lines=20',
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual({
      session: 'agora-craftsmen',
      panes: [{ id: '%0', title: 'codex', currentCommand: 'bash', active: true }],
    });
    expect(doctorResponse.statusCode).toBe(200);
    expect(doctorResponse.json()).toEqual({
      session: 'agora-craftsmen',
      panes: [{ agent: 'codex', pane: '%0', command: 'bash', active: true, ready: true }],
    });
    expect(sendResponse.statusCode).toBe(200);
    expect(sendResponse.json()).toEqual({ ok: true });
    expect(taskResponse.statusCode).toBe(200);
    expect(taskResponse.json()).toMatchObject({
      status: 'running',
      session_id: 'tmux:agora-craftsmen:codex',
    });
    expect(tailResponse.statusCode).toBe(200);
    expect(tailResponse.json()).toEqual({ output: 'tmux tail output' });
  });
});
