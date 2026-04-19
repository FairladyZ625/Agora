import { describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { buildApp } from './app.js';
import { createProjectServiceFromDb, createTaskServiceFromDb, createTaskContextBindingServiceFromDb } from '@agora-ts/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StubIMProvisioningPort } from '@agora-ts/core';

describe('IM context resolve routes', () => {
  it('resolves a task-thread context when thread binding exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-im-context-route-'));
    try {
      const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
      runMigrations(db);
      const projectService = createProjectServiceFromDb(db);
      projectService.createProject({
        id: 'proj-alpha',
        name: 'Project Alpha',
      });
      projectService.upsertProjectImSpace('proj-alpha', {
        provider: 'discord',
        conversation_ref: 'forum-alpha',
        parent_ref: 'category-1',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
      const taskContextBindingService = createTaskContextBindingServiceFromDb(db);
      const taskService = createTaskServiceFromDb(db, {
        taskIdGenerator: () => 'OC-IM-CTX-1',
        projectService,
        taskContextBindingService,
        imProvisioningPort: new StubIMProvisioningPort({
          im_provider: 'discord',
          conversation_ref: 'forum-alpha',
          thread_ref: 'thread-alpha',
        }),
      });
      taskService.createTask({
        title: 'Thread task',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        project_id: 'proj-alpha',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const app = buildApp({
        db,
        projectService,
        taskService,
        taskContextBindingService,
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/im/contexts/resolve',
        payload: {
          provider: 'discord',
          thread_ref: 'thread-alpha',
          conversation_ref: 'forum-alpha',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        managed: true,
        scope: 'task_thread',
        binding_id: expect.any(String),
        project: {
          id: 'proj-alpha',
          name: 'Project Alpha',
          conversation_ref: 'forum-alpha',
          parent_ref: 'category-1',
          kind: 'forum_channel',
          managed_by: 'agora',
        },
        task: {
          id: 'OC-IM-CTX-1',
          title: 'Thread task',
          state: 'active',
          current_stage: 'discuss',
          project_id: 'proj-alpha',
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a managed project space when only the forum binding exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-im-context-project-route-'));
    try {
      const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
      runMigrations(db);
      const projectService = createProjectServiceFromDb(db);
      projectService.createProject({
        id: 'proj-space',
        name: 'Project Space',
      });
      projectService.upsertProjectImSpace('proj-space', {
        provider: 'discord',
        conversation_ref: 'forum-space',
        parent_ref: 'category-9',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
      const app = buildApp({
        db,
        projectService,
        taskService: createTaskServiceFromDb(db, { projectService }),
        taskContextBindingService: createTaskContextBindingServiceFromDb(db),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/im/contexts/resolve',
        payload: {
          provider: 'discord',
          conversation_ref: 'forum-space',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        managed: true,
        scope: 'project_space',
        binding_id: null,
        project: {
          id: 'proj-space',
          name: 'Project Space',
          conversation_ref: 'forum-space',
          parent_ref: 'category-9',
          kind: 'forum_channel',
          managed_by: 'agora',
        },
        task: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
