import type { IFlowLogRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { stringifyJsonValue } from './json.js';

export interface StoredFlowLog {
  id: number;
  task_id: string;
  kind: string;
  event: string;
  stage_id: string | null;
  from_state: string | null;
  to_state: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export interface InsertFlowLogInput {
  task_id: string;
  kind: string;
  event: string;
  stage_id?: string | null;
  from_state?: string | null;
  to_state?: string | null;
  detail?: unknown;
  actor?: string | null;
}

export class FlowLogRepository implements IFlowLogRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertFlowLog(input: InsertFlowLogInput): StoredFlowLog {
    const info = this.db.prepare(`
      INSERT INTO flow_log (task_id, kind, event, stage_id, from_state, to_state, detail, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.task_id,
      input.kind,
      input.event,
      input.stage_id ?? null,
      input.from_state ?? null,
      input.to_state ?? null,
      input.detail === undefined ? null : stringifyJsonValue(input.detail),
      input.actor ?? null,
    );
    return this.getFlowLog(Number(info.lastInsertRowid))!;
  }

  listByTask(taskId: string): StoredFlowLog[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM flow_log
      WHERE task_id = ?
      ORDER BY id ASC
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  private getFlowLog(id: number): StoredFlowLog | null {
    const row = this.db.prepare('SELECT * FROM flow_log WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  private parseRow(row: Record<string, unknown>): StoredFlowLog {
    return {
      id: Number(row.id),
      task_id: String(row.task_id),
      kind: String(row.kind),
      event: String(row.event),
      stage_id: row.stage_id === null ? null : String(row.stage_id),
      from_state: row.from_state === null ? null : String(row.from_state),
      to_state: row.to_state === null ? null : String(row.to_state),
      detail: row.detail === null ? null : String(row.detail),
      actor: row.actor === null ? null : String(row.actor),
      created_at: String(row.created_at),
    };
  }
}
