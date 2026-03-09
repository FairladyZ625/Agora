import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository } from '@agora-ts/db';
import { CraftsmanDispatcher, StubCraftsmanAdapter, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

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

  it('rejects craftsmen dispatch for paused tasks', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-route-paused-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T11:00:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-981',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const app = buildApp({ taskService });

    taskService.createTask({
      title: 'paused craftsman route test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-paused',
      task_id: 'OC-981',
      stage_id: 'discuss',
      title: 'run codex later',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    taskService.pauseTask('OC-981', { reason: 'hold' });

    const dispatchResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/dispatch',
      payload: {
        task_id: 'OC-981',
        subtask_id: 'sub-codex-paused',
        adapter: 'codex',
        mode: 'task',
        workdir: '/tmp/codex',
      },
    });

    expect(dispatchResponse.statusCode).toBe(400);
    expect(dispatchResponse.json()).toEqual({
      message: "Task OC-981 is in state 'paused', expected 'active'",
    });
  });

  it('rejects craftsmen dispatch when dispatcher concurrency limit is reached', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      maxConcurrentRunning: 1,
      executionIdGenerator: () => 'exec-route-limit-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T16:30:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-982',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const app = buildApp({ taskService });

    taskService.createTask({
      title: 'craftsman route concurrency limit',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-1',
      task_id: 'OC-982',
      stage_id: 'discuss',
      title: 'run codex 1',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-2',
      task_id: 'OC-982',
      stage_id: 'discuss',
      title: 'run codex 2',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    await app.inject({
      method: 'POST',
      url: '/api/craftsmen/dispatch',
      payload: {
        task_id: 'OC-982',
        subtask_id: 'sub-codex-1',
        adapter: 'codex',
        mode: 'task',
        workdir: '/tmp/codex-1',
      },
    });
    const overflow = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/dispatch',
      payload: {
        task_id: 'OC-982',
        subtask_id: 'sub-codex-2',
        adapter: 'codex',
        mode: 'task',
        workdir: '/tmp/codex-2',
      },
    });

    expect(overflow.statusCode).toBe(400);
    expect(overflow.json()).toEqual({
      message: 'craftsman concurrency limit exceeded: max 1 active executions',
    });
  });

  it('exposes tmux runtime status, doctor, send, task, and tail routes', async () => {
    const app = buildApp({
      tmuxRuntimeService: {
        up: () => ({
          session: 'agora-craftsmen',
          panes: [{
            id: '%0',
            title: 'codex',
            currentCommand: 'bash',
            active: true,
            continuityBackend: 'codex_session_file',
            resumeCapability: 'native_resume',
            sessionReference: 'codex-session-123',
            identitySource: 'session_file',
            lastRecoveryMode: 'resume_exact',
            transportSessionId: 'tmux:agora-craftsmen:codex',
          }],
        }),
        status: () => ({
          session: 'agora-craftsmen',
          panes: [{
            id: '%0',
            title: 'codex',
            currentCommand: 'bash',
            active: true,
            continuityBackend: 'codex_session_file',
            resumeCapability: 'native_resume',
            sessionReference: 'codex-session-123',
            identitySource: 'session_file',
            lastRecoveryMode: 'resume_exact',
            transportSessionId: 'tmux:agora-craftsmen:codex',
          }],
        }),
        send: () => {},
        recordIdentity: () => ({
          continuityBackend: 'codex_session_file',
          resumeCapability: 'native_resume',
          sessionReference: 'codex-session-456',
          identitySource: 'hook_event' as const,
          identityPath: null,
          sessionObservedAt: '2026-03-08T23:02:00.000Z',
          workspaceRoot: '/tmp/codex',
          lastRecoveryMode: 'resume_exact' as const,
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }),
        task: () => ({
          status: 'running',
          session_id: 'tmux:agora-craftsmen:codex',
          started_at: '2026-03-08T23:00:00.000Z',
        }),
        tail: () => 'tmux tail output',
        doctor: () => ({
          session: 'agora-craftsmen',
          panes: [{
            agent: 'codex',
            pane: '%0',
            command: 'bash',
            active: true,
            ready: true,
            continuityBackend: 'codex_session_file',
            resumeCapability: 'native_resume',
            sessionReference: 'codex-session-123',
            identitySource: 'session_file',
            lastRecoveryMode: 'resume_exact',
            transportSessionId: 'tmux:agora-craftsmen:codex',
          }],
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
    const identityResponse = await app.inject({
      method: 'POST',
      url: '/api/craftsmen/runtime/identity',
      payload: {
        agent: 'codex',
        session_reference: 'codex-session-456',
        identity_source: 'hook_event',
        workspace_root: '/tmp/codex',
      },
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual({
      session: 'agora-craftsmen',
      panes: [{
        id: '%0',
        title: 'codex',
        currentCommand: 'bash',
        active: true,
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        sessionReference: 'codex-session-123',
        identitySource: 'session_file',
        lastRecoveryMode: 'resume_exact',
        transportSessionId: 'tmux:agora-craftsmen:codex',
      }],
    });
    expect(doctorResponse.statusCode).toBe(200);
    expect(doctorResponse.json()).toEqual({
      session: 'agora-craftsmen',
      panes: [{
        agent: 'codex',
        pane: '%0',
        command: 'bash',
        active: true,
        ready: true,
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        sessionReference: 'codex-session-123',
        identitySource: 'session_file',
        lastRecoveryMode: 'resume_exact',
        transportSessionId: 'tmux:agora-craftsmen:codex',
      }],
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
    expect(identityResponse.statusCode).toBe(200);
    expect(identityResponse.json()).toEqual({
      ok: true,
      identity: {
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        sessionReference: 'codex-session-456',
        identitySource: 'hook_event',
        identityPath: null,
        sessionObservedAt: '2026-03-08T23:02:00.000Z',
        workspaceRoot: '/tmp/codex',
        lastRecoveryMode: 'resume_exact',
        transportSessionId: 'tmux:agora-craftsmen:codex',
      },
    });
  });
});
