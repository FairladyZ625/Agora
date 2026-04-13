import {
  type InsertParticipantBindingInput,
  type IParticipantBindingRepository,
  participantBindingJoinStatusSchema,
  participantTaskRoleSchema,
  runtimeProviderSchema,
  type ParticipantBindingRecord,
} from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';

export type StoredParticipantBinding = ParticipantBindingRecord;

export class ParticipantBindingRepository implements IParticipantBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: InsertParticipantBindingInput): StoredParticipantBinding {
    const createdAt = input.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO participant_bindings (
        id, task_id, binding_id, agent_ref, runtime_provider, task_role, source, join_status,
        desired_exposure, exposure_reason, exposure_stage_id, reconciled_at,
        created_at, joined_at, left_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.binding_id ?? null,
      input.agent_ref,
      input.runtime_provider ?? null,
      input.task_role,
      input.source ?? 'template',
      input.join_status ?? 'pending',
      input.desired_exposure ?? 'hidden',
      input.exposure_reason ?? null,
      input.exposure_stage_id ?? null,
      input.reconciled_at ?? null,
      createdAt,
      input.joined_at ?? null,
      input.left_at ?? null,
    );
    return this.getById(input.id)!;
  }

  getById(id: string): StoredParticipantBinding | null {
    const row = this.db.prepare('SELECT * FROM participant_bindings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredParticipantBinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM participant_bindings WHERE task_id = ? ORDER BY created_at, id',
    ).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  getByTaskAndAgent(taskId: string, agentRef: string): StoredParticipantBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM participant_bindings WHERE task_id = ? AND agent_ref = ? ORDER BY created_at DESC LIMIT 1',
    ).get(taskId, agentRef) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  attachContextBinding(taskId: string, bindingId: string): void {
    this.db.prepare(
      'UPDATE participant_bindings SET binding_id = ? WHERE task_id = ?',
    ).run(bindingId, taskId);
  }

  updateJoinState(
    id: string,
    joinStatus: ReturnType<typeof participantBindingJoinStatusSchema.parse>,
    timestamps: { joined_at?: string | null; left_at?: string | null } = {},
  ): void {
    const current = this.getById(id);
    if (!current) {
      return;
    }
    this.db.prepare(`
      UPDATE participant_bindings
      SET join_status = ?, joined_at = ?, left_at = ?
      WHERE id = ?
    `).run(
      joinStatus,
      timestamps.joined_at ?? current.joined_at,
      timestamps.left_at ?? current.left_at,
      id,
    );
  }

  updateExposureState(
    id: string,
    input: {
      desired_exposure: string;
      exposure_reason?: string | null;
      exposure_stage_id?: string | null;
      reconciled_at?: string | null;
    },
  ): void {
    this.db.prepare(`
      UPDATE participant_bindings
      SET desired_exposure = ?, exposure_reason = ?, exposure_stage_id = ?, reconciled_at = ?
      WHERE id = ?
    `).run(
      input.desired_exposure,
      input.exposure_reason ?? null,
      input.exposure_stage_id ?? null,
      input.reconciled_at ?? new Date().toISOString(),
      id,
    );
  }

  private parseRow(row: Record<string, unknown>): StoredParticipantBinding {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      binding_id: row.binding_id === null ? null : String(row.binding_id),
      agent_ref: String(row.agent_ref),
      runtime_provider: row.runtime_provider === null ? null : runtimeProviderSchema.parse(String(row.runtime_provider)),
      task_role: participantTaskRoleSchema.parse(String(row.task_role)),
      source: String(row.source),
      join_status: participantBindingJoinStatusSchema.parse(String(row.join_status)),
      desired_exposure: row.desired_exposure === undefined ? 'hidden' : String(row.desired_exposure),
      exposure_reason: row.exposure_reason === null || row.exposure_reason === undefined ? null : String(row.exposure_reason),
      exposure_stage_id: row.exposure_stage_id === null || row.exposure_stage_id === undefined ? null : String(row.exposure_stage_id),
      reconciled_at: row.reconciled_at === null || row.reconciled_at === undefined ? null : String(row.reconciled_at),
      created_at: String(row.created_at),
      joined_at: row.joined_at === null ? null : String(row.joined_at),
      left_at: row.left_at === null ? null : String(row.left_at),
    };
  }
}
