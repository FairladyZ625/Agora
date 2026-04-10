import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  ParticipantBindingRepository,
  runMigrations,
  RuntimeSessionBindingRepository,
  TaskContextBindingRepository,
  TaskRepository,
} from '@agora-ts/db';
import { TaskParticipationService } from './task-participation-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-participation-cc-connect-'));
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

describe('task participation service cc-connect live sync', () => {
  it('preserves the cc-connect runtime provider when syncing live sessions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const service = new TaskParticipationService({
      participantRepository: new ParticipantBindingRepository(db),
      runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
      taskBindingRepository: bindings,
      participantIdGenerator: () => 'pb-cc-1',
      runtimeSessionIdGenerator: () => 'rs-cc-1',
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'cc-connect',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });

    tasks.insertTask({
      id: 'OC-PART-CC',
      title: 'cc-connect live sync',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [{ role: 'developer', agentId: 'cc-connect:agora-codex', model_preference: 'fast_coding' }] },
      workflow: { stages: [] },
    });
    service.seedParticipants('OC-PART-CC', {
      members: [{ role: 'developer', agentId: 'cc-connect:agora-codex', model_preference: 'fast_coding' }],
    });
    bindings.insert({
      id: 'binding-cc-1',
      task_id: 'OC-PART-CC',
      im_provider: 'discord',
      thread_ref: '1475328660373372940',
      status: 'active',
    });

    service.syncLiveSession({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'cc-connect:agora-codex:discord:1475328660373372940',
      channel: 'discord',
      conversation_id: '1475328660373372940',
      thread_id: '1475328660373372940',
      status: 'active',
      last_event: 'cc_connect_session_active',
      last_event_at: '2026-04-09T14:00:00.000Z',
      metadata: { raw_session_key: 'discord:1475328660373372940' },
    });

    expect(service.listRuntimeSessions('OC-PART-CC')).toEqual([
      expect.objectContaining({
        id: 'rs-cc-1',
        runtime_provider: 'cc-connect',
        runtime_session_ref: 'cc-connect:agora-codex:discord:1475328660373372940',
        runtime_actor_ref: 'cc-connect:agora-codex',
      }),
    ]);

    db.close();
  });
});
