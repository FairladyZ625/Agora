import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@agora-ts/contracts';
import { TaskApprovalService } from './task-approval-service.js';

function makeTask(): TaskRecord {
  return {
    id: 'OC-APPROVAL-1',
    title: 'Approval task',
    description: '',
    type: 'coding',
    priority: 'normal',
    creator: 'archon',
    locale: 'zh-CN',
    state: 'active',
    current_stage: 'review',
    version: 2,
    workflow: {
      type: 'custom',
      stages: [
        { id: 'review', mode: 'discuss', gate: { type: 'approval', approver_role: 'reviewer' } },
      ],
    },
    team: {
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
      ],
    },
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
  } as unknown as TaskRecord;
}

function createService() {
  const task = makeTask();
  const stage = task.workflow.stages?.[0];
  if (!stage) {
    throw new Error('approval fixture is missing review stage');
  }
  const logs: Array<Record<string, unknown>> = [];
  const mirrors: Array<Record<string, unknown>> = [];
  const resolved: Array<Record<string, unknown>> = [];
  const gateDecisions: Array<Record<string, unknown>> = [];
  const routeGateCommand = vi.fn();
  const recordApproval = vi.fn();
  const recordArchonReview = vi.fn();
  const recordQuorumVote = vi.fn((
    taskId: string,
    stageId: string,
    voterId: string,
    vote: 'approve' | 'reject',
    comment: string,
  ) => {
    void taskId;
    void stageId;
    void voterId;
    void vote;
    void comment;
    return { approved: 2, total: 3 };
  });
  const advanceSatisfiedStage = vi.fn(() => ({ ...task, current_stage: 'done' }));
  const rewindRejectedStage = vi.fn(() => ({ ...task, current_stage: 'draft' }));

  const service = new TaskApprovalService({
    getTaskOrThrow: () => task,
    assertTaskActive: () => {},
    getCurrentStageOrThrow: () => stage,
    assertStageRosterAction: () => {},
    assertApprovalAuthority: () => {},
    routeGateCommand: (currentTask, currentStage, command, callerId) => {
      routeGateCommand(currentTask.id, currentStage.id, command, callerId);
    },
    getApproverRole: () => 'reviewer',
    recordApproval: (taskId, stageId, approverRole, approverId, comment) => {
      recordApproval(taskId, stageId, approverRole, approverId, comment);
    },
    recordArchonReview: (taskId, stageId, decision, reviewerId, note) => {
      recordArchonReview(taskId, stageId, decision, reviewerId, note);
    },
    recordQuorumVote: (taskId, stageId, voterId, vote, comment) => recordQuorumVote(taskId, stageId, voterId, vote, comment),
    insertFlowLog: (input) => {
      logs.push(input);
    },
    mirrorConversationEntry: (taskId, input) => {
      mirrors.push({ taskId, ...input });
    },
    resolvePendingApprovalRequest: (taskId, stageId, status, resolvedBy, resolutionComment) => {
      resolved.push({ taskId, stageId, status, resolvedBy, resolutionComment });
    },
    advanceSatisfiedStage,
    rewindRejectedStage,
    publishGateDecisionBroadcast: (currentTask, input) => {
      gateDecisions.push({ taskId: currentTask.id, ...input });
    },
  });

  return {
    service,
    task,
    stage,
    logs,
    mirrors,
    resolved,
    gateDecisions,
    routeGateCommand,
    recordApproval,
    recordArchonReview,
    recordQuorumVote,
    advanceSatisfiedStage,
    rewindRejectedStage,
  };
}

describe('TaskApprovalService', () => {
  it('records approval decisions and advances the task', () => {
    const fixture = createService();

    const approved = fixture.service.approveTask('OC-APPROVAL-1', {
      approverId: 'reviewer-1',
      approverAccountId: 42,
      comment: 'ship it',
    });

    expect(fixture.routeGateCommand).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'approve', 'reviewer-1');
    expect(fixture.recordApproval).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'reviewer', 'reviewer-1', 'ship it');
    expect(fixture.advanceSatisfiedStage).toHaveBeenCalledWith(fixture.task, 'reviewer-1');
    expect(fixture.logs).toContainEqual(expect.objectContaining({
      event: 'gate_passed',
      task_id: 'OC-APPROVAL-1',
      stage_id: 'review',
    }));
    expect(fixture.resolved).toContainEqual({
      taskId: 'OC-APPROVAL-1',
      stageId: 'review',
      status: 'approved',
      resolvedBy: 'reviewer-1',
      resolutionComment: 'ship it',
    });
    expect(fixture.gateDecisions).toContainEqual(expect.objectContaining({
      taskId: 'OC-APPROVAL-1',
      decision: 'approved',
      reviewer: 'reviewer-1',
      gateType: 'approval',
    }));
    expect(approved.current_stage).toBe('done');
  });

  it('rewinds rejected approval decisions and broadcasts rejection', () => {
    const fixture = createService();

    const rejected = fixture.service.rejectTask('OC-APPROVAL-1', {
      rejectorId: 'reviewer-2',
      rejectorAccountId: 7,
      reason: 'needs more evidence',
    });

    expect(fixture.routeGateCommand).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'reject', 'reviewer-2');
    expect(fixture.rewindRejectedStage).toHaveBeenCalledWith(
      fixture.task,
      'review',
      'rejected',
      'reviewer-2',
      'needs more evidence',
    );
    expect(fixture.logs).toContainEqual(expect.objectContaining({
      event: 'gate_failed',
      task_id: 'OC-APPROVAL-1',
      stage_id: 'review',
    }));
    expect(fixture.gateDecisions).toContainEqual(expect.objectContaining({
      taskId: 'OC-APPROVAL-1',
      decision: 'rejected',
      reviewer: 'reviewer-2',
      gateType: 'approval',
    }));
    expect(rejected.current_stage).toBe('draft');
  });

  it('records archon approval decisions separately from normal approval', () => {
    const fixture = createService();

    const approved = fixture.service.archonApproveTask('OC-APPROVAL-1', {
      reviewerId: 'archon-1',
      comment: 'approved by archon',
    });

    expect(fixture.routeGateCommand).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'archon-approve', 'archon-1');
    expect(fixture.recordArchonReview).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'approved', 'archon-1', 'approved by archon');
    expect(fixture.logs).toContainEqual(expect.objectContaining({
      kind: 'archon',
      event: 'archon_approved',
      task_id: 'OC-APPROVAL-1',
    }));
    expect(fixture.gateDecisions).toContainEqual(expect.objectContaining({
      taskId: 'OC-APPROVAL-1',
      decision: 'approved',
      reviewer: 'archon-1',
      gateType: 'archon_review',
    }));
    expect(approved.current_stage).toBe('done');
  });

  it('returns quorum state for confirm actions', () => {
    const fixture = createService();

    const result = fixture.service.confirmTask('OC-APPROVAL-1', {
      voterId: 'reviewer-3',
      vote: 'approve',
      comment: 'looks good',
    });

    expect(fixture.routeGateCommand).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'confirm', 'reviewer-3');
    expect(fixture.recordQuorumVote).toHaveBeenCalledWith('OC-APPROVAL-1', 'review', 'reviewer-3', 'approve', 'looks good');
    expect(result.quorum).toEqual({ approved: 2, total: 3 });
    expect(fixture.logs).toContainEqual(expect.objectContaining({
      event: 'quorum_vote',
      task_id: 'OC-APPROVAL-1',
      stage_id: 'review',
    }));
  });
});
