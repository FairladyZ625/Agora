import { FlowLogRepository, ProgressLogRepository, type AgoraDatabase } from '@agora-ts/db';

type ActivityStreamItem = {
  layer: 'flow' | 'progress';
  created_at: string;
  event?: string | undefined;
  kind: string;
};

export class ProgressService {
  private readonly flowLogRepository: FlowLogRepository;
  private readonly progressLogRepository: ProgressLogRepository;

  constructor(db: AgoraDatabase) {
    this.flowLogRepository = new FlowLogRepository(db);
    this.progressLogRepository = new ProgressLogRepository(db);
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
