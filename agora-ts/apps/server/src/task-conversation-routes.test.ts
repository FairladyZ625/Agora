import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { HumanAccountService, TaskContextBindingService, TaskConversationService, TaskInboundService, TaskService } from '@agora-ts/core';
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
      unread_count: 0,
      has_unread: false,
    });
  });

  it('tracks unread summary state and marks a task conversation as read for a dashboard session user', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humans = new HumanAccountService(db);
    humans.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-962',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-3',
    });
    let index = 0;
    const conversations = new TaskConversationService(db, {
      idGenerator: () => `entry-${++index}`,
      now: () => new Date('2026-03-10T12:05:01.000Z'),
    });
    const task = taskService.createTask({
      title: 'Route unread summary task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-3',
    });

    conversations.ingest({
      provider: 'discord',
      thread_ref: 'thread-3',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      body: 'first unread',
      occurred_at: '2026-03-10T12:00:00.000Z',
    });

    const app = buildApp({
      db,
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      humanAccountService: humans,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const headers = {
      cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    };

    const before = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/conversation/summary`,
      headers,
    });
    const read = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/conversation/read`,
      headers,
      payload: {
        last_read_entry_id: 'entry-1',
        read_at: '2026-03-10T12:06:00.000Z',
      },
    });

    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      task_id: task.id,
      unread_count: 1,
      has_unread: true,
      last_read_at: null,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      task_id: task.id,
      unread_count: 0,
      has_unread: false,
      last_read_at: '2026-03-10T12:06:00.000Z',
    });
  });

  it('ingests a structured inbound action and applies it to the current task context', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-963',
      archonUsers: ['alice'],
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-4',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-4',
      now: () => new Date('2026-03-17T13:10:01.000Z'),
    });
    const task = taskService.createTask({
      title: 'Inbound action route task',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-4',
    });
    const inbound = new TaskInboundService(conversations, bindings, taskService);

    const app = buildApp({
      db,
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      taskInboundService: inbound,
    });

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/conversations/ingest',
      payload: {
        provider: 'discord',
        thread_ref: 'thread-4',
        provider_message_ref: 'msg-4',
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'alice',
        display_name: 'Alice',
        body: 'approve from thread',
        occurred_at: '2026-03-17T13:10:00.000Z',
        task_action: {
          kind: 'approve_current',
          actor_ref: 'alice',
          comment: 'approved in thread',
        },
      },
    });

    expect(ingest.statusCode).toBe(201);
    expect(ingest.json()).toMatchObject({
      id: 'entry-4',
      task_id: 'OC-963',
      task_action_result: {
        kind: 'approve_current',
        task_id: 'OC-963',
        current_stage: 'write',
        state: 'active',
      },
    });
  });

  it('ingests advance_current with next_stage_id for a branching task context', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-964',
      archonUsers: ['opus'],
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-5',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-5',
      now: () => new Date('2026-03-17T13:20:01.000Z'),
    });
    const task = taskService.createTask({
      title: 'Inbound branch route task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'fast-path', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          { id: 'deep-review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['triage'],
          nodes: [
            { id: 'triage', kind: 'stage', gate: { type: 'command' } },
            { id: 'fast-path', kind: 'stage', gate: { type: 'all_subtasks_done' } },
            { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
            { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
          ],
        },
      },
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-5',
    });
    const inbound = new TaskInboundService(conversations, bindings, taskService);

    const app = buildApp({
      db,
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      taskInboundService: inbound,
    });

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/conversations/ingest',
      payload: {
        provider: 'discord',
        thread_ref: 'thread-5',
        provider_message_ref: 'msg-5',
        direction: 'inbound',
        author_kind: 'agent',
        author_ref: 'opus',
        display_name: 'Opus',
        body: 'take deep review branch',
        occurred_at: '2026-03-17T13:20:00.000Z',
        task_action: {
          kind: 'advance_current',
          actor_ref: 'opus',
          next_stage_id: 'deep-review',
        },
      },
    });

    expect(ingest.statusCode).toBe(201);
    expect(ingest.json()).toMatchObject({
      id: 'entry-5',
      task_id: 'OC-964',
      task_action_result: {
        kind: 'advance_current',
        task_id: 'OC-964',
        current_stage: 'deep-review',
        state: 'active',
      },
    });
  });
});
