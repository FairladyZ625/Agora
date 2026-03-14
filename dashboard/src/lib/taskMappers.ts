import type {
  ApiCraftsmanExecutionDto,
  ApiCraftsmanGovernanceSnapshotDto,
  ApiFlowLogDto,
  ApiProgressLogDto,
  ApiSubtaskDto,
  ApiTaskDto,
  ApiTeamMemberDto,
  ApiTaskConversationEntryDto,
  ApiTaskConversationSummaryDto,
  ApiTaskStatusDto,
  ApiWorkflowStageDto,
} from '@/types/api';
import type {
  Task,
  CraftsmanExecution,
  CraftsmanGovernanceSnapshot,
  TaskBlueprint,
  TaskConversationEntry,
  TaskConversationStatusEvent,
  TaskConversationSummary,
  TaskState,
  TaskStatus,
} from '@/types/task';
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
  return !HIDDEN_TASK_STATES.has(task.state) && (task.archive_status == null || task.archive_status === 'pending');
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
    locale: task.locale,
    state: mapTaskState(task),
    archiveStatus: task.archive_status,
    controllerRef: task.controller_ref ?? null,
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

export function mapCraftsmanExecutionDto(entry: ApiCraftsmanExecutionDto): CraftsmanExecution {
  return {
    executionId: entry.execution_id,
    taskId: entry.task_id,
    subtaskId: entry.subtask_id,
    adapter: entry.adapter,
    mode: entry.mode,
    sessionId: entry.session_id,
    status: entry.status,
    briefPath: entry.brief_path,
    workdir: entry.workdir,
    callbackPayload: entry.callback_payload
      ? {
          ...(entry.callback_payload.output
            ? {
                output: {
                  summary: entry.callback_payload.output.summary ?? null,
                  text: entry.callback_payload.output.text ?? null,
                  stderr: entry.callback_payload.output.stderr ?? null,
                  artifacts: entry.callback_payload.output.artifacts ?? [],
                  structured: entry.callback_payload.output.structured ?? null,
                },
              }
            : {}),
          ...(entry.callback_payload.input_request
            ? {
                inputRequest: {
                  transport: entry.callback_payload.input_request.transport,
                  hint: entry.callback_payload.input_request.hint ?? null,
                  textPlaceholder: entry.callback_payload.input_request.text_placeholder ?? null,
                  keys: entry.callback_payload.input_request.keys ?? [],
                  choiceOptions: (entry.callback_payload.input_request.choice_options ?? []).map((option) => ({
                    id: option.id,
                    label: option.label,
                    description: option.description ?? null,
                    keys: option.keys ?? [],
                    submit: option.submit,
                  })),
                },
              }
            : {}),
        }
      : null,
    error: entry.error,
    startedAt: entry.started_at,
    finishedAt: entry.finished_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

export function mapCraftsmanGovernanceSnapshotDto(
  snapshot: ApiCraftsmanGovernanceSnapshotDto,
): CraftsmanGovernanceSnapshot {
  return {
    limits: {
      maxConcurrentRunning: snapshot.limits.max_concurrent_running,
      maxConcurrentPerAgent: snapshot.limits.max_concurrent_per_agent,
      hostMemoryUtilizationLimit: snapshot.limits.host_memory_utilization_limit,
      hostSwapUtilizationLimit: snapshot.limits.host_swap_utilization_limit,
      hostLoadPerCpuLimit: snapshot.limits.host_load_per_cpu_limit,
    },
    activeExecutions: snapshot.active_executions,
    activeByAssignee: snapshot.active_by_assignee.map((item) => ({ ...item })),
    host: snapshot.host
      ? {
          observedAt: snapshot.host.observed_at,
          platform: snapshot.host.platform ?? null,
          cpuCount: snapshot.host.cpu_count,
          load1m: snapshot.host.load_1m,
          memoryTotalBytes: snapshot.host.memory_total_bytes,
          memoryUsedBytes: snapshot.host.memory_used_bytes,
          memoryUtilization: snapshot.host.memory_utilization,
          memoryPressure: snapshot.host.memory_pressure ?? null,
          swapTotalBytes: snapshot.host.swap_total_bytes,
          swapUsedBytes: snapshot.host.swap_used_bytes,
          swapUtilization: snapshot.host.swap_utilization,
        }
      : null,
  };
}

function mapRoleBinding(member: ApiTeamMemberDto) {
  return { ...member };
}

function mapTaskBlueprint(status: ApiTaskStatusDto): TaskBlueprint | undefined {
  if (!status.task_blueprint) {
    return undefined;
  }

  return {
    graphVersion: status.task_blueprint.graph_version,
    entryNodes: [...status.task_blueprint.entry_nodes],
    controllerRef: status.task_blueprint.controller_ref ?? null,
    nodes: status.task_blueprint.nodes.map((node) => ({
      id: node.id,
      name: node.name ?? null,
      mode: node.mode ?? null,
      gateType: node.gate_type ?? null,
    })),
    edges: status.task_blueprint.edges.map((edge) => ({ ...edge })),
    artifactContracts: status.task_blueprint.artifact_contracts.map((artifact) => ({
      nodeId: artifact.node_id,
      artifactType: artifact.artifact_type,
    })),
    roleBindings: status.task_blueprint.role_bindings.map(mapRoleBinding),
  };
}

export function mapTaskConversationEntryDto(entry: ApiTaskConversationEntryDto): TaskConversationEntry {
  return {
    ...entry,
    statusEvent: mapTaskConversationStatusEvent(entry.metadata),
  };
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
    taskBlueprint: mapTaskBlueprint(status),
  };
}

function mapTaskConversationStatusEvent(metadata: Record<string, unknown> | null): TaskConversationStatusEvent | null {
  if (!metadata || typeof metadata.event_type !== 'string' || typeof metadata.task_id !== 'string' || typeof metadata.task_state !== 'string') {
    return null;
  }
  return {
    eventType: metadata.event_type,
    taskId: metadata.task_id,
    taskState: metadata.task_state,
    currentStage: typeof metadata.current_stage === 'string' ? metadata.current_stage : null,
    executionKind: typeof metadata.execution_kind === 'string' ? metadata.execution_kind : null,
    allowedActions: Array.isArray(metadata.allowed_actions)
      ? metadata.allowed_actions.filter((value): value is string => typeof value === 'string')
      : [],
    controllerRef: typeof metadata.controller_ref === 'string' ? metadata.controller_ref : null,
    workspacePath: typeof metadata.workspace_path === 'string' ? metadata.workspace_path : null,
    participantRefs: Array.isArray(metadata.participant_refs)
      ? metadata.participant_refs.filter((value): value is string => typeof value === 'string')
      : null,
  };
}
