import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalRequestRepository, ArchiveJobRepository, CraftsmanExecutionRepository, createAgoraDatabase, runMigrations, SubtaskRepository, TaskBrainBindingRepository, TaskConversationRepository, TaskRepository, TaskContextBindingRepository, TemplateRepository } from '@agora-ts/db';
import { StubCraftsmanAdapter } from './craftsman-adapter.js';
import { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { FilesystemTaskBrainWorkspaceAdapter } from './adapters/filesystem-task-brain-workspace-adapter.js';
import { TaskService } from './task-service.js';
import { TaskBrainBindingService } from './task-brain-binding-service.js';
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

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-brain-pack-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'templates'), { recursive: true });
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

  it('builds task blueprint from workflow.graph when present', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-BLUEPRINT',
    });

    const task = service.createTask({
      title: 'Graph blueprint',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['draft'],
          nodes: [
            { id: 'draft', kind: 'stage', execution_kind: 'citizen_discuss', gate: { type: 'command' } },
            { id: 'review', kind: 'stage', execution_kind: 'human_approval', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
            { id: 'review__reject__draft', from: 'review', to: 'draft', kind: 'reject' },
          ],
        },
      },
    });

    const status = service.getTaskStatus(task.id);
    expect(status.task_blueprint).toMatchObject({
      graph_version: 1,
      entry_nodes: ['draft'],
      nodes: [
        { id: 'draft', execution_kind: 'citizen_discuss' },
        { id: 'review', execution_kind: 'human_approval', gate_type: 'approval' },
      ],
      edges: [
        { from: 'draft', to: 'review', kind: 'advance' },
        { from: 'review', to: 'draft', kind: 'reject' },
      ],
    });
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

  it('creates an ad-hoc task when team and workflow overrides are fully provided for an unknown type', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const service = new TaskService(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-ADHOC-OVERRIDE',
    });

    const created = service.createTask({
      title: 'Ad-hoc orchestration',
      type: 'adhoc-runtime-task',
      creator: 'archon',
      description: 'create from explicit overrides only',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'claude-opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        ],
      },
    });

    const status = service.getTaskStatus('OC-ADHOC-OVERRIDE');

    expect(created).toMatchObject({
      id: 'OC-ADHOC-OVERRIDE',
      type: 'adhoc-runtime-task',
      state: 'active',
      current_stage: 'triage',
    });
    expect(created.team.members.map((member) => member.role)).toEqual(['architect', 'developer']);
    expect(status.task_blueprint).toMatchObject({
      entry_nodes: ['triage'],
      controller_ref: 'claude-opus',
      nodes: [
        { id: 'triage', gate_type: 'command' },
        { id: 'ship', gate_type: 'all_subtasks_done' },
      ],
    });
  });

  it('creates a brain binding and materialized workspace when task brain services are configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-100',
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-binding-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    const task = service.createTask({
      title: 'Brain pack materialization',
      type: 'coding',
      creator: 'archon',
      description: 'materialize task workspace',
      priority: 'high',
    });

    const bindings = new TaskBrainBindingRepository(db);
    const binding = bindings.getActiveByTask(task.id);
    expect(binding).toMatchObject({
      id: 'brain-binding-1',
      task_id: 'OC-BRAIN-100',
      brain_pack_ref: 'agora-ai-brain',
      brain_task_id: 'OC-BRAIN-100',
      status: 'active',
    });
    expect(binding?.workspace_path).toBe(join(brainPackDir, 'tasks', 'OC-BRAIN-100'));
    expect(existsSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', 'task.meta.yaml'))).toBe(true);
    expect(existsSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '05-agents', 'opus', '00-role-brief.md'))).toBe(true);
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '02-roster.md'), 'utf8')).toContain('opus | architect | controller');
  });

  it('rolls back task creation when brain workspace materialization fails', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-FAIL',
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-binding-fail',
      }),
      taskBrainWorkspacePort: {
        createWorkspace: () => {
          throw new Error('brain workspace boom');
        },
        updateWorkspace: () => {},
        destroyWorkspace: () => {},
      },
    });

    expect(() => service.createTask({
      title: 'Brain failure',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    })).toThrow('brain workspace boom');
    expect(tasks.getTask('OC-BRAIN-FAIL')).toBeNull();
    expect(new TaskBrainBindingRepository(db).getActiveByTask('OC-BRAIN-FAIL')).toBeNull();
  });

  it('repairs stale database-backed templates with missing member_kind before building the task team', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO templates (id, source, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'coding',
      'user',
      JSON.stringify({
        name: 'stale coding template',
        type: 'coding',
        governance: 'standard',
        defaultTeam: {
          architect: { suggested: ['opus'] },
          developer: { suggested: ['sonnet'] },
          craftsman: { suggested: ['codex'] },
        },
        stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
      }),
      now,
      now,
    );

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
      {
        role: 'architect',
        agentId: 'opus',
        member_kind: 'controller',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
      {
        role: 'developer',
        agentId: 'sonnet',
        member_kind: 'citizen',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
      {
        role: 'craftsman',
        agentId: 'codex',
        member_kind: 'craftsman',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
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
    const approvalRequests = new ApprovalRequestRepository(db);

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
    expect(approvalRequests.getLatestPending('OC-101', 'discuss')).toMatchObject({
      task_id: 'OC-101',
      stage_id: 'discuss',
      gate_type: 'archon_review',
      requested_by: 'archon',
      status: 'pending',
    });

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
          status: 'pending',
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
          status: 'pending',
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
      status: 'pending',
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
          status: 'cancelled',
          output: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          id: 'run-codex',
          status: 'cancelled',
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
      status: 'pending',
      craftsman_type: 'codex',
    });
    service.pauseTask('OC-107', { reason: 'hold' });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-107',
      subtask_id: 'paused-subtask',
      caller_id: 'opus',
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
          status: 'archived',
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
          join_status: 'joined',
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

  it('publishes bootstrap root and per-agent directed briefs when IM and brain services are configured', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-bootstrap-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const runtimePort = {
      resolveAgent(agentRef: string) {
        return {
          agent_ref: agentRef,
          runtime_provider: 'openclaw',
          runtime_actor_ref: agentRef,
          ...(agentRef === 'opus'
            ? {
                agent_origin: 'agora_managed' as const,
                briefing_mode: 'overlay_delta' as const,
              }
            : {}),
        };
      },
    };
    const taskParticipation = new TaskParticipationService(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-bootstrap-1', 'pb-bootstrap-2', 'pb-bootstrap-3', 'pb-bootstrap-4'];
        return () => ids.shift() ?? 'pb-bootstrap-x';
      })(),
      agentRuntimePort: runtimePort,
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BOOTSTRAP-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
      agentRuntimePort: runtimePort,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-bootstrap-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Bootstrap Task',
      type: 'coding',
      creator: 'archon',
      description: 'bootstrap everyone into context',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.published).toHaveLength(1);
    expect(provisioningPort.published[0]).toMatchObject({
      binding_id: expect.any(String),
      thread_ref: 'discord-thread-bootstrap-1',
    });
    expect(provisioningPort.published[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'bootstrap_root',
          participant_refs: ['opus', 'sonnet', 'glm5'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['opus'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['sonnet'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['glm5'],
        }),
      ]),
    );
    const rootBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_root');
    expect(rootBrief?.body).toContain('主控: opus');
    expect(rootBrief?.body).toContain(join(brainPackDir, 'tasks', 'OC-BOOTSTRAP-1', '00-bootstrap.md'));
    expect(rootBrief?.body).toContain('opus | architect | controller | agora_managed | overlay_delta');
    expect(rootBrief?.body).toContain('Craftsman 循环:');
    expect(rootBrief?.body).toContain('通过它的 `execution_id` 继续同一个执行');
    expect(rootBrief?.body).toContain('agora craftsman probe <executionId>');
    expect(rootBrief?.body).toContain('Discord 提及规则:');
    expect(rootBrief?.body).toContain('`<@USER_ID>`');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus');
    expect(opusBrief?.body).toContain(join(brainPackDir, 'tasks', 'OC-BOOTSTRAP-1', '05-agents', 'opus', '00-role-brief.md'));
    expect(opusBrief?.body).toContain('architect');
    expect(opusBrief?.body).toContain('简报模式: overlay_delta');
    expect(opusBrief?.body).toContain('Craftsman 循环：使用正式 subtask 绑定 craftsman');
    expect(opusBrief?.body).toContain('agora craftsman probe <executionId>');
    expect(opusBrief?.body).toContain('Discord 提及规则：使用真实 `<@USER_ID>` mention');
    expect(opusBrief?.body).not.toContain('Read role doc:');
    const sonnetBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'sonnet');
    expect(sonnetBrief?.body).toContain('简报模式: overlay_full');
    expect(sonnetBrief?.body).toContain('阅读角色文档:');
    const conversations = new TaskConversationRepository(db);
    const entries = conversations.listByTask('OC-BOOTSTRAP-1');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Task **OC-BOOTSTRAP-1** created: Bootstrap Task'),
        expect.stringContaining('Agora 任务启动简报'),
        expect.stringContaining('角色简报 opus'),
        expect.stringContaining('角色简报 sonnet'),
        expect.stringContaining('角色简报 glm5'),
      ]),
    );
  });

  it('adds smoke-mode guidance only when task control mode is smoke_test', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-smoke-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke Bootstrap',
      type: 'coding',
      creator: 'archon',
      description: 'validate smoke control mode',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const rootBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_root');
    expect(rootBrief?.body).toContain('冒烟测试模式:');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus');
    expect(opusBrief?.body).toContain('冒烟测试模式：当前线程仅用于验证');

    const task = new TaskRepository(db).getTask('OC-SMOKE-1');
    expect(task?.control?.mode).toBe('smoke_test');
    const meta = readFileSync(join(brainPackDir, 'tasks', 'OC-SMOKE-1', 'task.meta.yaml'), 'utf8');
    expect(meta).toContain('control_mode: "smoke_test"');
  });

  it('adds smoke-mode guidance to gate and callback status broadcasts only in smoke mode', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-status-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const executions = new CraftsmanExecutionRepository(db);
    const subtasks = new SubtaskRepository(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-STATUS-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-smoke-status-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke status task',
      type: 'coding',
      creator: 'archon',
      description: 'smoke status loop',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;

    expect(() => service.advanceTask('OC-SMOKE-STATUS-1', { callerId: 'archon' })).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const gateWaitingMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'gate_waiting');
    expect(gateWaitingMessage?.body).toContain('冒烟引导:');
    expect(gateWaitingMessage?.body).toContain('现在验证人工审批链路。');

    provisioningPort.published.length = 0;
    subtasks.insertSubtask({
      id: 'smoke-subtask-1',
      task_id: 'OC-SMOKE-STATUS-1',
      stage_id: 'develop',
      title: 'smoke callback',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:smoke-status-1',
    });
    executions.insertExecution({
      execution_id: 'exec-smoke-status-1',
      task_id: 'OC-SMOKE-STATUS-1',
      subtask_id: 'smoke-subtask-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:smoke-status-1',
      status: 'running',
      started_at: '2026-03-13T11:00:00.000Z',
    });
    service.handleCraftsmanCallback({
      execution_id: 'exec-smoke-status-1',
      status: 'succeeded',
      session_id: 'tmux:smoke-status-1',
      payload: {
        output: {
          summary: 'smoke callback complete',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-13T11:01:00.000Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_completed');
    expect(callbackMessage?.body).toContain('冒烟引导:');
    expect(callbackMessage?.body).toContain('确认这个 callback 也出现在 Agora conversation 和 Dashboard timeline。');

  });

  it('adds concrete craftsman loop commands to smoke-mode subtask and input broadcasts', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-craftsman-loop-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-smoke-loop-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T10:00:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-CRAFTSMAN-1',
      craftsmanDispatcher: dispatcher,
      craftsmanInputPort: {
        sendText: () => {},
        sendKeys: () => {},
        submitChoice: () => {},
      },
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-smoke-craftsman-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke craftsman loop',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;

    service.createSubtasks('OC-SMOKE-CRAFTSMAN-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-loop',
          title: 'Build loop',
          assignee: 'sonnet',
          craftsman: {
            adapter: 'codex',
            mode: 'task',
            workdir: '/tmp/smoke-loop',
            prompt: 'Implement the smoke loop',
          },
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const subtaskMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'subtasks_created');
    expect(subtaskMessage?.body).toContain('Smoke Next Step:');
    expect(subtaskMessage?.body).toContain('agora subtasks list OC-SMOKE-CRAFTSMAN-1');
    expect(subtaskMessage?.body).toContain('agora craftsman input-text exec-smoke-loop-1');

    provisioningPort.published.length = 0;
    service.handleCraftsmanCallback({
      execution_id: 'exec-smoke-loop-1',
      status: 'needs_input',
      session_id: 'codex:exec-smoke-loop-1',
      payload: {
        input_request: {
          transport: 'choice',
          hint: 'Choose continue',
          choice_options: [
            { id: 'continue', label: 'Continue', keys: ['Enter'], submit: true },
            { id: 'abort', label: 'Abort', keys: ['Down', 'Enter'], submit: true },
          ],
        },
      },
      error: null,
      finished_at: '2026-03-13T10:05:00.000Z',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_needs_input');
    expect(callbackMessage?.body).toContain('Smoke Next Step:');
    expect(callbackMessage?.body).toContain('agora craftsman input-text exec-smoke-loop-1');
    expect(callbackMessage?.body).toContain('agora craftsman input-keys exec-smoke-loop-1 Down Enter');
    expect(callbackMessage?.body).toContain('agora craftsman probe exec-smoke-loop-1');

    provisioningPort.published.length = 0;
    service.sendCraftsmanInputText('exec-smoke-loop-1', 'Continue');

    await new Promise((resolve) => setTimeout(resolve, 20));
    const inputSentMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_input_sent');
    expect(inputSentMessage?.body).toContain('Smoke Next Step:');
    expect(inputSentMessage?.body).toContain('agora craftsman probe exec-smoke-loop-1');
  });

  it('adds smoke-mode guidance to probe broadcasts only in smoke mode', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-probe-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Smoke probe task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');

    service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-13T01:00:00.000Z'),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const probeMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'thread_probe_controller');
    expect(probeMessage?.body).toContain('冒烟引导:');
    expect(probeMessage?.body).toContain('controller -> roster -> inbox');
  });

  it('joins explicit im_target participant refs in addition to interactive team members', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROV-HUMAN',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Provisioning Human Viewer Test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['discord-user-123'],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.provisioned).toHaveLength(1);
    expect(provisioningPort.provisioned[0]).toMatchObject({
      task_id: 'OC-PROV-HUMAN',
      participant_refs: expect.arrayContaining(['opus', 'sonnet', 'glm5', 'discord-user-123']),
    });
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'discord-user-123' }),
      ]),
    );
  });

  it('archives the bound IM context on pause/cancel and restores the same context on resume', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-ctx-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-ctx-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Context lifecycle test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const createdBinding = bindingService.listBindings('OC-CTX-1')[0];
    expect(createdBinding?.thread_ref).toBe('discord-thread-ctx-1');

    service.pauseTask('OC-CTX-1', { reason: 'hold for review' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'archive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('archived');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_paused');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已暂停');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: paused');

    service.resumeTask('OC-CTX-1');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'unarchive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('active');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_active');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已恢复');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: active');

    service.cancelTask('OC-CTX-1', { reason: 'manual stop' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'archive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('archived');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_cancelled');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已取消');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: cancelled');
  });

  it('broadcasts reject reasons to the controller and rewinds the thread stage state', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-reject-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REJECT-THREAD-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-reject-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Reject loop test',
      type: 'coding',
      creator: 'archon',
      description: 'walk into review and reject',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-REJECT-THREAD-1', 'discuss', 'approved', 'lizeyu');
    service.advanceTask('OC-REJECT-THREAD-1', { callerId: 'archon' });

    const subtasks = new SubtaskRepository(db);
    subtasks.insertSubtask({
      id: 'sub-review-1',
      task_id: 'OC-REJECT-THREAD-1',
      stage_id: 'develop',
      title: 'implementation done',
      assignee: 'sonnet',
      status: 'done',
    });
    service.advanceTask('OC-REJECT-THREAD-1', { callerId: 'archon' });

    service.archonRejectTask('OC-REJECT-THREAD-1', {
      reviewerId: 'archon',
      reason: 'Need stronger rollback coverage before merge',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const latestMessages = provisioningPort.published.slice(-2).flatMap((entry) => entry.messages);
    expect(latestMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'gate_rejected',
        }),
        expect.objectContaining({
          kind: 'controller_gate_rejected',
          participant_refs: ['opus'],
        }),
      ]),
    );
    const controllerMessage = latestMessages.find((message) => message.kind === 'controller_gate_rejected');
    expect(controllerMessage?.body).toContain('Need stronger rollback coverage before merge');
    expect(controllerMessage?.body).toContain('请与成员重新规划');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-REJECT-THREAD-1', '03-stage-state.md'), 'utf8')).toContain('当前阶段: develop');
  });

  it('probes inactive tasks in staged order: controller, roster, then inbox', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Inactive probe test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');

    const first = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:00:00.000Z'),
    });
    expect(first).toMatchObject({ scanned_tasks: 1, controller_pings: 1, roster_pings: 0, inbox_items: 0 });
    expect(provisioningPort.published.at(-1)?.messages[0]).toMatchObject({
      kind: 'thread_probe_controller',
      participant_refs: ['opus'],
    });

    const second = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:05:00.000Z'),
    });
    expect(second).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 1, inbox_items: 0 });
    expect(provisioningPort.published.at(-1)?.messages[0]).toMatchObject({
      kind: 'thread_probe_roster',
      participant_refs: ['opus', 'sonnet', 'glm5'],
    });

    const third = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:10:00.000Z'),
    });
    expect(third).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 0, inbox_items: 1 });
    const inboxRows = db.prepare('SELECT text, source FROM inbox_items ORDER BY id DESC').all() as Array<{ text: string; source: string }>;
    expect(inboxRows[0]).toMatchObject({
      text: 'Task OC-PROBE-1 appears stuck',
      source: 'thread_probe',
    });
  });

  it('rejects craftsman dispatch when the current stage semantics do not allow craftsman work', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-disallowed-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T15:00:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GUARD-1',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Guard discuss stage',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'sub-disallowed-1',
      task_id: 'OC-DISPATCH-GUARD-1',
      stage_id: 'discuss',
      title: 'Should not dispatch from discuss',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GUARD-1',
      subtask_id: 'sub-disallowed-1',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
    })).toThrow(/does not allow craftsman dispatch/i);
    expect(executions.listBySubtask('OC-DISPATCH-GUARD-1', 'sub-disallowed-1')).toEqual([]);
  });

  it('allows craftsman dispatch when the active stage explicitly opts into craftsman execution', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-allowed-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T15:30:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GUARD-2',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Guard execute stage',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-allowed-1',
      task_id: 'OC-DISPATCH-GUARD-2',
      stage_id: 'implement',
      title: 'Should dispatch in craftsman stage',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GUARD-2',
      subtask_id: 'sub-allowed-1',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
    });

    expect(result.execution).toMatchObject({
      task_id: 'OC-DISPATCH-GUARD-2',
      subtask_id: 'sub-allowed-1',
      adapter: 'codex',
    });
  });

  it('rejects craftsman dispatch when the caller is not the controller', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-owner-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T16:00:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-OWNER-1',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Dispatch ownership guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-owner-1',
      task_id: 'OC-DISPATCH-OWNER-1',
      stage_id: 'implement',
      title: 'Only controller can dispatch',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-OWNER-1',
      subtask_id: 'sub-owner-1',
      caller_id: 'sonnet',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
    })).toThrow(/controller ownership/i);
  });

  it('rejects craftsman dispatch when per-agent concurrency exceeds the configured limit', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-governance-limit-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T14:00:00.000Z'),
      },
    });
    const executions = new CraftsmanExecutionRepository(db);
    const subtasks = new SubtaskRepository(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-1',
      craftsmanDispatcher: dispatcher,
      craftsmanGovernance: {
        maxConcurrentPerAgent: 1,
      },
    });

    service.createTask({
      title: 'Per-agent concurrency guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-governance-limit-1',
      task_id: 'OC-DISPATCH-GOV-1',
      stage_id: 'implement',
      title: 'Already running elsewhere',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-existing-1',
      task_id: 'OC-DISPATCH-GOV-1',
      subtask_id: 'sub-governance-limit-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:existing',
      status: 'running',
      started_at: '2026-03-13T13:59:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'sub-governance-limit-2',
      task_id: 'OC-DISPATCH-GOV-1',
      stage_id: 'implement',
      title: 'Should be rejected by limit',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GOV-1',
      subtask_id: 'sub-governance-limit-2',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
    })).toThrow(/per-agent concurrency limit exceeded/i);
  });

  it('rejects subtask creation when host resource limits are exceeded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-2',
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-13T14:10:00.000Z',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 95,
          memory_utilization: 0.95,
          swap_total_bytes: 10,
          swap_used_bytes: 1,
          swap_utilization: 0.1,
        }),
      },
      craftsmanGovernance: {
        maxConcurrentPerAgent: 3,
        hostMemoryUtilizationLimit: 0.9,
      },
    });

    service.createTask({
      title: 'Host resource guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-DISPATCH-GOV-2', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-host-limit-1',
          title: 'Should be blocked by host limit',
          assignee: 'codex',
          craftsman: {
            adapter: 'codex',
            mode: 'task',
          },
        },
      ],
    })).toThrow(/memory utilization/i);
  });

  it('observes stale craftsman executions and probes them forward', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-3',
      craftsmanExecutionProbePort: {
        probe: ({ executionId }) => ({
          execution_id: executionId,
          status: 'running',
          session_id: 'tmux:observed',
          payload: { summary: 'still running' },
          error: null,
          finished_at: null,
        }),
      },
    });

    service.createTask({
      title: 'Observe stale executions',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-observe-1',
      task_id: 'OC-DISPATCH-GOV-3',
      stage_id: 'implement',
      title: 'Observe me',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:observed',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-observe-1',
      task_id: 'OC-DISPATCH-GOV-3',
      subtask_id: 'sub-observe-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:observed',
      status: 'running',
      started_at: '2026-03-13T13:00:00.000Z',
      finished_at: null,
    });

    db.prepare(`
      UPDATE craftsman_executions
      SET updated_at = ?
      WHERE execution_id = 'exec-observe-1'
    `).run('2026-03-13T13:00:00.000Z');

    const result = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date('2026-03-13T13:05:00.000Z'),
    });

    expect(result).toMatchObject({
      scanned: 1,
      probed: 1,
      progressed: 0,
    });
    expect(service.getCraftsmanExecution('exec-observe-1').status).toBe('running');
    expect(service.getTaskStatus('OC-DISPATCH-GOV-3').flow_log.map((entry) => entry.event)).toContain('craftsman_auto_probe');
  });

  it('creates execute-mode subtasks through the formal service surface and auto-dispatches craftsmen specs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-subtask-create-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T10:00:00.000Z'),
      },
    });
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-1',
      craftsmanDispatcher: dispatcher,
    });

    service.createTask({
      title: 'Formal subtask surface',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    const result = service.createSubtasks('OC-SUBTASK-CREATE-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-api',
          title: 'Build API',
          assignee: 'sonnet',
          craftsman: {
            adapter: 'codex',
            mode: 'task',
            workdir: '/tmp/subtask-build-api',
            prompt: 'Implement the API',
          },
        },
        {
          id: 'write-tests',
          title: 'Write tests',
          assignee: 'gpt52',
        },
      ],
    });

    expect(result.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'build-api',
          task_id: 'OC-SUBTASK-CREATE-1',
          stage_id: 'develop',
          craftsman_type: 'codex',
          dispatch_status: 'running',
        }),
        expect.objectContaining({
          id: 'write-tests',
          assignee: 'gpt52',
          craftsman_type: null,
        }),
      ]),
    );
    expect(result.dispatched_executions).toEqual([
      expect.objectContaining({
        execution_id: 'exec-subtask-create-1',
        task_id: 'OC-SUBTASK-CREATE-1',
        subtask_id: 'build-api',
        adapter: 'codex',
      }),
    ]);
  });

  it('rejects formal subtask creation when the caller is not the controller', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-2',
    });

    service.createTask({
      title: 'Subtask ownership guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-CREATE-2', {
      caller_id: 'sonnet',
      subtasks: [
        {
          id: 'rogue-subtask',
          title: 'Should fail',
          assignee: 'sonnet',
        },
      ],
    })).toThrow(/controller ownership/i);
  });

  it('rejects craftsman subtask creation when the per-agent concurrency limit would be exceeded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-LIMIT-1',
      craftsmanGovernance: {
        maxConcurrentPerAgent: 1,
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Per-agent concurrency guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'existing-runner',
      task_id: 'OC-SUBTASK-LIMIT-1',
      stage_id: 'develop',
      title: 'Existing running execution',
      assignee: 'sonnet',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-existing-runner',
      task_id: 'OC-SUBTASK-LIMIT-1',
      subtask_id: 'existing-runner',
      adapter: 'codex',
      mode: 'task',
      status: 'running',
      started_at: '2026-03-13T14:00:00.000Z',
    });

    expect(() => service.createSubtasks('OC-SUBTASK-LIMIT-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'new-runner',
          title: 'Should be blocked',
          assignee: 'sonnet',
          craftsman: {
            adapter: 'codex',
            mode: 'task',
            prompt: 'do work',
          },
        },
      ],
    })).toThrow(/per-agent concurrency limit exceeded/i);
  });

  it('rejects craftsman subtask creation when host memory utilization exceeds the configured limit', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-LIMIT-2',
      craftsmanGovernance: {
        hostMemoryUtilizationLimit: 0.5,
      },
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-13T14:10:00.000Z',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 80,
          memory_utilization: 0.8,
          swap_total_bytes: 0,
          swap_used_bytes: 0,
          swap_utilization: null,
        }),
      },
    });

    service.createTask({
      title: 'Host resource guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-LIMIT-2', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'blocked-by-memory',
          title: 'Should not dispatch under memory pressure',
          assignee: 'sonnet',
          craftsman: {
            adapter: 'codex',
            mode: 'task',
            prompt: 'do work',
          },
        },
      ],
    })).toThrow(/memory utilization/i);
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
        {
          role: 'architect',
          agentId: 'claude-opus',
          member_kind: 'controller',
          model_preference: 'strong_reasoning',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
        {
          role: 'developer',
          agentId: 'codex',
          member_kind: 'citizen',
          model_preference: 'fast_coding',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
        {
          role: 'craftsman',
          agentId: 'claude',
          member_kind: 'craftsman',
          model_preference: 'coding_cli',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
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

  it('broadcasts an immediate thread status update when a craftsman callback settles against an active context binding', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-notify-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOTIFY-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Immediate callback notify',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'notify-subtask-1',
      task_id: 'OC-NOTIFY-1',
      stage_id: 'develop',
      title: 'notify me',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:notify-1',
    });
    executions.insertExecution({
      execution_id: 'exec-notify-1',
      task_id: 'OC-NOTIFY-1',
      subtask_id: 'notify-subtask-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:notify-1',
      status: 'running',
      started_at: '2026-03-12T16:00:00.000Z',
    });

    service.handleCraftsmanCallback({
      execution_id: 'exec-notify-1',
      status: 'succeeded',
      session_id: 'tmux:notify-1',
      payload: {
        output: {
          summary: 'implemented and ready',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-12T16:01:00.000Z',
    });

    expect(provisioningPort.published.flatMap((entry) => entry.messages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'craftsman_completed',
        }),
      ]),
    );
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_completed');
    expect(callbackMessage?.body).toContain('事件类型: craftsman_completed');
    expect(callbackMessage?.body).toContain('Execution: exec-notify-1');
    expect(callbackMessage?.body).toContain('implemented and ready');
    const statusConversation = new TaskConversationRepository(db)
      .listByTask('OC-NOTIFY-1')
      .find((entry) => entry.metadata?.event_type === 'craftsman_completed' && entry.author_ref === 'agora-bot');
    expect(statusConversation?.metadata).toMatchObject({
      event_type: 'craftsman_completed',
      task_id: 'OC-NOTIFY-1',
      task_state: 'active',
      current_stage: 'discuss',
      controller_ref: 'opus',
    });
  });

  it('routes craftsman input by execution id and records the input event', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const inputCalls: Array<{ kind: string; executionId: string; payload: unknown }> = [];
    const provisioningPort = new StubIMProvisioningPort({
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-input-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-INPUT-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      craftsmanInputPort: {
        sendText: (execution, text, submit = true) => {
          inputCalls.push({ kind: 'text', executionId: execution.executionId, payload: { text, submit } });
        },
        sendKeys: (execution, keys) => {
          inputCalls.push({ kind: 'keys', executionId: execution.executionId, payload: keys });
        },
        submitChoice: (execution, keys) => {
          inputCalls.push({ kind: 'choice', executionId: execution.executionId, payload: keys });
        },
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Craftsman input route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'input-subtask-1',
      task_id: 'OC-INPUT-1',
      stage_id: 'develop',
      title: 'wait for input',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'needs_input',
      craftsman_session: 'tmux:agora-craftsmen:codex',
    });
    executions.insertExecution({
      execution_id: 'exec-input-1',
      task_id: 'OC-INPUT-1',
      subtask_id: 'input-subtask-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'needs_input',
      started_at: '2026-03-13T15:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-input-1', 'Continue');
    service.sendCraftsmanInputKeys('exec-input-1', ['Down']);
    service.submitCraftsmanChoice('exec-input-1', ['Down']);

    expect(inputCalls).toEqual([
      { kind: 'text', executionId: 'exec-input-1', payload: { text: 'Continue', submit: true } },
      { kind: 'keys', executionId: 'exec-input-1', payload: ['Down'] },
      { kind: 'choice', executionId: 'exec-input-1', payload: ['Down'] },
    ]);

    const conversation = new TaskConversationRepository(db).listByTask('OC-INPUT-1');
    const inputEvents = conversation.filter((entry) => entry.metadata?.event_type === 'craftsman_input_sent');
    expect(inputEvents.filter((entry) => entry.author_ref === 'archon')).toHaveLength(3);
    expect(inputEvents.filter((entry) => entry.author_ref === 'agora-bot').length).toBeGreaterThanOrEqual(3);
  });

  it('probes tmux executions after operator input and resumes the execution status loop', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-1',
    });
    const bindingService = new TaskContextBindingService(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      craftsmanInputPort: {
        sendText: () => {},
        sendKeys: () => {},
        submitChoice: () => {},
      },
      craftsmanExecutionProbePort: {
        probe: () => ({
          execution_id: 'exec-probe-1',
          status: 'running',
          session_id: 'tmux:agora-craftsmen:codex',
          payload: {
            output: {
              summary: 'codex resumed after input',
              text: null,
              stderr: null,
              artifacts: [],
              structured: null,
            },
          },
          error: null,
          finished_at: null,
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Craftsman probe route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'probe-subtask-1',
      task_id: 'OC-PROBE-1',
      stage_id: 'develop',
      title: 'wait for input then resume',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'needs_input',
      craftsman_session: 'tmux:agora-craftsmen:codex',
    });
    executions.insertExecution({
      execution_id: 'exec-probe-1',
      task_id: 'OC-PROBE-1',
      subtask_id: 'probe-subtask-1',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'needs_input',
      started_at: '2026-03-13T16:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-probe-1', 'Continue');

    expect(service.getCraftsmanExecution('exec-probe-1').status).toBe('running');
    const subtask = new SubtaskRepository(db).listByTask('OC-PROBE-1').find((entry) => entry.id === 'probe-subtask-1');
    expect(subtask?.dispatch_status).toBe('running');
    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const runningMessage = broadcasts.find((message) => message.kind === 'craftsman_running');
    expect(runningMessage?.body).toContain('Status: running');
  });

  it('allows execution-scoped input for running continuous tmux executions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const calls: Array<{ kind: string; executionId: string; payload: unknown }> = [];
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CONTINUOUS-INPUT-1',
      craftsmanInputPort: {
        sendText: (execution, text, submit = true) => {
          calls.push({ kind: 'text', executionId: execution.executionId, payload: { text, submit } });
        },
        sendKeys: () => {},
        submitChoice: () => {},
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Continuous craftsman input route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    subtasks.insertSubtask({
      id: 'continuous-subtask-1',
      task_id: 'OC-CONTINUOUS-INPUT-1',
      stage_id: 'develop',
      title: 'interactive loop',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'tmux:agora-craftsmen:claude',
    });
    executions.insertExecution({
      execution_id: 'exec-continuous-1',
      task_id: 'OC-CONTINUOUS-INPUT-1',
      subtask_id: 'continuous-subtask-1',
      adapter: 'claude',
      mode: 'continuous',
      session_id: 'tmux:agora-craftsmen:claude',
      status: 'running',
      started_at: '2026-03-13T16:30:00.000Z',
    });

    service.sendCraftsmanInputText('exec-continuous-1', 'Continue');

    expect(calls).toEqual([
      { kind: 'text', executionId: 'exec-continuous-1', payload: { text: 'Continue', submit: true } },
    ]);
  });
});
