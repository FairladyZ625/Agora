import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TaskContextBindingRepository, TaskRepository } from '@agora-ts/db';
import { TaskParticipationService } from './task-participation-service.js';
import type { AgentRuntimePort } from './runtime-ports.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-participation-'));
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

describe('task participation service', () => {
  it('seeds participant bindings from the task team and attaches a context binding', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const runtimePort: AgentRuntimePort = {
      resolveAgent(agentRef) {
        return {
          agent_ref: agentRef,
          runtime_provider: agentRef === 'sonnet' ? 'openclaw' : null,
          runtime_actor_ref: agentRef === 'sonnet' ? agentRef : null,
        };
      },
    };
    const service = new TaskParticipationService(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-1', 'pb-2'];
        return () => ids.shift() ?? 'pb-x';
      })(),
      agentRuntimePort: runtimePort,
    });

    tasks.insertTask({
      id: 'OC-PART-1',
      title: 'participants',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', model_preference: 'review' },
        ],
      },
      workflow: { stages: [] },
    });

    const participants = service.seedParticipants('OC-PART-1', {
      members: [
        { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
        { role: 'reviewer', agentId: 'glm5', model_preference: 'review' },
      ],
    });
    bindings.insert({
      id: 'binding-1',
      task_id: 'OC-PART-1',
      im_provider: 'discord',
      thread_ref: 'thread-1',
      status: 'active',
    });
    service.attachContextBinding('OC-PART-1', 'binding-1');

    expect(participants).toHaveLength(2);
    expect(service.listParticipants('OC-PART-1')).toEqual([
      expect.objectContaining({
        id: 'pb-1',
        task_id: 'OC-PART-1',
        binding_id: 'binding-1',
        agent_ref: 'sonnet',
        runtime_provider: 'openclaw',
        task_role: 'developer',
        join_status: 'pending',
      }),
      expect.objectContaining({
        id: 'pb-2',
        task_id: 'OC-PART-1',
        binding_id: 'binding-1',
        agent_ref: 'glm5',
        runtime_provider: null,
        task_role: 'reviewer',
        join_status: 'pending',
      }),
    ]);
  });

  it('syncs live sessions into participant join state and runtime session bindings', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const service = new TaskParticipationService(db, {
      participantIdGenerator: () => 'pb-live-1',
      runtimeSessionIdGenerator: () => 'rs-live-1',
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });

    tasks.insertTask({
      id: 'OC-PART-2',
      title: 'live sync',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [{ role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' }] },
      workflow: { stages: [] },
    });
    service.seedParticipants('OC-PART-2', {
      members: [{ role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' }],
    });
    bindings.insert({
      id: 'binding-live-1',
      task_id: 'OC-PART-2',
      im_provider: 'discord',
      thread_ref: 'thread-92',
      status: 'active',
    });

    const synced = service.syncLiveSession({
      source: 'openclaw',
      agent_id: 'sonnet',
      session_key: 'agent:sonnet:discord:thread:92',
      channel: 'discord',
      conversation_id: 'triage',
      thread_id: 'thread-92',
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-10T10:00:00.000Z',
      metadata: { continuity_ref: 'cont-92' },
    });

    expect(synced).toEqual({
      matched_participant_ids: ['pb-live-1'],
      matched_task_ids: ['OC-PART-2'],
    });
    expect(service.listParticipants('OC-PART-2')).toEqual([
      expect.objectContaining({
        id: 'pb-live-1',
        binding_id: 'binding-live-1',
        join_status: 'joined',
        joined_at: '2026-03-10T10:00:00.000Z',
      }),
    ]);
    expect(service.listRuntimeSessions('OC-PART-2')).toEqual([
      expect.objectContaining({
        id: 'rs-live-1',
        participant_binding_id: 'pb-live-1',
        runtime_provider: 'openclaw',
        runtime_session_ref: 'agent:sonnet:discord:thread:92',
        runtime_actor_ref: 'sonnet',
        continuity_ref: 'cont-92',
        presence_state: 'active',
      }),
    ]);
  });
});
