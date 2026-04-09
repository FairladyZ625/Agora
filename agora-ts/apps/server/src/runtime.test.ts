import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations, ArchiveJobRepository } from '@agora-ts/db';
import { CraftsmanExecutionRepository, SubtaskRepository } from '@agora-ts/db';
import { LiveSessionStore } from '@agora-ts/core';
import type { TmuxRuntimeService , TaskService } from '@agora-ts/core';
import { createTaskServiceFromDb } from '@agora-ts/testing';
import { createServerRuntime } from './runtime.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-runtime-'));
  tempPaths.push(dir);
  return dir;
}

function configureRuntimeEnv(dir: string) {
  const agoraHomeDir = join(dir, 'agora-home');
  process.env.AGORA_HOME_DIR = agoraHomeDir;
  process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
  return {
    agoraHomeDir,
    brainPackRoot: process.env.AGORA_BRAIN_PACK_ROOT!,
  };
}

function mockRuntimeModules(existsSyncImpl: (path: string) => boolean) {
  vi.doMock('node:fs', () => ({
    existsSync: vi.fn(existsSyncImpl),
    mkdirSync: vi.fn(),
  }));
  vi.doMock('@agora-ts/config', () => ({
    loadAgoraConfig: vi.fn(() => ({
      db_path: ':memory:',
      permissions: {
        archonUsers: ['archon'],
        allowAgents: {
          '*': { canCall: [], canAdvance: false },
        },
      },
      api_auth: { enabled: false, token: '' },
      dashboard_auth: {
        enabled: false,
        method: 'session',
        allowed_users: [],
        session_ttl_hours: 24,
      },
      rate_limit: {
        enabled: false,
        window_ms: 60_000,
        max_requests: 100,
        write_max_requests: 20,
      },
      observability: {},
      scheduler: {
        enabled: false,
        scan_interval_sec: 60,
        task_probe_controller_after_sec: 300,
        task_probe_roster_after_sec: 900,
        task_probe_inbox_after_sec: 1800,
        craftsman_running_after_sec: 300,
        craftsman_waiting_after_sec: 120,
        startup_recovery_on_boot: false,
      },
    })),
    ensureBundledAgoraAssetsInstalled: vi.fn(() => ({
      userAgoraDir: '/tmp/agora-home',
      agoraSkillDir: '/tmp/agora-home/skills/agora-bootstrap',
      userSkillDirs: [],
      installedSkillTargets: [],
      userBrainPackDir: '/tmp/agora-home/agora-ai-brain',
    })),
    agoraDataDirPath: vi.fn(() => '/tmp/agora-home'),
    hasInstalledBrainPack: vi.fn(() => true),
    syncBundledBrainPackContents: vi.fn(),
    resolveAgoraRuntimeEnvironmentFromConfigPackage: vi.fn(() => ({
      apiBaseUrl: 'http://127.0.0.1:3000',
      projectRoot: '/tmp/agora-project',
    })),
  }));
  vi.doMock('@agora-ts/db', () => ({
    createAgoraDatabase: vi.fn(() => ({ close: vi.fn() })),
    runMigrations: vi.fn(),
    ArchiveJobRepository: class ArchiveJobRepository {},
    CraftsmanExecutionRepository: class CraftsmanExecutionRepository {},
    ProjectBrainIndexJobRepository: class ProjectBrainIndexJobRepository {},
    SubtaskRepository: class SubtaskRepository {},
  }));
  vi.doMock('@agora-ts/core', () => ({
    DashboardQueryService: class DashboardQueryService {},
    InboxService: class InboxService {},
    LiveSessionStore: class LiveSessionStore {},
    ProjectBrainDoctorService: class ProjectBrainDoctorService {},
    ProjectBrainIndexQueueService: class ProjectBrainIndexQueueService {},
    TaskService: class TaskService {
      startupRecoveryScan() {}
    },
    TaskConversationService: class TaskConversationService {},
    TaskContextBindingService: class TaskContextBindingService {},
    TaskParticipationService: class TaskParticipationService {},
    NotificationDispatcher: class NotificationDispatcher {},
    HumanAccountService: class HumanAccountService {},
  }));
  vi.doMock('./composition.js', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
      ...actual,
      buildServerComposition: vi.fn(() => ({
        taskService: { startupRecoveryScan: vi.fn() },
        dashboardQueryService: {},
        inboxService: {},
        liveSessionStore: {},
        taskConversationService: {},
        taskContextBindingService: {},
        taskParticipationService: {},
        notificationDispatcher: {},
        humanAccountService: {},
      })),
    };
  });
}

