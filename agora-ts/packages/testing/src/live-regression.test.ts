import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TaskContextBindingRepository, TaskConversationReadCursorRepository, TaskConversationRepository } from '@agora-ts/db';
import {
  StubIMProvisioningPort,
  TaskContextBindingService,
  TaskConversationService,
} from '@agora-ts/core';
import { createTaskServiceFromDb } from '@agora-ts/testing';
import { LiveRegressionActor } from './live-regression.js';

const tempDirs: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-live-regression-'));
  tempDirs.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('LiveRegressionActor', () => {
  it('publishes a regression operator message and records an outbound conversation entry', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-1',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      idGenerator: () => 'conversation-regression-1',
      now: () => new Date('2026-03-21T10:00:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-1',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor task',
      type: 'coding',
      creator: 'archon',
      description: 'existing live regression task',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date('2026-03-21T10:00:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-1' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Drive a live regression check',
      message: 'Please continue the regression flow and report blockers.',
      participantRefs: ['opus'],
    });

    expect(result).toMatchObject({
      taskId: 'OC-REG-ACTOR-1',
      bindingId: expect.any(String),
      threadRef: 'discord-thread-regression-actor-1',
      state: 'active',
      currentStage: expect.any(String),
    });
    expect(provisioning.published).toHaveLength(1);
    expect(provisioning.published[0]).toMatchObject({
      thread_ref: 'discord-thread-regression-actor-1',
      messages: [
        expect.objectContaining({
          kind: 'regression_operator',
          participant_refs: ['opus'],
          body: 'Please continue the regression flow and report blockers.',
        }),
      ],
    });
    expect(conversations.listByTask('OC-REG-ACTOR-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conversation-regression-1',
        direction: 'outbound',
        author_kind: 'agent',
        author_ref: 'agora-bot',
        display_name: 'AgoraBot',
        body: 'Please continue the regression flow and report blockers.',
        metadata: expect.objectContaining({
          regression_goal: 'Drive a live regression check',
        }),
      }),
    ]));
  });

  it('can fall back to a structured task action after publishing the regression prompt', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-2',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:00:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-2',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor advance task',
      type: 'coding',
      creator: 'archon',
      description: 'existing live regression task with fallback action',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'triage',
            mode: 'discuss',
            gate: { type: 'command' },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date('2026-03-21T11:00:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-2' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Drive the task into execute mode',
      message: 'Advance to execute if the thread is ready.',
      taskAction: {
        kind: 'advance_current',
        actor_ref: 'archon',
      },
    });

    expect(result.currentStage).toBe('execute');
    expect(result.state).toBe('active');
    expect(conversations.listByTask('OC-REG-ACTOR-2')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'outbound',
        metadata: expect.objectContaining({
          regression_goal: 'Drive the task into execute mode',
          task_action_kind: 'advance_current',
        }),
      }),
    ]));
  });

  it('auto-selects advance_current for command-gated stages when no explicit task action is provided', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-3',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:10:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-3',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
      allowAgents: {
        opus: { canCall: [], canAdvance: true },
      },
    });

    taskService.createTask({
      title: 'Regression actor auto action task',
      type: 'coding',
      creator: 'archon',
      description: 'command-gated auto progression',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'triage',
            mode: 'discuss',
            gate: { type: 'command' },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date('2026-03-21T11:10:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-3' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Auto-progress command gate',
      message: 'If the task is command-gated, continue automatically.',
    });

    expect(result.currentStage).toBe('execute');
    expect(conversations.listByTask('OC-REG-ACTOR-3')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'outbound',
        metadata: expect.objectContaining({
          regression_goal: 'Auto-progress command gate',
          task_action_kind: 'advance_current',
          task_action_actor: 'opus',
          task_action_source: 'auto',
        }),
      }),
    ]));
  });

  it('routes approve_current through the inbound action gateway for archon_review stages', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-4',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:20:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-4',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor archon review task',
      type: 'coding',
      creator: 'archon',
      description: 'archon review progression through inbound gateway',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'review',
            mode: 'discuss',
            gate: { type: 'archon_review' },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date('2026-03-21T11:20:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-4' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Approve the current archon review stage',
      message: 'Approve the current review stage if the regression contract allows it.',
      taskAction: {
        kind: 'approve_current',
        actor_ref: 'archon',
        comment: 'regression approval',
      },
    });

    expect(result.currentStage).toBe('execute');
    expect(result.state).toBe('active');
    expect(conversations.listByTask('OC-REG-ACTOR-4')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'outbound',
        metadata: expect.objectContaining({
          regression_goal: 'Approve the current archon review stage',
          task_action_kind: 'approve_current',
          task_action_actor: 'archon',
        }),
      }),
    ]));
  });
});
