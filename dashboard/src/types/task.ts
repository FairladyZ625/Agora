/* ═══════════════════════════════════════════
   Dashboard View Models
   Derived from backend DTOs for stable UI rendering
   ═══════════════════════════════════════════ */

export type TaskState =
  | 'pending'
  | 'in_progress'
  | 'gate_waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'blocked';

export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: TaskPriority | string;
  creator: string;
  locale?: 'zh-CN' | 'en-US';
  state: TaskState;
  archiveStatus: string | null;
  controllerRef?: string | null;
  current_stage: string | null;
  teamLabel: string;
  workflowLabel: string;
  memberCount: number;
  isReviewStage: boolean;
  sourceState: string;
  stageName?: string | null;
  gateType?: string | null;
  teamMembers?: Array<{
    role: string;
    agentId: string;
    model_preference: string;
  }>;
  scheduler: unknown;
  scheduler_snapshot: unknown;
  discord: unknown;
  metrics: unknown;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowLogEntry {
  id: number;
  task_id: string;
  kind: string;
  event: string;
  stage_id: string | null;
  from_state: string | null;
  to_state: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export interface ProgressLogEntry {
  id: number;
  task_id: string;
  kind: string;
  stage_id: string | null;
  subtask_id: string | null;
  content: string;
  artifacts: string | null;
  actor: string;
  created_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  stage_id: string;
  title: string;
  assignee: string;
  status: string;
  output: string | null;
  craftsman_type: string | null;
  dispatch_status: string | null;
  dispatched_at: string | null;
  done_at: string | null;
}

export interface CraftsmanInputRequest {
  transport: 'text' | 'keys' | 'choice';
  hint: string | null;
  textPlaceholder: string | null;
  keys: string[];
  choiceOptions: Array<{
    id: string;
    label: string;
    description: string | null;
    keys: string[];
    submit: boolean;
  }>;
}

export interface CraftsmanExecution {
  executionId: string;
  taskId: string;
  subtaskId: string;
  adapter: string;
  mode: string;
  sessionId: string | null;
  status: string;
  briefPath: string | null;
  workdir: string | null;
  callbackPayload: {
    output?: {
      summary?: string | null;
      text?: string | null;
      stderr?: string | null;
      artifacts?: string[];
      structured?: Record<string, unknown> | null;
    };
    inputRequest?: CraftsmanInputRequest | null;
  } | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CraftsmanExecutionTail {
  available: boolean;
  output: string | null;
  source: 'tmux' | 'acpx' | 'unavailable';
  fetchedAt: string;
}

export interface CraftsmanGovernanceSnapshot {
  limits: {
    maxConcurrentRunning: number | null;
    maxConcurrentPerAgent: number | null;
    hostMemoryWarningUtilizationLimit: number | null;
    hostMemoryUtilizationLimit: number | null;
    hostSwapWarningUtilizationLimit: number | null;
    hostSwapUtilizationLimit: number | null;
    hostLoadPerCpuWarningLimit: number | null;
    hostLoadPerCpuLimit: number | null;
  };
  activeExecutions: number;
  activeByAssignee: Array<{
    assignee: string;
    count: number;
  }>;
  activeExecutionDetails: Array<{
    executionId: string;
    taskId: string;
    subtaskId: string;
    assignee: string;
    adapter: string;
    status: string;
    sessionId: string | null;
    workdir: string | null;
  }>;
  hostPressureStatus: 'healthy' | 'warning' | 'hard_limit' | 'unavailable';
  warnings: string[];
  host: {
    observedAt: string;
    platform?: string | null;
    cpuCount: number | null;
    load1m: number | null;
    memoryTotalBytes: number | null;
    memoryUsedBytes: number | null;
    memoryUtilization: number | null;
    memoryPressure?: number | null;
    swapTotalBytes: number | null;
    swapUsedBytes: number | null;
    swapUtilization: number | null;
  } | null;
}

export interface UnifiedHealthSnapshot {
  generatedAt: string;
  tasks: {
    status: 'healthy' | 'degraded' | 'unavailable';
    totalTasks: number;
    activeTasks: number;
    pausedTasks: number;
    blockedTasks: number;
    doneTasks: number;
  };
  im: {
    status: 'healthy' | 'degraded' | 'unavailable';
    activeBindings: number;
    activeThreads: number;
    bindingsByProvider: Array<{ label: string; count: number }>;
  };
  runtime: {
    status: 'healthy' | 'degraded' | 'unavailable';
    available: boolean;
    staleAfterMs: number | null;
    activeSessions: number;
    idleSessions: number;
    closedSessions: number;
    agents: Array<{
      agentId: string;
      status: string;
      sessionCount: number;
      lastEventAt: string | null;
    }>;
  };
  craftsman: {
    status: 'healthy' | 'degraded' | 'unavailable';
    activeExecutions: number;
    queuedExecutions: number;
    runningExecutions: number;
    waitingInputExecutions: number;
    awaitingChoiceExecutions: number;
    activeByAssignee: Array<{ label: string; count: number }>;
  };
  host: {
    status: 'healthy' | 'degraded' | 'unavailable';
    snapshot: CraftsmanGovernanceSnapshot['host'];
  };
  escalation: {
    status: 'healthy' | 'degraded' | 'unavailable';
    policy: {
      controllerAfterMs: number;
      rosterAfterMs: number;
      inboxAfterMs: number;
    };
    controllerPingedTasks: number;
    rosterPingedTasks: number;
    inboxEscalatedTasks: number;
    unhealthyRuntimeAgents: number;
    runtimeUnhealthy: boolean;
  };
}

export interface RuntimeDiagnosisResult {
  operation: 'request_runtime_diagnosis';
  taskId: string;
  agentRef: string;
  status: 'accepted' | 'unsupported' | 'unavailable';
  health: 'healthy' | 'degraded' | 'unavailable';
  runtimeProvider: string | null;
  runtimeActorRef: string | null;
  summary: string;
  detail: string | null;
}

export interface RuntimeRecoveryAction {
  operation: 'restart_citizen_runtime' | 'stop_execution';
  status: 'accepted' | 'unsupported' | 'unavailable';
  taskId: string | null;
  agentRef: string | null;
  executionId: string | null;
  summary: string;
  detail: string | null;
}

export interface TaskConversationEntry {
  id: string;
  task_id: string;
  binding_id: string;
  provider: string;
  provider_message_ref: string | null;
  parent_message_ref: string | null;
  direction: 'inbound' | 'outbound' | 'system';
  author_kind: 'human' | 'agent' | 'craftsman' | 'system';
  author_ref: string | null;
  display_name: string | null;
  body: string;
  body_format: 'plain_text' | 'markdown' | 'structured';
  occurred_at: string;
  ingested_at: string;
  metadata: Record<string, unknown> | null;
  statusEvent?: TaskConversationStatusEvent | null;
}

export interface TaskConversationStatusEvent {
  eventType: string;
  taskId: string;
  taskState: string;
  currentStage: string | null;
  executionKind: string | null;
  allowedActions: string[];
  controllerRef: string | null;
  workspacePath: string | null;
  participantRefs: string[] | null;
}

export interface TaskConversationSummary {
  task_id: string;
  total_entries: number;
  latest_entry_id: string | null;
  latest_provider: string | null;
  latest_direction: 'inbound' | 'outbound' | 'system' | null;
  latest_author_kind: 'human' | 'agent' | 'craftsman' | 'system' | null;
  latest_display_name: string | null;
  latest_occurred_at: string | null;
  latest_body_excerpt: string | null;
  last_read_at: string | null;
  unread_count: number;
  has_unread: boolean;
}

export interface TaskBlueprintNode {
  id: string;
  name: string | null;
  mode: string | null;
  gateType: string | null;
}

export interface TaskBlueprintEdge {
  from: string;
  to: string;
  kind: string;
}

export interface TaskBlueprintArtifactContract {
  nodeId: string;
  artifactType: string;
}

export interface TaskBlueprint {
  graphVersion: number;
  entryNodes: string[];
  controllerRef?: string | null;
  nodes: TaskBlueprintNode[];
  edges: TaskBlueprintEdge[];
  artifactContracts: TaskBlueprintArtifactContract[];
  roleBindings: Array<{
    role: string;
    agentId: string;
    model_preference: string;
  }>;
}

export interface TaskStatus {
  task: Task;
  flow_log: FlowLogEntry[];
  progress_log: ProgressLogEntry[];
  subtasks: Subtask[];
  subtaskExecutions?: Record<string, CraftsmanExecution[]>;
  governanceSnapshot?: CraftsmanGovernanceSnapshot | null;
  taskBlueprint?: TaskBlueprint;
  conversationSummary?: TaskConversationSummary;
  conversation?: TaskConversationEntry[];
}

export interface HealthStatus {
  status: string;
}

export interface CreateTaskInput {
  title: string;
  type: string;
  creator: string;
  description: string;
  priority: TaskPriority | string;
  locale?: 'zh-CN' | 'en-US';
  team_override?: {
    members: Array<{
      role: string;
      agentId: string;
      member_kind?: 'controller' | 'citizen' | 'craftsman';
      model_preference?: string;
    }>;
  };
  workflow_override?: {
    type?: string;
    stages: Array<{
      id: string;
      name?: string;
      mode?: string;
      reject_target?: string;
      gate?: {
        type?: string;
        approver?: string;
        required?: number;
        timeout_sec?: number;
      } | null;
    }>;
  };
  im_target?: {
    provider: string;
    channel_ref?: string;
    thread_name?: string;
    visibility?: 'public' | 'private';
    participant_refs?: string[];
  };
}

export type TaskAction =
  | 'advance'
  | 'approve'
  | 'reject'
  | 'confirm'
  | 'subtask_done'
  | 'force_advance'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'unblock';

export interface TaskActionPayload {
  taskId: string;
  actorId?: string;
  note?: string;
  vote?: 'approve' | 'reject';
  subtaskId?: string;
}
