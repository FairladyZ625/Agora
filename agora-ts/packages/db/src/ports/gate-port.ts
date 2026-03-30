import type { GateCommandPort, GateQueryPort } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';

export class SqliteGateQueryPort implements GateQueryPort {
  constructor(private readonly db: AgoraDatabase) {}

  getLatestArchonReview(taskId: string, stageId: string) {
    const row = this.db.prepare(`
      SELECT decision
      FROM archon_reviews
      WHERE task_id = ? AND stage_id = ?
      ORDER BY reviewed_at DESC
      LIMIT 1
    `).get(taskId, stageId) as { decision: string } | undefined;
    return row;
  }

  getSubtaskStatuses(taskId: string, stageId: string): Array<{ status: string }> {
    return this.db.prepare(`
      SELECT status
      FROM subtasks
      WHERE task_id = ? AND stage_id = ?
    `).all(taskId, stageId) as Array<{ status: string }>;
  }

  hasApproval(taskId: string, stageId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1
      FROM approvals
      WHERE task_id = ? AND stage_id = ?
      LIMIT 1
    `).get(taskId, stageId);
    return Boolean(row);
  }

  getQuorumApproveCount(taskId: string, stageId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM quorum_votes
      WHERE task_id = ? AND stage_id = ? AND vote = 'approve'
    `).get(taskId, stageId) as { count: number };
    return row.count;
  }

  getStageEntryTime(taskId: string, stageId: string): string | undefined {
    const row = this.db.prepare(`
      SELECT entered_at
      FROM stage_history
      WHERE task_id = ? AND stage_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(taskId, stageId) as { entered_at: string } | undefined;
    return row?.entered_at;
  }
}

export class SqliteGateCommandPort implements GateCommandPort {
  constructor(private readonly db: AgoraDatabase) {}

  recordArchonReview(taskId: string, stageId: string, decision: 'approved' | 'rejected', reviewerId: string, comment: string): void {
    this.db.prepare(`
      INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, stageId, decision, reviewerId, comment);
  }

  recordApproval(taskId: string, stageId: string, approverRole: string, approverId: string, comment: string): void {
    this.db.prepare(`
      INSERT INTO approvals (task_id, stage_id, approver_role, approver_id, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, stageId, approverRole, approverId, comment);
  }

  recordQuorumVote(taskId: string, stageId: string, voterId: string, vote: string, comment: string): { approved: number; total: number } {
    this.db.prepare(`
      INSERT OR IGNORE INTO quorum_votes (task_id, stage_id, voter_id, vote, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(taskId, stageId, voterId, vote, comment);

    const approvedRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM quorum_votes
      WHERE task_id = ? AND stage_id = ? AND vote = 'approve'
    `).get(taskId, stageId) as { count: number };
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM quorum_votes
      WHERE task_id = ? AND stage_id = ?
    `).get(taskId, stageId) as { count: number };

    return {
      approved: approvedRow.count,
      total: totalRow.count,
    };
  }
}
