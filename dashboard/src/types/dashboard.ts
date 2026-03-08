export interface AgentStatusSummary {
  activeTasks: number;
  activeAgents: number;
  totalAgents: number;
  onlineAgents: number;
  busyCraftsmen: number;
}

export interface AgentStatusItem {
  id: string;
  role: string | null;
  status: string;
  presence: 'online' | 'offline' | 'disconnected';
  source: string | null;
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
}

export interface AgentsStatus {
  summary: AgentStatusSummary;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
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
