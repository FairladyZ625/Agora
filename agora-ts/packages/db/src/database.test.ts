import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, listAppliedMigrations, runMigrations } from './database.js';
import { ArchiveJobRepository } from './repositories/archive-job.repository.js';
import { RoleDefinitionRepository } from './repositories/role-definition.repository.js';
import { TaskRepository } from './repositories/task.repository.js';
import { TemplateRepository } from './repositories/template.repository.js';
import { TodoRepository } from './repositories/todo.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-db-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeTemplatesDir(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-templates-'));
  tempPaths.push(dir);
  const tasksDir = join(dir, 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  for (const [name, payload] of Object.entries(files)) {
    writeFileSync(join(tasksDir, `${name}.json`), JSON.stringify(payload), 'utf8');
  }
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

describe('agora-ts sqlite bootstrap', () => {
  it('applies a busy timeout to sqlite connections', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath(), busyTimeoutMs: 4321 });

    const row = db.prepare('PRAGMA busy_timeout;').get() as { timeout: number } | undefined;

    expect(row).toBeDefined();
    expect(Object.values(row ?? {})).toContain(4321);
  });

  it('runs the initial migration and records it', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });

    runMigrations(db);

    expect(listAppliedMigrations(db)).toEqual([
      '001_initial.sql',
      '002_inbox.sql',
      '003_craftsman_executions.sql',
      '004_context_bindings.sql',
      '005_runtime_bindings.sql',
      '006_human_accounts.sql',
      '007_task_conversation.sql',
      '008_task_conversation_read_cursors.sql',
      '009_templates.sql',
      '010_role_pack_bindings.sql',
      '011_task_brain_bindings.sql',
      '012_approval_requests.sql',
      '013_task_control.sql',
      '014_task_locale.sql',
    ]);
    const taskTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get() as { name: string } | undefined;
    expect(taskTable?.name).toBe('tasks');
    const participantTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'participant_bindings'")
      .get() as { name: string } | undefined;
    expect(participantTable?.name).toBe('participant_bindings');
    const humanAccountTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'human_accounts'")
      .get() as { name: string } | undefined;
    expect(humanAccountTable?.name).toBe('human_accounts');
    const conversationTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_conversation_entries'")
      .get() as { name: string } | undefined;
    expect(conversationTable?.name).toBe('task_conversation_entries');
    const templatesTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'templates'")
      .get() as { name: string } | undefined;
    expect(templatesTable?.name).toBe('templates');
    const roleDefinitionsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'role_definitions'")
      .get() as { name: string } | undefined;
    expect(roleDefinitionsTable?.name).toBe('role_definitions');
    const approvalRequestsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'approval_requests'")
      .get() as { name: string } | undefined;
    expect(approvalRequestsTable?.name).toBe('approval_requests');
  });

  it('can persist role definitions inside the single sqlite database', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const roles = new RoleDefinitionRepository(db);

    roles.saveRoleDefinition({
      id: 'controller',
      name: 'Controller',
      member_kind: 'controller',
      summary: 'Owns orchestration flow.',
      prompt_asset: 'roles/controller.md',
      source: 'agora',
      allowed_target_kinds: ['runtime_agent'],
    });

    expect(roles.getRoleDefinition('controller')).toMatchObject({
      id: 'controller',
      member_kind: 'controller',
    });
  });

  it('seeds the checked-in Agora default role pack from disk', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const roles = new RoleDefinitionRepository(db);

    const seeded = roles.seedFromPackDir(resolve(process.cwd(), 'role-packs', 'agora-default'));

    expect(seeded.inserted).toBeGreaterThanOrEqual(9);
    expect(roles.getRoleDefinition('controller')).toMatchObject({
      id: 'controller',
      member_kind: 'controller',
      prompt_asset_path: 'roles/controller.md',
      payload: {
        citizen_scaffold: {
          soul: expect.any(String),
          boundaries: expect.any(Array),
          heartbeat: expect.any(Array),
          recap_expectations: expect.any(Array),
        },
      },
    });
    expect(roles.getRoleDefinition('craftsman')).toMatchObject({
      id: 'craftsman',
      member_kind: 'craftsman',
    });
  });

  it('rejects empty todo updates before issuing SQL', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const todos = new TodoRepository(db);
    const created = todos.insertTodo({ text: 'empty update' });

    expect(() => todos.updateTodo(created.id, {})).toThrow();
  });

  it('seeds templates from disk into the single sqlite database and persists later edits there', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);

    const seeded = templates.seedFromDir(resolve(process.cwd(), 'templates'));

    expect(seeded.inserted).toBeGreaterThan(0);
    expect(templates.listTemplates().some((template) => template.id === 'coding')).toBe(true);
    expect(templates.getTemplate('coding')?.template.name).toBeTruthy();

    templates.saveTemplate('db_only', {
      name: '数据库模板',
      type: 'db_only',
      governance: 'lean',
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    }, 'user');

    expect(templates.getTemplate('db_only')).toMatchObject({
      id: 'db_only',
      source: 'user',
      template: {
        name: '数据库模板',
      },
    });
  });

  it('rejects invalid templates at the repository boundary', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);

    expect(() => templates.saveTemplate('invalid_template', {
      name: '坏模板',
      type: 'invalid_template',
      governance: 'lean',
      defaultTeam: {
        developer: {
          member_kind: 'citizen',
          suggested: ['sonnet'],
        },
      },
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    }, 'user')).toThrow(/exactly one controller role/i);
  });

  it('rolls back seedFromDir when any template in the batch is invalid', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);
    const templatesDir = makeTemplatesDir({
      aaa_valid: {
        name: '有效模板',
        type: 'valid',
        governance: 'lean',
        defaultTeam: {
          architect: { member_kind: 'controller', suggested: ['opus'] },
        },
        stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
      },
      zzz_invalid: {
        name: '无控制器模板',
        type: 'invalid',
        governance: 'lean',
        defaultTeam: {
          developer: { member_kind: 'citizen', suggested: ['sonnet'] },
        },
        stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
      },
    });

    expect(() => templates.seedFromDir(templatesDir)).toThrow(/exactly one controller role/i);
    expect(templates.listTemplates()).toEqual([]);
  });

  it('repairs existing sqlite templates with missing member_kind from the seed directory without overwriting other fields', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);

    db.prepare(`
      INSERT INTO templates (id, source, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'coding',
      'user',
      JSON.stringify({
        name: '自定义编码模板',
        type: 'coding',
        description: 'db customized',
        governance: 'standard',
        defaultTeam: {
          architect: { suggested: ['custom-opus'] },
          developer: { model_preference: 'custom-fast', suggested: ['custom-sonnet'] },
          craftsman: { suggested: ['codex'] },
        },
        stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
      }),
      '2026-03-13T00:00:00.000Z',
      '2026-03-13T00:00:00.000Z',
    );

    const repaired = templates.repairMemberKindsFromDir(resolve(process.cwd(), 'templates'));

    expect(repaired.updated).toBe(1);
    expect(templates.getTemplate('coding')).toMatchObject({
      source: 'user',
      template: {
        name: '自定义编码模板',
        defaultTeam: {
          architect: { member_kind: 'controller', suggested: ['custom-opus'] },
          developer: { member_kind: 'citizen', model_preference: 'custom-fast', suggested: ['custom-sonnet'] },
          craftsman: { member_kind: 'craftsman', suggested: ['codex'] },
        },
      },
    });

    expect(templates.repairMemberKindsFromDir(resolve(process.cwd(), 'templates')).updated).toBe(0);
  });

  it('repairs existing sqlite templates with missing stage semantics from the seed directory without overwriting stage names', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);

    templates.saveTemplate('coding', {
      name: '自定义编码模板',
      type: 'coding',
      description: 'db customized',
      governance: 'standard',
      defaultTeam: {
        architect: { member_kind: 'controller', suggested: ['custom-opus'] },
        developer: { member_kind: 'citizen', suggested: ['custom-sonnet'] },
        craftsman: { member_kind: 'craftsman', suggested: ['codex'] },
      },
      stages: [
        { id: 'discuss', name: '我的讨论阶段', mode: 'discuss', gate: { type: 'archon_review' } },
        { id: 'develop', name: '我的开发阶段', mode: 'execute', gate: { type: 'all_subtasks_done' } },
      ],
    }, 'user');

    const repaired = templates.repairStageSemanticsFromDir(resolve(process.cwd(), 'templates'));

    expect(repaired.updated).toBe(1);
    expect(templates.getTemplate('coding')).toMatchObject({
      source: 'user',
      template: {
        stages: [
          { id: 'discuss', name: '我的讨论阶段', execution_kind: 'citizen_discuss' },
          { id: 'develop', name: '我的开发阶段', execution_kind: 'citizen_execute', allowed_actions: ['execute', 'dispatch_craftsman'] },
        ],
      },
    });

    expect(templates.repairStageSemanticsFromDir(resolve(process.cwd(), 'templates')).updated).toBe(0);
  });

  it('stores and reads task JSON fields via the task repository', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-001',
      title: '迁移 task repository',
      description: '把 Python 版 task row 语义迁到 TS。',
      type: 'coding',
      priority: 'high',
      creator: 'archon',
      team: {
        members: [{ role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' }],
      },
      workflow: {
        type: 'discuss-execute-review',
        stages: [{ id: 'discuss', gate: { type: 'archon_review' } }],
      },
      control: {
        mode: 'smoke_test',
      },
    });

    const task = tasks.getTask('OC-001');

    expect(task?.id).toBe('OC-001');
    expect(task?.state).toBe('draft');
    expect(task?.team.members[0]?.agentId).toBe('opus');
    expect(task?.workflow.stages?.[0]?.id).toBe('discuss');
    expect(task?.control?.mode).toBe('smoke_test');
  });

  it('supports todo CRUD and tag deserialization', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const todos = new TodoRepository(db);

    const created = todos.insertTodo({
      text: '补 ts lint',
      due: '2026-03-12',
      tags: ['typescript', 'governance'],
    });
    const updated = todos.updateTodo(created.id, {
      status: 'done',
      completed_at: '2026-03-08T00:00:00Z',
    });
    const listed = todos.listTodos();
    const deleted = todos.deleteTodo(created.id);

    expect(created.tags).toEqual(['typescript', 'governance']);
    expect(updated.status).toBe('done');
    expect(listed).toHaveLength(1);
    expect(deleted).toBe(true);
    expect(todos.listTodos()).toEqual([]);
  });

  it('joins archive jobs with task metadata and parses payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-002',
      title: '归档日报',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-002',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { error_message: 'timeout' },
      writer_agent: 'writer-agent',
    });
    const fetched = archives.getArchiveJob(job.id);

    expect(fetched?.task_title).toBe('归档日报');
    expect(fetched?.payload).toEqual({ error_message: 'timeout' });
    expect(archives.listArchiveJobs()[0]?.task_type).toBe('document');
  });

  it('surfaces the latest archive job status on task reads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-ARCHIVE-STATUS',
      title: '归档状态透传',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-ARCHIVE-STATUS', 1, {
      state: 'cancelled',
    });

    expect(tasks.getTask('OC-ARCHIVE-STATUS')?.archive_status).toBeNull();

    const job = archives.insertArchiveJob({
      task_id: 'OC-ARCHIVE-STATUS',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });

    expect(tasks.getTask('OC-ARCHIVE-STATUS')?.archive_status).toBe('pending');

    archives.updateArchiveJob(job.id, { status: 'synced', commit_hash: 'deadbeef' });

    expect(tasks.getTask('OC-ARCHIVE-STATUS')).toMatchObject({
      id: 'OC-ARCHIVE-STATUS',
      archive_status: 'synced',
    });
    expect(tasks.listTasks()[0]).toMatchObject({
      id: 'OC-ARCHIVE-STATUS',
      archive_status: 'synced',
    });
  });

  it('updates archive job status with commit hash and error payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-003',
      title: '归档状态更新',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-003',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    const notified = archives.updateArchiveJob(job.id, { status: 'notified' });
    const failed = archives.updateArchiveJob(job.id, { status: 'failed', error_message: 'writer timeout' });
    const synced = archives.updateArchiveJob(job.id, { status: 'synced', commit_hash: 'abc123' });

    expect(notified.status).toBe('notified');
    expect(notified.completed_at).toBeNull();
    expect(failed).toMatchObject({
      status: 'failed',
      completed_at: expect.any(String),
      payload: { error_message: 'writer timeout' },
    });
    expect(synced).toMatchObject({
      status: 'synced',
      commit_hash: 'abc123',
      completed_at: expect.any(String),
    });
  });

  it('merges additional payload metadata while updating archive jobs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-005',
      title: '归档通知元数据',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-005',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { task_id: 'OC-005' },
      writer_agent: 'writer-agent',
    });
    const notified = archives.updateArchiveJob(job.id, {
      status: 'notified',
      payload_patch: {
        notification_receipt: {
          notification_id: 'archive-job-5',
          outbox_path: '/tmp/archive-job-5.json',
        },
      },
    });

    expect(notified).toMatchObject({
      status: 'notified',
      payload: {
        task_id: 'OC-005',
        notified_at: expect.any(String),
        notification_receipt: {
          notification_id: 'archive-job-5',
          outbox_path: '/tmp/archive-job-5.json',
        },
      },
    });
  });

  it('marks stale notified archive jobs as failed during a timeout scan', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-004',
      title: '归档超时扫描',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-004',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    archives.updateArchiveJob(job.id, { status: 'notified' });

    const failed = archives.failStaleNotifiedJobs({
      timeoutMs: 1,
      now: new Date(Date.now() + 10),
    });
    const fetched = archives.getArchiveJob(job.id);

    expect(failed).toBe(1);
    expect(fetched).toMatchObject({
      status: 'failed',
      completed_at: expect.any(String),
      payload: expect.objectContaining({
        error_message: 'archive notify timeout',
        notified_at: expect.any(String),
      }),
    });
  });
});
