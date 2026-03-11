import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArchiveJobRepository, CraftsmanExecutionRepository, createAgoraDatabase, runMigrations, SubtaskRepository, TaskConversationRepository, TaskRepository, TaskContextBindingRepository, TemplateRepository } from '@agora-ts/db';
import { StubCraftsmanAdapter } from './craftsman-adapter.js';
import { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { TaskService } from './task-service.js';
import { TaskContextBindingService } from './task-context-binding-service.js';
import { TaskParticipationService } from './task-participation-service.js';
import { StubIMProvisioningPort } from './im-ports.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-service-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeEmptyTemplatesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-empty-templates-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('task service', () => {
  it('creates a task from template and exposes task status payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-100',
    });

    const task = service.createTask({
      title: '迁移 TS 任务主链路',
      type: 'coding',
      creator: 'archon',
      description: '先追平 create/list/get/status',
      priority: 'high',
    });
    const listed = service.listTasks();
    const status = service.getTaskStatus('OC-100');

    expect(task.id).toBe('OC-100');
    expect(task.state).toBe('active');
    expect(task.current_stage).toBe('discuss');
    expect(task.team.members.map((member) => member.role)).toContain('architect');
    expect(listed).toHaveLength(1);
    expect(status.task.id).toBe('OC-100');
    expect(status.task.controller_ref).toBe('opus');
    expect(status.task_blueprint).toMatchObject({
      graph_version: 1,
      entry_nodes: ['discuss'],
      controller_ref: 'opus',
      nodes: [
        { id: 'discuss', gate_type: 'archon_review' },
        { id: 'develop', gate_type: 'all_subtasks_done' },
        { id: 'review', gate_type: 'archon_review' },
      ],
      edges: [
        { from: 'discuss', to: 'develop', kind: 'advance' },
        { from: 'develop', to: 'review', kind: 'advance' },
        { from: 'review', to: 'develop', kind: 'reject' },
      ],
    });
    expect(status.flow_log).toHaveLength(2);
    expect(status.progress_log).toHaveLength(1);
    expect(status.subtasks).toEqual([]);
  });

  it('creates tasks from the database-backed template catalog even when the legacy templates directory is empty', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);
    templates.seedFromDir(templatesDir);

    const service = new TaskService(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-DB-TEMPLATE',
    });

    const task = service.createTask({
      title: '数据库模板创建',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });

    expect(task).toMatchObject({
      id: 'OC-DB-TEMPLATE',
      type: 'coding',
      current_stage: 'discuss',
    });
  });

  it('repairs stale database-backed templates with missing member_kind before building the task team', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);
    templates.saveTemplate('coding', {
      name: 'stale coding template',
      type: 'coding',
      governance: 'standard',
      defaultTeam: {
        architect: { suggested: ['opus'] },
        developer: { suggested: ['sonnet'] },
        craftsman: { suggested: ['codex'] },
      },
      stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
    }, 'user');

    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REPAIRED-TEMPLATE',
    });

    const task = service.createTask({
      title: 'repair stale template team semantics',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    expect(task.team.members).toEqual([
      { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: '' },
      { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: '' },
      { role: 'craftsman', agentId: 'codex', member_kind: 'craftsman', model_preference: '' },
    ]);
    expect(service.getTaskStatus('OC-REPAIRED-TEMPLATE').task.controller_ref).toBe('opus');
  });

  it('rejects advance before gate passes and advances once archon review is recorded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-101',
    });

    service.createTask({
      title: '推进 discuss gate',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    expect(() => service.advanceTask('OC-101', { callerId: 'archon' })).toThrow(
      "Gate check failed for stage 'discuss'",
    );

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-101', 'discuss', 'approved', 'lizeyu');

    const advanced = service.advanceTask('OC-101', { callerId: 'archon' });
    const status = service.getTaskStatus('OC-101');

    expect(advanced.current_stage).toBe('develop');
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'stage_advanced',
      stage_id: 'develop',
    });
  });

  it('uses allowAgents canAdvance config instead of team membership for command advances', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-104',
      archonUsers: ['archon'],
      allowAgents: {
        opus: { canCall: ['sonnet'], canAdvance: false },
        '*': { canCall: [], canAdvance: false },
      },
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-104',
      title: 'command advance permissions',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [{ role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' }],
      },
      workflow: {
        type: 'command-only',
        stages: [{ id: 'execute', gate: { type: 'command' } }],
      },
    });
    tasks.updateTask('OC-104', 1, { state: 'created' });
    tasks.updateTask('OC-104', 2, { state: 'active', current_stage: 'execute' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-104', 'execute');

    expect(() => service.advanceTask('OC-104', { callerId: 'opus' })).toThrow(
      'caller opus has canAdvance=false for /task advance',
    );
    expect(service.advanceTask('OC-104', { callerId: 'archon' }).state).toBe('done');
  });

  it('records archon approval, subtask completion, approval, and force advance actions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-102',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: '迁移剩余 task actions',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const outlineApproved = service.archonApproveTask('OC-102', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    expect(outlineApproved).toMatchObject({
      id: 'OC-102',
      current_stage: 'write',
    });

    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-102',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });

    const subtaskDone = service.completeSubtask('OC-102', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '初稿完成',
    });
    expect(subtaskDone.id).toBe('OC-102');

    const reviewStage = service.advanceTask('OC-102', { callerId: 'archon' });
    expect(reviewStage.current_stage).toBe('review');

    const rejected = service.rejectTask('OC-102', {
      rejectorId: 'gpt52',
      reason: 'needs more structure',
    });
    expect(rejected).toMatchObject({
      id: 'OC-102',
      current_stage: 'write',
    });

    subtasks.insertSubtask({
      id: 'write-doc-rework',
      task_id: 'OC-102',
      stage_id: 'write',
      title: '重写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-102', {
      subtaskId: 'write-doc-rework',
      callerId: 'glm5',
      output: '重写完成',
    });
    const reviewAgain = service.advanceTask('OC-102', { callerId: 'archon' });
    expect(reviewAgain.current_stage).toBe('review');

    const approved = service.approveTask('OC-102', {
      approverId: 'gpt52',
      comment: 'fixed',
    });
    const status = service.getTaskStatus('OC-102');

    expect(approved).toMatchObject({
      id: 'OC-102',
      state: 'done',
      current_stage: 'review',
    });
    expect(status.subtasks).toMatchObject([
      {
        id: 'write-doc',
        status: 'done',
        output: '初稿完成',
      },
      {
        id: 'write-doc-rework',
        status: 'done',
        output: '重写完成',
      },
    ]);
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        'gate_passed',
        'archon_approved',
        'stage_advanced',
        'subtask_done',
        'gate_failed',
        'stage_rewound',
        'rejected',
        'gate_passed',
      ]),
    );
  });

  it('auto-advances archon review stages and blocks repeated approval on the next gate', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-102A',
    });

    service.createTask({
      title: 'coding review auto advance',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const approved = service.archonApproveTask('OC-102A', {
      reviewerId: 'lizeyu',
      comment: 'go build',
    });

    expect(approved).toMatchObject({
      id: 'OC-102A',
      current_stage: 'develop',
    });
    expect(() => service.archonApproveTask('OC-102A', {
      reviewerId: 'lizeyu',
      comment: 'again',
    })).toThrow('当前 Gate 类型为 all_subtasks_done，不是 archon_review。');
  });

  it('mirrors key task actions into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103',
    });
    const bindings = new TaskContextBindingRepository(db);
    const conversations = new TaskConversationRepository(db);
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'mirror task actions',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-103',
      task_id: 'OC-103',
      im_provider: 'discord',
      thread_ref: 'thread-103',
      status: 'active',
    });

    service.archonApproveTask('OC-103', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-103',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-103', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '初稿完成',
    });
    service.advanceTask('OC-103', { callerId: 'archon' });
    service.rejectTask('OC-103', {
      rejectorId: 'gpt52',
      reason: 'needs more structure',
    });

    const entries = conversations.listByTask('OC-103');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Archon approved: outline ok',
        'Advanced to stage write',
        'Subtask write-doc marked done',
        'Advanced to stage review',
        'Approval rejected: needs more structure',
      ]),
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: 'bind-103',
          provider: 'discord',
          direction: 'system',
          author_kind: 'system',
        }),
      ]),
    );
  });

  it('mirrors state transition actions into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103B',
    });
    const bindings = new TaskContextBindingRepository(db);
    const conversations = new TaskConversationRepository(db);
    const tasks = new TaskRepository(db);

    service.createTask({
      title: 'mirror state transitions',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-103b',
      task_id: 'OC-103B',
      im_provider: 'discord',
      thread_ref: 'thread-103b',
      status: 'active',
    });

    service.pauseTask('OC-103B', { reason: 'hold for review' });
    service.resumeTask('OC-103B');
    const latest = tasks.getTask('OC-103B');
    if (!latest) {
      throw new Error('Expected task OC-103B to exist');
    }
    tasks.updateTask('OC-103B', latest.version, { state: 'blocked' });
    service.unblockTask('OC-103B', { reason: 'dependency resolved' });
    service.cancelTask('OC-103B', { reason: 'manual stop' });

    const entries = conversations.listByTask('OC-103B');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Task paused: hold for review',
        'Task resumed',
        'Task unblocked: dependency resolved',
        'Task cancelled: manual stop',
      ]),
    );
  });

  it('records gate result events for archon review decisions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-108',
    });
    const tasks = new TaskRepository(db);

    service.createTask({
      title: 'archon gate result logs',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    service.archonApproveTask('OC-108', {
      reviewerId: 'lizeyu',
      comment: 'approved',
    });

    tasks.insertTask({
      id: 'OC-109',
      title: 'archon reject logs',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: {
        type: 'archon-review',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'archon_review' }, reject_target: 'draft' },
        ],
      },
    });
    tasks.updateTask('OC-109', 1, { state: 'created' });
    tasks.updateTask('OC-109', 2, { state: 'active', current_stage: 'review' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-109', 'review');

    const rejected = service.archonRejectTask('OC-109', {
      reviewerId: 'lizeyu',
      reason: 'not ready',
    });
    expect(rejected.current_stage).toBe('draft');

    expect(service.getTaskStatus('OC-108').flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['gate_passed', 'archon_approved']),
    );
    expect(service.getTaskStatus('OC-109').flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['gate_failed', 'stage_rewound', 'archon_rejected']),
    );
  });

  it('records quorum confirmations and supports pause/resume/cancel/unblock state transitions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103',
    });
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-103',
      title: '自定义 quorum 任务',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'quorum-only',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
      },
    });
    tasks.updateTask('OC-103', 1, { state: 'created' });
    tasks.updateTask('OC-103', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-103', 'vote');

    const firstVote = service.confirmTask('OC-103', {
      voterId: 'opus',
      vote: 'approve',
      comment: 'first yes',
    });
    const secondVote = service.confirmTask('OC-103', {
      voterId: 'gpt52',
      vote: 'approve',
      comment: 'second yes',
    });

    expect(firstVote.quorum).toMatchObject({ approved: 1, total: 1 });
    expect(secondVote.quorum).toMatchObject({ approved: 2, total: 2 });

    const paused = service.pauseTask('OC-103', { reason: 'waiting' });
    const resumed = service.resumeTask('OC-103');
    const blocked = service.updateTaskState('OC-103', 'blocked', { reason: 'dependency' });
    const unblocked = service.unblockTask('OC-103', { reason: 'dependency cleared' });
    const cancelled = service.cancelTask('OC-103', { reason: 'closed' });
    const status = service.getTaskStatus('OC-103');

    expect(paused.state).toBe('paused');
    expect(resumed.state).toBe('active');
    expect(blocked.state).toBe('blocked');
    expect(unblocked.state).toBe('active');
    expect(cancelled.state).toBe('cancelled');
    expect(archives.listArchiveJobs({ taskId: 'OC-103' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task_id: 'OC-103',
          status: 'pending',
          payload: expect.objectContaining({
            state: 'cancelled',
          }),
        }),
      ]),
    );
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        'quorum_vote',
        'state_changed',
        'paused',
        'resumed',
        'blocked',
        'unblocked',
        'cancelled',
      ]),
    );
  });

  it('supports unblock retry by resetting failed subtasks in the current stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-110',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock retry',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'retry-me',
      task_id: 'OC-110',
      stage_id: 'discuss',
      title: 'Retry this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:retry-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'leave-alone',
      task_id: 'OC-110',
      stage_id: 'discuss',
      title: 'Already done',
      assignee: 'opus',
      status: 'done',
      output: 'done',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    service.updateTaskState('OC-110', 'blocked', { reason: 'timeout escalation' });

    const unblocked = service.unblockTask('OC-110', { reason: 'retry now', action: 'retry' });
    const status = service.getTaskStatus('OC-110');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-me',
          status: 'not_started',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
        expect.objectContaining({
          id: 'leave-alone',
          status: 'done',
          output: 'done',
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'retry now',
        action: 'retry',
        retried_subtasks: ['retry-me'],
      }),
    });
  });

  it('supports unblock skip by marking failed subtasks done in the current stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-111',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock skip',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'skip-me',
      task_id: 'OC-111',
      stage_id: 'discuss',
      title: 'Skip this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:skip-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'other-stage',
      task_id: 'OC-111',
      stage_id: 'develop',
      title: 'Do not touch',
      assignee: 'opus',
      status: 'failed',
      output: 'keep failed',
      dispatch_status: 'failed',
    });
    service.updateTaskState('OC-111', 'blocked', { reason: 'human intervention' });

    const unblocked = service.unblockTask('OC-111', { reason: 'skip now', action: 'skip' });
    const status = service.getTaskStatus('OC-111');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-me',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
        expect.objectContaining({
          id: 'other-stage',
          status: 'failed',
          output: 'keep failed',
          dispatch_status: 'failed',
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'skip now',
        action: 'skip',
        skipped_subtasks: ['skip-me'],
      }),
    });
  });

  it('supports unblock reassign by resetting failed subtasks to a new assignee', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-112',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock reassign',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'reassign-me',
      task_id: 'OC-112',
      stage_id: 'discuss',
      title: 'Reassign this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:reassign-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    service.updateTaskState('OC-112', 'blocked', { reason: 'human intervention' });

    const unblocked = service.unblockTask('OC-112', {
      reason: 'reassign now',
      action: 'reassign',
      assignee: 'claude',
      craftsman_type: 'claude',
    });
    const status = service.getTaskStatus('OC-112');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-me',
          status: 'not_started',
          assignee: 'claude',
          craftsman_type: 'claude',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'reassign now',
        action: 'reassign',
        reassigned_subtasks: ['reassign-me'],
        assignee: 'claude',
        craftsman_type: 'claude',
      }),
    });
  });

  it('cancels active subtasks and craftsmen executions while capturing a scheduler snapshot', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-105',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'cancel state closure',
      type: 'coding',
      creator: 'archon',
      description: 'ensure cancel closes outstanding work',
      priority: 'high',
    });

    subtasks.insertSubtask({
      id: 'draft-plan',
      task_id: 'OC-105',
      stage_id: 'discuss',
      title: 'Draft the plan',
      assignee: 'opus',
      status: 'not_started',
    });
    subtasks.insertSubtask({
      id: 'run-codex',
      task_id: 'OC-105',
      stage_id: 'develop',
      title: 'Run codex',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'success',
      craftsman_session: 'tmux:run-codex',
    });
    subtasks.insertSubtask({
      id: 'keep-done',
      task_id: 'OC-105',
      stage_id: 'review',
      title: 'Done already',
      assignee: 'gpt52',
      status: 'done',
      output: 'kept',
      done_at: '2026-03-09T10:00:00.000Z',
    });

    executions.insertExecution({
      execution_id: 'exec-queued',
      task_id: 'OC-105',
      subtask_id: 'run-codex',
      adapter: 'codex',
      mode: 'task',
      status: 'queued',
      session_id: 'tmux:queued',
    });
    executions.insertExecution({
      execution_id: 'exec-running',
      task_id: 'OC-105',
      subtask_id: 'run-codex',
      adapter: 'codex',
      mode: 'task',
      status: 'running',
      session_id: 'tmux:running',
      started_at: '2026-03-09T10:01:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-succeeded',
      task_id: 'OC-105',
      subtask_id: 'keep-done',
      adapter: 'codex',
      mode: 'task',
      status: 'succeeded',
      session_id: 'tmux:done',
      finished_at: '2026-03-09T10:02:00.000Z',
    });

    const cancelled = service.cancelTask('OC-105', { reason: 'scope dropped' });
    const status = service.getTaskStatus('OC-105');

    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.error_detail).toBe('scope dropped');
    expect(cancelled.scheduler_snapshot).toMatchObject({
      state: 'active',
      current_stage: 'discuss',
    });

    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'draft-plan',
          status: 'failed',
          output: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          id: 'run-codex',
          status: 'failed',
          output: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          id: 'keep-done',
          status: 'done',
          output: 'kept',
        }),
      ]),
    );

    const executionStates = executions.listBySubtask('OC-105', 'run-codex');
    expect(executionStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          execution_id: 'exec-queued',
          status: 'cancelled',
          error: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          execution_id: 'exec-running',
          status: 'cancelled',
          error: 'Task cancelled: scope dropped',
        }),
      ]),
    );
    expect(executions.getExecution('exec-succeeded')).toMatchObject({
      status: 'succeeded',
      error: null,
    });
  });

  it('cleans up craftsman executions when deleting orphaned tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-106',
    });
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    const draft = tasks.insertTask({
      id: 'OC-106',
      title: 'cleanup execution residue',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-106', draft.version, { state: 'orphaned' });
    subtasks.insertSubtask({
      id: 'cleanup-subtask',
      task_id: 'OC-106',
      stage_id: 'develop',
      title: 'Orphaned craft',
      assignee: 'codex',
      status: 'failed',
      craftsman_type: 'codex',
    });
    executions.insertExecution({
      execution_id: 'exec-orphaned',
      task_id: 'OC-106',
      subtask_id: 'cleanup-subtask',
      adapter: 'codex',
      mode: 'task',
      status: 'failed',
      session_id: 'tmux:orphaned',
      finished_at: '2026-03-09T10:03:00.000Z',
    });

    const cleaned = service.cleanupOrphaned('OC-106');

    expect(cleaned).toBe(1);
    expect(service.getTask('OC-106')).toBeNull();
    expect(executions.getExecution('exec-orphaned')).toBeNull();
  });

  it('rejects craftsmen dispatch when the task is not active', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-paused-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T11:00:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-107',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'paused dispatch guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'paused-subtask',
      task_id: 'OC-107',
      stage_id: 'discuss',
      title: 'Dispatch should fail',
      assignee: 'codex',
      status: 'not_started',
      craftsman_type: 'codex',
    });
    service.pauseTask('OC-107', { reason: 'hold' });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-107',
      subtask_id: 'paused-subtask',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
    })).toThrow("Task OC-107 is in state 'paused', expected 'active'");
    expect(executions.listBySubtask('OC-107', 'paused-subtask')).toEqual([]);
  });

  it('flushes deferred craftsmen callbacks when resuming a paused task', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-113',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'resume deferred callbacks',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'resume-me',
      task_id: 'OC-113',
      stage_id: 'discuss',
      title: 'Flush on resume',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:resume-me',
    });
    executions.insertExecution({
      execution_id: 'exec-resume-1',
      task_id: 'OC-113',
      subtask_id: 'resume-me',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:resume-me',
      status: 'running',
      started_at: '2026-03-09T12:00:00.000Z',
    });

    service.pauseTask('OC-113', { reason: 'hold' });
    service.handleCraftsmanCallback({
      execution_id: 'exec-resume-1',
      status: 'succeeded',
      session_id: 'tmux:resume-me',
      payload: {
        output: {
          summary: 'done while paused',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-09T12:01:00.000Z',
    });

    const pausedStatus = service.getTaskStatus('OC-113');
    expect(pausedStatus.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume-me',
          status: 'in_progress',
          dispatch_status: 'running',
        }),
      ]),
    );

    const resumed = service.resumeTask('OC-113');
    const resumedStatus = service.getTaskStatus('OC-113');

    expect(resumed.state).toBe('active');
    expect(resumedStatus.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume-me',
          status: 'done',
          dispatch_status: 'succeeded',
          output: 'done while paused',
          done_at: '2026-03-09T12:01:00.000Z',
        }),
      ]),
    );
    expect(resumedStatus.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_callback_deferred', 'resumed', 'subtask_done']),
    );
  });

  it('enqueues a pending archive job when a task reaches done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-114',
    });
    const subtasks = new SubtaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    service.createTask({
      title: 'archive when done',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    service.archonApproveTask('OC-114', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-114',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-114', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '草稿完成',
    });
    service.advanceTask('OC-114', { callerId: 'archon' });
    service.approveTask('OC-114', {
      approverId: 'gpt52',
      comment: 'ship it',
    });

    const archiveJobs = archives.listArchiveJobs({ taskId: 'OC-114' });

    expect(service.getTask('OC-114')).toMatchObject({
      state: 'done',
    });
    expect(archiveJobs).toHaveLength(1);
    expect(archiveJobs[0]).toMatchObject({
      task_id: 'OC-114',
      status: 'pending',
      writer_agent: 'writer-agent',
    });
    expect(archiveJobs[0]?.target_path).toContain('OC-114');
  });

  it('fails running craftsmen work on resume when the session is no longer alive', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-115',
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'resume dead session',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'dead-subtask',
      task_id: 'OC-115',
      stage_id: 'discuss',
      title: 'Dead session subtask',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T13:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-dead-1',
      task_id: 'OC-115',
      subtask_id: 'dead-subtask',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T13:00:00.000Z',
    });

    service.pauseTask('OC-115', { reason: 'hold' });
    const resumed = service.resumeTask('OC-115');
    const status = service.getTaskStatus('OC-115');

    expect(resumed.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dead-subtask',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on resume: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on resume: tmux:dead',
      finished_at: expect.any(String),
    });
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_session_missing_on_resume', 'resumed']),
    );
  });

  it('blocks active tasks with dead craftsmen sessions during startup recovery scan', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-116',
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'startup recovery dead session',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'startup-dead',
      task_id: 'OC-116',
      stage_id: 'discuss',
      title: 'Dead on startup',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T14:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-startup-dead-1',
      task_id: 'OC-116',
      subtask_id: 'startup-dead',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T14:00:00.000Z',
    });

    const recovered = service.startupRecoveryScan();
    const status = service.getTaskStatus('OC-116');

    expect(recovered).toEqual({
      scanned_tasks: 1,
      blocked_tasks: 1,
      failed_subtasks: 1,
      failed_executions: 1,
    });
    expect(status.task.state).toBe('blocked');
    expect(status.task.error_detail).toBe('startup recovery blocked task after missing craftsmen sessions');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'startup-dead',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on startup recovery: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-startup-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on startup recovery: tmux:dead',
      finished_at: expect.any(String),
    });
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_session_missing_on_startup', 'blocked', 'state_changed']),
    );
  });

  it('mirrors startup recovery blocking into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-116B',
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });
    const bindings = new TaskContextBindingRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const conversations = new TaskConversationRepository(db);

    service.createTask({
      title: 'startup recovery mirror',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-116b',
      task_id: 'OC-116B',
      im_provider: 'discord',
      thread_ref: 'thread-116b',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'startup-dead',
      task_id: 'OC-116B',
      stage_id: 'discuss',
      title: 'Dead on startup',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T14:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-startup-dead-116b',
      task_id: 'OC-116B',
      subtask_id: 'startup-dead',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T14:00:00.000Z',
    });

    service.startupRecoveryScan();

    const entries = conversations.listByTask('OC-116B');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Task blocked: startup recovery blocked task after missing craftsmen sessions',
      ]),
    );
  });

  it('fires IM provisioning and creates a binding when imProvisioningPort is configured', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskParticipation = new TaskParticipationService(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-prov-1', 'pb-prov-2', 'pb-prov-3', 'pb-prov-4'];
        return () => ids.shift() ?? 'pb-prov-x';
      })(),
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROV-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Provisioning Test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    // Wait for the async provisioning to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.provisioned).toHaveLength(1);
    expect(provisioningPort.provisioned[0]).toMatchObject({
      task_id: 'OC-PROV-1',
      title: 'Provisioning Test',
      participant_refs: expect.arrayContaining(['opus', 'sonnet', 'glm5']),
    });

    const bindings = new TaskContextBindingRepository(db);
    const binding = bindings.getActiveByTask('OC-PROV-1');
    expect(binding).not.toBeNull();
    expect(binding?.im_provider).toBe('discord');
    expect(binding?.conversation_ref).toBe('discord-parent-channel');
    expect(binding?.thread_ref).toBe('stub-thread-OC-PROV-1');
    expect(taskParticipation.listParticipants('OC-PROV-1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'opus',
          binding_id: binding?.id,
          join_status: 'pending',
          runtime_provider: 'openclaw',
        }),
      ]),
    );
    expect(taskParticipation.listParticipants('OC-PROV-1')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'claude_code',
        }),
      ]),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: binding?.id,
          participant_ref: 'opus',
          thread_ref: 'stub-thread-OC-PROV-1',
        }),
        expect.objectContaining({
          binding_id: binding?.id,
          participant_ref: 'sonnet',
          thread_ref: 'stub-thread-OC-PROV-1',
        }),
      ]),
    );
    expect(provisioningPort.joined).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participant_ref: 'claude_code',
        }),
      ]),
    );
  });

  it('applies team/workflow overrides when creating a task', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-OVERRIDE-1',
    });

    const created = service.createTask({
      title: 'Override team and workflow',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'claude-opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'deliver', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        ],
      },
    });

    expect(created.current_stage).toBe('triage');
    expect(created.team).toEqual({
      members: [
        { role: 'architect', agentId: 'claude-opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
        { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
      ],
    });
    expect(created.workflow).toMatchObject({
      type: 'custom',
      stages: [
        { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
        { id: 'deliver', mode: 'execute', gate: { type: 'all_subtasks_done' } },
      ],
    });
  });
});
