import type { GateCommandPort, TeamDto, TaskRecord } from '@agora-ts/contracts';
import { PermissionDeniedError } from './errors.js';
import type { PermissionService } from './permission-service.js';

type WorkflowStage = NonNullable<TaskRecord['workflow']['stages']>[number];

export class GateService {
  constructor(
    private readonly gateCommand: GateCommandPort,
    private readonly permissions: PermissionService,
  ) {}

  routeGateCommand(task: TaskRecord, stage: WorkflowStage, command: string, callerId: string) {
    const gateType = stage.gate?.type ?? 'command';

    if (command === 'approve' || command === 'reject') {
      if (gateType !== 'approval') {
        throw new PermissionDeniedError(`当前 Gate 类型为 ${gateType}，不是 approval。`);
      }
      const approverRole = this.getApproverRole(stage);
      this.verifyRole(task.team, callerId, approverRole);
      return;
    }

    if (command === 'archon-approve' || command === 'archon-reject') {
      if (gateType !== 'archon_review') {
        throw new PermissionDeniedError(`当前 Gate 类型为 ${gateType}，不是 archon_review。`);
      }
      if (!this.permissions.isArchon(callerId)) {
        throw new PermissionDeniedError('此命令仅限 Archon 使用');
      }
      return;
    }

    if (command === 'advance') {
      if (!this.permissions.canAdvance(callerId, task.team)) {
        throw new PermissionDeniedError(`caller ${callerId} has canAdvance=false for /task advance`);
      }
      return;
    }

    if (command === 'confirm') {
      if (gateType !== 'quorum') {
        throw new PermissionDeniedError(`当前 Gate 类型为 ${gateType}，不是 quorum。`);
      }
      if (!this.permissions.isMember(callerId, task.team) && !this.permissions.isArchon(callerId)) {
        throw new PermissionDeniedError(`${callerId} 不是任务 ${task.id} 的团队成员`);
      }
    }
  }

  recordArchonReview(taskId: string, stageId: string, decision: 'approved' | 'rejected', reviewerId: string, comment: string) {
    this.gateCommand.recordArchonReview(taskId, stageId, decision, reviewerId, comment);
  }

  recordApproval(taskId: string, stageId: string, approverRole: string, approverId: string, comment: string) {
    this.gateCommand.recordApproval(taskId, stageId, approverRole, approverId, comment);
  }

  recordQuorumVote(taskId: string, stageId: string, voterId: string, vote: string, comment: string) {
    return this.gateCommand.recordQuorumVote(taskId, stageId, voterId, vote, comment);
  }

  private verifyRole(team: TeamDto, callerId: string, role: string) {
    if (!this.permissions.hasRole(callerId, team, role)) {
      throw new PermissionDeniedError(`${callerId} 不持有角色 ${role}`);
    }
  }

  private getApproverRole(stage: WorkflowStage) {
    const raw = stage.gate?.approver_role ?? stage.gate?.approver;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'reviewer';
  }
}
