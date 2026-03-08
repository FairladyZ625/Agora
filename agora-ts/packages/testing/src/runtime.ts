import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import { DashboardQueryService, InboxService, TaskService, TemplateAuthoringService } from '@agora-ts/core';

export interface CreateTestRuntimeOptions {
  taskIdGenerator?: () => string;
  templatesDir?: string;
}

export interface TestRuntime {
  dir: string;
  db: AgoraDatabase;
  templatesDir: string;
  taskService: TaskService;
  dashboardQueryService: DashboardQueryService;
  inboxService: InboxService;
  templateAuthoringService: TemplateAuthoringService;
  cleanup: () => void;
}

export function createTestRuntime(options: CreateTestRuntimeOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-runtime-'));
  const dbPath = join(dir, 'tasks.db');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const sourceTemplatesDir = options.templatesDir ?? resolve(process.cwd(), '../agora/templates');
  const templatesDir = join(dir, 'templates');
  mkdirSync(templatesDir, { recursive: true });
  cpSync(sourceTemplatesDir, templatesDir, { recursive: true });
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
  const inboxService = new InboxService(db, taskService);
  const templateAuthoringService = new TemplateAuthoringService({ templatesDir });

  return {
    dir,
    db,
    templatesDir,
    taskService,
    dashboardQueryService,
    inboxService,
    templateAuthoringService,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  } satisfies TestRuntime;
}
