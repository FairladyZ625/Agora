import { randomUUID } from 'node:crypto';
import type { IApprovalRequestRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredApprovalRequest {
  id: string;
  task_id: string;
  stage_id: string;
  gate_type: string;
  requested_by: string;
  status: 'pending' | 'approved' | 'rejected';
  summary_path: string | null;
  request_comment: string | null;
  resolution_comment: string | null;
  resolved_by: string | null;
  requested_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
}

export class ApprovalRequestRepository implements IApprovalRequestRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id?: string;
    task_id: string;
    stage_id: string;
    gate_type: string;
    requested_by: string;
    summary_path?: string | null;
    request_comment?: string | null;
    metadata?: Record<string, unknown> | null;
  }): StoredApprovalRequest {
    const id = input.id ?? randomUUID();
    const requestedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO approval_requests (
        id, task_id, stage_id, gate_type, requested_by, status, summary_path, request_comment, requested_at, metadata
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      id,
      input.task_id,
      input.stage_id,
      input.gate_type,
      input.requested_by,
      input.summary_path ?? null,
      input.request_comment ?? null,
      requestedAt,
      stringifyJsonValue(input.metadata ?? null),
    );
    return this.requireById(id, 'insert');
  }

  getById(id: string): StoredApprovalRequest | null {
    const row = this.db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getLatestPending(taskId: string, stageId: string): StoredApprovalRequest | null {
    const row = this.db.prepare(`
      SELECT *
      FROM approval_requests
      WHERE task_id = ? AND stage_id = ? AND status = 'pending'
      ORDER BY requested_at DESC, id DESC
      LIMIT 1
    `).get(taskId, stageId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredApprovalRequest[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM approval_requests
      WHERE task_id = ?
      ORDER BY requested_at DESC, id DESC
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  resolve(
    id: string,
    input: {
      status: 'approved' | 'rejected';
      resolved_by: string;
      resolution_comment?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): StoredApprovalRequest {
    const current = this.getById(id);
    if (!current) {
      throw new Error(`Approval request ${id} not found`);
    }
    this.db.prepare(`
      UPDATE approval_requests
      SET status = ?, resolved_by = ?, resolution_comment = ?, resolved_at = ?, metadata = ?
      WHERE id = ?
    `).run(
      input.status,
      input.resolved_by,
      input.resolution_comment ?? null,
      new Date().toISOString(),
      stringifyJsonValue(input.metadata ?? current.metadata ?? null),
      id,
    );
    return this.requireById(id, 'resolve');
  }

  private requireById(id: string, operation: 'insert' | 'resolve'): StoredApprovalRequest {
    const record = this.getById(id);
    if (!record) {
      throw new Error(`Failed to retrieve approval request ${id} after ${operation}`);
    }
    return record;
  }

  private parseRow(row: Record<string, unknown>): StoredApprovalRequest {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      stage_id: String(row.stage_id),
      gate_type: String(row.gate_type),
      requested_by: String(row.requested_by),
      status: String(row.status) as StoredApprovalRequest['status'],
      summary_path: row.summary_path === null ? null : String(row.summary_path),
      request_comment: row.request_comment === null ? null : String(row.request_comment),
      resolution_comment: row.resolution_comment === null ? null : String(row.resolution_comment),
      resolved_by: row.resolved_by === null ? null : String(row.resolved_by),
      requested_at: String(row.requested_at),
      resolved_at: row.resolved_at === null ? null : String(row.resolved_at),
      metadata: row.metadata === null ? null : parseJsonValue<Record<string, unknown>>(row.metadata, {}),
    };
  }
}
