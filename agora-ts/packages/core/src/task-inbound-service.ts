import type {
  IngestTaskConversationEntryRequestDto,
  TaskConversationEntryDto,
  TaskConversationInboundActionDto,
} from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskConversationService } from './task-conversation-service.js';
import type { TaskService } from './task-service.js';

export interface TaskInboundActionResult {
  kind: TaskConversationInboundActionDto['kind'];
  task_id: string;
  current_stage: string | null;
  state: string;
  quorum?: {
    approved: number;
    total: number;
  };
}

export interface TaskInboundIngestResult {
  entry: TaskConversationEntryDto | null;
  task_action_result: TaskInboundActionResult | null;
}

export class TaskInboundService {
  constructor(
    private readonly taskConversationService: TaskConversationService,
    private readonly taskContextBindingService: TaskContextBindingService,
    private readonly taskService: TaskService,
  ) {}

  ingest(input: IngestTaskConversationEntryRequestDto): TaskInboundIngestResult {
    const { task_action, ...conversationInput } = input;
    const entry = this.taskConversationService.ingest(conversationInput);
    if (!entry) {
      return { entry: null, task_action_result: null };
    }
    if (!task_action) {
      return { entry, task_action_result: null };
    }
    return {
      entry,
      task_action_result: this.applyTaskAction(entry.task_id, conversationInput, task_action),
    };
  }

  private applyTaskAction(
    taskId: string,
    input: Pick<IngestTaskConversationEntryRequestDto, 'provider' | 'thread_ref' | 'conversation_ref'>,
    action: TaskConversationInboundActionDto,
  ): TaskInboundActionResult {
    const binding = this.taskContextBindingService.findLatestBindingByRefs({
      provider: input.provider,
      thread_ref: input.thread_ref ?? null,
      conversation_ref: input.conversation_ref ?? null,
    });
    if (!binding || binding.task_id !== taskId) {
      throw new NotFoundError('task context binding not found for inbound action');
    }

    switch (action.kind) {
      case 'approve_current': {
        const task = this.taskService.getTask(taskId);
        const stage = task?.current_stage
          ? (task.workflow.stages ?? []).find((item) => item.id === task.current_stage)
          : null;
        if (stage?.gate?.type === 'archon_review') {
          const next = this.taskService.archonApproveTask(taskId, {
            reviewerId: action.actor_ref,
            comment: action.comment ?? '',
          });
          return {
            kind: action.kind,
            task_id: next.id,
            current_stage: next.current_stage,
            state: next.state,
          };
        }
        const next = this.taskService.approveTask(taskId, {
          approverId: action.actor_ref,
          comment: action.comment ?? '',
        });
        return {
          kind: action.kind,
          task_id: next.id,
          current_stage: next.current_stage,
          state: next.state,
        };
      }
      case 'reject_current': {
        const task = this.taskService.getTask(taskId);
        const stage = task?.current_stage
          ? (task.workflow.stages ?? []).find((item) => item.id === task.current_stage)
          : null;
        if (stage?.gate?.type === 'archon_review') {
          const next = this.taskService.archonRejectTask(taskId, {
            reviewerId: action.actor_ref,
            reason: action.reason ?? '',
          });
          return {
            kind: action.kind,
            task_id: next.id,
            current_stage: next.current_stage,
            state: next.state,
          };
        }
        const next = this.taskService.rejectTask(taskId, {
          rejectorId: action.actor_ref,
          reason: action.reason ?? '',
        });
        return {
          kind: action.kind,
          task_id: next.id,
          current_stage: next.current_stage,
          state: next.state,
        };
      }
      case 'advance_current': {
        const next = this.taskService.advanceTask(taskId, {
          callerId: action.actor_ref,
          ...(action.next_stage_id ? { nextStageId: action.next_stage_id } : {}),
        });
        return {
          kind: action.kind,
          task_id: next.id,
          current_stage: next.current_stage,
          state: next.state,
        };
      }
      case 'confirm_current': {
        const next = this.taskService.confirmTask(taskId, {
          voterId: action.actor_ref,
          vote: action.vote ?? 'approve',
          comment: action.comment ?? '',
        });
        return {
          kind: action.kind,
          task_id: next.id,
          current_stage: next.current_stage,
          state: next.state,
          quorum: next.quorum,
        };
      }
    }
  }
}
