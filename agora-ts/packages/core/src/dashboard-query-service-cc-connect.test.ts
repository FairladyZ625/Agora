import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  createAgoraDatabase,
  ProgressLogRepository,
  runMigrations,
  TaskRepository,
  TemplateRepository,
  TodoRepository,
  SubtaskRepository,
} from '@agora-ts/db';
import { DashboardQueryService } from './dashboard-query-service.js';
import { LiveSessionStore } from './live-session-store.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-cc-connect-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('dashboard query service cc-connect live session projection', () => {
  it('projects cc-connect live sessions under the cc-connect host instead of openclaw', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-04-09T14:00:30.000Z'),
    });
    const queries = new DashboardQueryService({
      templatesDir,
      taskRepository: new TaskRepository(db),
      subtaskRepository: new SubtaskRepository(db),
      archiveJobRepository: new ArchiveJobRepository(db),
      todoRepository: new TodoRepository(db),
      executionRepository: new CraftsmanExecutionRepository(db),
      progressLogRepository: new ProgressLogRepository(db),
      templateRepository: new TemplateRepository(db),
      liveSessions,
      agentRegistry: {
        listAgents: () => [{
          id: 'cc-connect:agora-codex',
          inventory_kind: 'runtime_target',
          host_framework: 'cc-connect',
          runtime_provider: 'cc-connect',
          runtime_flavor: 'codex',
          runtime_target_ref: 'cc-connect:agora-codex',
          channel_providers: ['discord'],
          inventory_sources: ['cc-connect'],
          primary_model: 'gpt-5.4',
          workspace_dir: '/repo/agora',
          discord_bot_user_ids: ['1491781344664227942'],
        }],
      },
    });

    liveSessions.upsert({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'cc-connect:agora-codex:discord:1475328660373372940',
      channel: 'discord',
      conversation_id: '1475328660373372940',
      thread_id: '1475328660373372940',
      status: 'active',
      last_event: 'cc_connect_session_active',
      last_event_at: '2026-04-09T14:00:00.000Z',
      metadata: { project: 'agora-codex' },
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cc-connect:agora-codex',
        host_framework: 'cc-connect',
        inventory_sources: ['cc-connect'],
        channel_providers: ['discord'],
        inventory_kind: 'runtime_target',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex',
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
        discord_bot_user_ids: ['1491781344664227942'],
        status: 'busy',
        presence: 'online',
      }),
    ]));
    expect(agentsStatus.host_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        host: 'cc-connect',
        total_agents: 1,
        busy_agents: 1,
      }),
    ]));

    db.close();
  });
});
