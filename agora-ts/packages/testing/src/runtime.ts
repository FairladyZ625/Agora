import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import { DashboardQueryService, TaskService } from '@agora-ts/core';

export interface CreateTestRuntimeOptions {
  taskIdGenerator?: () => string;
  templatesDir?: string;
}

export interface TestRuntime {
  dir: string;
  db: AgoraDatabase;
  taskService: TaskService;
  dashboardQueryService: DashboardQueryService;
  cleanup: () => void;
}

export function createTestRuntime(options: CreateTestRuntimeOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-runtime-'));
  const dbPath = join(dir, 'tasks.db');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const templatesDir = options.templatesDir ?? resolve(process.cwd(), '../agora/templates');
  const taskServiceOptions: { templatesDir: string; taskIdGenerator?: () => string } = {
    templatesDir,
  };
  if (options.taskIdGenerator !== undefined) {
    taskServiceOptions.taskIdGenerator = options.taskIdGenerator;
  }
  const taskService = new TaskService(db, taskServiceOptions);
  const dashboardQueryService = new DashboardQueryService(db, {
    templatesDir,
  });

  return {
    dir,
    db,
    taskService,
    dashboardQueryService,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  } satisfies TestRuntime;
}
