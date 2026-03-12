import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { DashboardQueryService, HumanAccountService, StubIMProvisioningPort, TaskContextBindingService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-'));
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

describe('task routes', () => {
  it('creates, lists, and fetches task status from the fastify app', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200',
    });
    const app = buildApp({ taskService });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: '接任务接口到 TS server',
        type: 'coding',
        creator: 'archon',
        description: 'Phase 2 route parity',
        priority: 'high',
      },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-200/status',
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      id: 'OC-200',
      state: 'active',
      current_stage: 'discuss',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      task: {
        id: 'OC-200',
      },
      task_blueprint: {
        entry_nodes: ['discuss'],
        nodes: expect.any(Array),
        edges: expect.any(Array),
      },
      flow_log: expect.any(Array),
      progress_log: expect.any(Array),
      subtasks: [],
    });
  });

  it('accepts create-task overrides through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200B',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'override create route',
        type: 'coding',
        creator: 'archon',
        description: 'custom team',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'kickoff', mode: 'discuss', gate: { type: 'command' } },
            { id: 'build', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
        },
        im_target: {
          provider: 'discord',
          conversation_ref: 'channel-abc',
          visibility: 'private',
          participant_refs: ['opus', 'codex'],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-200B',
      current_stage: 'kickoff',
      team: {
        members: [
          { role: 'architect', agentId: 'opus' },
          { role: 'developer', agentId: 'codex' },
        ],
      },
      workflow: {
        type: 'custom',
        stages: [
          { id: 'kickoff' },
          { id: 'build' },
        ],
      },
    });
  });

  it('adds the dashboard session user discord identity to private-thread participants', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-200C',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200C',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.createUser({
      username: 'alice',
      password: 'secret-pass',
      role: 'member',
    });
    humanAccountService.bindIdentity({
      username: 'alice',
      provider: 'discord',
      externalUserId: 'discord-user-123',
    });
    const app = buildApp({
      taskService,
      humanAccountService,
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
        username: 'alice',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        title: 'route adds human discord identity',
        type: 'coding',
        creator: 'archon',
        description: 'custom team',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus'],
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response.statusCode).toBe(200);
    expect(provisioningPort.provisioned[0]?.participant_refs).toEqual(
      expect.arrayContaining(['opus', 'discord-user-123']),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'discord-user-123' }),
      ]),
    );
  });

  it('returns 403 on advance when gate is not satisfied', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-201',
    });
    taskService.createTask({
      title: '测试 gate 拒绝',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-201/advance',
      payload: {
        caller_id: 'archon',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Gate check failed for stage 'discuss' (gate type: archon_review)",
    });
  });

  it('serves task action routes for archon approve, subtask done, force advance, and approve', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-202',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: '补 task action routes',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });

    const archonApprove = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/archon-approve',
      payload: {
        reviewer_id: 'lizeyu',
        comment: 'outline ok',
      },
    });

    subtasks.insertSubtask({
      id: 'write-202',
      task_id: 'OC-202',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });

    const subtaskDone = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/subtask-done',
      payload: {
        subtask_id: 'write-202',
        caller_id: 'glm5',
        output: 'done',
      },
    });
    const advance = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/advance',
      payload: {
        caller_id: 'archon',
      },
    });
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/approve',
      payload: {
        approver_id: 'gpt52',
        comment: 'looks good',
      },
    });

    expect(archonApprove.statusCode).toBe(200);
    expect(archonApprove.json()).toMatchObject({
      id: 'OC-202',
      current_stage: 'write',
    });
    expect(subtaskDone.statusCode).toBe(200);
    expect(advance.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: 'OC-202',
      state: 'done',
    });
  });

  it('serves confirm and state transition routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-203',
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-203',
      title: '确认与状态切换',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'vote',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
      },
    });
    tasks.updateTask('OC-203', 1, { state: 'created' });
    tasks.updateTask('OC-203', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-203', 'vote');

    const app = buildApp({ taskService });

    const confirmOne = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'opus',
        vote: 'approve',
        comment: 'one',
      },
    });
    const confirmTwo = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'gpt52',
        vote: 'approve',
        comment: 'two',
      },
    });
    const pause = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/pause',
      payload: {
        reason: 'hold',
      },
    });
    const resume = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/resume',
    });
    const cancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/cancel',
      payload: {
        reason: 'closed',
      },
    });

    expect(confirmOne.statusCode).toBe(200);
    expect(confirmOne.json().quorum).toMatchObject({ approved: 1, total: 1 });
    expect(confirmTwo.statusCode).toBe(200);
    expect(confirmTwo.json().quorum).toMatchObject({ approved: 2, total: 2 });
    expect(pause.statusCode).toBe(200);
    expect(pause.json()).toMatchObject({ state: 'paused' });
    expect(resume.statusCode).toBe(200);
    expect(resume.json()).toMatchObject({ state: 'active' });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ state: 'cancelled' });
  });

  it('drives IM context archive/unarchive through pause, resume, and cancel routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-CTX-ROUTE',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-ROUTE',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const app = buildApp({ taskService });

    const create = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'route lifecycle',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['530383608410800138'],
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const pause = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/pause',
      payload: { reason: 'hold' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const resume = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/resume',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const cancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/cancel',
      payload: { reason: 'closed' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(create.statusCode).toBe(200);
    expect(pause.statusCode).toBe(200);
    expect(resume.statusCode).toBe(200);
    expect(cancel.statusCode).toBe(200);
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'archive', thread_ref: 'stub-thread-OC-CTX-ROUTE' }),
        expect.objectContaining({ mode: 'unarchive', thread_ref: 'stub-thread-OC-CTX-ROUTE' }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-ROUTE')[0]?.status).toBe('archived');
  });

  it('deletes the IM context when the archive job is marked synced through the route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-CTX-DELETE',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-DELETE',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const dashboardQueries = new DashboardQueryService(db, {
      templatesDir,
      taskContextBindingService: bindingService,
      imProvisioningPort: provisioningPort,
    });
    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });

    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'route archive delete',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['530383608410800138'],
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-DELETE/cancel',
      payload: { reason: 'closed' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const archiveJob = await app.inject({
      method: 'GET',
      url: '/api/archive/jobs?task_id=OC-CTX-DELETE',
    });
    const jobId = archiveJob.json()[0].id;
    const synced = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${jobId}/status`,
      payload: { status: 'synced', commit_hash: 'route-sync' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(synced.statusCode).toBe(200);
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'delete', thread_ref: 'stub-thread-OC-CTX-DELETE' }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-DELETE')[0]?.status).toBe('destroyed');
  });

  it('serves cleanup route for orphaned tasks', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-204',
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-204',
      title: 'cleanup task',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-204', 1, { state: 'orphaned' });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/cleanup',
      payload: { task_id: 'OC-204' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cleaned: 1 });
    expect(taskService.getTask('OC-204')).toBeNull();
  });

  it('serves reject, archon-reject, and unblock routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-205',
    });
    const subtasks = new SubtaskRepository(db);
    const tasks = new TaskRepository(db);

    taskService.createTask({
      title: 'review rejection route',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-205', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-205',
      task_id: 'OC-205',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    taskService.completeSubtask('OC-205', {
      subtaskId: 'write-205',
      callerId: 'glm5',
      output: 'done',
    });
    taskService.advanceTask('OC-205', { callerId: 'archon' });

    tasks.insertTask({
      id: 'OC-206',
      title: 'archon reject route',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [{ role: 'architect', agentId: 'opus', model_preference: 'reasoning' }] },
      workflow: {
        type: 'archon-review',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'archon_review' }, reject_target: 'draft' },
        ],
      },
    });
    tasks.updateTask('OC-206', 1, { state: 'created' });
    tasks.updateTask('OC-206', 2, { state: 'active', current_stage: 'review' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-206', 'review');

    tasks.insertTask({
      id: 'OC-207',
      title: 'unblock route',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-207', 1, { state: 'created' });
    tasks.updateTask('OC-207', 2, { state: 'active' });
    taskService.updateTaskState('OC-207', 'blocked', { reason: 'dependency' });

    const app = buildApp({ taskService });

    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-205/reject',
      payload: {
        rejector_id: 'gpt52',
        reason: 'needs more detail',
      },
    });
    const archonReject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-206/archon-reject',
      payload: {
        reviewer_id: 'lizeyu',
        reason: 'reject this stage',
      },
    });
    const archonRejectStatus = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-206/status',
    });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-207/unblock',
      payload: {
        reason: 'dependency resolved',
      },
    });

    expect(reject.statusCode).toBe(200);
    expect(reject.json()).toMatchObject({ id: 'OC-205', current_stage: 'write' });
    expect(archonReject.statusCode).toBe(200);
    expect(archonReject.json()).toMatchObject({ id: 'OC-206', current_stage: 'draft' });
    expect(archonRejectStatus.statusCode).toBe(200);
    expect(archonRejectStatus.json().flow_log.map((item: { event: string }) => item.event)).toEqual(
      expect.arrayContaining(['gate_failed', 'stage_rewound', 'archon_rejected']),
    );
    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-207', state: 'active' });
  });

  it('supports unblock retry through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-208',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock retry route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'retry-route',
      task_id: 'OC-208',
      stage_id: 'discuss',
      title: 'retry through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:retry-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    taskService.updateTaskState('OC-208', 'blocked', { reason: 'timeout escalation' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-208/unblock',
      payload: {
        reason: 'retry now',
        action: 'retry',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-208/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-208', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-route',
          status: 'not_started',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
      ]),
    );
  });

  it('supports unblock skip through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-209',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock skip route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'skip-route',
      task_id: 'OC-209',
      stage_id: 'discuss',
      title: 'skip through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:skip-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-209', 'blocked', { reason: 'human intervention' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-209/unblock',
      payload: {
        reason: 'skip now',
        action: 'skip',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-209/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-209', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-route',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
      ]),
    );
  });

  it('supports unblock reassign through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-210',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock reassign route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'reassign-route',
      task_id: 'OC-210',
      stage_id: 'discuss',
      title: 'reassign through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:reassign-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-210', 'blocked', { reason: 'human intervention' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-210/unblock',
      payload: {
        reason: 'reassign now',
        action: 'reassign',
        assignee: 'claude',
        craftsman_type: 'claude',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-210/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-210', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-route',
          status: 'not_started',
          assignee: 'claude',
          craftsman_type: 'claude',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
        }),
      ]),
    );
  });
});
