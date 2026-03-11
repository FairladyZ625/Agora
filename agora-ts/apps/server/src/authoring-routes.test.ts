import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { DashboardQueryService, InboxService, TaskService, TemplateAuthoringService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const sourceTemplatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-authoring-routes-db-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeTemplatesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-authoring-routes-templates-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  cpSync(join(sourceTemplatesDir, 'tasks', 'coding.json'), join(dir, 'tasks', 'coding.json'));
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

describe('authoring routes', () => {
  it('serves inbox CRUD/promote and template authoring routes', async () => {
    const templatesDir = makeTemplatesDir();
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-800',
    });
    const inboxService = new InboxService(db, taskService);
    const dashboardQueryService = new DashboardQueryService(db, { templatesDir });
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const app = buildApp({
      taskService,
      dashboardQueryService,
      inboxService,
      templateAuthoringService,
    });

    const createInbox = await app.inject({
      method: 'POST',
      url: '/api/inbox',
      payload: {
        text: '把 workflow editor 接到 TS server',
        source: 'dashboard',
        tags: ['authoring'],
      },
    });
    const createdInbox = createInbox.json();

    const listInbox = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const patchInbox = await app.inject({
      method: 'PATCH',
      url: `/api/inbox/${createdInbox.id}`,
      payload: {
        notes: '优先做最小保存能力',
      },
    });
    const promoteInbox = await app.inject({
      method: 'POST',
      url: `/api/inbox/${createdInbox.id}/promote`,
      payload: {
        target: 'task',
        type: 'coding',
        creator: 'archon',
        priority: 'high',
      },
    });

    const validateTemplate = await app.inject({
      method: 'POST',
      url: '/api/templates/validate',
      payload: {
        name: '模板校验',
        type: 'template_validate',
        stages: [{ id: 'draft', gate: { type: 'command' } }],
      },
    });
    const saveTemplate = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: {
        id: 'flow_editor',
        template: {
          name: '工作流编辑器模板',
          type: 'flow_editor',
          defaultWorkflow: 'draft-review',
          stages: [{ id: 'draft', gate: { type: 'command' } }],
        },
      },
    });
    const updateWorkflow = await app.inject({
      method: 'PUT',
      url: '/api/templates/flow_editor/workflow',
      payload: {
        defaultWorkflow: 'draft-review-publish',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'publish', gate: { type: 'archon_review' } },
        ],
      },
    });
    const duplicateTemplate = await app.inject({
      method: 'POST',
      url: '/api/templates/flow_editor/duplicate',
      payload: {
        new_id: 'flow_editor_copy',
        name: '工作流编辑器模板副本',
      },
    });
    const validateWorkflow = await app.inject({
      method: 'POST',
      url: '/api/workflows/validate',
      payload: {
        stages: [{ id: 'draft', gate: { type: 'command' } }],
      },
    });
    const deleteInbox = await app.inject({
      method: 'DELETE',
      url: `/api/inbox/${createdInbox.id}`,
    });

    expect(createInbox.statusCode).toBe(200);
    expect(listInbox.statusCode).toBe(200);
    expect(listInbox.json()).toHaveLength(1);
    expect(patchInbox.statusCode).toBe(200);
    expect(patchInbox.json()).toMatchObject({ notes: '优先做最小保存能力' });
    expect(promoteInbox.statusCode).toBe(200);
    expect(promoteInbox.json()).toMatchObject({
      inbox: { promoted_to_type: 'task' },
      task: { id: 'OC-800' },
    });
    expect(validateTemplate.statusCode).toBe(200);
    expect(validateTemplate.json()).toMatchObject({ valid: true });
    expect(saveTemplate.statusCode).toBe(200);
    expect(saveTemplate.json()).toMatchObject({ id: 'flow_editor', saved: true });
    expect(updateWorkflow.statusCode).toBe(200);
    expect(updateWorkflow.json()).toMatchObject({
      template: {
        defaultWorkflow: 'draft-review-publish',
      },
    });
    expect(duplicateTemplate.statusCode).toBe(200);
    expect(duplicateTemplate.json()).toMatchObject({ id: 'flow_editor_copy' });
    expect(validateWorkflow.statusCode).toBe(200);
    expect(validateWorkflow.json()).toMatchObject({ valid: true });
    expect(deleteInbox.statusCode).toBe(200);
  });

  it('returns 400 for invalid inbox ids', async () => {
    const templatesDir = makeTemplatesDir();
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-801',
    });
    const inboxService = new InboxService(db, taskService);
    const app = buildApp({ taskService, inboxService });

    const patchInbox = await app.inject({
      method: 'PATCH',
      url: '/api/inbox/not-a-number',
      payload: { notes: 'invalid id' },
    });
    const deleteInbox = await app.inject({
      method: 'DELETE',
      url: '/api/inbox/not-a-number',
    });
    const promoteInbox = await app.inject({
      method: 'POST',
      url: '/api/inbox/not-a-number/promote',
      payload: { target: 'todo' },
    });

    expect(patchInbox.statusCode).toBe(400);
    expect(deleteInbox.statusCode).toBe(400);
    expect(promoteInbox.statusCode).toBe(400);
  });

  it('reports invalid workflow gate semantics through authoring validation routes', async () => {
    const templatesDir = makeTemplatesDir();
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-802',
    });
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const app = buildApp({ taskService, templateAuthoringService });

    const validateTemplate = await app.inject({
      method: 'POST',
      url: '/api/templates/validate',
      payload: {
        name: '非法审批模板',
        type: 'broken',
        stages: [{ id: 'review', gate: { type: 'approval' } }],
      },
    });
    const validateWorkflow = await app.inject({
      method: 'POST',
      url: '/api/workflows/validate',
      payload: {
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 1 } }],
      },
    });

    expect(validateTemplate.statusCode).toBe(400);
    expect(JSON.stringify(validateTemplate.json())).toMatch(/approver/i);
    expect(validateWorkflow.statusCode).toBe(400);
    expect(JSON.stringify(validateWorkflow.json())).toMatch(/required/i);
  });
});
