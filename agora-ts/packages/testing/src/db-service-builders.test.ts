import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import {
  createDashboardQueryServiceFromDb,
  createTaskServiceFromDb,
  createWorkspaceBootstrapServiceFromDb,
} from './db-service-builders.js';

const tempDirs: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-db-service-builders-'));
  tempDirs.push(dir);
  return join(dir, 'runtime.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('db service builders', () => {
  it('creates task and dashboard services with explicit db-backed root wiring', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BUILDER-1',
    });
    const dashboardQueryService = createDashboardQueryServiceFromDb(db, {
      taskContextBindingService: Reflect.get(taskService as object, 'taskContextBindingService'),
      taskBrainBindingService: Reflect.get(taskService as object, 'taskBrainBindingService'),
    });

    expect(Reflect.get(taskService as object, 'gateQueryPort')?.constructor?.name).toBe('SqliteGateQueryPort');
    expect(Reflect.get(taskService as object, 'gateService')?.constructor?.name).toBe('GateService');
    expect(Reflect.get(taskService as object, 'taskRepository')?.constructor?.name).toBe('TaskRepository');
    expect(Reflect.get(dashboardQueryService as object, 'taskContextBindingService')).toBe(
      Reflect.get(taskService as object, 'taskContextBindingService'),
    );
    expect(Reflect.get(dashboardQueryService as object, 'taskBrainBindingService')).toBe(
      Reflect.get(taskService as object, 'taskBrainBindingService'),
    );

    db.close();
  });

  it('creates workspace bootstrap service without relying on core fallback construction', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const service = createWorkspaceBootstrapServiceFromDb(db, {
      taskService: {
        createTask: () => {
          throw new Error('not used');
        },
      },
      runtimeReady: true,
    });

    expect(Reflect.get(service as object, 'tasks')?.constructor?.name).toBe('TaskRepository');

    db.close();
  });
});
