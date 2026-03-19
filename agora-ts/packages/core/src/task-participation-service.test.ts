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
        binding_reason: 'live_session_match',
        desired_runtime_presence: 'detached',
        reconcile_stage_id: null,
        reconciled_at: null,
      }),
    ]);
  });

  it('stores participant exposure reasoning for the active stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const service = new TaskParticipationService(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-exp-1', 'pb-exp-2'];
        return () => ids.shift() ?? 'pb-exp-x';
      })(),
    });

    tasks.insertTask({
      id: 'OC-PART-3',
      title: 'exposure',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
        ],
      },
      workflow: { stages: [] },
    });

    service.seedParticipants('OC-PART-3', {
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
      ],
    });

    service.applyExposureStates('OC-PART-3', 'develop', [
      { agent_ref: 'opus', desired_exposure: 'in_thread', exposure_reason: 'controller_preserved' },
      { agent_ref: 'sonnet', desired_exposure: 'hidden', exposure_reason: 'stage_roster_excluded' },
    ]);

    expect(service.listParticipants('OC-PART-3')).toEqual([
      expect.objectContaining({
        agent_ref: 'opus',
        desired_exposure: 'in_thread',
        exposure_reason: 'controller_preserved',
        exposure_stage_id: 'develop',
      }),
      expect.objectContaining({
        agent_ref: 'sonnet',
        desired_exposure: 'hidden',
        exposure_reason: 'stage_roster_excluded',
        exposure_stage_id: 'develop',
      }),
    ]);
  });

  it('reconciles runtime session bindings against the active stage exposure state', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const service = new TaskParticipationService(db, {
      participantIdGenerator: () => 'pb-runtime-1',
      runtimeSessionIdGenerator: () => 'rs-runtime-1',
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
      id: 'OC-PART-4',
      title: 'runtime reconcile',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
        ],
      },
      workflow: { stages: [] },
    });
    service.seedParticipants('OC-PART-4', {
      members: [{ role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' }],
    });
    bindings.insert({
      id: 'binding-runtime-1',
      task_id: 'OC-PART-4',
      im_provider: 'discord',
      thread_ref: 'thread-runtime-1',
      status: 'active',
    });

    service.syncLiveSession({
      source: 'openclaw',
      agent_id: 'sonnet',
      session_key: 'agent:sonnet:discord:thread:runtime',
      channel: 'discord',
      conversation_id: 'runtime',
      thread_id: 'thread-runtime-1',
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-17T12:00:00.000Z',
      metadata: {},
    });

    service.applyExposureStates('OC-PART-4', 'develop', [
      { agent_ref: 'sonnet', desired_exposure: 'in_thread', exposure_reason: 'stage_roster_selected' },
    ]);
    service.reconcileRuntimeSessions('OC-PART-4', 'develop', [
      { agent_ref: 'sonnet', desired_exposure: 'in_thread', exposure_reason: 'stage_roster_selected' },
    ]);

    expect(service.listRuntimeSessions('OC-PART-4')).toEqual([
      expect.objectContaining({
        participant_binding_id: 'pb-runtime-1',
        desired_runtime_presence: 'attached',
        binding_reason: 'stage_roster_selected',
        reconcile_stage_id: 'develop',
        reconciled_at: expect.any(String),
      }),
    ]);

    service.applyExposureStates('OC-PART-4', 'review', [
      { agent_ref: 'sonnet', desired_exposure: 'hidden', exposure_reason: 'stage_roster_excluded' },
    ]);
    service.reconcileRuntimeSessions('OC-PART-4', 'review', [
      { agent_ref: 'sonnet', desired_exposure: 'hidden', exposure_reason: 'stage_roster_excluded' },
    ]);

    expect(service.listRuntimeSessions('OC-PART-4')).toEqual([
      expect.objectContaining({
        participant_binding_id: 'pb-runtime-1',
        runtime_session_ref: 'agent:sonnet:discord:thread:runtime',
        presence_state: 'active',
        desired_runtime_presence: 'detached',
        binding_reason: 'stage_roster_excluded',
        reconcile_stage_id: 'review',
        reconciled_at: expect.any(String),
      }),
    ]);
  });
});
