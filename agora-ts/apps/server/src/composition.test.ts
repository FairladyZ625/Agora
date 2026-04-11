import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskService } from '@agora-ts/core';
import { parseAgoraConfig } from '@agora-ts/config';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { buildServerComposition } from './composition.js';

const tempPaths: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
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

describe('server composition', () => {
  it('builds the default server composition with explicit root-owned dependencies', () => {
    const dir = makeTempDir('agora-ts-server-composition-');
    const dbPath = join(dir, 'runtime.db');
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);

    const rolePackDir = join(dir, 'role-packs');
    const brainPackDir = join(dir, 'brain-pack');
    mkdirSync(rolePackDir, { recursive: true });
    mkdirSync(brainPackDir, { recursive: true });

    const composition = buildServerComposition({
      config: parseAgoraConfig({
        db_path: dbPath,
        permissions: {
          archonUsers: ['archon'],
          allowAgents: {
            '*': { canCall: [], canAdvance: false },
          },
        },
      }),
      runtimeEnv: {
        apiBaseUrl: 'http://127.0.0.1:3141',
        projectRoot: resolve(process.cwd()),
      },
      db,
      templatesDir: resolve(process.cwd(), 'templates'),
      rolePackDir,
      brainPackDir,
    });

    expect(composition.taskService).toBeDefined();
    expect(composition.dashboardQueryService).toBeDefined();
    expect(Reflect.get(composition.taskService as object, 'taskContextBindingService')).toBe(composition.taskContextBindingService);
    expect(Reflect.get(composition.taskService as object, 'projectService')).toBe(composition.projectService);
    expect(Reflect.get(composition.taskService as object, 'gateQueryPort')?.constructor?.name).toBe('SqliteGateQueryPort');
    expect(Reflect.get(composition.taskService as object, 'gateService')?.constructor?.name).toBe('GateService');
    expect(Reflect.get(composition.taskService as object, 'taskRepository')?.constructor?.name).toBe('TaskRepository');
    expect(Reflect.get(composition.dashboardQueryService as object, 'taskContextBindingService')).toBe(composition.taskContextBindingService);
    expect(Reflect.get(composition.dashboardQueryService as object, 'skillCatalogPort')?.constructor?.name).toBe('FilesystemSkillCatalogAdapter');

    db.close();
  });

  it('threads explicit root-owned dependencies into the server task service factory', () => {
    const dir = makeTempDir('agora-ts-server-composition-capture-');
    const dbPath = join(dir, 'runtime.db');
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);

    const rolePackDir = join(dir, 'role-packs');
    const brainPackDir = join(dir, 'brain-pack');
    mkdirSync(rolePackDir, { recursive: true });
    mkdirSync(brainPackDir, { recursive: true });

    const captured: Record<string, unknown> = {};
    const overriddenTaskService = {
      listTasks: () => [],
    } as unknown as TaskService;

    const composition = buildServerComposition(
      {
        config: parseAgoraConfig({
          db_path: dbPath,
          permissions: {
            archonUsers: ['archon'],
            allowAgents: {
              '*': { canCall: [], canAdvance: false },
            },
          },
        }),
        runtimeEnv: {
          apiBaseUrl: 'http://127.0.0.1:3141',
          projectRoot: resolve(process.cwd()),
        },
        db,
        templatesDir: resolve(process.cwd(), 'templates'),
        rolePackDir,
        brainPackDir,
      },
      {
        createTaskService: (_context, deps) => {
          captured.projectService = deps.projectService;
          captured.taskContextBindingService = deps.taskContextBindingService;
          captured.taskParticipationService = deps.taskParticipationService;
          captured.taskBrainBindingService = deps.taskBrainBindingService;
          captured.agentRuntimePort = deps.agentRuntimePort;
          captured.craftsmanDispatcher = deps.craftsmanDispatcher;
          return overriddenTaskService;
        },
      },
    );

    expect(composition.taskService).toBe(overriddenTaskService);
    expect(captured.projectService).toBe(composition.projectService);
    expect(captured.taskContextBindingService).toBe(composition.taskContextBindingService);
    expect(captured.taskParticipationService).toBe(composition.taskParticipationService);
    expect(captured.taskBrainBindingService).toBeDefined();
    expect(captured.agentRuntimePort).toBeDefined();
    expect(captured.craftsmanDispatcher).toBeDefined();

    db.close();
  });
});
