import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { TaskService } from './task-service.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-service-'));
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
    expect(status.flow_log).toHaveLength(2);
    expect(status.progress_log).toHaveLength(1);
    expect(status.subtasks).toEqual([]);
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
    expect(outlineApproved.id).toBe('OC-102');

    const forced = service.forceAdvanceTask('OC-102', { reason: 'skip outline wait' });
    expect(forced.current_stage).toBe('write');

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
    expect(rejected.id).toBe('OC-102');

    const approved = service.approveTask('OC-102', {
      approverId: 'gpt52',
      comment: 'fixed',
    });
    const status = service.getTaskStatus('OC-102');

    expect(approved.id).toBe('OC-102');
    expect(status.subtasks).toMatchObject([
      {
        id: 'write-doc',
        status: 'done',
        output: '初稿完成',
      },
    ]);
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        'archon_approved',
        'force_advance',
        'subtask_done',
        'gate_failed',
        'rejected',
        'gate_passed',
      ]),
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
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['quorum_vote', 'state_changed']),
    );
  });
});
