import type { IFlowLogRepository, IProgressLogRepository } from '@agora-ts/contracts';

type ActivityStreamItem = {
  layer: 'flow' | 'progress';
  created_at: string;
  event?: string | undefined;
  kind: string;
};

export interface ProgressServiceOptions {
  flowLogRepository: IFlowLogRepository;
  progressLogRepository: IProgressLogRepository;
}

export class ProgressService {
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly progressLogRepository: IProgressLogRepository;

  constructor(options: ProgressServiceOptions) {
    this.flowLogRepository = options.flowLogRepository;
    this.progressLogRepository = options.progressLogRepository;
  }

  recordStateChange(taskId: string, fromState: string, toState: string, actor = 'system', detail?: unknown) {
    return this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      event: 'state_change',
      kind: 'flow',
      from_state: fromState,
      to_state: toState,
      actor,
      detail,
    });
  }

  recordStageAdvance(taskId: string, fromStage: string, toStage: string, actor = 'system') {
    return this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      event: 'stage_advance',
      kind: 'flow',
      stage_id: toStage,
      from_state: fromStage,
      to_state: toStage,
      actor,
      detail: { from_stage: fromStage, to_stage: toStage },
    });
  }

  recordGateResult(taskId: string, stageId: string, gateType: string, passed: boolean, actor = 'system') {
    return this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      event: passed ? 'gate_passed' : 'gate_failed',
      kind: 'flow',
      stage_id: stageId,
      actor,
      detail: { gate_type: gateType, passed },
    });
  }

  recordArchonDecision(taskId: string, stageId: string, decision: 'approved' | 'rejected', actor = 'archon', comment = '') {
    return this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      event: `archon_${decision}`,
      kind: 'archon',
      stage_id: stageId,
      actor,
      detail: { decision, comment },
    });
  }

  recordAgentReport(
    taskId: string,
    stageId: string,
    actor: string,
    content: string,
    subtaskId?: string,
    artifacts?: unknown,
  ) {
    return this.progressLogRepository.insertProgressLog({
      task_id: taskId,
      kind: 'progress',
      stage_id: stageId,
      ...(subtaskId !== undefined ? { subtask_id: subtaskId } : {}),
      content,
      ...(artifacts !== undefined ? { artifacts } : {}),
      actor,
    });
  }

  recordTodosSnapshot(taskId: string, stageId: string, actor: string, content: string) {
    return this.progressLogRepository.insertProgressLog({
      task_id: taskId,
      kind: 'todos',
      stage_id: stageId,
      content,
      actor,
    });
  }

  recordSubtaskEvent(
    taskId: string,
    stageId: string,
    subtaskId: string,
    eventType: string,
    actor = 'system',
    detail?: Record<string, unknown>,
  ) {
    return this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      event: `subtask_${eventType}`,
      kind: 'system',
      stage_id: stageId,
      actor,
      detail: { subtask_id: subtaskId, ...(detail ?? {}) },
    });
  }

  getActivityStream(taskId: string): ActivityStreamItem[] {
    const flow = this.flowLogRepository.listByTask(taskId).map((item) => ({
      ...item,
      layer: 'flow' as const,
    }));
    const progress = this.progressLogRepository.listByTask(taskId).map((item) => ({
      ...item,
      layer: 'progress' as const,
    }));
    return [...flow, ...progress].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}
