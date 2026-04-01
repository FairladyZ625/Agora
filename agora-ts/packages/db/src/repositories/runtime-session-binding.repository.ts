import type { IRuntimeSessionBindingRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';

export interface StoredRuntimeSessionBinding {
  id: string;
  participant_binding_id: string;
  runtime_provider: string;
  runtime_session_ref: string;
  runtime_actor_ref: string | null;
  continuity_ref: string | null;
  presence_state: string;
  binding_reason: string | null;
  desired_runtime_presence: string;
  reconcile_stage_id: string | null;
  reconciled_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export class RuntimeSessionBindingRepository implements IRuntimeSessionBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  upsertByParticipant(input: {
    id: string;
    participant_binding_id: string;
    runtime_provider: string;
    runtime_session_ref: string;
    runtime_actor_ref?: string | null;
    continuity_ref?: string | null;
    presence_state: string;
    binding_reason?: string | null;
    desired_runtime_presence?: string;
    reconcile_stage_id?: string | null;
    reconciled_at?: string | null;
    last_seen_at: string;
    created_at?: string;
  }): StoredRuntimeSessionBinding {
    const now = input.last_seen_at;
    const createdAt = input.created_at ?? now;
    this.db.prepare(`
      INSERT INTO runtime_session_bindings (
        id, participant_binding_id, runtime_provider, runtime_session_ref, runtime_actor_ref, continuity_ref, presence_state, binding_reason, desired_runtime_presence, reconcile_stage_id, reconciled_at, last_seen_at, created_at, updated_at, closed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(participant_binding_id) DO UPDATE SET
        runtime_provider = excluded.runtime_provider,
        runtime_session_ref = excluded.runtime_session_ref,
        runtime_actor_ref = excluded.runtime_actor_ref,
        continuity_ref = excluded.continuity_ref,
        presence_state = excluded.presence_state,
        binding_reason = excluded.binding_reason,
        desired_runtime_presence = excluded.desired_runtime_presence,
        reconcile_stage_id = excluded.reconcile_stage_id,
        reconciled_at = excluded.reconciled_at,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at,
        closed_at = excluded.closed_at
    `).run(
      input.id,
      input.participant_binding_id,
      input.runtime_provider,
      input.runtime_session_ref,
      input.runtime_actor_ref ?? null,
      input.continuity_ref ?? null,
      input.presence_state,
      input.binding_reason ?? null,
      input.desired_runtime_presence ?? 'attached',
      input.reconcile_stage_id ?? null,
      input.reconciled_at ?? null,
      input.last_seen_at,
      createdAt,
      now,
      input.presence_state === 'closed' ? now : null,
    );
    return this.getByParticipantBinding(input.participant_binding_id)!;
  }

  getByParticipantBinding(participantBindingId: string): StoredRuntimeSessionBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM runtime_session_bindings WHERE participant_binding_id = ?',
    ).get(participantBindingId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredRuntimeSessionBinding[] {
    const rows = this.db.prepare(`
      SELECT rsb.*
      FROM runtime_session_bindings rsb
      INNER JOIN participant_bindings pb ON pb.id = rsb.participant_binding_id
      WHERE pb.task_id = ?
      ORDER BY rsb.updated_at DESC, rsb.id DESC
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  reconcileByParticipant(
    participantBindingId: string,
    input: {
      binding_reason?: string | null;
      desired_runtime_presence: string;
      reconcile_stage_id?: string | null;
      reconciled_at?: string | null;
    },
  ): void {
    const current = this.getByParticipantBinding(participantBindingId);
    if (!current) {
      return;
    }
    const reconciledAt = input.reconciled_at ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE runtime_session_bindings
      SET binding_reason = ?, desired_runtime_presence = ?, reconcile_stage_id = ?, reconciled_at = ?, updated_at = ?
      WHERE participant_binding_id = ?
    `).run(
      input.binding_reason ?? current.binding_reason,
      input.desired_runtime_presence,
      input.reconcile_stage_id ?? current.reconcile_stage_id,
      reconciledAt,
      reconciledAt,
      participantBindingId,
    );
  }

  private parseRow(row: Record<string, unknown>): StoredRuntimeSessionBinding {
    return {
      id: String(row.id),
      participant_binding_id: String(row.participant_binding_id),
      runtime_provider: String(row.runtime_provider),
      runtime_session_ref: String(row.runtime_session_ref),
      runtime_actor_ref: row.runtime_actor_ref === null ? null : String(row.runtime_actor_ref),
      continuity_ref: row.continuity_ref === null ? null : String(row.continuity_ref),
      presence_state: String(row.presence_state),
      binding_reason: row.binding_reason === null || row.binding_reason === undefined ? null : String(row.binding_reason),
      desired_runtime_presence: row.desired_runtime_presence === undefined ? 'attached' : String(row.desired_runtime_presence),
      reconcile_stage_id: row.reconcile_stage_id === null || row.reconcile_stage_id === undefined ? null : String(row.reconcile_stage_id),
      reconciled_at: row.reconciled_at === null || row.reconciled_at === undefined ? null : String(row.reconciled_at),
      last_seen_at: String(row.last_seen_at),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      closed_at: row.closed_at === null ? null : String(row.closed_at),
    };
  }
}
