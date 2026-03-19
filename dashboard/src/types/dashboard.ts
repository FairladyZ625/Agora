export interface AgentStatusSummary {
  activeTasks: number;
  activeAgents: number;
  totalAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  busyCraftsmen: number;
}

export interface AgentAxisAffectedAgent {
  id: string;
  status: string;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  presenceReason: string | null;
  lastSeenAt: string | null;
  accountId: string | null;
}

export interface AgentChannelHistoryEvent {
  occurredAt: string;
  agentId: string;
  accountId: string | null;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  reason: string | null;
}

export interface AgentChannelSignalEvent {
  occurredAt: string;
  channel: string;
  agentId: string | null;
  accountId: string | null;
  kind:
    | 'provider_start'
    | 'provider_ready'
    | 'gateway_proxy_enabled'
    | 'health_restart'
    | 'auto_restart_attempt'
    | 'transport_error'
    | 'inbound_ready';
  severity: 'info' | 'warning' | 'error';
  detail: string | null;
}

export interface AgentChannelSummary {
  channel: string;
  totalAgents: number;
  busyAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  offlineAgents: number;
  overallPresence: 'online' | 'offline' | 'disconnected' | 'stale';
  lastSeenAt: string | null;
  presenceReason: string | null;
  affectedAgents: AgentAxisAffectedAgent[];
  history: AgentChannelHistoryEvent[];
  signalStatus: 'healthy' | 'recovering' | 'degraded' | 'unknown';
  lastSignalAt: string | null;
  signalCounts: {
    readyEvents: number;
    restartEvents: number;
    transportErrors: number;
  };
  signals: AgentChannelSignalEvent[];
}

export interface AgentHostSummary {
  host: string;
  totalAgents: number;
  busyAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  offlineAgents: number;
  overallPresence: 'online' | 'offline' | 'disconnected' | 'stale';
  lastSeenAt: string | null;
  presenceReason: string | null;
  affectedAgents: AgentAxisAffectedAgent[];
}

export interface AgentStatusItem {
  id: string;
  role: string | null;
  status: string;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  presenceReason: string | null;
  channelProviders: string[];
  hostFramework: string | null;
  inventorySources: string[];
  primaryModel: string | null;
  workspaceDir: string | null;
  accountId: string | null;
  activeTaskIds: string[];
  activeSubtaskIds: string[];
  taskCount: number;
  subtaskCount: number;
  load: number;
  lastActiveAt: string | null;
  lastSeenAt: string | null;
}

export interface CraftsmanStatusItem {
  id: string;
  status: string;
  taskId: string;
  subtaskId: string;
  title: string;
  runningSince: string | null;
  recentExecutions: Array<{
    executionId: string;
    status: string;
    sessionId: string | null;
    transport: string | null;
    runtimeMode: string | null;
    startedAt: string | null;
  }>;
}

export interface CraftsmanRuntimeProviderSummary {
  provider: 'tmux' | 'acpx' | 'unknown';
  session: string | null;
  slotCount: number;
  readySlots: number;
  activeSlots: number;
}

export interface CraftsmanRuntimeSlot {
  provider: 'tmux' | 'acpx' | 'unknown';
  agent: string;
  sessionId: string | null;
  runtimeMode: string | null;
  transport: string | null;
  status: string;
  ready: boolean;
  active: boolean;
  currentCommand: string | null;
  tailPreview: string | null;
  sessionReference: string | null;
  executionId: string | null;
  taskId: string | null;
  subtaskId: string | null;
  title: string | null;
}

export interface CraftsmanRuntimeStatus {
  providers: CraftsmanRuntimeProviderSummary[];
  slots: CraftsmanRuntimeSlot[];
}

export interface AgentsStatus {
  summary: AgentStatusSummary;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  channelSummaries: AgentChannelSummary[];
  hostSummaries: AgentHostSummary[];
  craftsmanRuntime: CraftsmanRuntimeStatus | null;
}

export type TodoFilter = 'all' | 'pending' | 'done';

export interface Todo {
  id: number;
  text: string;
  projectId: string | null;
  status: 'pending' | 'done' | string;
  due: string | null;
  createdAt: string;
  completedAt: string | null;
  tags: string[];
  tagLabel: string;
  promotedTo: string | null;
}

export interface PromoteTodoResult {
  todo: Todo;
  task: {
    id: string;
    title?: string | null;
  };
}

export interface ArchiveJob {
  id: number;
  taskId: string;
  taskTitle: string;
  taskType: string;
  status: string;
  targetPath: string | null;
  writerAgent: string | null;
  commitHash: string | null;
  requestedAt: string;
  completedAt: string | null;
  payload: Record<string, unknown> | null;
  payloadSummary: string;
  canConfirm: boolean;
  canRetry: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  type: string;
  description: string;
  governance: string;
  stageCount: number;
  stageCountLabel: string;
}

export interface TemplateStage {
  id: string;
  name: string;
  mode: string;
  roster?: {
    includeRoles: string[];
    includeAgents: string[];
    excludeAgents: string[];
    keepController: boolean;
  } | null;
  gateType: string | null;
  gateApprover?: string | null;
  gateRequired?: number | null;
  gateTimeoutSec?: number | null;
  rejectTarget?: string | null;
}

export interface TemplateGraphNode {
  id: string;
  name: string;
  kind: 'stage' | 'terminal';
  executionKind: string | null;
  allowedActions: string[];
  roster?: {
    includeRoles: string[];
    includeAgents: string[];
    excludeAgents: string[];
    keepController: boolean;
  } | null;
  gateType: string | null;
  gateApprover: string | null;
  gateRequired: number | null;
  gateTimeoutSec: number | null;
  layout: { x: number; y: number } | null;
}

export interface TemplateGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'advance' | 'reject' | 'timeout' | 'branch' | 'complete';
}

export interface TemplateGraph {
  graphVersion: number;
  entryNodes: string[];
  nodes: TemplateGraphNode[];
  edges: TemplateGraphEdge[];
}

export interface TemplateTeamPresetMember {
  role: string;
  memberKind?: 'controller' | 'citizen' | 'craftsman' | null;
  modelPreference: string | null;
  suggested: string[];
}

export interface TemplateDetail {
  id: string;
  name: string;
  type: string;
  description: string;
  governance: string;
  stageCount: number;
  stages: TemplateStage[];
  graph?: TemplateGraph;
  defaultTeamRoles: string[];
  defaultTeam: TemplateTeamPresetMember[];
  raw: Record<string, unknown>;
}
