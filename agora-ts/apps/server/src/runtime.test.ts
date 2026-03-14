import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations, ArchiveJobRepository } from '@agora-ts/db';
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

function mockRuntimeModules(existsSyncImpl: (path: string) => boolean) {
  vi.doMock('node:fs', () => ({
    existsSync: vi.fn(existsSyncImpl),
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
    resolveAgoraRuntimeEnvironmentFromConfigPackage: vi.fn(() => ({})),
  }));
  vi.doMock('@agora-ts/db', () => ({
    createAgoraDatabase: vi.fn(() => ({ close: vi.fn() })),
    runMigrations: vi.fn(),
    ArchiveJobRepository: class ArchiveJobRepository {},
    CraftsmanExecutionRepository: class CraftsmanExecutionRepository {},
    SubtaskRepository: class SubtaskRepository {},
  }));
  vi.doMock('@agora-ts/core', () => ({
    DashboardQueryService: class DashboardQueryService {},
    InboxService: class InboxService {},
    LiveSessionStore: class LiveSessionStore {},
    TaskService: class TaskService {
      startupRecoveryScan() {}
    },
    TaskConversationService: class TaskConversationService {},
    TaskContextBindingService: class TaskContextBindingService {},
    TaskParticipationService: class TaskParticipationService {},
    NotificationDispatcher: class NotificationDispatcher {},
    HumanAccountService: class HumanAccountService {},
  }));
  vi.doMock('./composition.js', () => ({
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
  }));
}

afterEach(() => {
  delete process.env.AGORA_BRAIN_PACK_ROOT;
  delete process.env.AGORA_HOME_DIR;
  delete process.env.AGORA_SKILL_TARGET_DIRS;
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
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
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
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
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

  it('accepts composition factory overrides for runtime dependencies', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
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

  it('self-heals bundled bootstrap skill into runtime-visible skill roots on startup', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    const agoraHomeDir = join(dir, 'agora-home');
    const agentsSkillsDir = join(dir, 'agents-skills');
    const codexSkillsDir = join(dir, 'codex-skills');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_HOME_DIR = agoraHomeDir;
    process.env.AGORA_SKILL_TARGET_DIRS = [agentsSkillsDir, codexSkillsDir].join(',');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );

    const runtime = createServerRuntime({ configPath });

    expect(readFileSync(join(agoraHomeDir, 'skills', 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(agentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(codexSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    runtime.db.close();
  });

  it('uses stable default archive outbox and receipt directories when env paths are unset', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
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
    const bootstrapTaskService = new TaskService(bootstrapDb, {
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
    const { createServerRuntime: createServerRuntimeWithMocks } = await import('./runtime.js');
    const runtime = createServerRuntimeWithMocks({ configPath: '/tmp/agora.json' });

    expect(runtime.dashboardDir).toBe('/tmp/custom-dashboard-dist');

    delete process.env.AGORA_DASHBOARD_DIR;
    vi.resetModules();
    mockRuntimeModules(() => false);

    const { createServerRuntime: createServerRuntimeWithoutDist } = await import('./runtime.js');
    const noDistRuntime = createServerRuntimeWithoutDist({ configPath: '/tmp/agora.json' });

    expect(noDistRuntime.dashboardDir).toBeUndefined();
  });
});
