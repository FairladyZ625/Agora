import type { AgoraDatabase } from '@agora-ts/db';
import { GateType, TaskState } from './enums.js';

type WorkflowStage = {
  id: string;
  next?: string[] | undefined;
  reject_target?: string | undefined;
  gate?: {
    type?: string | undefined;
    [key: string]: unknown;
  } | null | undefined;
};

type WorkflowDefinition = {
  stages?: WorkflowStage[] | undefined;
};

type TaskShape = {
  id: string;
  workflow: WorkflowDefinition;
};

export class StateMachine {
  private readonly validTransitions: Record<TaskState, TaskState[]> = {
    [TaskState.DRAFT]: [TaskState.CREATED, TaskState.ORPHANED],
    [TaskState.CREATED]: [TaskState.ACTIVE],
    [TaskState.ACTIVE]: [TaskState.ACTIVE, TaskState.BLOCKED, TaskState.PAUSED, TaskState.DONE, TaskState.CANCELLED],
    [TaskState.BLOCKED]: [TaskState.ACTIVE, TaskState.CANCELLED],
    [TaskState.PAUSED]: [TaskState.ACTIVE, TaskState.CANCELLED],
    [TaskState.DONE]: [],
    [TaskState.CANCELLED]: [],
    [TaskState.ORPHANED]: [],
  };

  validateTransition(fromState: TaskState, toState: TaskState): boolean {
    return this.validTransitions[fromState].includes(toState);
  }

  getCurrentStage(workflow: WorkflowDefinition, currentStageId: string): WorkflowStage {
    const stage = (workflow.stages ?? []).find((item) => item.id === currentStageId);
    if (!stage) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    return stage;
  }

  getNextStage(workflow: WorkflowDefinition, currentStageId: string): WorkflowStage | null {
    const stages = workflow.stages ?? [];
    const currentIndex = stages.findIndex((item) => item.id === currentStageId);
    if (currentIndex === -1) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    const current = stages[currentIndex]!;
    if (current.next && current.next.length > 0) {
      return stages.find((item) => item.id === current.next?.[0]) ?? null;
    }
    return stages[currentIndex + 1] ?? null;
  }

  getRejectStage(workflow: WorkflowDefinition, currentStageId: string): WorkflowStage | null {
    const stages = workflow.stages ?? [];
    const currentIndex = stages.findIndex((item) => item.id === currentStageId);
    if (currentIndex === -1) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    const current = stages[currentIndex]!;
    const rejectTarget = current.reject_target;
    if (!rejectTarget) {
      return null;
    }
    const targetIndex = stages.findIndex((item) => item.id === rejectTarget);
    if (targetIndex === -1) {
      throw new Error(`reject_target '${rejectTarget}' not found in workflow`);
    }
    if (targetIndex >= currentIndex) {
      throw new Error(`reject_target '${rejectTarget}' for stage '${currentStageId}' must reference an earlier stage`);
    }
    return stages[targetIndex] ?? null;
  }

  advance(workflow: WorkflowDefinition, currentStageId: string): {
    currentStage: WorkflowStage;
    nextStage: WorkflowStage | null;
    completesTask: boolean;
  } {
    const currentStage = this.getCurrentStage(workflow, currentStageId);
    const nextStage = this.getNextStage(workflow, currentStageId);
    return {
      currentStage,
      nextStage,
      completesTask: nextStage === null,
    };
  }

  checkGate(db: AgoraDatabase, task: TaskShape, stage: WorkflowStage, callerId?: string, now = new Date().toISOString()): boolean {
    const gateType = stage.gate?.type ?? GateType.COMMAND;

    if (gateType === GateType.COMMAND) {
      return typeof callerId === 'string' && callerId.length > 0;
    }

    if (gateType === GateType.ARCHON_REVIEW) {
      const row = db.prepare(`
        SELECT decision
        FROM archon_reviews
        WHERE task_id = ? AND stage_id = ?
        ORDER BY reviewed_at DESC
        LIMIT 1
      `).get(task.id, stage.id) as { decision: string } | undefined;
      return row?.decision === 'approved';
    }

    if (gateType === GateType.ALL_SUBTASKS_DONE) {
      const rows = db.prepare(`
        SELECT status
        FROM subtasks
        WHERE task_id = ? AND stage_id = ?
      `).all(task.id, stage.id) as Array<{ status: string }>;
      if (rows.length === 0) {
        return true;
      }
      return rows.every((row) => row.status === 'done');
    }

    if (gateType === GateType.APPROVAL) {
      const row = db.prepare(`
        SELECT 1
        FROM approvals
        WHERE task_id = ? AND stage_id = ?
        LIMIT 1
      `).get(task.id, stage.id);
      return Boolean(row);
    }

    if (gateType === GateType.QUORUM) {
      const required = Number(stage.gate?.required ?? 1);
      if (!Number.isFinite(required) || required <= 0) {
        return false;
      }
      const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM quorum_votes
        WHERE task_id = ? AND stage_id = ? AND vote = 'approve'
      `).get(task.id, stage.id) as { count: number };
      return row.count >= required;
    }

    if (gateType === GateType.AUTO_TIMEOUT) {
      const row = db.prepare(`
        SELECT entered_at
        FROM stage_history
        WHERE task_id = ? AND stage_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(task.id, stage.id) as { entered_at: string } | undefined;
      if (!row?.entered_at) {
        return false;
      }
      const elapsedMs = Date.parse(now) - Date.parse(row.entered_at);
      const timeoutSeconds = Number(stage.gate?.timeout_sec ?? 0);
      if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
        return elapsedMs >= timeoutSeconds * 1000;
      }
      const timeoutMinutes = Number(stage.gate?.timeout_minutes ?? stage.gate?.timeoutMinutes ?? 0);
      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        return false;
      }
      return elapsedMs >= timeoutMinutes * 60_000;
    }

    return false;
  }
}
