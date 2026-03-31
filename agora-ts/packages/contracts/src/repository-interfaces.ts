/**
 * Repository interfaces for Core data access.
 *
 * These interfaces define the contracts that Core depends on.
 * Concrete implementations live in @agora-ts/db and are bound
 * at the composition root (apps/server, apps/cli).
 *
 * Design rules:
 * - Interfaces return primitive types, plain objects, or types from this package
 * - No reference to @agora-ts/db types
 * - Method signatures mirror the actual repository methods Core calls
 */

// ---------------------------------------------------------------------------
// Gate query / command — used by StateMachine and GateService
// ---------------------------------------------------------------------------

export interface GateQueryPort {
  /** Return the latest archon review decision for a task+stage, or null. */
  getLatestArchonReview(
    taskId: string,
    stageId: string,
  ): { decision: string } | undefined;

  /** Return all subtask statuses for a task+stage. */
  getSubtaskStatuses(
    taskId: string,
    stageId: string,
  ): Array<{ status: string }>;

  /** Return whether an approval exists for a task+stage. */
  hasApproval(taskId: string, stageId: string): boolean;

  /** Return the count of approve votes for a quorum gate. */
  getQuorumApproveCount(taskId: string, stageId: string): number;

  /** Return the most recent stage_entry timestamp, or null. */
  getStageEntryTime(
    taskId: string,
    stageId: string,
  ): string | undefined;
}

export interface GateCommandPort {
  recordArchonReview(
    taskId: string,
    stageId: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
    comment: string,
  ): void;

  recordApproval(
    taskId: string,
    stageId: string,
    approverRole: string,
    approverId: string,
    comment: string,
  ): void;

  recordQuorumVote(
    taskId: string,
    stageId: string,
    voterId: string,
    vote: string,
    comment: string,
  ): { approved: number; total: number };
}

// ---------------------------------------------------------------------------
// Transaction management
// ---------------------------------------------------------------------------

export interface TransactionManager {
  begin(): void;
  commit(): void;
  rollback(): void;
}
