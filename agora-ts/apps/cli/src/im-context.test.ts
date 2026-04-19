import { describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createProjectServiceFromDb, createTaskContextBindingServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';
import { StubIMProvisioningPort } from '@agora-ts/core';
import { createCliProgram } from './index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createBuffer() {
  let value = '';
  return {
    write(chunk: string) {
      value += chunk;
    },
    get value() {
      return value;
    },
  };
}

describe('IM context CLI', () => {
  it('resolves a managed project-space context through the cli', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-im-context-'));
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
      const stdout = createBuffer();
      const stderr = createBuffer();
      const program = createCliProgram({
        projectService,
        taskService: createTaskServiceFromDb(db, { projectService }),
        taskContextBindingService: createTaskContextBindingServiceFromDb(db),
        stdout,
        stderr,
      }).exitOverride();

      await program.parseAsync(['im', 'resolve', '--provider', 'discord', '--conversation-ref', 'forum-space'], { from: 'user' });

      expect(stderr.value).toBe('');
      expect(stdout.value).toContain('managed: true');
      expect(stdout.value).toContain('scope: project_space');
      expect(stdout.value).toContain('project_id: proj-space');
      expect(stdout.value).toContain('project_space: forum-space');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a managed task-thread context through the cli', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-im-task-context-'));
    try {
      const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
      runMigrations(db);
      const projectService = createProjectServiceFromDb(db);
      projectService.createProject({
        id: 'proj-thread',
        name: 'Project Thread',
      });
      projectService.upsertProjectImSpace('proj-thread', {
        provider: 'discord',
        conversation_ref: 'forum-thread',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
      const taskContextBindingService = createTaskContextBindingServiceFromDb(db);
      const taskService = createTaskServiceFromDb(db, {
        taskIdGenerator: () => 'OC-CLI-CTX-1',
        projectService,
        taskContextBindingService,
        imProvisioningPort: new StubIMProvisioningPort({
          im_provider: 'discord',
          conversation_ref: 'forum-thread',
          thread_ref: 'thread-cli',
        }),
      });
      taskService.createTask({
        title: 'CLI thread task',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        project_id: 'proj-thread',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const stdout = createBuffer();
      const stderr = createBuffer();
      const program = createCliProgram({
        projectService,
        taskService,
        taskContextBindingService,
        stdout,
        stderr,
      }).exitOverride();

      await program.parseAsync(['im', 'resolve', '--provider', 'discord', '--thread-ref', 'thread-cli', '--conversation-ref', 'forum-thread'], { from: 'user' });

      expect(stderr.value).toBe('');
      expect(stdout.value).toContain('managed: true');
      expect(stdout.value).toContain('scope: task_thread');
      expect(stdout.value).toContain('task_id: OC-CLI-CTX-1');
      expect(stdout.value).toContain('project_id: proj-thread');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
