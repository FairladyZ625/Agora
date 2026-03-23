import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { ProjectService } from './project-service.js';
import { TaskService } from './task-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-service-'));
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

describe('project service', () => {
  it('creates, lists, and resolves projects', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
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
    expect(existsSync(join(brainPackDir, 'projects', 'proj-alpha', 'index.md'))).toBe(true);
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-alpha', 'index.md'), 'utf8')).toContain('doc_type: project_index');
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-alpha', 'index.md'), 'utf8')).toContain('# Project Alpha');
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-alpha', 'timeline.md'), 'utf8')).toContain('doc_type: project_timeline');
  });

  it('auto-generates a persisted project id when the caller omits one', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    const created = service.createProject({
      name: '中文 Project Alpha',
      summary: 'auto id',
      owner: 'archon',
    });

    expect(created.id).toMatch(/^proj-[a-z0-9-]+$/);
    expect(service.requireProject(created.id).name).toBe('中文 Project Alpha');
    expect(existsSync(join(brainPackDir, 'projects', created.id, 'index.md'))).toBe(true);
  });

  it('throws when requiring a missing project', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new ProjectService(db);

    expect(() => service.requireProject('proj-missing')).toThrow('Project not found: proj-missing');
  });

  it('writes, lists, reads, and searches project knowledge docs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
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
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-knowledge', 'index.md'), 'utf8')).toContain(
      '[[knowledge/decisions/runtime-boundary.md]]',
    );
  });

  it('enqueues affected project brain docs when knowledge, timeline, and recap write paths change', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const enqueueDocumentSync = vi.fn();
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
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

  it('archives a project only when no active tasks remain', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
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
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    service.createProject({
      id: 'proj-active',
      name: 'Project Active',
      owner: 'archon',
    });
    const taskService = new TaskService(db, {
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
    const service = new ProjectService(db);
    service.createProject({
      id: 'proj-delete',
      name: 'Project Delete',
    });

    service.archiveProject('proj-delete');
    service.deleteProject('proj-delete');

    expect(service.getProject('proj-delete')).toBeNull();
  });

  it('rejects project delete before archive or while tasks still exist', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new ProjectService(db);
    service.createProject({
      id: 'proj-delete-blocked',
      name: 'Project Delete Blocked',
    });

    expect(() => service.deleteProject('proj-delete-blocked')).toThrow(/before it is archived/i);

    const taskService = new TaskService(db, {
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
