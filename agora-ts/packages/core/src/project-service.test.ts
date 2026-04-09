import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgoraDatabase,
  ProjectAgentRosterRepository,
  ProjectMembershipRepository,
  runMigrations,
} from '@agora-ts/db';
import { createProjectServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';
import { FilesystemProjectKnowledgeAdapter } from '@agora-ts/adapters-brain';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-service-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('project service', () => {
  it('creates, lists, and resolves projects', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const projectStateDir = makeTempDir('agora-ts-project-state-');
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    const created = service.createProject({
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'thin slice',
      owner: 'archon',
      metadata: { scope: 'task-writeback' },
    });

    expect(created).toMatchObject({
      id: 'proj-alpha',
      name: 'Project Alpha',
      status: 'active',
      owner: 'archon',
      metadata: { scope: 'task-writeback' },
    });
    expect(service.requireProject('proj-alpha').name).toBe('Project Alpha');
    expect(service.listProjects()).toEqual([
      expect.objectContaining({
        id: 'proj-alpha',
      }),
    ]);
    expect(existsSync(join(projectStateDir, 'proj-alpha', 'index.md'))).toBe(true);
    expect(existsSync(join(projectStateDir, 'proj-alpha', '.git'))).toBe(true);
    expect(existsSync(join(projectStateDir, 'proj-alpha', 'tasks', 'active'))).toBe(true);
    expect(existsSync(join(projectStateDir, 'proj-alpha', 'tasks', 'archive'))).toBe(true);
    expect(runGit(join(projectStateDir, 'proj-alpha'), ['rev-parse', '--verify', 'HEAD'])).not.toBe('');
    expect(readFileSync(join(projectStateDir, 'proj-alpha', 'index.md'), 'utf8')).toContain('doc_type: project_index');
    expect(readFileSync(join(projectStateDir, 'proj-alpha', 'index.md'), 'utf8')).toContain('# Project Alpha');
    expect(readFileSync(join(projectStateDir, 'proj-alpha', 'index.md'), 'utf8')).toContain('[[tasks/active/]]');
    expect(readFileSync(join(projectStateDir, 'proj-alpha', 'index.md'), 'utf8')).toContain('[[tasks/archive/]]');
    expect(readFileSync(join(projectStateDir, 'proj-alpha', 'timeline.md'), 'utf8')).toContain('doc_type: project_timeline');
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-alpha', 'index.md'))).toBe(false);
  });

  it('creates project memberships and agent roster entries during project creation', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    db.prepare(`
      INSERT INTO human_accounts (username, password_hash, role, enabled, created_at, updated_at)
      VALUES
        ('archon', 'hash-1', 'admin', 1, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z'),
        ('alice', 'hash-2', 'member', 1, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z')
    `).run();
    const service = createProjectServiceFromDb(db);
    const memberships = new ProjectMembershipRepository(db);
    const rosters = new ProjectAgentRosterRepository(db);

    service.createProject({
      id: 'proj-membership',
      name: 'Project Membership',
      owner: 'archon',
      admins: [{ account_id: 1 }],
      members: [{ account_id: 2, role: 'member' }],
      default_agents: [{ agent_ref: 'workspace-orchestrator', kind: 'orchestrator' }],
    });

    expect(memberships.listByProject('proj-membership')).toEqual([
      expect.objectContaining({ account_id: 1, role: 'admin', status: 'active' }),
      expect.objectContaining({ account_id: 2, role: 'member', status: 'active' }),
    ]);
    expect(rosters.listByProject('proj-membership')).toEqual([
      expect.objectContaining({ agent_ref: 'workspace-orchestrator', kind: 'orchestrator', status: 'active' }),
    ]);
  });

  it('requires at least one project admin when creating a project membership set', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createProjectServiceFromDb(db);

    expect(() => service.createProject({
      id: 'proj-no-admin',
      name: 'Project Without Admin',
      admins: [],
      members: [{ account_id: 2, role: 'member' }],
    })).toThrow(/at least one project admin/i);
  });

  it('auto-generates a persisted project id when the caller omits one', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const projectStateDir = makeTempDir('agora-ts-project-state-');
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    const created = service.createProject({
      name: '中文 Project Alpha',
      summary: 'auto id',
      owner: 'archon',
    });

    expect(created.id).toMatch(/^proj-[a-z0-9-]+$/);
    expect(service.requireProject(created.id).name).toBe('中文 Project Alpha');
    expect(existsSync(join(projectStateDir, created.id, 'index.md'))).toBe(true);
    expect(existsSync(join(projectStateDir, created.id, '.git'))).toBe(true);
    expect(existsSync(join(brainPackDir, 'project-index', created.id, 'index.md'))).toBe(false);
  });

  it('throws when requiring a missing project', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createProjectServiceFromDb(db);

    expect(() => service.requireProject('proj-missing')).toThrow('Project not found: proj-missing');
  });

  it('writes, lists, reads, and searches project knowledge docs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const projectStateDir = makeTempDir('agora-ts-project-state-');
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    service.createProject({
      id: 'proj-knowledge',
      name: 'Project Knowledge',
      owner: 'archon',
    });
    const doc = service.upsertKnowledgeEntry({
      project_id: 'proj-knowledge',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Core keeps orchestration semantics. Runtime adapters stay outside core.',
      source_task_ids: ['OC-100'],
    });

    expect(doc.path).toContain('knowledge/decisions/runtime-boundary.md');
    expect(service.listKnowledgeEntries('proj-knowledge', 'decision')).toEqual([
      expect.objectContaining({
        slug: 'runtime-boundary',
        title: 'Runtime Boundary',
      }),
    ]);
    expect(service.getKnowledgeEntry('proj-knowledge', 'decision', 'runtime-boundary')?.content).toContain(
      'Runtime adapters stay outside core.',
    );
    expect(service.searchProjectKnowledge('proj-knowledge', 'orchestration semantics')).toEqual([
      expect.objectContaining({
        kind: 'decision',
        slug: 'runtime-boundary',
      }),
    ]);
    expect(readFileSync(join(projectStateDir, 'proj-knowledge', 'index.md'), 'utf8')).toContain(
      '[[knowledge/decisions/runtime-boundary.md]]',
    );
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-knowledge', 'index.md'))).toBe(false);
  });

  it('enqueues affected project brain docs when knowledge, timeline, and recap write paths change', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const projectStateDir = makeTempDir('agora-ts-project-state-');
    const enqueueDocumentSync = vi.fn();
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
      projectBrainIndexQueueService: {
        enqueueDocumentSync,
      },
    });

    service.createProject({
      id: 'proj-knowledge',
      name: 'Project Knowledge',
      owner: 'archon',
    });
    service.upsertKnowledgeEntry({
      project_id: 'proj-knowledge',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      body: 'Core keeps orchestration semantics.',
    });
    service.recordTaskBinding({
      project_id: 'proj-knowledge',
      task_id: 'OC-1',
      title: 'Task One',
      state: 'active',
      workspace_path: null,
      bound_at: new Date().toISOString(),
    });
    service.recordTaskRecap({
      project_id: 'proj-knowledge',
      task_id: 'OC-1',
      title: 'Task One',
      state: 'done',
      current_stage: 'review',
      controller_ref: 'archon',
      workspace_path: null,
      completed_by: 'archon',
      completed_at: new Date().toISOString(),
      summary_lines: ['done'],
    });

    expect(enqueueDocumentSync).toHaveBeenCalledWith({
      project_id: 'proj-knowledge',
      document_kind: 'decision',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
    });
    expect(enqueueDocumentSync).toHaveBeenCalledWith({
      project_id: 'proj-knowledge',
      document_kind: 'timeline',
      document_slug: 'timeline',
      reason: 'task_binding',
    });
    expect(enqueueDocumentSync).toHaveBeenCalledWith({
      project_id: 'proj-knowledge',
      document_kind: 'recap',
      document_slug: 'OC-1',
      reason: 'task_recap',
    });
  });

  it('falls back to the internal project-index tree when no canonical project root resolver is configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createProject({
      id: 'proj-legacy',
      name: 'Legacy Projection',
      owner: 'archon',
    });

    expect(existsSync(join(brainPackDir, 'project-index', 'proj-legacy', 'index.md'))).toBe(true);
    expect(readFileSync(join(brainPackDir, 'project-index', 'proj-legacy', 'index.md'), 'utf8')).toContain('# Legacy Projection');
  });

  it('writes project task projections into the canonical project root when a project state root is configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    const projectStateDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-state-'));
    tempPaths.push(brainPackDir);
    tempPaths.push(projectStateDir);
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    service.createProject({
      id: 'proj-projection',
      name: 'Project Projection',
      owner: 'archon',
    });

    service.recordTaskBinding({
      project_id: 'proj-projection',
      task_id: 'OC-PROJECTION-1',
      title: 'Projection Task',
      state: 'active',
      workspace_path: join(projectStateDir, 'proj-projection', 'tasks', 'OC-PROJECTION-1'),
      bound_at: '2026-03-27T10:00:00.000Z',
    });

    const activeProjectionPath = join(projectStateDir, 'proj-projection', 'tasks', 'active', 'OC-PROJECTION-1.md');
    const archiveProjectionPath = join(projectStateDir, 'proj-projection', 'tasks', 'archive', 'OC-PROJECTION-1.md');
    const indexPath = join(projectStateDir, 'proj-projection', 'index.md');
    const timelinePath = join(projectStateDir, 'proj-projection', 'timeline.md');

    expect(existsSync(activeProjectionPath)).toBe(true);
    expect(readFileSync(activeProjectionPath, 'utf8')).toContain('Projection: active');
    expect(readFileSync(activeProjectionPath, 'utf8')).toContain('[[../OC-PROJECTION-1/00-current.md]]');
    expect(readFileSync(indexPath, 'utf8')).toContain('[[tasks/active/OC-PROJECTION-1.md]] | Projection Task | state=active');
    expect(readFileSync(timelinePath, 'utf8')).toContain('doc=[[tasks/active/OC-PROJECTION-1.md]]');
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-projection', 'index.md'))).toBe(false);

    service.recordTaskRecap({
      project_id: 'proj-projection',
      task_id: 'OC-PROJECTION-1',
      title: 'Projection Task',
      state: 'done',
      current_stage: 'review',
      controller_ref: 'archon',
      workspace_path: join(projectStateDir, 'proj-projection', 'tasks', 'OC-PROJECTION-1'),
      completed_by: 'archon',
      completed_at: '2026-03-27T11:00:00.000Z',
      summary_lines: ['Projection completed'],
    });

    expect(existsSync(activeProjectionPath)).toBe(false);
    expect(existsSync(archiveProjectionPath)).toBe(true);
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('Projection: archive');
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('[[../../recaps/OC-PROJECTION-1.md]]');
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('[[../OC-PROJECTION-1/07-outputs/project-harvest-draft.md]]');
    expect(readFileSync(indexPath, 'utf8')).toContain('[[tasks/archive/OC-PROJECTION-1.md]] | Projection Task | state=done');
    expect(readFileSync(timelinePath, 'utf8')).toContain('doc=[[tasks/archive/OC-PROJECTION-1.md]]');
  });

  it('archives a project only when no active tasks remain', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createProject({
      id: 'proj-archive',
      name: 'Project Archive',
      owner: 'archon',
    });

    expect(service.archiveProject('proj-archive')).toMatchObject({
      id: 'proj-archive',
      status: 'archived',
    });
  });

  it('rejects project archive while active tasks still exist', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    service.createProject({
      id: 'proj-active',
      name: 'Project Active',
      owner: 'archon',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir: join(process.cwd(), 'templates'),
      taskIdGenerator: () => 'OC-PROJ-ACTIVE-1',
      projectService: service,
    });
    taskService.createTask({
      title: 'Active project task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-active',
    });

    expect(() => service.archiveProject('proj-active')).toThrow(/active tasks/i);
  });

  it('deletes an archived project when no tasks remain bound to it', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeTempDir('agora-ts-project-knowledge-');
    const projectStateDir = makeTempDir('agora-ts-project-state-');
    const service = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    service.createProject({
      id: 'proj-delete',
      name: 'Project Delete',
    });
    mkdirSync(join(brainPackDir, 'project-index', 'proj-delete'), { recursive: true });
    writeFileSync(join(brainPackDir, 'project-index', 'proj-delete', 'index.md'), '# internal index\n', 'utf8');

    service.archiveProject('proj-delete');
    service.deleteProject('proj-delete');

    expect(service.getProject('proj-delete')).toBeNull();
    expect(existsSync(join(projectStateDir, 'proj-delete'))).toBe(false);
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-delete'))).toBe(false);
  });

  it('rejects project delete before archive or while tasks still exist', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createProjectServiceFromDb(db);
    service.createProject({
      id: 'proj-delete-blocked',
      name: 'Project Delete Blocked',
    });

    expect(() => service.deleteProject('proj-delete-blocked')).toThrow(/before it is archived/i);

    const taskService = createTaskServiceFromDb(db, {
      templatesDir: join(process.cwd(), 'templates'),
      taskIdGenerator: () => 'OC-PROJ-DELETE-1',
      projectService: service,
    });
    taskService.createTask({
      title: 'Done project task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-delete-blocked',
    });
    taskService.cancelTask('OC-PROJ-DELETE-1', {
      reason: 'close task before project delete test',
    });

    service.archiveProject('proj-delete-blocked');
    expect(() => service.deleteProject('proj-delete-blocked')).toThrow(/tasks are still bound/i);
  });
});
