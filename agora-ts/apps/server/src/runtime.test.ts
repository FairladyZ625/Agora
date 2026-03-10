import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { CraftsmanExecutionRepository, SubtaskRepository } from '@agora-ts/db';
import { LiveSessionStore, TaskService } from '@agora-ts/core';
import type { TmuxRuntimeService } from '@agora-ts/core';
import { createServerRuntime } from './runtime.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-runtime-'));
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

describe('server runtime', () => {
  it('loads config and wires task/dashboard services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        permissions: {
          archonUsers: ['archon'],
          allowAgents: {
            '*': { canCall: [], canAdvance: false },
          },
        },
      }),
    );

    const runtime = createServerRuntime({ configPath });

    expect(runtime.config.db_path).toBe(dbPath);
    expect(runtime.taskService).toBeDefined();
    expect(runtime.dashboardQueryService).toBeDefined();
    expect(runtime.liveSessionStore).toBeDefined();
    expect(runtime.taskConversationService).toBeDefined();
    runtime.db.close();
  });

  it('runs startup recovery on boot when configured', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        scheduler: {
          enabled: true,
          scan_interval_sec: 60,
          startup_recovery_on_boot: true,
        },
      }),
    );
    const bootstrapDb = createAgoraDatabase({ dbPath });
    runMigrations(bootstrapDb);
    const bootstrapTaskService = new TaskService(bootstrapDb, {
      templatesDir: new URL('../../../templates', import.meta.url).pathname,
      taskIdGenerator: () => 'OC-BOOT',
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });
    bootstrapTaskService.createTask({
      title: 'boot recovery runtime',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    const subtasks = new SubtaskRepository(bootstrapDb);
    const executions = new CraftsmanExecutionRepository(bootstrapDb);
    subtasks.insertSubtask({
      id: 'boot-dead',
      task_id: 'OC-BOOT',
      stage_id: 'discuss',
      title: 'Dead on boot',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T15:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-boot-dead-1',
      task_id: 'OC-BOOT',
      subtask_id: 'boot-dead',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T15:00:00.000Z',
    });
    bootstrapDb.close();

    const runtime = createServerRuntime({
      configPath,
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });
    const status = runtime.taskService.getTaskStatus('OC-BOOT');

    expect(status.task.state).toBe('blocked');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'boot-dead',
          status: 'failed',
        }),
      ]),
    );
    runtime.db.close();
  });

  it('accepts composition factory overrides for runtime dependencies', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    const liveSessionStore = new LiveSessionStore({ staleAfterMs: 1234 });
    const tmuxRuntimeService = {
      status: () => ({ session: 'override', panes: [] }),
    } as unknown as TmuxRuntimeService;

    const runtime = createServerRuntime({
      configPath,
      factories: {
        createLiveSessionStore: () => liveSessionStore,
        createTmuxRuntimeService: () => tmuxRuntimeService,
      },
    });

    expect(runtime.liveSessionStore).toBe(liveSessionStore);
    expect(runtime.tmuxRuntimeService).toBe(tmuxRuntimeService);
    runtime.db.close();
  });
});
