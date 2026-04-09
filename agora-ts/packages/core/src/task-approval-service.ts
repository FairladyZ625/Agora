import type { TaskRecord, WorkflowDto } from '@agora-ts/contracts';

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type GateType = 'approval' | 'archon_review';

type MirrorConversationInput = {
  actor: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export interface TaskApprovalServiceOptions {
  getTaskOrThrow: (taskId: string) => TaskRecord;
  assertTaskActive: (task: TaskRecord) => void;
  getCurrentStageOrThrow: (task: TaskRecord) => WorkflowStageLike;
  assertStageRosterAction: (
    task: TaskRecord,
    stage: WorkflowStageLike,
    callerId: string,
    action: 'approve' | 'reject' | 'confirm' | 'archon-approve' | 'archon-reject',
  ) => void;
  assertApprovalAuthority: (task: TaskRecord, actorAccountId: number | null) => void;
  routeGateCommand: (
    task: TaskRecord,
    stage: WorkflowStageLike,
    command: 'approve' | 'reject' | 'confirm' | 'archon-approve' | 'archon-reject',
    callerId: string,
  ) => void;
  getApproverRole: (stage: WorkflowStageLike) => string;
  recordApproval: (
    taskId: string,
    stageId: string,
    approverRole: string,
    approverId: string,
    comment: string,
  ) => void;
  recordArchonReview: (
    taskId: string,
    stageId: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
    note: string,
  ) => void;
  recordQuorumVote: (
    taskId: string,
    stageId: string,
    voterId: string,
    vote: 'approve' | 'reject',
    comment: string,
  ) => { approved: number; total: number };
  insertFlowLog: (input: {
    task_id: string;
    kind: string;
    event: string;
    stage_id?: string | null;
    detail?: Record<string, unknown>;
    actor: string;
  }) => void;
  mirrorConversationEntry: (taskId: string, input: MirrorConversationInput) => void;
  resolvePendingApprovalRequest: (
    taskId: string,
    stageId: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    resolutionComment: string,
  ) => void;
  advanceSatisfiedStage: (task: TaskRecord, actor: string) => TaskRecord;
  rewindRejectedStage: (
    task: TaskRecord,
    currentStageId: string,
    decisionEvent: 'rejected' | 'archon_rejected',
    actor: string,
    reason: string,
  ) => TaskRecord;
  publishGateDecisionBroadcast: (
    task: TaskRecord,
    input: {
      decision: 'approved' | 'rejected';
      reviewer: string;
      gateType: GateType;
      comment?: string;
      reason?: string;
    },
  ) => void;
}

export class TaskApprovalService {
  private readonly options: TaskApprovalServiceOptions;

  constructor(options: TaskApprovalServiceOptions) {
    this.options = options;
  }

  approveTask(
    taskId: string,
    options: {
      approverId: string;
      approverAccountId?: number | null;
      comment: string;
    },
  ): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    this.options.assertTaskActive(task);
    const stage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, stage, options.approverId, 'approve');
    this.options.assertApprovalAuthority(task, options.approverAccountId ?? null);
    this.options.routeGateCommand(task, stage, 'approve', options.approverId);
    const approverRole = this.options.getApproverRole(stage);
    this.options.recordApproval(taskId, stage.id, approverRole, options.approverId, options.comment);
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: true, comment: options.comment },
      actor: options.approverId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.approverId,
      body: options.comment ? `Approval passed: ${options.comment}` : 'Approval passed',
      metadata: {
        event: 'gate_passed',
        gate_type: 'approval',
      },
    });
    this.options.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.approverId, options.comment);
    const advanced = this.options.advanceSatisfiedStage(task, options.approverId);
    this.options.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.approverId,
      comment: options.comment,
      gateType: 'approval',
    });
    return advanced;
  }

  rejectTask(
    taskId: string,
    options: {
      rejectorId: string;
      rejectorAccountId?: number | null;
      reason: string;
    },
  ): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    this.options.assertTaskActive(task);
    const stage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, stage, options.rejectorId, 'reject');
    this.options.assertApprovalAuthority(task, options.rejectorAccountId ?? null);
    this.options.routeGateCommand(task, stage, 'reject', options.rejectorId);
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: false, reason: options.reason },
      actor: options.rejectorId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.rejectorId,
      body: `Approval rejected: ${options.reason}`,
      metadata: {
        event: 'gate_failed',
        gate_type: 'approval',
      },
    });
    this.options.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.rejectorId, options.reason);
    const rewound = this.options.rewindRejectedStage(task, stage.id, 'rejected', options.rejectorId, options.reason);
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'rejected',
      stage_id: stage.id,
      detail: {
        reason: options.reason,
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.rejectorId,
    });
    this.options.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.rejectorId,
      reason: options.reason,
      gateType: 'approval',
    });
    return rewound;
  }

  archonApproveTask(
    taskId: string,
    options: {
      reviewerId: string;
      comment?: string;
    },
  ): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    this.options.assertTaskActive(task);
    const stage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, stage, options.reviewerId, 'archon-approve');
    this.options.routeGateCommand(task, stage, 'archon-approve', options.reviewerId);
    this.options.recordArchonReview(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: true, comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_approved',
      stage_id: stage.id,
      detail: { decision: 'approved', comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.comment ? `Archon approved: ${options.comment}` : 'Archon approved',
      metadata: {
        event: 'archon_approved',
      },
    });
    this.options.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    const advanced = this.options.advanceSatisfiedStage(task, options.reviewerId);
    this.options.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.reviewerId,
      comment: options.comment ?? '',
      gateType: 'archon_review',
    });
    return advanced;
  }

  archonRejectTask(
    taskId: string,
    options: {
      reviewerId: string;
      reason?: string;
    },
  ): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    this.options.assertTaskActive(task);
    const stage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, stage, options.reviewerId, 'archon-reject');
    this.options.routeGateCommand(task, stage, 'archon-reject', options.reviewerId);
    this.options.recordArchonReview(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: false, reason: options.reason ?? '' },
      actor: options.reviewerId,
    });
    const rewound = this.options.rewindRejectedStage(task, stage.id, 'archon_rejected', options.reviewerId, options.reason ?? '');
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_rejected',
      stage_id: stage.id,
      detail: {
        decision: 'rejected',
        reason: options.reason ?? '',
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.reviewerId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.reason ? `Archon rejected: ${options.reason}` : 'Archon rejected',
      metadata: {
        event: 'archon_rejected',
      },
    });
    this.options.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.options.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.reviewerId,
      reason: options.reason ?? '',
      gateType: 'archon_review',
    });
    return rewound;
  }

  confirmTask(
    taskId: string,
    options: {
      voterId: string;
      vote: 'approve' | 'reject';
      comment: string;
    },
  ): TaskRecord & { quorum: { approved: number; total: number } } {
    const task = this.options.getTaskOrThrow(taskId);
    this.options.assertTaskActive(task);
    const stage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, stage, options.voterId, 'confirm');
    this.options.routeGateCommand(task, stage, 'confirm', options.voterId);
    const quorum = this.options.recordQuorumVote(taskId, stage.id, options.voterId, options.vote, options.comment);
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'quorum_vote',
      stage_id: stage.id,
      detail: {
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
      actor: options.voterId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.voterId,
      body: `Quorum vote ${options.vote} (${quorum.approved}/${quorum.total})`,
      metadata: {
        event: 'quorum_vote',
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
    });
    return {
      ...task,
      quorum,
    };
  }
}
