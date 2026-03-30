import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgoraDatabase, runMigrations, TaskRepository } from '@agora-ts/db';
import { TaskService } from './task-service.js';
import { WorkspaceBootstrapService } from './workspace-bootstrap-service.js';

const tempDirs: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-workspace-bootstrap-'));
  tempDirs.push(dir);
  return join(dir, 'agora.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('workspace bootstrap service', () => {
  it('creates a workspace bootstrap task when runtime readiness is available', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db);
    const service = new WorkspaceBootstrapService({
      db,
      taskService,
      runtimeReady: true,
      runtimeReadinessReason: null,
      creator: 'archon',
    });

    const created = service.initialize();
    const status = service.getStatus();

    expect(created).not.toBeNull();
    expect(created?.title).toBe('Workspace Bootstrap Interview');
    expect(created?.control).toMatchObject({
      workspace_bootstrap: {
        kind: 'orchestrator_onboarding',
      },
    });
    expect(status).toMatchObject({
      runtime_ready: true,
      bootstrap_task_id: created?.id,
      bootstrap_completed: false,
    });
    db.close();
  });

  it('marks bootstrap as completed once the dedicated task is done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db);
    const tasks = new TaskRepository(db);
    const service = new WorkspaceBootstrapService({
      db,
      taskService,
      runtimeReady: true,
      runtimeReadinessReason: null,
      creator: 'archon',
    });

    const created = service.initialize();
    if (!created) {
      throw new Error('workspace bootstrap task was not created');
    }
    tasks.updateTask(created.id, created.version, { state: 'done' });

    expect(service.getStatus()).toMatchObject({
      bootstrap_task_id: created.id,
      bootstrap_task_state: 'done',
      bootstrap_completed: true,
    });
    db.close();
  });
});
