import { describe, expect, it } from 'vitest';
import { participantBindingSchema } from './participant-binding.js';
import { runtimeSessionBindingSchema } from './runtime-session-binding.js';

describe('participant/runtime-session contracts', () => {
  it('parses participant and runtime session bindings with shared enum values', () => {
    expect(participantBindingSchema.parse({
      id: 'participant-1',
      task_id: 'OC-ROLE-1',
      binding_id: 'binding-1',
      agent_ref: 'glm5',
      runtime_provider: 'openclaw',
      task_role: 'architect',
      source: 'template',
      join_status: 'joined',
      created_at: '2026-04-13T00:00:00.000Z',
      joined_at: '2026-04-13T00:00:01.000Z',
      left_at: null,
    }).task_role).toBe('architect');

    expect(runtimeSessionBindingSchema.parse({
      id: 'runtime-session-1',
      participant_binding_id: 'participant-1',
      runtime_provider: 'cc-connect',
      runtime_session_ref: 'cc-connect:session-1',
      runtime_actor_ref: 'glm5',
      continuity_ref: null,
      presence_state: 'active',
      binding_reason: 'live_session_match',
      desired_runtime_presence: 'attached',
      reconcile_stage_id: 'draft',
      reconciled_at: '2026-04-13T00:00:02.000Z',
      last_seen_at: '2026-04-13T00:00:03.000Z',
      created_at: '2026-04-13T00:00:03.000Z',
      updated_at: '2026-04-13T00:00:03.000Z',
      closed_at: null,
    }).runtime_provider).toBe('cc-connect');
  });

  it('rejects unsupported shared enum values', () => {
    expect(() => participantBindingSchema.parse({
      id: 'participant-1',
      task_id: 'OC-ROLE-1',
      binding_id: null,
      agent_ref: 'glm5',
      runtime_provider: 'relay',
      task_role: 'citizen',
      source: 'template',
      join_status: 'waiting',
      created_at: '2026-04-13T00:00:00.000Z',
      joined_at: null,
      left_at: null,
    })).toThrow();

    expect(() => runtimeSessionBindingSchema.parse({
      id: 'runtime-session-1',
      participant_binding_id: 'participant-1',
      runtime_provider: 'relay',
      runtime_session_ref: 'relay:session-1',
      runtime_actor_ref: 'glm5',
      continuity_ref: null,
      presence_state: 'running',
      binding_reason: null,
      desired_runtime_presence: 'attached',
      reconcile_stage_id: null,
      reconciled_at: null,
      last_seen_at: '2026-04-13T00:00:03.000Z',
      created_at: '2026-04-13T00:00:03.000Z',
      updated_at: '2026-04-13T00:00:03.000Z',
      closed_at: null,
    })).toThrow();
  });
});
