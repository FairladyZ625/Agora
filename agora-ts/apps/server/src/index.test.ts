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
});
