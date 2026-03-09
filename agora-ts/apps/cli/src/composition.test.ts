import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskService } from '@agora-ts/core';
import type { TmuxRuntimeService } from '@agora-ts/core';
import { createCliComposition } from './composition.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-composition-'));
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

describe('cli composition', () => {
  it('loads config and builds task/tmux runtime services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const composition = createCliComposition({ configPath });

    expect(composition.config.db_path).toBe(dbPath);
    expect(composition.taskService).toBeDefined();
    expect(composition.tmuxRuntimeService).toBeDefined();
    composition.db.close();
  });

  it('accepts composition factory overrides for task and tmux services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const overriddenTaskService = {
      listTasks: () => [],
    } as unknown as TaskService;
    const overriddenTmuxRuntimeService = {
      status: () => ({ session: 'override', panes: [] }),
    } as unknown as TmuxRuntimeService;

    const composition = createCliComposition(
      { configPath },
      {
        createTaskService: () => overriddenTaskService,
        createTmuxRuntimeService: () => overriddenTmuxRuntimeService,
      },
    );

    expect(composition.taskService).toBe(overriddenTaskService);
    expect(composition.tmuxRuntimeService).toBe(overriddenTmuxRuntimeService);
    composition.db.close();
  });
});
