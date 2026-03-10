import type {
  ApiFlowLogDto,
  ApiProgressLogDto,
  ApiSubtaskDto,
  ApiTaskDto,
  ApiTaskConversationEntryDto,
  ApiTaskConversationSummaryDto,
  ApiTaskStatusDto,
  ApiWorkflowStageDto,
} from '@/types/api';
import type { Task, TaskConversationEntry, TaskConversationSummary, TaskState, TaskStatus } from '@/types/task';
import { translate } from '@/lib/i18n';

const REVIEW_GATE_TYPES = new Set(['approval', 'archon_review']);
const HIDDEN_TASK_STATES = new Set(['draft', 'created', 'orphaned']);

function getCurrentStage(task: ApiTaskDto): ApiWorkflowStageDto | null {
  const stageId = task.current_stage;
  if (!stageId) return null;
  const stages = task.workflow?.stages ?? [];
  return stages.find((stage) => stage.id === stageId) ?? null;
}

function isReviewStage(task: ApiTaskDto): boolean {
  const gateType = getCurrentStage(task)?.gate?.type;
  return typeof gateType === 'string' ? REVIEW_GATE_TYPES.has(gateType) : false;
}

function mapTaskState(task: ApiTaskDto): TaskState {
  switch (task.state) {
    case 'done':
      return 'completed';
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'cancelled';
    case 'blocked':
      return 'blocked';
    case 'draft':
    case 'created':
    case 'orphaned':
      return 'pending';
    case 'active':
    default:
      return isReviewStage(task) ? 'gate_waiting' : 'in_progress';
  }
}

function formatTeamLabel(task: ApiTaskDto): string {
  const members = task.team?.members ?? [];
  if (members.length === 0) return translate('taskMeta.unassignedTeam');
  if (members.length <= 3) {
    return members.map((member) => member.agentId).join(' / ');
  }

  const [first, second] = members;
  return `${first.agentId} / ${second.agentId} / +${members.length - 2}`;
}

export function isTaskVisibleInWorkbench(task: ApiTaskDto): boolean {
  return !HIDDEN_TASK_STATES.has(task.state);
}

export function mapTaskDto(task: ApiTaskDto): Task {
  const currentStage = getCurrentStage(task);
  return {
    id: task.id,
    version: task.version,
    title: task.title,
    description: task.description,
    type: task.type,
    priority: task.priority,
    creator: task.creator,
    state: mapTaskState(task),
    current_stage: task.current_stage,
    teamLabel: formatTeamLabel(task),
    workflowLabel: task.workflow?.type ?? 'custom',
    memberCount: task.team?.members?.length ?? 0,
    isReviewStage: isReviewStage(task),
    sourceState: task.state,
    stageName: currentStage?.name ?? task.current_stage,
    gateType: currentStage?.gate?.type ?? null,
    teamMembers: task.team?.members ?? [],
    scheduler: task.scheduler,
    scheduler_snapshot: task.scheduler_snapshot,
    discord: task.discord,
    metrics: task.metrics,
    error_detail: task.error_detail,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

function mapFlowLogEntry(entry: ApiFlowLogDto) {
  return { ...entry };
}

function mapProgressLogEntry(entry: ApiProgressLogDto) {
  return { ...entry };
}

function mapSubtask(entry: ApiSubtaskDto) {
  return { ...entry };
}

export function mapTaskConversationEntryDto(entry: ApiTaskConversationEntryDto): TaskConversationEntry {
  return { ...entry };
}

export function mapTaskConversationSummaryDto(summary: ApiTaskConversationSummaryDto): TaskConversationSummary {
  return { ...summary };
}

export function mapTaskStatusDto(status: ApiTaskStatusDto): TaskStatus {
  return {
    task: mapTaskDto(status.task),
    flow_log: status.flow_log.map(mapFlowLogEntry),
    progress_log: status.progress_log.map(mapProgressLogEntry),
    subtasks: status.subtasks.map(mapSubtask),
  };
}
