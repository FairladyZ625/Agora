import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TaskConversationReadCursorRepository, TaskConversationRepository, TaskContextBindingRepository } from '@agora-ts/db';
import { createTaskServiceFromDb } from '@agora-ts/testing';
import { TaskContextBindingService } from './task-context-binding-service.js';
import { TaskConversationService } from './task-conversation-service.js';
import { TaskInboundService } from './task-inbound-service.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-inbound-'));
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

describe('task inbound service', () => {
  it('ingests a conversation entry and applies approve_current to the bound task', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({
      repository: bindingRepository,
      idGenerator: () => 'binding-inbound-1',
    });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      idGenerator: () => 'entry-inbound-1',
      now: () => new Date('2026-03-17T13:00:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-INBOUND-1',
      archonUsers: ['alice'],
    });
    const task = taskService.createTask({
      title: 'Inbound approval task',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-inbound-1',
    });

    const inbound = new TaskInboundService(
      conversations,
      bindings,
      taskService as unknown as ConstructorParameters<typeof TaskInboundService>[2],
    );
    const result = inbound.ingest({
      provider: 'discord',
      thread_ref: 'thread-inbound-1',
      provider_message_ref: 'msg-inbound-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'alice',
      display_name: 'Alice',
      body: 'approved from thread',
      occurred_at: '2026-03-17T13:00:00.000Z',
      task_action: {
        kind: 'approve_current',
        actor_ref: 'alice',
        comment: 'ship it',
      },
    });

    expect(result).toMatchObject({
      entry: {
        id: 'entry-inbound-1',
        task_id: 'OC-INBOUND-1',
        body: 'approved from thread',
      },
      task_action_result: {
        kind: 'approve_current',
        task_id: 'OC-INBOUND-1',
        current_stage: 'write',
        state: 'active',
      },
    });
  });

  it('passes next_stage_id through inbound advance_current actions for branching stages', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({
      repository: bindingRepository,
      idGenerator: () => 'binding-inbound-branch-1',
    });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      idGenerator: () => 'entry-inbound-branch-1',
      now: () => new Date('2026-03-17T13:10:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-INBOUND-BRANCH-1',
      archonUsers: ['alice'],
    });
    const task = taskService.createTask({
      title: 'Inbound branch advance task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'alice', member_kind: 'controller', model_preference: 'strong_reasoning' },
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
      thread_ref: 'thread-inbound-branch-1',
    });

    const inbound = new TaskInboundService(
      conversations,
      bindings,
      taskService as unknown as ConstructorParameters<typeof TaskInboundService>[2],
    );
    const result = inbound.ingest({
      provider: 'discord',
      thread_ref: 'thread-inbound-branch-1',
      provider_message_ref: 'msg-inbound-branch-1',
      direction: 'inbound',
      author_kind: 'agent',
      author_ref: 'alice',
      display_name: 'Alice',
      body: 'take deep review path',
      occurred_at: '2026-03-17T13:10:00.000Z',
      task_action: {
        kind: 'advance_current',
        actor_ref: 'alice',
        next_stage_id: 'deep-review',
      },
    });

    expect(result).toMatchObject({
      task_action_result: {
        kind: 'advance_current',
        task_id: 'OC-INBOUND-BRANCH-1',
        current_stage: 'deep-review',
        state: 'active',
      },
    });
  });

  it('completes graph-backed tasks through inbound advance_current when the stage has a complete edge', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({
      repository: bindingRepository,
      idGenerator: () => 'binding-inbound-complete-1',
    });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      idGenerator: () => 'entry-inbound-complete-1',
      now: () => new Date('2026-03-17T13:20:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-INBOUND-COMPLETE-1',
      archonUsers: ['alice'],
    });
    const task = taskService.createTask({
      title: 'Inbound complete edge task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'alice', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'deliver', mode: 'execute', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['deliver'],
          nodes: [
            { id: 'deliver', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'deliver__complete__done', from: 'deliver', to: 'done', kind: 'complete' },
          ],
        },
      },
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-inbound-complete-1',
    });

    const inbound = new TaskInboundService(
      conversations,
      bindings,
      taskService as unknown as ConstructorParameters<typeof TaskInboundService>[2],
    );
    const result = inbound.ingest({
      provider: 'discord',
      thread_ref: 'thread-inbound-complete-1',
      provider_message_ref: 'msg-inbound-complete-1',
      direction: 'inbound',
      author_kind: 'agent',
      author_ref: 'alice',
      display_name: 'Alice',
      body: 'finish this task',
      occurred_at: '2026-03-17T13:20:00.000Z',
      task_action: {
        kind: 'advance_current',
        actor_ref: 'alice',
      },
    });

    expect(result).toMatchObject({
      task_action_result: {
        kind: 'advance_current',
        task_id: 'OC-INBOUND-COMPLETE-1',
        current_stage: null,
        state: 'done',
      },
    });
  });
});