afterEach(() => {
  delete process.env.AGORA_BRAIN_PACK_ROOT;
  delete process.env.AGORA_HOME_DIR;
  delete process.env.AGORA_SKILL_TARGET_DIRS;
  delete process.env.AGORA_CRAFTSMAN_SERVER_MODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_EMBEDDING_MODEL;
  delete process.env.OPENAI_EMBEDDING_DIMENSION;
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_API_KEY;
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
    const env = configureRuntimeEnv(dir);
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
    expect(Reflect.get(runtime.taskService as object, 'skillCatalogPort')?.constructor?.name).toBe('FilesystemSkillCatalogAdapter');
    expect(Reflect.get(runtime.dashboardQueryService as object, 'skillCatalogPort')?.constructor?.name).toBe('FilesystemSkillCatalogAdapter');
    expect(Reflect.get(runtime.dashboardQueryService as object, 'taskBrainBindingService')).toBeDefined();
    expect(Reflect.get(runtime.dashboardQueryService as object, 'taskBrainWorkspacePort')).toBeDefined();
    expect(readFileSync(join(env.brainPackRoot, 'roles', 'controller.md'), 'utf8')).toContain('soul:');
    runtime.db.close();
  });

  it('starts discord presence service when provided by composition', () => {
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        im: {
          provider: 'discord',
          discord: {
            bot_token: 'discord-token',
            default_channel_id: '123',
          },
        },
      }),
    );

    const start = vi.fn();
    const runtime = createServerRuntime({
      configPath,
      factories: {
        createDiscordPresenceService: () => ({
          start,
          stop: vi.fn(),
          enabled: true,
        }) as never,
      },
    });

    expect(start).toHaveBeenCalledTimes(1);
    runtime.db.close();
  });

  it('disposes runtime-owned services on shutdown', () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        scheduler: {
          enabled: true,
          scan_interval_sec: 5,
        },
      }),
    );

    const stopPresence = vi.fn();
    const observeCraftsmanExecutions = vi.fn(() => ({
      scanned: 1,
      probed: 0,
      progressed: 0,
    }));
    const probeInactiveTasks = vi.fn(() => ({
      scanned_tasks: 1,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    }));

    const runtime = createServerRuntime({
      configPath,
      factories: {
        createDiscordPresenceService: () => ({
          start: vi.fn(),
          stop: stopPresence,
          enabled: true,
        }) as never,
        createTaskService: () => ({
          observeCraftsmanExecutions,
          probeInactiveTasks,
          startupRecoveryScan: vi.fn(),
        } as unknown as TaskService),
      },
    });

    runtime.dispose();
    vi.advanceTimersByTime(5_000);

    expect(stopPresence).toHaveBeenCalledTimes(1);
    expect(observeCraftsmanExecutions).not.toHaveBeenCalled();
    expect(probeInactiveTasks).not.toHaveBeenCalled();

    runtime.db.close();
    vi.useRealTimers();
  });

  it('runs startup recovery on boot when configured', () => {
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
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
    const bootstrapTaskService = createTaskServiceFromDb(bootstrapDb, {
      templatesDir: new URL('../../../templates', import.meta.url).pathname,
      taskIdGenerator: () => 'OC-BOOT',
      isCraftsmanSessionAlive: (sessionId: string) => sessionId !== 'tmux:dead',
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
      mode: 'one_shot',
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

  it('runs schedulerized observation ticks on the configured interval', () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        scheduler: {
          enabled: true,
          scan_interval_sec: 5,
          task_probe_controller_after_sec: 11,
          task_probe_roster_after_sec: 22,
          task_probe_inbox_after_sec: 33,
          craftsman_running_after_sec: 44,
          craftsman_waiting_after_sec: 55,
          startup_recovery_on_boot: false,
        },
      }),
    );

    const observeCraftsmanExecutions = vi.fn(() => ({
      scanned: 1,
      probed: 1,
      progressed: 0,
    }));
    const probeInactiveTasks = vi.fn(() => ({
      scanned_tasks: 2,
      controller_pings: 1,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    }));

    const runtime = createServerRuntime({
      configPath,
      factories: {
        createTaskService: () => ({
          observeCraftsmanExecutions,
          probeInactiveTasks,
          startupRecoveryScan: vi.fn(),
        } as unknown as TaskService),
      },
    });

    expect(runtime.observationScheduler.enabled).toBe(true);
    expect(runtime.observationScheduler.interval_ms).toBe(5000);
    expect(observeCraftsmanExecutions).not.toHaveBeenCalled();
    expect(probeInactiveTasks).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);

    expect(observeCraftsmanExecutions).toHaveBeenCalledWith({
      runningAfterMs: 44_000,
      waitingAfterMs: 55_000,
    });
    expect(probeInactiveTasks).toHaveBeenCalledWith({
      controllerAfterMs: 11_000,
      rosterAfterMs: 22_000,
      inboxAfterMs: 33_000,
    });

    runtime.observationScheduler.stop();
    runtime.db.close();
    vi.useRealTimers();
  });

  it('drains project brain index jobs during observation ticks when an index worker is provided', () => {
    vi.useFakeTimers();
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        scheduler: {
          enabled: true,
          scan_interval_sec: 5,
          startup_recovery_on_boot: false,
        },
      }),
    );

    const observeCraftsmanExecutions = vi.fn(() => ({
      scanned: 0,
      probed: 0,
      progressed: 0,
    }));
    const probeInactiveTasks = vi.fn(() => ({
      scanned_tasks: 0,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    }));
    const drainPendingJobs = vi.fn().mockResolvedValue({
      processed: 1,
      succeeded: 1,
      failed: 0,
      pending: 0,
    });

    const runtime = createServerRuntime({
      configPath,
      factories: {
        createTaskService: () => ({
          observeCraftsmanExecutions,
          probeInactiveTasks,
          startupRecoveryScan: vi.fn(),
        } as unknown as TaskService),
        createProjectBrainIndexWorkerService: () => ({
          drainPendingJobs,
        }) as never,
      },
    });

    vi.advanceTimersByTime(5000);

    expect(drainPendingJobs).toHaveBeenCalledWith({ limit: 25 });
    runtime.observationScheduler.stop();
    runtime.db.close();
    vi.useRealTimers();
  });

  it('accepts composition factory overrides for legacy runtime dependencies', () => {
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    const liveSessionStore = new LiveSessionStore({ staleAfterMs: 1234 });
    const legacyRuntimeService = {
      status: () => ({ session: 'override', panes: [] }),
    } as unknown as TmuxRuntimeService;

    const runtime = createServerRuntime({
      configPath,
      factories: {
        createLiveSessionStore: () => liveSessionStore,
        createLegacyRuntimeService: () => legacyRuntimeService,
      },
    });

    expect(runtime.liveSessionStore).toBe(liveSessionStore);
    expect(runtime.legacyRuntimeService).toBe(legacyRuntimeService);
    expect(runtime.tmuxRuntimeService).toBe(legacyRuntimeService);
    runtime.db.close();
  });

  it('wires acp craftsman ports into server composition when server mode is acp', () => {
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_CRAFTSMAN_SERVER_MODE = 'acp';
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    let capturedDeps: Record<string, string> | null = null;
    let dispatcherRuntime: object | undefined;
    let inputRuntime: object | undefined;
    const runtime = createServerRuntime({
      configPath,
      factories: {
        createTaskService: (context, deps) => {
          capturedDeps = {
            input: deps.craftsmanInputPort.constructor.name,
            probe: deps.craftsmanExecutionProbePort.constructor.name,
            tail: deps.craftsmanExecutionTailPort.constructor.name,
            recovery: deps.runtimeRecoveryPort.constructor.name,
          };
          const adapters = Reflect.get(deps.craftsmanDispatcher as object, 'adapters') as Record<string, unknown> | undefined;
          const adapter = adapters?.codex ?? adapters?.claude ?? adapters?.gemini;
          dispatcherRuntime = adapter && typeof adapter === 'object'
            ? Reflect.get(adapter, 'runtime') as object | undefined
            : undefined;
          inputRuntime = Reflect.get(deps.craftsmanInputPort as object, 'runtime') as object | undefined;
          return createTaskServiceFromDb(context.db, {
            templatesDir: context.templatesDir,
          });
        },
      },
    });

    expect(capturedDeps).toEqual({
      input: 'AcpCraftsmanInputPort',
      probe: 'AcpCraftsmanProbePort',
      tail: 'AcpCraftsmanTailPort',
      recovery: 'AcpRuntimeRecoveryPort',
    });
    expect(dispatcherRuntime).toBeDefined();
    expect(inputRuntime).toBe(dispatcherRuntime);
    runtime.db.close();
    delete process.env.AGORA_CRAFTSMAN_SERVER_MODE;
  });

  it('self-heals bundled bootstrap skill into runtime-visible skill roots on startup', () => {
    const dir = makeTempDir();
    const env = configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    const agentsSkillsDir = join(dir, 'agents-skills');
    const codexSkillsDir = join(dir, 'codex-skills');
    process.env.AGORA_SKILL_TARGET_DIRS = [agentsSkillsDir, codexSkillsDir].join(',');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    const runtime = createServerRuntime({ configPath });

    expect(readFileSync(join(env.agoraHomeDir, 'skills', 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(agentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(codexSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    runtime.db.close();
  });

  it('uses stable default archive outbox and receipt directories when env paths are unset', () => {
    const dir = makeTempDir();
    configureRuntimeEnv(dir);
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    const previousOutbox = process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR;
    const previousReceipt = process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR;
    delete process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR;
    delete process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR;

    const bootstrapDb = createAgoraDatabase({ dbPath });
    runMigrations(bootstrapDb);
    const bootstrapTaskService = createTaskServiceFromDb(bootstrapDb, {
      templatesDir: new URL('../../../templates', import.meta.url).pathname,
      taskIdGenerator: () => 'OC-ARCHIVE',
    });
    bootstrapTaskService.createTask({
      title: 'archive task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    const archives = new ArchiveJobRepository(bootstrapDb);
    const job = archives.insertArchiveJob({
      task_id: 'OC-ARCHIVE',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/tasks/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    bootstrapDb.close();

    try {
      const runtime = createServerRuntime({ configPath });
      const notified = runtime.dashboardQueryService.notifyArchiveJob(job.id);
      const outboxDir = join(dir, 'archive-outbox');
      const receiptDir = join(dir, 'archive-receipts');

      expect(notified.status).toBe('notified');
      expect(readdirSync(outboxDir)).toEqual(['archive-job-1.json']);

      mkdirSync(receiptDir, { recursive: true });
      writeFileSync(join(receiptDir, 'archive-job-1.receipt.json'), JSON.stringify({
        job_id: 1,
        status: 'synced',
        commit_hash: 'deadbeef',
      }), 'utf8');

      const ingested = runtime.dashboardQueryService.ingestArchiveJobReceipts();
      expect(ingested.synced).toBe(1);
      expect(readdirSync(receiptDir)).toEqual(['archive-job-1.processed.json']);
      runtime.db.close();
    } finally {
      if (previousOutbox === undefined) {
        delete process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR;
      } else {
        process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR = previousOutbox;
      }
      if (previousReceipt === undefined) {
        delete process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR;
      } else {
        process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR = previousReceipt;
      }
    }
  });

  it('does not mount dashboard source files when no built dist directory exists', async () => {
    vi.resetModules();
    mockRuntimeModules((path) => path === '/tmp/custom-dashboard-dist');

    process.env.AGORA_DASHBOARD_DIR = '/tmp/custom-dashboard-dist';
    process.env.AGORA_HOME_DIR = '/tmp/agora-home';
    const { createServerRuntime: createServerRuntimeWithMocks } = await import('./runtime.js');
    const runtime = createServerRuntimeWithMocks({ configPath: '/tmp/agora.json' });

    expect(runtime.dashboardDir).toBe('/tmp/custom-dashboard-dist');

    delete process.env.AGORA_DASHBOARD_DIR;
    vi.resetModules();
    mockRuntimeModules(() => false);

    process.env.AGORA_HOME_DIR = '/tmp/agora-home';
    const { createServerRuntime: createServerRuntimeWithoutDist } = await import('./runtime.js');
    const noDistRuntime = createServerRuntimeWithoutDist({ configPath: '/tmp/agora.json' });

    expect(noDistRuntime.dashboardDir).toBeUndefined();
  });
});
