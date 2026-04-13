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
      settled: true,
      initialState: 'active',
      appliedTaskAction: {
        kind: 'approve_current',
        actorRef: 'archon',
        source: 'auto',
      },
      actionResult: expect.objectContaining({
        kind: 'approve_current',
        state: 'active',
      }),
      latestConversation: expect.objectContaining({
        entryId: expect.any(String),
        bodyExcerpt: expect.any(String),
      }),
      failureHint: null,
    });
    const regressionPublishes = provisioning.published.filter((entry) => entry.messages.some((message) => (
      message.kind === 'regression_operator'
      && message.body === 'Please continue the regression flow and report blockers.'
    )));
    expect(regressionPublishes.length).toBeGreaterThan(0);
    expect(regressionPublishes).toContainEqual(expect.objectContaining({
      thread_ref: 'discord-thread-regression-actor-1',
      messages: [
        expect.objectContaining({
          kind: 'regression_operator',
          participant_refs: ['opus'],
          body: 'Please continue the regression flow and report blockers.',
        }),
      ],
    }));
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
    expect(result.settled).toBe(true);
    expect(result.initialStage).toBe('triage');
    expect(result.stageChanged).toBe(true);
    expect(result.appliedTaskAction).toEqual({
      kind: 'advance_current',
      actorRef: 'archon',
      source: 'explicit',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'advance_current',
      state: 'active',
      currentStage: 'execute',
    });
    expect(result.failureHint).toBeNull();
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
    expect(result.settled).toBe(true);
    expect(result.appliedTaskAction).toEqual({
      kind: 'advance_current',
      actorRef: 'opus',
      source: 'auto',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'advance_current',
      currentStage: 'execute',
    });
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
    expect(result.settled).toBe(true);
    expect(result.appliedTaskAction).toEqual({
      kind: 'approve_current',
      actorRef: 'archon',
      source: 'explicit',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'approve_current',
      state: 'active',
      currentStage: 'execute',
    });
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

  it('reports quorum action evidence for explicit confirm_current actions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-5',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:30:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-5',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor quorum task',
      type: 'coding',
      creator: 'archon',
      description: 'quorum evidence reporting',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'vote',
            mode: 'discuss',
            gate: { type: 'quorum', required: 2 },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'archon', member_kind: 'controller', model_preference: 'test' },
          { role: 'reviewer', agentId: 'reviewer-a', member_kind: 'citizen', model_preference: 'test' },
          { role: 'developer', agentId: 'developer-a', member_kind: 'citizen', model_preference: 'test' },
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
      now: () => new Date('2026-03-21T11:30:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-5' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Record the first quorum vote',
      message: 'Cast one quorum vote and report the tally.',
      taskAction: {
        kind: 'confirm_current',
        actor_ref: 'reviewer-a',
        vote: 'approve',
        comment: 'regression quorum vote',
      },
    });

    expect(result.currentStage).toBe('vote');
    expect(result.settled).toBe(true);
    expect(result.stageChanged).toBe(false);
    expect(result.appliedTaskAction).toEqual({
      kind: 'confirm_current',
      actorRef: 'reviewer-a',
      source: 'explicit',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'confirm_current',
      state: 'active',
      currentStage: 'vote',
      quorum: {
        approved: 1,
        total: 1,
      },
    });
    expect(result.latestConversation.entryId).toEqual(expect.any(String));
    expect(result.latestConversation.bodyExcerpt).toEqual(expect.any(String));
    expect(result.failureHint).toBeNull();
  });

  it('auto-selects approve_current for approval-gated stages using the reviewer role', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-6',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:40:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-6',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor auto approval task',
      type: 'coding',
      creator: 'archon',
      description: 'approval-gated auto progression',
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
            gate: { type: 'approval', approver_role: 'reviewer' },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'glm5', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
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
      now: () => new Date('2026-03-21T11:40:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-6' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Auto-progress approval gate',
      message: 'If the task is approval-gated, continue automatically.',
    });

    expect(result.currentStage).toBe('execute');
    expect(result.appliedTaskAction).toEqual({
      kind: 'approve_current',
      actorRef: 'haiku',
      source: 'auto',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'approve_current',
      currentStage: 'execute',
    });
  });

  it('auto-selects approve_current for archon_review stages using the archon actor', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-7',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T11:50:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-7',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor auto archon review task',
      type: 'coding',
      creator: 'archon',
      description: 'archon-gated auto progression',
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
      team_override: {
        members: [
          { role: 'architect', agentId: 'glm5', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
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
      now: () => new Date('2026-03-21T11:50:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-7' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Auto-progress archon review gate',
      message: 'If the task is archon-review-gated, continue automatically.',
    });

    expect(result.currentStage).toBe('execute');
    expect(result.appliedTaskAction).toEqual({
      kind: 'approve_current',
      actorRef: 'archon',
      source: 'auto',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'approve_current',
      currentStage: 'execute',
    });
  });

  it('auto-selects confirm_current for quorum stages using an in-roster participant', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-8',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T12:00:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-8',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor auto quorum task',
      type: 'coding',
      creator: 'archon',
      description: 'quorum-gated auto progression',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'vote',
            mode: 'discuss',
            gate: { type: 'quorum', required: 2 },
            roster: {
              include_roles: ['reviewer'],
              keep_controller: false,
            },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'glm5', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
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
      now: () => new Date('2026-03-21T12:00:00.000Z'),
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-8' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Auto-cast a quorum vote',
      message: 'If the task is quorum-gated, cast the next vote automatically.',
    });

    expect(result.currentStage).toBe('vote');
    expect(result.stageChanged).toBe(false);
    expect(result.appliedTaskAction).toEqual({
      kind: 'confirm_current',
      actorRef: 'haiku',
      source: 'auto',
    });
    expect(result.actionResult).toMatchObject({
      kind: 'confirm_current',
      currentStage: 'vote',
      quorum: {
        approved: 1,
        total: 1,
      },
    });
  });

  it('waits for the expected stage transition before reporting success', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-9',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T12:10:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-9',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor observed quorum task',
      type: 'coding',
      creator: 'archon',
      description: 'waits for a follow-up stage transition',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'vote',
            mode: 'discuss',
            gate: { type: 'quorum', required: 2 },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'archon', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
          { role: 'developer', agentId: 'glm47', member_kind: 'citizen', model_preference: 'cost_regression' },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    let observedWaits = 0;
    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date('2026-03-21T12:10:00.000Z'),
      sleep: async () => {
        observedWaits += 1;
        if (observedWaits === 1) {
          taskService.confirmTask('OC-REG-ACTOR-9', {
            voterId: 'glm47',
            vote: 'approve',
            comment: 'second quorum vote',
          });
          taskService.advanceTask('OC-REG-ACTOR-9', { callerId: 'archon' });
        }
      },
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-9' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Observe the task until it reaches execute',
      message: 'Cast the first vote, then keep watching until execute.',
      taskAction: {
        kind: 'confirm_current',
        actor_ref: 'haiku',
        vote: 'approve',
        comment: 'first quorum vote',
      },
      waitFor: {
        currentStage: 'execute',
        timeoutMs: 10,
        pollIntervalMs: 0,
      },
    });

    expect(result.currentStage).toBe('execute');
    expect(result.goalSatisfied).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.observationAttempts).toBeGreaterThanOrEqual(1);
    expect(result.failureHint).toBeNull();
    expect(result.latestConversation.bodyExcerpt).toSatisfy((excerpt: string | null) => (
      excerpt?.includes('当前阶段: execute')
      || excerpt?.includes('Advanced to stage execute')
    ) ?? false);
  });

  it('reports a target mismatch when the expected stage is not reached before timeout', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-10',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date('2026-03-21T12:20:01.000Z'),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-10',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor timed-out quorum task',
      type: 'coding',
      creator: 'archon',
      description: 'reports an unmet target stage',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'vote',
            mode: 'discuss',
            gate: { type: 'quorum', required: 2 },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'archon', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
          { role: 'developer', agentId: 'glm47', member_kind: 'citizen', model_preference: 'cost_regression' },
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
      now: () => new Date('2026-03-21T12:20:00.000Z'),
      sleep: async () => {},
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-10' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Observe the task until it reaches execute',
      message: 'Cast the first vote and report if execute is never reached.',
      taskAction: {
        kind: 'confirm_current',
        actor_ref: 'haiku',
        vote: 'approve',
        comment: 'first quorum vote',
      },
      waitFor: {
        currentStage: 'execute',
        timeoutMs: 0,
        pollIntervalMs: 0,
      },
    });

    expect(result.currentStage).toBe('vote');
    expect(result.goalSatisfied).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.observationAttempts).toBe(1);
    expect(result.failureHint).toContain('expected currentStage=execute');
  });

  it('can drive auto-timeout stages forward during observation waits', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-actor-timeout',
    });
    const bindingRepository = new TaskContextBindingRepository(db);
    const conversationRepository = new TaskConversationRepository(db);
    const readCursorRepository = new TaskConversationReadCursorRepository(db);
    const bindings = new TaskContextBindingService({ repository: bindingRepository });
    const conversations = new TaskConversationService({
      bindingRepository,
      conversationRepository,
      readCursorRepository,
      now: () => new Date(),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REG-ACTOR-TIMEOUT',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'Regression actor timeout task',
      type: 'coding',
      creator: 'archon',
      description: 'auto-timeout progression through live regression actor',
      priority: 'normal',
      control: {
        mode: 'regression_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'wait',
            mode: 'discuss',
            gate: { type: 'auto_timeout', timeout_sec: 1 },
          },
          {
            id: 'escalate',
            mode: 'discuss',
            gate: { type: 'command' },
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

    let currentTime = Date.now();
    const actor = new LiveRegressionActor({
      taskService,
      taskContextBindingService: bindings,
      taskConversationService: conversations,
      imProvisioningPort: provisioning,
      now: () => new Date(currentTime),
      sleep: async () => {
        currentTime += 1_500;
      },
    });

    const result = await actor.run({
      target: { taskId: 'OC-REG-ACTOR-TIMEOUT' },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: 'Observe the task until it auto-advances to escalate',
      message: 'Wait for the timeout gate to advance the task automatically.',
      waitFor: {
        currentStage: 'escalate',
        timeoutMs: 5_000,
        pollIntervalMs: 0,
        driveAutoTimeouts: true,
      },
    });

    expect(result.currentStage).toBe('escalate');
    expect(result.goalSatisfied).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.observationAttempts).toBeGreaterThanOrEqual(1);
    expect(result.failureHint).toBeNull();
  });
});
