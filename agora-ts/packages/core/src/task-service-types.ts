import { fileURLToPath } from 'node:url';
import type {
  CreateTaskAuthorityDto,
  CreateTaskRequestDto,
  DatabasePort,
  GateCommandPort,
  GateQueryPort,
  IApprovalRequestRepository,
  IArchiveJobRepository,
  ICraftsmanExecutionRepository,
  IFlowLogRepository,
  IInboxRepository,
  IProgressLogRepository,
  ISubtaskRepository,
  ITaskContextBindingRepository,
  ITaskConversationRepository,
  ITaskRepository,
  ITemplateRepository,
  ITodoRepository,
  TaskLocaleDto,
  TaskRecord,
} from '@agora-ts/contracts';
import type { CraftsmanCallbackService } from './craftsman-callback-service.js';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import type { CraftsmanExecutionProbePort } from './craftsman-probe-port.js';
import type { CraftsmanExecutionTailPort } from './craftsman-tail-port.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { HostResourcePort } from './host-resource-port.js';
import type { IMMessagingPort, IMProvisioningPort } from './im-ports.js';
import type { LiveSessionStore } from './live-session-store.js';
import type { ProjectAgentRosterService } from './project-agent-roster-service.js';
import type { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import type { ContextMaterializationService } from './context-materialization-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ProjectMembershipService } from './project-membership-service.js';
import type { ProjectNomosAuthoringPort } from './project-nomos-authoring-port.js';
import type { ProjectService } from './project-service.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import type { RuntimeThreadMessageRouter } from './runtime-message-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { SkillCatalogPort } from './skill-catalog-port.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskBrainWorkspacePort } from './task-brain-port.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';

export type CreateTaskInputLike = Omit<CreateTaskRequestDto, 'locale'> & {
  locale?: TaskLocaleDto;
  authority?: CreateTaskAuthorityDto | undefined;
};

export type CraftsmanGovernanceLimits = {
  maxConcurrentRunning: number | null;
  maxConcurrentPerAgent: number | null;
  hostMemoryWarningUtilizationLimit: number | null;
  hostMemoryUtilizationLimit: number | null;
  hostSwapWarningUtilizationLimit: number | null;
  hostSwapUtilizationLimit: number | null;
  hostLoadPerCpuWarningLimit: number | null;
  hostLoadPerCpuLimit: number | null;
};

export type EscalationPolicy = {
  controllerAfterMs: number;
  rosterAfterMs: number;
  inboxAfterMs: number;
};

export interface HumanReminderParticipantResolverInput {
  task: TaskRecord;
  provider: string;
  reason: 'approval_waiting';
}

export interface TaskServiceOptions {
  templatesDir?: string;
  taskIdGenerator?: () => string;
  archonUsers?: string[];
  allowAgents?: Record<string, { canCall: string[]; canAdvance: boolean }>;
  projectService?: ProjectService;
  craftsmanDispatcher?: CraftsmanDispatcher;
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
  imProvisioningPort?: IMProvisioningPort;
  imMessagingPort?: IMMessagingPort;
  taskBrainWorkspacePort?: TaskBrainWorkspacePort;
  taskBrainBindingService?: TaskBrainBindingService;
  taskContextBindingService?: TaskContextBindingService;
  taskParticipationService?: TaskParticipationService;
  contextMaterializationService?: Pick<ContextMaterializationService, 'materializeSync'>;
  projectBrainAutomationService?: ProjectBrainAutomationService;
  agentRuntimePort?: AgentRuntimePort;
  runtimeThreadMessageRouter?: RuntimeThreadMessageRouter;
  runtimeRecoveryPort?: RuntimeRecoveryPort;
  craftsmanInputPort?: CraftsmanInputPort;
  craftsmanExecutionProbePort?: CraftsmanExecutionProbePort;
  craftsmanExecutionTailPort?: CraftsmanExecutionTailPort;
  hostResourcePort?: HostResourcePort;
  liveSessionStore?: LiveSessionStore;
  skillCatalogPort?: SkillCatalogPort;
  projectNomosAuthoringPort?: ProjectNomosAuthoringPort;
  craftsmanGovernance?: {
    maxConcurrentRunning?: number | null;
    maxConcurrentPerAgent?: number | null;
    hostMemoryWarningUtilizationLimit?: number | null;
    hostMemoryUtilizationLimit?: number | null;
    hostSwapWarningUtilizationLimit?: number | null;
    hostSwapUtilizationLimit?: number | null;
    hostLoadPerCpuWarningLimit?: number | null;
    hostLoadPerCpuLimit?: number | null;
  };
  escalationPolicy?: {
    controllerAfterMs?: number;
    rosterAfterMs?: number;
    inboxAfterMs?: number;
  };
  resolveHumanReminderParticipantRefs?: (input: HumanReminderParticipantResolverInput) => string[];
  databasePort: DatabasePort;
  gateCommandPort: GateCommandPort;
  gateQueryPort: GateQueryPort;
  repositories: {
    task: ITaskRepository;
    flowLog: IFlowLogRepository;
    progressLog: IProgressLogRepository;
    subtask: ISubtaskRepository;
    taskContextBinding: ITaskContextBindingRepository;
    taskConversation: ITaskConversationRepository;
    todo: ITodoRepository;
    archiveJob: IArchiveJobRepository;
    approvalRequest: IApprovalRequestRepository;
    inbox: IInboxRepository;
    craftsmanExecution: ICraftsmanExecutionRepository;
    template: ITemplateRepository;
  };
  subServices: {
    taskAuthority: TaskAuthorityService;
    projectMembership: ProjectMembershipService;
    projectAgentRoster: ProjectAgentRosterService;
    craftsmanCallback: CraftsmanCallbackService;
    projectContextWriter: ProjectContextWriter;
  };
}

export interface AdvanceTaskOptions {
  callerId: string;
  nextStageId?: string;
}

export interface ApproveTaskOptions {
  approverId: string;
  approverAccountId?: number | null;
  comment: string;
}

export interface RejectTaskOptions {
  rejectorId: string;
  rejectorAccountId?: number | null;
  reason: string;
}

export interface ArchonDecisionOptions {
  reviewerId: string;
  comment?: string;
  reason?: string;
}

export interface CompleteSubtaskOptions {
  subtaskId: string;
  callerId: string;
  output: string;
}

export interface SubtaskLifecycleOptions {
  subtaskId: string;
  callerId: string;
  note: string;
}

export interface ForceAdvanceOptions {
  reason: string;
}

export interface ConfirmTaskOptions {
  voterId: string;
  vote: 'approve' | 'reject';
  comment: string;
}

export interface UpdateTaskStateOptions {
  reason: string;
  action?: 'retry' | 'skip' | 'reassign';
  assignee?: string;
  craftsman_type?: string;
}

export interface StartupRecoveryScanResult {
  scanned_tasks: number;
  blocked_tasks: number;
  failed_subtasks: number;
  failed_executions: number;
}

export interface InactiveTaskProbeOptions {
  controllerAfterMs?: number;
  rosterAfterMs?: number;
  inboxAfterMs?: number;
  now?: Date;
}

export interface InactiveTaskProbeResult {
  scanned_tasks: number;
  controller_pings: number;
  roster_pings: number;
  human_pings: number;
  inbox_items: number;
}

export interface ObserveCraftsmanExecutionsOptions {
  runningAfterMs: number;
  waitingAfterMs: number;
  now?: Date;
}

export interface ObserveCraftsmanExecutionsResult {
  scanned: number;
  probed: number;
  progressed: number;
}

export function defaultTemplatesDir() {
  return fileURLToPath(new URL('../../../templates', import.meta.url));
}

export function defaultTaskIdGenerator() {
  return `OC-${Date.now()}`;
}
