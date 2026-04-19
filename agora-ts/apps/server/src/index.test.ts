import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerRuntime } from './runtime.js';
import { createAppFromRuntime } from './index.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-index-'));
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

describe('server index wiring', () => {
  it('passes taskConversationService from runtime into buildApp', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );
    const runtime = createServerRuntime({ configPath });
    const app = createAppFromRuntime(runtime);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks/nonexistent/conversation',
    });

    expect(response.statusCode).not.toBe(503);
    runtime.db.close();
  });

  it('passes taskInboundService from runtime into buildApp', async () => {
    const ingest = vi.fn(() => ({
      entry: {
        id: 'entry-1',
        task_id: 'OC-INBOUND',
        binding_id: 'binding-1',
        provider: 'discord',
        provider_message_ref: null,
        parent_message_ref: null,
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Tester',
        body: 'hello',
        body_format: 'plain_text',
        occurred_at: '2026-04-14T08:00:00.000Z',
        ingested_at: '2026-04-14T08:00:01.000Z',
        metadata: null,
      },
      task_action_result: null,
    }));
    const app = createAppFromRuntime({
      db: undefined,
      taskService: undefined,
      projectService: undefined,
      projectBrainService: undefined,
      projectBrainDoctorService: undefined,
      citizenService: undefined,
      dashboardQueryService: undefined,
      inboxService: undefined,
      templateAuthoringService: undefined,
      liveSessionStore: undefined,
      legacyRuntimeService: undefined,
      tmuxRuntimeService: undefined,
      taskContextBindingService: undefined,
      taskConversationService: { ingest: vi.fn() },
      taskInboundService: { ingest },
      taskParticipationService: undefined,
      humanAccountService: undefined,
      notificationDispatcher: undefined,
      apiAuth: undefined,
      dashboardAuth: undefined,
      rateLimit: undefined,
      observability: {
        ready_path: '/ready',
        metrics_enabled: false,
        structured_logs: false,
      },
      dashboardDir: undefined,
      dispose: async () => {},
    } as unknown as ReturnType<typeof createServerRuntime>);

    const response = await app.inject({
      method: 'POST',
      url: '/api/conversations/ingest',
      payload: {
        provider: 'discord',
        conversation_ref: 'forum-1',
        thread_ref: 'thread-1',
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Tester',
        body: 'hello',
        occurred_at: '2026-04-14T08:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it('passes projectBrainDoctorService from runtime into buildApp', async () => {
    const diagnoseProject = vi.fn(async (projectId: string) => ({
      project_id: projectId,
      embedding: { healthy: true },
      vector_index: { healthy: true },
      jobs: { pending: 0, running: 0, failed: 0, succeeded: 0 },
      drift: { detected: false },
    }));
    const app = createAppFromRuntime({
      db: undefined,
      taskService: undefined,
      projectService: undefined,
      projectBrainService: undefined,
      projectBrainDoctorService: { diagnoseProject },
      citizenService: undefined,
      dashboardQueryService: undefined,
      inboxService: undefined,
      templateAuthoringService: undefined,
      liveSessionStore: undefined,
      legacyRuntimeService: undefined,
      tmuxRuntimeService: undefined,
      taskContextBindingService: undefined,
      taskConversationService: undefined,
      taskParticipationService: undefined,
      humanAccountService: undefined,
      notificationDispatcher: undefined,
      apiAuth: undefined,
      dashboardAuth: undefined,
      rateLimit: undefined,
      observability: {
        ready_path: '/ready',
        metrics_enabled: false,
        structured_logs: false,
      },
      dashboardDir: undefined,
      dispose: async () => {},
    } as unknown as ReturnType<typeof createServerRuntime>);

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-doctor/nomos/doctor',
    });

    expect(response.statusCode).toBe(200);
    expect(diagnoseProject).toHaveBeenCalledWith('proj-doctor');
  });

  it('closes runtime-owned resources when the app closes', async () => {
    const dispose = vi.fn(async () => {});
    const app = createAppFromRuntime({
      db: undefined,
      taskService: undefined,
      projectService: undefined,
      dashboardQueryService: undefined,
      inboxService: undefined,
      templateAuthoringService: undefined,
      liveSessionStore: undefined,
      legacyRuntimeService: undefined,
      tmuxRuntimeService: undefined,
      taskContextBindingService: undefined,
      taskConversationService: undefined,
      taskParticipationService: undefined,
      humanAccountService: undefined,
      notificationDispatcher: undefined,
      apiAuth: undefined,
      dashboardAuth: undefined,
      rateLimit: undefined,
      observability: {
        ready_path: '/ready',
        metrics_enabled: false,
        structured_logs: false,
      },
      dashboardDir: undefined,
      dispose,
    } as unknown as ReturnType<typeof createServerRuntime>);

    await app.close();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('passes observation scheduler metrics into the metrics endpoint', async () => {
    const app = createAppFromRuntime({
      db: undefined,
      taskService: undefined,
      projectService: undefined,
      dashboardQueryService: undefined,
      inboxService: undefined,
      templateAuthoringService: undefined,
      liveSessionStore: undefined,
      legacyRuntimeService: undefined,
      tmuxRuntimeService: undefined,
      taskContextBindingService: undefined,
      taskConversationService: undefined,
      taskParticipationService: undefined,
      humanAccountService: undefined,
      notificationDispatcher: undefined,
      apiAuth: undefined,
      dashboardAuth: undefined,
      rateLimit: undefined,
      observability: {
        ready_path: '/ready',
        metrics_enabled: true,
        structured_logs: false,
      },
      observationScheduler: {
        enabled: true,
        interval_ms: 5_000,
        tick: () => ({
          observed_at: new Date().toISOString(),
          craftsman: { scanned: 0, probed: 0, progressed: 0 },
          tasks: { scanned_tasks: 0, controller_pings: 0, roster_pings: 0, human_pings: 0, inbox_items: 0 },
        }),
        getMetricsSnapshot: () => ({
          observationTicksByResult: { success: 4, error: 1 },
          projectBrainIndexWorkerTicksByResult: { success: 2, error: 0 },
        }),
        stop: () => undefined,
      },
      dashboardDir: undefined,
      dispose: async () => {},
    } as unknown as ReturnType<typeof createServerRuntime>);

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('agora_background_observation_ticks_total{result="success"} 4');
    expect(response.body).toContain('agora_project_brain_index_worker_ticks_total{result="success"} 2');
  });
});
