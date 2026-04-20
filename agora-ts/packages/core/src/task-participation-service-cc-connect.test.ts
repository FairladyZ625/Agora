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

  it('does not let a legacy mirrored cc-connect session override thread-bound runtime truth', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const service = new TaskParticipationService({
      participantRepository: new ParticipantBindingRepository(db),
      runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
      taskBindingRepository: bindings,
      participantIdGenerator: () => 'pb-cc-legacy-1',
      runtimeSessionIdGenerator: (() => {
        const ids = ['rs-thread-1', 'rs-legacy-1'];
        return () => ids.shift() ?? 'rs-fallback';
      })(),
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
      id: 'OC-PART-CC-LEGACY',
      title: 'cc-connect legacy precedence',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [{ role: 'developer', agentId: 'cc-connect:agora-codex', model_preference: 'fast_coding' }] },
      workflow: { stages: [] },
    });
    service.seedParticipants('OC-PART-CC-LEGACY', {
      members: [{ role: 'developer', agentId: 'cc-connect:agora-codex', model_preference: 'fast_coding' }],
    });
    bindings.insert({
      id: 'binding-cc-legacy-1',
      task_id: 'OC-PART-CC-LEGACY',
      im_provider: 'discord',
      thread_ref: '1475328660373372940',
      status: 'active',
    });

    service.bindRuntimeSession({
      participant_binding_id: 'pb-cc-legacy-1',
      runtime_provider: 'cc-connect',
      runtime_session_ref: 'agora-discord:1475328660373372940:pb-cc-legacy-1',
      runtime_actor_ref: 'cc-connect:agora-codex',
      presence_state: 'active',
      binding_reason: 'thread_bridge_dispatch',
      last_seen_at: '2026-04-20T12:00:00.000Z',
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
      last_event_at: '2026-04-20T12:05:00.000Z',
      metadata: {
        session_scope: 'legacy_channel',
        raw_session_key: 'discord:1475328660373372940',
      },
    });

    expect(service.listParticipants('OC-PART-CC-LEGACY')).toEqual([
      expect.objectContaining({
        id: 'pb-cc-legacy-1',
        join_status: 'pending',
      }),
    ]);
    expect(service.listRuntimeSessions('OC-PART-CC-LEGACY')).toEqual([
      expect.objectContaining({
        id: 'rs-thread-1',
        runtime_provider: 'cc-connect',
        runtime_session_ref: 'agora-discord:1475328660373372940:pb-cc-legacy-1',
        runtime_actor_ref: 'cc-connect:agora-codex',
        binding_reason: 'thread_bridge_dispatch',
        last_seen_at: '2026-04-20T12:00:00.000Z',
      }),
    ]);

    db.close();
  });
});
