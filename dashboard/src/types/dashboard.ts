export interface AgentStatusSummary {
  activeTasks: number;
  activeAgents: number;
  totalAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  busyCraftsmen: number;
}

export interface AgentProviderAffectedAgent {
  id: string;
  status: string;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  presenceReason: string | null;
  lastSeenAt: string | null;
  accountId: string | null;
}

export interface AgentProviderHistoryEvent {
  occurredAt: string;
  agentId: string;
  accountId: string | null;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  reason: string | null;
}

export interface AgentProviderSignalEvent {
  occurredAt: string;
  provider: string;
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

export interface AgentProviderSummary {
  provider: string;
  totalAgents: number;
  busyAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  offlineAgents: number;
  overallPresence: 'online' | 'offline' | 'disconnected' | 'stale';
  lastSeenAt: string | null;
  presenceReason: string | null;
  affectedAgents: AgentProviderAffectedAgent[];
  history: AgentProviderHistoryEvent[];
  signalStatus: 'healthy' | 'recovering' | 'degraded' | 'unknown';
  lastSignalAt: string | null;
  signalCounts: {
    readyEvents: number;
    restartEvents: number;
    transportErrors: number;
  };
  signals: AgentProviderSignalEvent[];
}

export interface AgentStatusItem {
  id: string;
  role: string | null;
  status: string;
  presence: 'online' | 'offline' | 'disconnected' | 'stale';
  presenceReason: string | null;
  source: string | null;
  primaryModel: string | null;
  workspaceDir: string | null;
  provider: string | null;
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

export interface TmuxRuntimePane {
  agent: string;
  paneId: string | null;
  currentCommand: string | null;
  active: boolean;
  ready: boolean;
  tailPreview: string | null;
  continuityBackend: 'claude_session_id' | 'codex_session_file' | 'gemini_session_id' | 'unknown';
  resumeCapability: 'native_resume' | 'resume_last' | 'none';
  sessionReference: string | null;
  identitySource: 'registry_default' | 'hook_event' | 'session_file' | 'chat_file' | 'manual' | 'transport_session';
  lastRecoveryMode: 'fresh_start' | 'resume_exact' | 'resume_latest' | 'resume_last' | null;
  transportSessionId: string | null;
}

export interface TmuxRuntimeStatus {
  session: string | null;
  panes: TmuxRuntimePane[];
}

export interface AgentsStatus {
  summary: AgentStatusSummary;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  providerSummaries: AgentProviderSummary[];
  tmuxRuntime: TmuxRuntimeStatus | null;
}

export type TodoFilter = 'all' | 'pending' | 'done';

export interface Todo {
  id: number;
  text: string;
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
  gateType: string | null;
}

export interface TemplateDetail {
  id: string;
  name: string;
  type: string;
  description: string;
  governance: string;
  stageCount: number;
  stages: TemplateStage[];
  defaultTeamRoles: string[];
  raw: Record<string, unknown>;
}
