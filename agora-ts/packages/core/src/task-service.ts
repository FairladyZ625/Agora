import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CraftsmanCallbackRequestDto, CraftsmanDispatchRequestDto, CraftsmanExecutionTailResponseDto, CraftsmanInputKeyDto, CraftsmanStopExecutionRequestDto, CreateSubtasksRequestDto, CreateSubtasksResponseDto, CreateTaskAuthorityDto, CreateTaskRequestDto, DatabasePort, GateCommandPort, GateQueryPort, HostResourceSnapshotDto, IApprovalRequestRepository, IArchiveJobRepository, ICraftsmanExecutionRepository, IFlowLogRepository, IInboxRepository, IProgressLogRepository, ISubtaskRepository, ITaskContextBindingRepository, ITaskConversationRepository, ITaskRepository, ITemplateRepository, ITodoRepository, PromoteTodoRequestDto, RuntimeDiagnosisResultDto, RuntimeRecoveryActionDto, RuntimeRecoveryRequestDto, TaskBlueprintDto, TaskConversationEntryRecord, TaskLocaleDto, TaskRecord, TaskStatusDto, UnifiedHealthSnapshotDto, WorkflowDto } from '@agora-ts/contracts';
import { craftsmanExecutionSchema, createSubtasksRequestSchema } from '@agora-ts/contracts';
import { PermissionDeniedError, NotFoundError } from './errors.js';
import type { CraftsmanCallbackService } from './craftsman-callback-service.js';
import { normalizeCraftsmanAdapter } from './craftsman-adapter-aliases.js';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { GateService } from './gate-service.js';
import { ModeController } from './mode-controller.js';
import { ProgressService } from './progress-service.js';
import { TaskState } from './enums.js';
import { PermissionService } from './permission-service.js';
import type { ProjectService } from './project-service.js';
import { StateMachine } from './state-machine.js';
import type { IMMessagingPort, IMPublishMessageInput, IMProvisioningPort } from './im-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import type { SkillCatalogEntry, SkillCatalogPort } from './skill-catalog-port.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { CraftsmanExecutionProbePort } from './craftsman-probe-port.js';
import type { CraftsmanExecutionTailPort } from './craftsman-tail-port.js';
import type { HostResourcePort } from './host-resource-port.js';
import type {
  TaskBrainContextArtifact,
  TaskBrainContextAudience,
  TaskBrainWorkspacePort,
} from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import { TaskParticipantSyncService } from './task-participant-sync-service.js';
import type { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import type { ProjectAgentRosterService } from './project-agent-roster-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ProjectMembershipService } from './project-membership-service.js';
import type { ProjectNomosAuthoringPort } from './project-nomos-authoring-port.js';
import { StageRosterService } from './stage-roster-service.js';
import { TaskBroadcastService } from './task-broadcast-service.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import { TaskWorktreeService } from './task-worktree-service.js';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';
import type { LiveSessionStore } from './live-session-store.js';
import { validateRuntimeSupportedGraphSemantics, validateRuntimeWorkflowGraphAlignment, validateTemplateGraph } from './template-graph-service.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const TASK_BRAIN_CONTEXT_AUDIENCES: TaskBrainContextAudience[] = ['controller', 'craftsman', 'citizen'];

type TaskTemplate = {
  name: string;
  defaultWorkflow?: string;
  defaultTeam?: Record<
    string,
    {
      member_kind?: 'controller' | 'citizen' | 'craftsman';
      model_preference?: string;
      suggested?: string[];
    }
  >;
  stages?: WorkflowDto['stages'];
  graph?: WorkflowDto['graph'];
};

type CreateTaskInputLike = Omit<CreateTaskRequestDto, 'locale'> & {
  locale?: TaskLocaleDto;
  authority?: CreateTaskAuthorityDto | undefined;
};

type CraftsmanGovernanceLimits = {
  maxConcurrentRunning: number | null;
  maxConcurrentPerAgent: number | null;
  hostMemoryWarningUtilizationLimit: number | null;
  hostMemoryUtilizationLimit: number | null;
  hostSwapWarningUtilizationLimit: number | null;
  hostSwapUtilizationLimit: number | null;
  hostLoadPerCpuWarningLimit: number | null;
  hostLoadPerCpuLimit: number | null;
};

type EscalationPolicy = {
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
  projectBrainAutomationService?: ProjectBrainAutomationService;
  agentRuntimePort?: AgentRuntimePort;
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
  /** Pre-built sub-services */
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

type CraftsmanProbeState = {
  activityMs: number;
  lastProbeMs: number | null;
  attempts: number;
};

const SYSTEM_ECHO_ACTIVITY_WINDOW_MS = 5_000;

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return Date.parse(value.replace(' ', 'T') + 'Z');
  }
  return Date.parse(value);
}

function defaultTemplatesDir() {
  return fileURLToPath(new URL('../../../templates', import.meta.url));
}

function defaultTaskIdGenerator() {
  return `OC-${Date.now()}`;
}

export class TaskService {
  private static readonly CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS = [1, 3, 9] as const;
  private readonly taskRepository: ITaskRepository;
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly progressLogRepository: IProgressLogRepository;
  private readonly subtaskRepository: ISubtaskRepository;
  private readonly taskContextBindingRepository: ITaskContextBindingRepository;
  private readonly taskConversationRepository: ITaskConversationRepository;
  private readonly todoRepository: ITodoRepository;
  private readonly archiveJobRepository: IArchiveJobRepository;
  private readonly approvalRequestRepository: IApprovalRequestRepository;
  private readonly inboxRepository: IInboxRepository;
  private readonly taskAuthorities: TaskAuthorityService;
  private readonly projectMemberships: ProjectMembershipService;
  private readonly projectAgentRoster: ProjectAgentRosterService;
  private readonly stateMachine: StateMachine;
  private readonly permissions: PermissionService;
  private readonly gateService: GateService;
  private readonly projectService: ProjectService;
  private readonly projectContextWriter: ProjectContextWriter;
  private readonly taskWorktreeService: TaskWorktreeService;
  private readonly craftsmanCallbacks: CraftsmanCallbackService;
  private readonly craftsmanExecutions: ICraftsmanExecutionRepository;
  private readonly craftsmanDispatcher: CraftsmanDispatcher | undefined;
  private readonly craftsmanInputPort: CraftsmanInputPort | undefined;
  private readonly isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  private readonly templateRepository: ITemplateRepository;
  private readonly templatesDir: string;
  private readonly taskIdGenerator: () => string;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly imMessagingPort: IMMessagingPort | undefined;
  private readonly taskBrainWorkspacePort: TaskBrainWorkspacePort | undefined;
  private readonly taskBrainBindingService: TaskBrainBindingService | undefined;
  private readonly taskContextBindingService: TaskContextBindingService | undefined;
  private readonly taskParticipationService: TaskParticipationService | undefined;
  private readonly resolveHumanReminderParticipantRefs:
    | ((input: HumanReminderParticipantResolverInput) => string[])
    | undefined;
  private readonly projectBrainAutomationService: ProjectBrainAutomationService | undefined;
  private readonly stageRosterService: StageRosterService;
  private readonly taskBroadcastService: TaskBroadcastService;
  private readonly taskParticipantSyncService: TaskParticipantSyncService;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;
  private readonly runtimeRecoveryPort: RuntimeRecoveryPort | undefined;
  private readonly craftsmanExecutionProbePort: CraftsmanExecutionProbePort | undefined;
  private readonly craftsmanExecutionTailPort: CraftsmanExecutionTailPort | undefined;
  private readonly hostResourcePort: HostResourcePort | undefined;
  private readonly liveSessionStore: LiveSessionStore | undefined;
  private readonly skillCatalogPort: SkillCatalogPort | undefined;
  private readonly projectNomosAuthoringPort: ProjectNomosAuthoringPort | undefined;
  private readonly craftsmanGovernance: CraftsmanGovernanceLimits;
  private readonly escalationPolicy: EscalationPolicy;
  private readonly pendingBackgroundOperations = new Set<Promise<void>>();
  private readonly craftsmanProbeStateByExecution = new Map<string, CraftsmanProbeState>();
  private readonly gateQueryPort: GateQueryPort;
  private readonly db: DatabasePort;

  constructor(options: TaskServiceOptions) {
    const repos = options.repositories;
    const subs = options.subServices;
    this.db = options.databasePort;
    this.taskRepository = repos.task;
    this.flowLogRepository = repos.flowLog;
    this.progressLogRepository = repos.progressLog;
    this.subtaskRepository = repos.subtask;
    this.taskContextBindingRepository = repos.taskContextBinding;
    this.taskConversationRepository = repos.taskConversation;
    this.todoRepository = repos.todo;
    this.archiveJobRepository = repos.archiveJob;
    this.approvalRequestRepository = repos.approvalRequest;
    this.inboxRepository = repos.inbox;
    this.taskAuthorities = subs.taskAuthority;
    this.projectMemberships = subs.projectMembership;
    this.projectAgentRoster = subs.projectAgentRoster;
    this.craftsmanExecutions = repos.craftsmanExecution;
    this.templateRepository = repos.template;
    this.stateMachine = new StateMachine();
    this.permissions = options.archonUsers
      ? new PermissionService({ archonUsers: options.archonUsers, allowAgents: options.allowAgents })
      : new PermissionService({ allowAgents: options.allowAgents });
    this.gateService = new GateService(options.gateCommandPort, this.permissions);
    this.gateQueryPort = options.gateQueryPort;
    this.projectService = options.projectService!;
    this.taskBrainWorkspacePort = options.taskBrainWorkspacePort;
    this.taskBrainBindingService = options.taskBrainBindingService;
    this.taskContextBindingService = options.taskContextBindingService;
    this.taskParticipationService = options.taskParticipationService;
    this.resolveHumanReminderParticipantRefs = options.resolveHumanReminderParticipantRefs;
    this.projectBrainAutomationService = options.projectBrainAutomationService;
    this.projectContextWriter = subs.projectContextWriter;
    this.taskWorktreeService = new TaskWorktreeService({
      projectService: this.projectService,
    });
    this.craftsmanCallbacks = subs.craftsmanCallback;
    this.craftsmanDispatcher = options.craftsmanDispatcher;
    this.craftsmanInputPort = options.craftsmanInputPort;
    this.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
    this.templatesDir = options.templatesDir ?? defaultTemplatesDir();
    this.templateRepository.seedFromDir(this.templatesDir);
    this.templateRepository.repairMemberKindsFromDir(this.templatesDir);
    this.templateRepository.repairStageSemanticsFromDir(this.templatesDir);
    this.templateRepository.repairGraphsFromDir(this.templatesDir);
    this.taskIdGenerator = options.taskIdGenerator ?? defaultTaskIdGenerator;
    this.imProvisioningPort = options.imProvisioningPort;
    this.imMessagingPort = options.imMessagingPort;
    this.stageRosterService = new StageRosterService();
    this.taskBroadcastService = new TaskBroadcastService({
      taskContextBindingRepository: this.taskContextBindingRepository,
      taskConversationRepository: this.taskConversationRepository,
      imProvisioningPort: this.imProvisioningPort,
      getTaskBrainWorkspacePath: (taskId) => this.taskBrainBindingService?.getActiveBinding(taskId)?.workspace_path ?? null,
      trackBackgroundOperation: (operation) => this.trackBackgroundOperation(operation),
    });
    this.taskParticipantSyncService = new TaskParticipantSyncService({
      taskContextBindingRepository: this.taskContextBindingRepository,
      taskParticipationService: this.taskParticipationService,
      imProvisioningPort: this.imProvisioningPort,
      stageRosterService: this.stageRosterService,
      trackBackgroundOperation: (operation) => this.trackBackgroundOperation(operation),
    });
    this.agentRuntimePort = options.agentRuntimePort;
    this.runtimeRecoveryPort = options.runtimeRecoveryPort;
    this.craftsmanExecutionProbePort = options.craftsmanExecutionProbePort;
    this.craftsmanExecutionTailPort = options.craftsmanExecutionTailPort;
    this.hostResourcePort = options.hostResourcePort;
    this.liveSessionStore = options.liveSessionStore;
    this.skillCatalogPort = options.skillCatalogPort;
    this.projectNomosAuthoringPort = options.projectNomosAuthoringPort;
    this.craftsmanGovernance = {
      maxConcurrentRunning: options.craftsmanGovernance?.maxConcurrentRunning ?? null,
      maxConcurrentPerAgent: options.craftsmanGovernance?.maxConcurrentPerAgent ?? null,
      hostMemoryWarningUtilizationLimit: options.craftsmanGovernance?.hostMemoryWarningUtilizationLimit ?? null,
      hostMemoryUtilizationLimit: options.craftsmanGovernance?.hostMemoryUtilizationLimit ?? null,
      hostSwapWarningUtilizationLimit: options.craftsmanGovernance?.hostSwapWarningUtilizationLimit ?? null,
      hostSwapUtilizationLimit: options.craftsmanGovernance?.hostSwapUtilizationLimit ?? null,
      hostLoadPerCpuWarningLimit: options.craftsmanGovernance?.hostLoadPerCpuWarningLimit ?? null,
      hostLoadPerCpuLimit: options.craftsmanGovernance?.hostLoadPerCpuLimit ?? null,
    };
    this.escalationPolicy = {
      controllerAfterMs: options.escalationPolicy?.controllerAfterMs ?? 300_000,
      rosterAfterMs: options.escalationPolicy?.rosterAfterMs ?? 900_000,
      inboxAfterMs: options.escalationPolicy?.inboxAfterMs ?? 1_800_000,
    };
  }

  async drainBackgroundOperations(): Promise<void> {
    while (this.pendingBackgroundOperations.size > 0) {
      await Promise.allSettled([...this.pendingBackgroundOperations]);
    }
  }

  createTask(input: CreateTaskInputLike): TaskRecord {
    const template = this.tryLoadTemplate(input.type);
    const workflow = input.workflow_override ?? (template ? this.buildWorkflow(template) : null);
    const requestedTeam = input.team_override ?? (template ? this.buildTeam(template) : null);
    if (!workflow || !requestedTeam) {
      throw new NotFoundError(`Template not found: ${input.type}`);
    }
    if (workflow.graph) {
      const graphErrors = [
        ...validateTemplateGraph(workflow.graph),
        ...validateRuntimeWorkflowGraphAlignment(workflow.stages, workflow.graph),
        ...validateRuntimeSupportedGraphSemantics(workflow.graph),
      ];
      if (graphErrors.length > 0) {
        throw new Error(`workflow graph violates runtime-supported graph semantics: ${graphErrors.join('; ')}`);
      }
    }
    const team = this.enrichTeam(requestedTeam);
    const taskId = this.taskIdGenerator();
    const projectId = input.project_id ?? null;
    const nomosAuthoring = input.control?.nomos_authoring;
    const firstStageId = workflow.graph?.entry_nodes[0] ?? workflow.stages?.[0]?.id ?? null;
    const templateLabel = template?.name ?? input.type;
    let active: TaskRecord;
    let brainWorkspaceBinding: ReturnType<NonNullable<TaskBrainWorkspacePort['createWorkspace']>> | null = null;

    this.db.exec('BEGIN');
    try {
      if (nomosAuthoring?.kind === 'project_nomos') {
        if (!projectId) {
          throw new Error('project_nomos authoring tasks must be bound to a project');
        }
        if (nomosAuthoring.project_id !== projectId) {
          throw new Error(`project_nomos authoring project mismatch: task=${projectId} control=${nomosAuthoring.project_id}`);
        }
      }
      if (projectId) {
        this.projectService.requireProject(projectId);
        if (this.projectMemberships.hasConfiguredMemberships(projectId)) {
          this.projectMemberships.requireActiveCreatorMembership(projectId, input.creator);
          this.projectMemberships.requireActiveMemberAccounts(projectId, [
            input.authority?.requester_account_id,
            input.authority?.owner_account_id,
            input.authority?.assignee_account_id,
            input.authority?.approver_account_id,
          ]);
        }
        if (input.authority?.controller_agent_ref && this.projectAgentRoster.hasConfiguredRoster(projectId)) {
          this.projectAgentRoster.requireActiveAgent(projectId, input.authority.controller_agent_ref);
        }
      }
      const draftInput: Parameters<ITaskRepository['insertTask']>[0] = {
        id: taskId,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        creator: input.creator,
        locale: resolveTaskLocale(input.locale),
        project_id: projectId,
        skill_policy: input.skill_policy ?? null,
        team,
        workflow,
        control: input.control ?? null,
      };
      const draft = this.taskRepository.insertTask(draftInput);

      const created = this.taskRepository.updateTask(taskId, draft.version, {
        state: TaskState.CREATED,
      });

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        from_state: TaskState.DRAFT,
        to_state: TaskState.CREATED,
        detail: { template: templateLabel, task_type: input.type },
        actor: 'system',
      });

      active = this.taskRepository.updateTask(taskId, created.version, {
        state: TaskState.ACTIVE,
        current_stage: firstStageId,
      });

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: firstStageId,
        from_state: TaskState.CREATED,
        to_state: TaskState.ACTIVE,
        actor: 'system',
      });
      if (firstStageId) {
        this.enterStage(taskId, firstStageId);
        this.progressLogRepository.insertProgressLog({
          task_id: taskId,
          kind: 'progress',
          stage_id: firstStageId,
          content: `Entered stage ${firstStageId}`,
          artifacts: { stage_id: firstStageId },
          actor: 'system',
        });
      }

      this.taskParticipationService?.seedParticipants(taskId, team);
      if (firstStageId) {
        const firstStage = workflow.stages?.[0] ?? null;
        this.taskParticipantSyncService.seedStageExposure(taskId, team, firstStage ?? undefined);
      }
      if (this.taskBrainWorkspacePort && this.taskBrainBindingService) {
        brainWorkspaceBinding = this.taskBrainWorkspacePort.createWorkspace(this.buildTaskBrainWorkspaceRequest(active, input.type));
        this.taskBrainBindingService.createBinding({
          task_id: taskId,
          brain_pack_ref: brainWorkspaceBinding.brain_pack_ref,
          brain_task_id: brainWorkspaceBinding.brain_task_id,
          workspace_path: brainWorkspaceBinding.workspace_path,
          metadata: brainWorkspaceBinding.metadata ?? null,
        });
      }
      if (projectId) {
        this.projectService.recordTaskBinding({
          project_id: projectId,
          task_id: taskId,
          title: input.title,
          state: TaskState.ACTIVE,
          workspace_path: brainWorkspaceBinding?.workspace_path ?? null,
          bound_at: new Date().toISOString(),
        });
      }
      if (input.authority) {
        this.taskAuthorities.createOrUpdate({
          task_id: taskId,
          requester_account_id: input.authority.requester_account_id ?? null,
          owner_account_id: input.authority.owner_account_id ?? null,
          assignee_account_id: input.authority.assignee_account_id ?? null,
          approver_account_id: input.authority.approver_account_id ?? null,
          controller_agent_ref: input.authority.controller_agent_ref ?? null,
        });
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (brainWorkspaceBinding && this.taskBrainWorkspacePort) {
        try {
          this.taskBrainWorkspacePort.destroyWorkspace(brainWorkspaceBinding);
        } catch {
          // Ignore cleanup errors on rollback; DB remains canonical.
        }
      }
      throw error;
    }

    const createdTask = active!;
    const initialStage = createdTask.current_stage
      ? this.getStageByIdOrThrow(createdTask, createdTask.current_stage)
      : null;
    const imParticipantRefs = this.collectImParticipantRefs(createdTask, initialStage, input.im_target?.participant_refs);
    const brainWorkspace = brainWorkspaceBinding;

    // Fire-and-forget: provision IM thread (non-blocking, failure doesn't block task creation)
    if (this.imProvisioningPort && this.taskContextBindingService) {
      const bindingService = this.taskContextBindingService;
      const provisioningPort = this.imProvisioningPort;
      this.trackBackgroundOperation(provisioningPort.provisionContext({
        task_id: taskId,
        title: input.title,
        target: input.im_target
          ? {
              ...(input.im_target.provider ? { provider: input.im_target.provider } : {}),
              ...(input.im_target.conversation_ref ? { conversation_ref: input.im_target.conversation_ref } : {}),
              ...(input.im_target.thread_ref ? { thread_ref: input.im_target.thread_ref } : {}),
              ...(input.im_target.visibility ? { visibility: input.im_target.visibility } : {}),
              ...(input.im_target.participant_refs ? { participant_refs: input.im_target.participant_refs } : {}),
            }
          : null,
        participant_refs: imParticipantRefs,
      }).then(async (provisioned) => {
        const binding = bindingService.createBinding({
          task_id: taskId,
          im_provider: provisioned.im_provider,
          ...(provisioned.conversation_ref ? { conversation_ref: provisioned.conversation_ref } : {}),
          ...(provisioned.thread_ref ? { thread_ref: provisioned.thread_ref } : {}),
          ...(provisioned.message_root_ref ? { message_root_ref: provisioned.message_root_ref } : {}),
        });
        this.taskParticipantSyncService.attachProvisionedContext(taskId, binding.id);
        this.mirrorProvisioningConversationEntry(taskId, binding, `Task **${taskId}** created: ${input.title}`);
        await this.taskParticipantSyncService.joinProvisionedParticipants(taskId, binding, imParticipantRefs);
        const bootstrapMessages = this.buildBootstrapMessages(createdTask, brainWorkspace, imParticipantRefs);
        if (bootstrapMessages.length > 0) {
          await provisioningPort.publishMessages({
            binding_id: binding.id,
            ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
            ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
            messages: bootstrapMessages,
          });
          this.mirrorPublishedMessagesToConversation(taskId, binding, bootstrapMessages);
        }
      }).catch((err: unknown) => {
        console.error(`[TaskService] IM provisioning failed for task ${taskId}:`, err);
      }));
    }

    return createdTask;
  }

  getTask(taskId: string): TaskRecord | null {
    const task = this.taskRepository.getTask(taskId);
    return task ? this.withControllerRef(task) : null;
  }

  listTasks(state?: string, projectId?: string): TaskRecord[] {
    return this.taskRepository.listTasks(state, projectId).map((task) => this.withControllerRef(task));
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    const task = this.getTaskOrThrow(taskId);
    return {
      task: this.withControllerRef(task) as TaskStatusDto['task'],
      task_blueprint: this.buildTaskBlueprint(task),
      current_stage_roster: this.buildCurrentStageRoster(task),
      flow_log: this.flowLogRepository.listByTask(taskId),
      progress_log: this.progressLogRepository.listByTask(taskId),
      subtasks: this.subtaskRepository.listByTask(taskId),
    };
  }

  advanceTask(taskId: string, options: AdvanceTaskOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }

    const currentStage = this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
    this.assertStageRosterAction(task, currentStage, options.callerId, 'advance');
    this.gateService.routeGateCommand(task, currentStage, 'advance', options.callerId);
    if (!this.stateMachine.checkGate(this.gateQueryPort, task, currentStage, options.callerId)) {
      const refreshed = this.getTaskOrThrow(taskId);
      if (
        refreshed.current_stage !== task.current_stage
        || refreshed.state !== task.state
        || refreshed.version !== task.version
      ) {
        return refreshed;
      }
      const approvalRequest = this.ensureApprovalRequestForGate(task, currentStage, options.callerId);
      if (approvalRequest?.shouldBroadcast) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'gate_waiting',
          bodyLines: [
            `Gate ${approvalRequest.request.gate_type} is waiting for human decision.`,
            `Approval Request: ${approvalRequest.request.id}`,
            ...(approvalRequest.request.summary_path ? [`Summary Path: ${approvalRequest.request.summary_path}`] : []),
          ],
        });
      }
      throw new PermissionDeniedError(
        `Gate check failed for stage '${task.current_stage}' (gate type: ${currentStage.gate?.type ?? 'command'})`,
      );
    }

    return this.advanceSatisfiedStage(task, options.callerId, options.nextStageId);
  }

  approveTask(taskId: string, options: ApproveTaskOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskActive(task);
    const stage = this.getCurrentStageOrThrow(task);
    this.assertStageRosterAction(task, stage, options.approverId, 'approve');
    this.assertApprovalAuthority(task, options.approverAccountId ?? null);
    this.gateService.routeGateCommand(task, stage, 'approve', options.approverId);
    const approverRole = this.getApproverRole(stage);
    this.gateService.recordApproval(taskId, stage.id, approverRole, options.approverId, options.comment);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: true, comment: options.comment },
      actor: options.approverId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.approverId,
      body: options.comment ? `Approval passed: ${options.comment}` : 'Approval passed',
      metadata: {
        event: 'gate_passed',
        gate_type: 'approval',
      },
    });
    this.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.approverId, options.comment);
    const advanced = this.advanceSatisfiedStage(task, options.approverId);
    this.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.approverId,
      comment: options.comment,
      gateType: 'approval',
    });
    return advanced;
  }

  rejectTask(taskId: string, options: RejectTaskOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskActive(task);
    const stage = this.getCurrentStageOrThrow(task);
    this.assertStageRosterAction(task, stage, options.rejectorId, 'reject');
    this.assertApprovalAuthority(task, options.rejectorAccountId ?? null);
    this.gateService.routeGateCommand(task, stage, 'reject', options.rejectorId);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: false, reason: options.reason },
      actor: options.rejectorId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.rejectorId,
      body: `Approval rejected: ${options.reason}`,
      metadata: {
        event: 'gate_failed',
        gate_type: 'approval',
      },
    });
    this.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.rejectorId, options.reason);
    const rewound = this.rewindRejectedStage(task, stage.id, 'rejected', options.rejectorId, options.reason);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'rejected',
      stage_id: stage.id,
      detail: {
        reason: options.reason,
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.rejectorId,
    });
    this.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.rejectorId,
      reason: options.reason,
      gateType: 'approval',
    });
    return rewound;
  }

  archonApproveTask(taskId: string, options: ArchonDecisionOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskActive(task);
    const stage = this.getCurrentStageOrThrow(task);
    this.assertStageRosterAction(task, stage, options.reviewerId, 'archon-approve');
    this.gateService.routeGateCommand(task, stage, 'archon-approve', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: true, comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_approved',
      stage_id: stage.id,
      detail: { decision: 'approved', comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.comment ? `Archon approved: ${options.comment}` : 'Archon approved',
      metadata: {
        event: 'archon_approved',
      },
    });
    this.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    const advanced = this.advanceSatisfiedStage(task, options.reviewerId);
    this.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.reviewerId,
      comment: options.comment ?? '',
      gateType: 'archon_review',
    });
    return advanced;
  }

  archonRejectTask(taskId: string, options: ArchonDecisionOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskActive(task);
    const stage = this.getCurrentStageOrThrow(task);
    this.assertStageRosterAction(task, stage, options.reviewerId, 'archon-reject');
    this.gateService.routeGateCommand(task, stage, 'archon-reject', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: false, reason: options.reason ?? '' },
      actor: options.reviewerId,
    });
    const rewound = this.rewindRejectedStage(task, stage.id, 'archon_rejected', options.reviewerId, options.reason ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_rejected',
      stage_id: stage.id,
      detail: {
        decision: 'rejected',
        reason: options.reason ?? '',
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.reviewerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.reason ? `Archon rejected: ${options.reason}` : 'Archon rejected',
      metadata: {
        event: 'archon_rejected',
      },
    });
    this.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.reviewerId,
      reason: options.reason ?? '',
      gateType: 'archon_review',
    });
    return rewound;
  }

  private advanceSatisfiedStage(task: TaskRecord, actor: string, nextStageId?: string): TaskRecord {
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${task.id} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    const advance = this.stateMachine.advance(task.workflow, task.current_stage, nextStageId);
    this.reconcileStageExitSubtasks(task.id, advance.currentStage.id, 'archived', 'stage_advanced');
    this.exitStage(task.id, advance.currentStage.id, 'advance');

    if (advance.completesTask) {
      this.runTaskDoneAutomation(task);
      const done = this.taskRepository.updateTask(task.id, task.version, {
        state: TaskState.DONE,
        current_stage: null,
      });
      this.refreshTaskBrainWorkspace(done);
      this.materializeTaskCloseRecap(done, actor);
      const archiveJob = this.ensureArchiveJobForTask(task.id);
      this.flowLogRepository.insertFlowLog({
        task_id: task.id,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor,
      });
      this.mirrorConversationEntry(task.id, {
        actor,
        body: 'Task completed',
        metadata: {
          event: 'state_changed',
          from_state: TaskState.ACTIVE,
          to_state: TaskState.DONE,
        },
      });
      this.publishTaskStatusBroadcast(done, {
        kind: 'task_completed',
        bodyLines: ['Task reached done state and has been queued for archive handling.'],
      });
      this.publishControllerCloseoutReminder(done, archiveJob);
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.taskRepository.updateTask(task.id, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.enterStage(task.id, nextStage.id);
    }
    this.refreshTaskBrainWorkspace(updated);
    this.flowLogRepository.insertFlowLog({
      task_id: task.id,
      kind: 'flow',
      event: 'stage_advanced',
      stage_id: nextStage?.id ?? null,
      detail: {
        from_stage: advance.currentStage.id,
        to_stage: nextStage?.id ?? 'done',
      },
      actor,
    });
    if (nextStage) {
      this.progressLogRepository.insertProgressLog({
        task_id: task.id,
        kind: 'progress',
        stage_id: nextStage.id,
        content: `Advanced to stage ${nextStage.id}`,
        artifacts: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor,
      });
      this.mirrorConversationEntry(task.id, {
        actor,
        body: `Advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'stage_advanced',
          from_stage: advance.currentStage.id,
          to_stage: nextStage.id,
        },
      });
      this.publishTaskStatusBroadcast(updated, {
        kind: 'stage_entered',
        bodyLines: [
          `Advanced from ${advance.currentStage.id} to ${nextStage.id}.`,
          ...this.describeGateState(nextStage),
          ...this.buildSmokeStageEntryCommands(updated, nextStage),
        ],
      });
      this.reconcileStageParticipants(updated, nextStage);
    }
    return updated;
  }

  private runTaskDoneAutomation(task: TaskRecord) {
    const authoring = task.control?.nomos_authoring;
    if (!authoring || authoring.kind !== 'project_nomos' || authoring.auto_refine_on_done === false) {
      return;
    }
    if (!task.project_id) {
      return;
    }
    if (!this.projectNomosAuthoringPort) {
      throw new Error('Project Nomos authoring port is not configured');
    }
    this.projectNomosAuthoringPort.refineProjectNomosDraft(task.project_id);
  }

  completeSubtask(taskId: string, options: CompleteSubtaskOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'done',
      output: options.output,
      done_at: new Date().toISOString(),
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_done',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId },
      actor: options.callerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} marked done`,
      metadata: {
        event: 'subtask_done',
        subtask_id: options.subtaskId,
      },
    });
    return task;
  }

  archiveSubtask(taskId: string, options: SubtaskLifecycleOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'archived',
      output: options.note || subtask.output || `Subtask archived by ${options.callerId}`,
      done_at: now,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_archived',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} archived`,
      metadata: {
        event: 'subtask_archived',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'subtask_archived',
      bodyLines: [
        `Subtask ${options.subtaskId} archived by ${options.callerId}.`,
        ...(options.note ? [`Note: ${options.note}`] : []),
      ],
    });
    return task;
  }

  cancelSubtask(taskId: string, options: SubtaskLifecycleOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    const reason = options.note || `Subtask cancelled by ${options.callerId}`;
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'cancelled',
      output: reason,
      dispatch_status: subtask.dispatch_status && !TERMINAL_EXECUTION_STATUSES.has(subtask.dispatch_status)
        ? 'failed'
        : subtask.dispatch_status,
      done_at: now,
    });
    for (const execution of this.craftsmanExecutions.listBySubtask(taskId, subtask.id)) {
      if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
        continue;
      }
      this.craftsmanExecutions.updateExecution(execution.execution_id, {
        status: 'cancelled',
        error: reason,
        finished_at: now,
      });
    }
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_cancelled',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} cancelled`,
      metadata: {
        event: 'subtask_cancelled',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'subtask_cancelled',
      bodyLines: [
        `Subtask ${options.subtaskId} cancelled by ${options.callerId}.`,
        ...(options.note ? [`Reason: ${options.note}`] : []),
      ],
    });
    return task;
  }

  createSubtasks(taskId: string, options: CreateSubtasksRequestDto): CreateSubtasksResponseDto {
    options = createSubtasksRequestSchema.parse(options);
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && options.caller_id !== controllerRef) {
      throw new Error(`Subtask creation requires controller ownership: expected '${controllerRef}', received '${options.caller_id}'`);
    }
    const stage = this.getCurrentStageOrThrow(task);
    const executionKind = resolveStageExecutionKind(stage);
    if (executionKind !== 'citizen_execute' && executionKind !== 'craftsman_dispatch') {
      throw new Error(`Stage '${stage.id}' does not allow execute-mode subtasks`);
    }
    const duplicateIds = new Set<string>();
    const existingIds = new Set(this.subtaskRepository.listByTask(taskId).map((subtask) => subtask.id));
    const normalizedSubtasks = options.subtasks.map((subtask) => ({
      ...subtask,
      ...(subtask.craftsman ? {
        craftsman: {
          ...subtask.craftsman,
          adapter: normalizeCraftsmanAdapter(subtask.craftsman.adapter),
        },
      } : {}),
    }));
    for (const subtask of normalizedSubtasks) {
      if (duplicateIds.has(subtask.id) || existingIds.has(subtask.id)) {
        throw new Error(`Subtask id '${subtask.id}' already exists in task ${taskId}`);
      }
      duplicateIds.add(subtask.id);
      if (subtask.execution_target === 'craftsman' && !stageAllowsCraftsmanDispatch(stage)) {
        throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
      }
      if (subtask.execution_target === 'craftsman' && subtask.craftsman) {
        this.assertCraftsmanInteractionGuard(
          subtask.craftsman.mode,
          subtask.craftsman.interaction_expectation,
          `subtask '${subtask.id}'`,
        );
      }
      if (
        task.control?.mode === 'smoke_test'
        && stageAllowsCraftsmanDispatch(stage)
        && subtask.execution_target === 'manual'
      ) {
        throw new Error([
          `Smoke task ${taskId} is in a craftsman-capable stage '${stage.id}', but subtask '${subtask.id}' declares execution_target='manual'.`,
          'If you want a craftsman run, use execution_target="craftsman" and include a craftsman block.',
          'Example:',
          JSON.stringify({
            id: subtask.id,
            title: subtask.title,
            assignee: subtask.assignee,
            execution_target: 'craftsman',
            craftsman: {
              adapter: 'claude',
              mode: 'one_shot',
              interaction_expectation: 'one_shot',
              prompt: '<prompt>',
            },
          }, null, 2),
        ].join('\n'));
      }
    }
    this.assertCraftsmanGovernanceForSubtasks(normalizedSubtasks);

    const executeDefs = normalizedSubtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      assignee: subtask.assignee,
      ...(subtask.execution_target === 'craftsman' && subtask.craftsman ? {
        craftsman: {
          adapter: subtask.craftsman.adapter,
          mode: subtask.craftsman.mode,
          workdir: subtask.craftsman.workdir ?? this.taskWorktreeService.resolveDispatchWorkdir(task),
          prompt: subtask.craftsman.prompt ?? null,
          brief_path: subtask.craftsman.brief_path
            ?? this.materializeExecutionBrief(task, {
              subtask_id: subtask.id,
              subtask_title: subtask.title,
              assignee: subtask.assignee,
              adapter: subtask.craftsman.adapter,
              mode: subtask.craftsman.mode,
              prompt: subtask.craftsman.prompt ?? null,
              workdir: subtask.craftsman.workdir ?? this.taskWorktreeService.resolveDispatchWorkdir(task),
            }),
        },
      } : {}),
    }));

    const controller = new ModeController({
      subtaskRepository: this.subtaskRepository,
      progressService: new ProgressService({
        flowLogRepository: this.flowLogRepository,
        progressLogRepository: this.progressLogRepository,
      }),
      ...(this.craftsmanDispatcher ? { dispatcher: this.craftsmanDispatcher } : {}),
    });
    controller.enterExecuteMode(taskId, stage.id, executeDefs);

    const createdSubtasks = this.subtaskRepository
      .listByTask(taskId)
      .filter((subtask) => duplicateIds.has(subtask.id));
    const dispatchedExecutions = createdSubtasks
      .flatMap((subtask) => this.craftsmanExecutions.listBySubtask(taskId, subtask.id))
      .map((execution) => craftsmanExecutionSchema.parse(execution));

    this.publishTaskStatusBroadcast(task, {
      kind: 'subtasks_created',
      bodyLines: [
        `Controller ${options.caller_id} created ${createdSubtasks.length} subtasks in stage ${stage.id}.`,
        ...createdSubtasks.map((subtask) => `- ${subtask.id} | ${subtask.assignee} | ${subtask.craftsman_type ?? 'manual'}`),
        ...(dispatchedExecutions.length > 0
          ? [`Auto-dispatched executions: ${dispatchedExecutions.map((execution) => `${execution.subtask_id}:${execution.execution_id}`).join(', ')}`]
          : []),
        ...this.buildSmokeSubtaskCommands(task, options.caller_id, createdSubtasks, dispatchedExecutions),
      ],
    });

    return {
      task: this.withControllerRef(this.getTaskOrThrow(taskId)) as CreateSubtasksResponseDto['task'],
      subtasks: createdSubtasks,
      dispatched_executions: dispatchedExecutions,
    };
  }

  listSubtasks(taskId: string) {
    this.getTaskOrThrow(taskId);
    return this.subtaskRepository.listByTask(taskId);
  }

  handleCraftsmanCallback(input: CraftsmanCallbackRequestDto) {
    const result = this.craftsmanCallbacks.handleCallback(input);
    if (
      result.task.state !== TaskState.PAUSED
      && ['done', 'failed', 'in_progress', 'waiting_input'].includes(result.subtask.status)
      && ['running', 'succeeded', 'failed', 'cancelled', 'needs_input', 'awaiting_choice'].includes(result.execution.status)
    ) {
      this.sendImmediateCraftsmanNotification(result.task.id, result.execution.execution_id, result.subtask.id);
    }
    return result;
  }

  dispatchCraftsman(input: CraftsmanDispatchRequestDto) {
    if (!this.craftsmanDispatcher) {
      throw new Error('Craftsman dispatcher is not configured');
    }
    const normalizedAdapter = normalizeCraftsmanAdapter(input.adapter);
    const task = this.getTaskOrThrow(input.task_id);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${input.task_id} is in state '${task.state}', expected 'active'`);
    }
    const subtask = this.subtaskRepository.listByTask(input.task_id).find((item) => item.id === input.subtask_id);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${input.subtask_id} not found in task ${input.task_id}`);
    }
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && input.caller_id !== controllerRef) {
      throw new Error(`Craftsman dispatch requires controller ownership: expected '${controllerRef}', received '${input.caller_id}'`);
    }
    if (task.current_stage !== subtask.stage_id) {
      throw new Error(
        `Craftsman dispatch requires the active stage '${task.current_stage ?? 'null'}' to match subtask stage '${subtask.stage_id}'`,
      );
    }
    const stage = this.getStageByIdOrThrow(task, subtask.stage_id);
    if (!stageAllowsCraftsmanDispatch(stage)) {
      throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
    }
    this.assertCraftsmanInteractionGuard(
      input.mode,
      input.interaction_expectation,
      `dispatch for subtask '${subtask.id}'`,
    );
    this.assertCraftsmanDispatchAllowed(subtask.assignee);
    const resolvedWorkdir = input.workdir ?? subtask.craftsman_workdir ?? this.taskWorktreeService.resolveDispatchWorkdir(task);
    const dispatched = this.craftsmanDispatcher.dispatchSubtask({
      task_id: input.task_id,
      stage_id: subtask.stage_id,
      subtask_id: input.subtask_id,
      adapter: normalizedAdapter,
      mode: input.mode,
      workdir: resolvedWorkdir,
      prompt: subtask.craftsman_prompt,
      brief_path: input.brief_path
        ?? this.materializeExecutionBrief(task, {
          subtask_id: subtask.id,
          subtask_title: subtask.title,
          assignee: subtask.assignee,
          adapter: normalizedAdapter,
          mode: input.mode,
          prompt: subtask.craftsman_prompt,
          workdir: resolvedWorkdir,
        }),
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_started',
      bodyLines: [
        `Craftsman dispatch started for subtask ${subtask.id}.`,
        `Caller: ${input.caller_id}`,
        `Adapter: ${normalizedAdapter}`,
        `Execution: ${dispatched.execution.execution_id}`,
        ...this.taskBroadcastService.buildSmokeExecutionCommandsForTask(
          task,
          dispatched.execution.execution_id,
          dispatched.execution.status,
        ),
      ],
    });
    return dispatched;
  }

  getCraftsmanExecution(executionId: string) {
    const execution = this.craftsmanExecutions.getExecution(executionId);
    if (!execution) {
      throw new NotFoundError(`Craftsman execution ${executionId} not found`);
    }
    return execution;
  }

  getCraftsmanExecutionTail(executionId: string, lines = 120): CraftsmanExecutionTailResponseDto {
    if (!Number.isFinite(lines) || lines <= 0) {
      throw new Error('lines must be a positive number');
    }
    const execution = this.getCraftsmanExecution(executionId);
    if (!this.craftsmanExecutionTailPort) {
      return {
        execution_id: execution.execution_id,
        available: false,
        output: null,
        source: 'unavailable',
      };
    }
    return this.craftsmanExecutionTailPort.tail({
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      status: execution.status,
    }, lines) ?? {
      execution_id: execution.execution_id,
      available: false,
      output: null,
      source: 'unavailable',
    };
  }

  listCraftsmanExecutions(taskId: string, subtaskId: string) {
    return this.craftsmanExecutions.listBySubtask(taskId, subtaskId);
  }

  getCraftsmanGovernanceSnapshot() {
    const hostSnapshot = this.hostResourcePort?.readSnapshot() ?? null;
    return {
      limits: {
        max_concurrent_running: this.craftsmanGovernance.maxConcurrentRunning,
        max_concurrent_per_agent: this.craftsmanGovernance.maxConcurrentPerAgent,
        host_memory_warning_utilization_limit: this.craftsmanGovernance.hostMemoryWarningUtilizationLimit,
        host_memory_utilization_limit: this.craftsmanGovernance.hostMemoryUtilizationLimit,
        host_swap_warning_utilization_limit: this.craftsmanGovernance.hostSwapWarningUtilizationLimit,
        host_swap_utilization_limit: this.craftsmanGovernance.hostSwapUtilizationLimit,
        host_load_per_cpu_warning_limit: this.craftsmanGovernance.hostLoadPerCpuWarningLimit,
        host_load_per_cpu_limit: this.craftsmanGovernance.hostLoadPerCpuLimit,
      },
      active_executions: this.craftsmanExecutions.countActiveExecutions(),
      active_by_assignee: this.craftsmanExecutions.listActiveExecutionCountsByAssignee(),
      active_execution_details: this.craftsmanExecutions.listActiveExecutions().map((execution) => {
        const subtask = this.getSubtaskOrThrow(execution.task_id, execution.subtask_id);
        return {
          execution_id: execution.execution_id,
          task_id: execution.task_id,
          subtask_id: execution.subtask_id,
          assignee: subtask.assignee,
          adapter: execution.adapter,
          status: execution.status,
          session_id: execution.session_id,
          workdir: subtask.craftsman_workdir,
        };
      }),
      host_pressure_status: this.resolveHostPressureStatus(hostSnapshot),
      warnings: this.buildHostGovernanceWarnings(hostSnapshot),
      host: hostSnapshot,
    };
  }

  getHealthSnapshot(): UnifiedHealthSnapshotDto {
    const generatedAt = new Date().toISOString();
    const tasks = this.taskRepository.listTasks();
    const taskCounts = {
      total_tasks: tasks.length,
      active_tasks: tasks.filter((task) => task.state === 'active').length,
      paused_tasks: tasks.filter((task) => task.state === 'paused').length,
      blocked_tasks: tasks.filter((task) => task.state === 'blocked').length,
      done_tasks: tasks.filter((task) => task.state === 'done').length,
    };

    const activeBindings = tasks
      .map((task) => this.taskContextBindingRepository.getActiveByTask(task.id))
      .filter((binding): binding is NonNullable<typeof binding> => binding !== null);
    const bindingsByProvider = Array.from(
      activeBindings.reduce((map, binding) => {
        map.set(binding.im_provider, (map.get(binding.im_provider) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));

    const sessions = this.liveSessionStore?.listAll() ?? [];
    const runtimeAgents = Array.from(
      sessions.reduce((map, session) => {
        const current = map.get(session.agent_id) ?? {
          agent_id: session.agent_id,
          status: session.status,
          session_count: 0,
          last_event_at: session.last_event_at,
        };
        current.session_count += 1;
        if (current.last_event_at === null || current.last_event_at < session.last_event_at) {
          current.status = session.status;
          current.last_event_at = session.last_event_at;
        }
        map.set(session.agent_id, current);
        return map;
      }, new Map<string, { agent_id: string; status: 'active' | 'idle' | 'closed'; session_count: number; last_event_at: string | null }>()),
    ).map(([, agent]) => agent).sort((a, b) => a.agent_id.localeCompare(b.agent_id));

    const activeExecutions = this.craftsmanExecutions.listActiveExecutions();
    const governance = this.getCraftsmanGovernanceSnapshot();
    const hostSnapshot = governance.host;
    const hostStatus = !hostSnapshot
      ? 'unavailable'
      : this.isHostHealthDegraded(hostSnapshot)
        ? 'degraded'
        : 'healthy';
    const escalationSnapshot = this.buildEscalationSnapshot(tasks, runtimeAgents);

    return {
      generated_at: generatedAt,
      tasks: {
        status: taskCounts.blocked_tasks > 0 ? 'degraded' : 'healthy',
        ...taskCounts,
      },
      im: {
        status: activeBindings.length > 0 ? 'healthy' : 'unavailable',
        active_bindings: activeBindings.length,
        active_threads: activeBindings.filter((binding) => binding.thread_ref !== null).length,
        bindings_by_provider: bindingsByProvider,
      },
      runtime: {
        status: !this.liveSessionStore
          ? 'unavailable'
          : runtimeAgents.some((agent) => agent.status === 'closed')
            ? 'degraded'
            : 'healthy',
        available: !!this.liveSessionStore,
        stale_after_ms: this.liveSessionStore?.getStaleAfterMs() ?? null,
        active_sessions: sessions.filter((session) => session.status === 'active').length,
        idle_sessions: sessions.filter((session) => session.status === 'idle').length,
        closed_sessions: sessions.filter((session) => session.status === 'closed').length,
        agents: runtimeAgents,
      },
      craftsman: {
        status: activeExecutions.length === 0
          ? 'healthy'
          : activeExecutions.some((execution) => execution.status === 'needs_input' || execution.status === 'awaiting_choice')
            ? 'degraded'
            : 'healthy',
        active_executions: activeExecutions.length,
        queued_executions: activeExecutions.filter((execution) => execution.status === 'queued').length,
        running_executions: activeExecutions.filter((execution) => execution.status === 'running').length,
        waiting_input_executions: activeExecutions.filter((execution) => execution.status === 'needs_input').length,
        awaiting_choice_executions: activeExecutions.filter((execution) => execution.status === 'awaiting_choice').length,
        active_by_assignee: governance.active_by_assignee.map((item) => ({
          label: item.assignee,
          count: item.count,
        })),
      },
      host: {
        status: hostStatus,
        snapshot: hostSnapshot,
      },
      escalation: escalationSnapshot,
    };
  }

  requestRuntimeDiagnosis(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeDiagnosisResultDto {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskRuntimeControl(task, options.caller_id, `runtime diagnosis for agent '${options.agent_ref}'`);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const runtimeResolution = this.resolveTaskRuntimeParticipant(task, options.agent_ref);
    const result = this.runtimeRecoveryPort.requestRuntimeDiagnosis({
      taskId,
      agentRef: options.agent_ref,
      runtimeProvider: runtimeResolution.runtime_provider,
      runtimeActorRef: runtimeResolution.runtime_actor_ref,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'runtime_diagnosis_requested',
      stage_id: task.current_stage,
      detail: {
        agent_ref: options.agent_ref,
        caller_id: options.caller_id,
        status: result.status,
        health: result.health,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.caller_id,
      body: `Runtime diagnosis requested for ${options.agent_ref}.`,
      metadata: {
        event: 'runtime_diagnosis_requested',
        status: result.status,
        health: result.health,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'runtime_diagnosis_requested',
      participantRefs: [options.agent_ref],
      bodyLines: [
        `Agent: ${options.agent_ref}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Health: ${result.health}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
  }

  restartCitizenRuntime(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeRecoveryActionDto {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskRuntimeControl(task, options.caller_id, `runtime restart for agent '${options.agent_ref}'`);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const runtimeResolution = this.resolveTaskRuntimeParticipant(task, options.agent_ref);
    const result = this.runtimeRecoveryPort.restartCitizenRuntime({
      taskId,
      agentRef: options.agent_ref,
      runtimeProvider: runtimeResolution.runtime_provider,
      runtimeActorRef: runtimeResolution.runtime_actor_ref,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'runtime_restart_requested',
      stage_id: task.current_stage,
      detail: {
        agent_ref: options.agent_ref,
        caller_id: options.caller_id,
        status: result.status,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.caller_id,
      body: `Runtime restart requested for ${options.agent_ref}.`,
      metadata: {
        event: 'runtime_restart_requested',
        status: result.status,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'runtime_restart_requested',
      participantRefs: [options.agent_ref],
      bodyLines: [
        `Agent: ${options.agent_ref}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
  }

  stopCraftsmanExecution(executionId: string, options: CraftsmanStopExecutionRequestDto & { caller_id: string }): RuntimeRecoveryActionDto {
    const execution = this.getCraftsmanExecution(executionId);
    if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
      throw new Error(`Craftsman execution ${executionId} is already terminal (status=${execution.status})`);
    }
    const task = this.getTaskOrThrow(execution.task_id);
    const subtask = this.getSubtaskOrThrow(execution.task_id, execution.subtask_id);
    this.assertSubtaskControl(task, subtask, options.caller_id);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const result = this.runtimeRecoveryPort.stopExecution({
      taskId: execution.task_id,
      subtaskId: execution.subtask_id,
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'craftsman_stop_requested',
      stage_id: subtask.stage_id,
      detail: {
        execution_id: execution.execution_id,
        subtask_id: execution.subtask_id,
        caller_id: options.caller_id,
        status: result.status,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(execution.task_id, {
      actor: options.caller_id,
      body: `Craftsman stop requested for execution ${execution.execution_id}.`,
      metadata: {
        event: 'craftsman_stop_requested',
        status: result.status,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_stop_requested',
      bodyLines: [
        `Execution: ${execution.execution_id}`,
        `Subtask: ${execution.subtask_id}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
  }

  sendCraftsmanInputText(executionId: string, text: string, submit = true) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.sendText(execution, text, submit);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'text', text);
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  sendCraftsmanInputKeys(executionId: string, keys: CraftsmanInputKeyDto[]) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.sendKeys(execution, keys);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'keys', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  submitCraftsmanChoice(executionId: string, keys: CraftsmanInputKeyDto[] = []) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.submitChoice(execution, keys);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'choice', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  probeCraftsmanExecution(executionId: string) {
    const execution = this.getCraftsmanExecution(executionId);
    if (!this.craftsmanExecutionProbePort) {
      return { execution, probed: false as const };
    }
    const callback = this.craftsmanExecutionProbePort.probe({
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      status: execution.status,
    });
    if (!callback) {
      return { execution, probed: false as const };
    }
    return {
      ...this.handleCraftsmanCallback(callback),
      probed: true as const,
    };
  }

  observeCraftsmanExecutions(options: ObserveCraftsmanExecutionsOptions): ObserveCraftsmanExecutionsResult {
    const nowMs = (options.now ?? new Date()).getTime();
    const result: ObserveCraftsmanExecutionsResult = {
      scanned: 0,
      probed: 0,
      progressed: 0,
    };
    for (const execution of this.craftsmanExecutions.listActiveExecutions()) {
      result.scanned += 1;
      const lastActivityMs = Date.parse(execution.updated_at ?? execution.started_at ?? execution.created_at);
      if (!Number.isFinite(lastActivityMs)) {
        continue;
      }
      const thresholdMs = execution.status === 'needs_input' || execution.status === 'awaiting_choice'
        ? options.waitingAfterMs
        : options.runningAfterMs;
      if (nowMs - lastActivityMs < thresholdMs) {
        continue;
      }
      const probeState = this.getCraftsmanProbeState(execution.execution_id, lastActivityMs);
      if (!this.shouldProbeCraftsmanExecution(nowMs, thresholdMs, probeState)) {
        continue;
      }
      this.flowLogRepository.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'craftsman_auto_probe',
        stage_id: this.subtaskRepository.listByTask(execution.task_id).find((item) => item.id === execution.subtask_id)?.stage_id ?? null,
        detail: {
          execution_id: execution.execution_id,
          status: execution.status,
        },
        actor: 'system',
      });
      this.noteCraftsmanAutoProbe(execution.execution_id, lastActivityMs, nowMs);
      const probeResult = this.probeCraftsmanExecution(execution.execution_id);
      if (probeResult.probed) {
        result.probed += 1;
        if (probeResult.execution.status !== execution.status) {
          result.progressed += 1;
        }
      }
    }
    return result;
  }

  forceAdvanceTask(taskId: string, options: ForceAdvanceOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const advance = this.stateMachine.advance(task.workflow, task.current_stage);
    this.reconcileStageExitSubtasks(taskId, advance.currentStage.id, 'archived', 'force_advanced');
    this.exitStage(taskId, advance.currentStage.id, 'force_advance');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'force_advance',
      stage_id: task.current_stage,
      detail: { reason: options.reason },
      actor: 'archon',
    });

    if (advance.completesTask) {
      this.runTaskDoneAutomation(task);
      const done = this.taskRepository.updateTask(taskId, task.version, {
        state: TaskState.DONE,
        current_stage: null,
      });
      this.refreshTaskBrainWorkspace(done);
      this.materializeTaskCloseRecap(done, 'archon', options.reason);
      const archiveJob = this.ensureArchiveJobForTask(taskId);
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor: 'archon',
      });
      this.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: 'Force advanced task to done',
        metadata: {
          event: 'force_advance',
          to_state: TaskState.DONE,
        },
      });
      this.publishTaskStatusBroadcast(done, {
        kind: 'task_completed',
        bodyLines: ['Task reached done state and has been queued for archive handling.'],
      });
      this.publishControllerCloseoutReminder(done, archiveJob);
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.taskRepository.updateTask(taskId, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.enterStage(taskId, nextStage.id);
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'stage_advanced',
        stage_id: nextStage.id,
        detail: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor: 'archon',
      });
      this.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: `Force advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'force_advance',
          to_stage: nextStage.id,
        },
      });
      this.reconcileStageParticipants(updated, nextStage);
    }
    return updated;
  }

  confirmTask(taskId: string, options: ConfirmTaskOptions): TaskRecord & { quorum: { approved: number; total: number } } {
    const task = this.getTaskOrThrow(taskId);
    this.assertTaskActive(task);
    const stage = this.getCurrentStageOrThrow(task);
    this.assertStageRosterAction(task, stage, options.voterId, 'confirm');
    this.gateService.routeGateCommand(task, stage, 'confirm', options.voterId);
    const quorum = this.gateService.recordQuorumVote(taskId, stage.id, options.voterId, options.vote, options.comment);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'quorum_vote',
      stage_id: stage.id,
      detail: {
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
      actor: options.voterId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.voterId,
      body: `Quorum vote ${options.vote} (${quorum.approved}/${quorum.total})`,
      metadata: {
        event: 'quorum_vote',
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
    });
    return {
      ...task,
      quorum,
    };
  }

  pauseTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.updateTaskState(taskId, TaskState.PAUSED, options);
  }

  resumeTask(taskId: string): TaskRecord {
    return this.updateTaskState(taskId, TaskState.ACTIVE, { reason: 'resumed' });
  }

  cancelTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.updateTaskState(taskId, TaskState.CANCELLED, options);
  }

  unblockTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.updateTaskState(taskId, TaskState.ACTIVE, options);
  }

  updateTaskState(taskId: string, newState: string, options: UpdateTaskStateOptions): TaskRecord {
    const task = this.getTaskOrThrow(taskId);
    if (!this.stateMachine.validateTransition(task.state as TaskState, newState as TaskState)) {
      throw new Error(`Invalid transition: ${task.state} -> ${newState}`);
    }
    const schedulerSnapshot = this.buildSchedulerSnapshot(task, options.reason);
    const errorDetail = newState === TaskState.ACTIVE ? null : (options.reason ?? task.error_detail);
    const actionEvent = this.getStateActionEvent(task.state as TaskState, newState as TaskState);

    this.db.exec('BEGIN');
    try {
      const actionDetail = this.applyStateTransitionSideEffects(task, newState as TaskState, options);
      const updated = this.taskRepository.updateTask(taskId, task.version, {
        state: newState,
        scheduler_snapshot: schedulerSnapshot,
        error_detail: errorDetail,
      });

      if (newState === TaskState.CANCELLED) {
        this.cancelOpenWork(taskId, options.reason);
      }
      if (newState === TaskState.DONE || newState === TaskState.CANCELLED) {
        this.ensureArchiveJobForTask(taskId);
      }

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: task.current_stage,
        from_state: task.state,
        to_state: newState,
        detail: this.buildStateChangeDetail(options, actionDetail),
        actor: 'system',
      });
      const conversationBody = this.buildStateConversationBody(task.state as TaskState, newState as TaskState, options);
      if (conversationBody) {
        this.mirrorConversationEntry(taskId, {
          actor: 'system',
          body: conversationBody,
          metadata: {
            event: actionEvent ?? 'state_changed',
            from_state: task.state,
            to_state: newState,
            ...(options.reason ? { reason: options.reason } : {}),
          },
        });
      }
      if (actionEvent) {
        this.flowLogRepository.insertFlowLog({
          task_id: taskId,
          kind: 'flow',
          event: actionEvent,
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: newState,
          detail: this.buildStateChangeDetail(options, actionDetail),
          actor: 'system',
        });
      }
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.craftsmanCallbacks.resumeDeferredCallbacks(taskId);
        this.failMissingCraftsmanSessionsOnResume(taskId);
      }
      this.db.exec('COMMIT');
      this.refreshTaskBrainWorkspace(updated);
      const broadcast = () => this.publishTaskStateBroadcast(updated, task.state as TaskState, newState as TaskState, options.reason);
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason, broadcast);
      } else {
        broadcast();
        this.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason);
      }
      return updated;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  promoteTodo(todoId: number, options: PromoteTodoRequestDto) {
    const todo = this.todoRepository.getTodo(todoId);
    if (!todo) {
      throw new NotFoundError(`Todo ${todoId} not found`);
    }
    if (todo.promoted_to) {
      throw new Error(`Todo ${todoId} already promoted to ${todo.promoted_to}`);
    }
    const task = this.createTask({
      title: todo.text,
      type: options.type,
      creator: options.creator,
      description: '',
      priority: options.priority,
      locale: 'zh-CN',
      ...(todo.project_id ? { project_id: todo.project_id } : {}),
    });
    const updatedTodo = this.todoRepository.updateTodo(todoId, {
      promoted_to: task.id,
    });
    return { todo: updatedTodo, task };
  }

  cleanupOrphaned(taskId?: string): number {
    const rows = taskId
      ? (this.db.prepare("SELECT id FROM tasks WHERE id = ? AND state = 'orphaned'").all(taskId) as Array<{ id: string }>)
      : (this.db.prepare("SELECT id FROM tasks WHERE state = 'orphaned'").all() as Array<{ id: string }>);

    let count = 0;
    for (const row of rows) {
      const orphanedTaskId = row.id;
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM craftsman_executions WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM flow_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM progress_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM stage_history WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM archon_reviews WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM approvals WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM quorum_votes WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(orphanedTaskId);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      count += 1;
    }
    return count;
  }

  startupRecoveryScan(): StartupRecoveryScanResult {
    const result: StartupRecoveryScanResult = {
      scanned_tasks: 0,
      blocked_tasks: 0,
      failed_subtasks: 0,
      failed_executions: 0,
    };

    for (const task of this.taskRepository.listTasks(TaskState.ACTIVE)) {
      result.scanned_tasks += 1;
      const schedulerSnapshot = this.buildSchedulerSnapshot(task, 'startup_recovery_scan');

      this.db.exec('BEGIN');
      try {
        const impacts = this.failMissingCraftsmanSessions(task.id, {
          event: 'craftsman_session_missing_on_startup',
          messagePrefix: 'Craftsman session not alive on startup recovery',
        });

        if (impacts.length === 0) {
          this.db.exec('COMMIT');
          continue;
        }

        const reason = 'startup recovery blocked task after missing craftsmen sessions';
        this.taskRepository.updateTask(task.id, task.version, {
          state: TaskState.BLOCKED,
          error_detail: reason,
          scheduler_snapshot: schedulerSnapshot,
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'state_changed',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: TaskState.BLOCKED,
          detail: {
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
          actor: 'system',
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'blocked',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: TaskState.BLOCKED,
          detail: {
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
          actor: 'system',
        });
        this.mirrorConversationEntry(task.id, {
          actor: 'system',
          body: `Task blocked: ${reason}`,
          metadata: {
            event: 'blocked',
            from_state: task.state,
            to_state: TaskState.BLOCKED,
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
        });
        this.db.exec('COMMIT');

        result.blocked_tasks += 1;
        result.failed_subtasks += impacts.length;
        result.failed_executions += impacts.reduce((sum, impact) => sum + impact.execution_ids.length, 0);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    return result;
  }

  probeInactiveTasks(options: InactiveTaskProbeOptions): InactiveTaskProbeResult {
    const thresholds = this.resolveEscalationPolicy(options);
    const now = options.now ?? new Date();
    const result: InactiveTaskProbeResult = {
      scanned_tasks: 0,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    };

    for (const task of this.taskRepository.listTasks(TaskState.ACTIVE)) {
      result.scanned_tasks += 1;
      const latestActivityMs = this.resolveLatestBusinessActivityMs(task);
      const idleMs = now.getTime() - latestActivityMs;
      const controllerRef = resolveControllerRef(task.team.members);
      const interactiveRefs = task.team.members.filter(isInteractiveParticipant).map((member) => member.agentId);
      const probeState = this.getProbeState(task.id, latestActivityMs);
      const approvalWaitProbe = this.resolveApprovalWaitProbe(task);

      if (approvalWaitProbe) {
        if (idleMs >= thresholds.controllerAfterMs && !probeState.humanApprovalNotified && approvalWaitProbe.participantRefs.length > 0) {
          this.publishTaskStatusBroadcast(task, {
            kind: 'human_approval_pinged',
            participantRefs: approvalWaitProbe.participantRefs,
            ensureParticipantRefsJoined: approvalWaitProbe.participantRefs,
            bodyLines: [
              `Task is waiting for human approval and has remained idle for ${Math.round(idleMs / 1000)} seconds.`,
              `Approval Request: ${approvalWaitProbe.request.id}`,
              'Please review the pending approval and decide in Dashboard or the task thread.',
            ],
          });
          this.flowLogRepository.insertFlowLog({
            task_id: task.id,
            kind: 'flow',
            event: 'human_approval_pinged',
            stage_id: task.current_stage,
            detail: {
              idle_ms: idleMs,
              approval_request_id: approvalWaitProbe.request.id,
              participant_refs: approvalWaitProbe.participantRefs,
            },
            actor: 'system',
          });
          result.human_pings += 1;
          continue;
        }

        if (idleMs >= thresholds.inboxAfterMs && !probeState.inboxRaised) {
          this.inboxRepository.insertInboxItem({
            text: `Task ${task.id} is awaiting human approval`,
            source: 'inbox_escalated',
            notes: `Task ${task.id} has waited ${Math.round(idleMs / 1000)} seconds for human approval at stage ${task.current_stage ?? '-'}.`,
            tags: ['task', 'approval_waiting'],
            metadata: {
              task_id: task.id,
              kind: 'inbox_escalated',
              current_stage: task.current_stage,
              idle_ms: idleMs,
              reason: 'approval_waiting',
              approval_request_id: approvalWaitProbe.request.id,
            },
          });
          this.flowLogRepository.insertFlowLog({
            task_id: task.id,
            kind: 'flow',
            event: 'inbox_escalated',
            stage_id: task.current_stage,
            detail: {
              idle_ms: idleMs,
              reason: 'approval_waiting',
              approval_request_id: approvalWaitProbe.request.id,
            },
            actor: 'system',
          });
          result.inbox_items += 1;
        }
        continue;
      }

      if (idleMs < thresholds.controllerAfterMs) {
        continue;
      }

      if (!probeState.controllerNotified && controllerRef) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'controller_pinged',
          participantRefs: [controllerRef],
          bodyLines: [
            `Task appears inactive for ${Math.round(idleMs / 1000)} seconds.`,
            'No meaningful progress has been detected. Please inspect the thread and continue orchestration.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'controller_pinged',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, controller_ref: controllerRef },
          actor: 'system',
        });
        result.controller_pings += 1;
        continue;
      }

      if (idleMs >= thresholds.rosterAfterMs && probeState.controllerNotified && !probeState.rosterNotified && interactiveRefs.length > 0) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'roster_pinged',
          participantRefs: interactiveRefs,
          bodyLines: [
            `Task remains inactive for ${Math.round(idleMs / 1000)} seconds after controller probe.`,
            'Interactive roster should check the thread, unblock the current stage, and continue execution.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'roster_pinged',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, participant_refs: interactiveRefs },
          actor: 'system',
        });
        result.roster_pings += 1;
        continue;
      }

      if (idleMs >= thresholds.inboxAfterMs && probeState.rosterNotified && !probeState.inboxRaised) {
        this.inboxRepository.insertInboxItem({
          text: `Task ${task.id} appears stuck`,
          source: 'inbox_escalated',
          notes: `Task ${task.id} has remained inactive for ${Math.round(idleMs / 1000)} seconds at stage ${task.current_stage ?? '-'}.`,
          tags: ['task', 'stuck'],
          metadata: {
            task_id: task.id,
            kind: 'inbox_escalated',
            current_stage: task.current_stage,
            idle_ms: idleMs,
          },
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'inbox_escalated',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs },
          actor: 'system',
        });
        result.inbox_items += 1;
      }
    }

    return result;
  }

  private buildWorkflow(template: TaskTemplate): WorkflowDto {
    return {
      type: template.defaultWorkflow ?? 'linear',
      stages: template.stages ?? [],
      ...(template.graph ? { graph: template.graph } : {}),
    };
  }

  private buildTaskBlueprint(task: TaskRecord): TaskBlueprintDto {
    if (task.workflow.graph) {
      const graph = task.workflow.graph;
      return {
        graph_version: graph.graph_version,
        entry_nodes: [...graph.entry_nodes],
        controller_ref: resolveControllerRef(task.team.members),
        nodes: graph.nodes.map((node) => ({
          id: node.id,
          name: node.name ?? null,
          mode: resolveStageModeFromExecutionKind(node.execution_kind ?? null),
          execution_kind: node.execution_kind ?? null,
          ...(node.allowed_actions?.length ? { allowed_actions: node.allowed_actions } : {}),
          ...(node.roster ? { roster: node.roster } : {}),
          gate_type: node.gate?.type ?? null,
        })),
        edges: graph.edges
          .filter((edge): edge is typeof edge & { kind: 'advance' | 'reject' | 'branch' | 'complete' } => edge.kind === 'advance' || edge.kind === 'reject' || edge.kind === 'branch' || edge.kind === 'complete')
          .map((edge) => ({
            from: edge.from,
            to: edge.to,
            kind: edge.kind,
          })),
        artifact_contracts: graph.nodes
          .filter((node) => node.execution_kind === 'citizen_execute' || node.execution_kind === 'craftsman_dispatch')
          .map((node) => ({
            node_id: node.id,
            artifact_type: 'stage_output',
          })),
        role_bindings: task.team.members,
      };
    }
    const stages = task.workflow.stages ?? [];
    const nodes: TaskBlueprintDto['nodes'] = stages.map((stage) => ({
      id: stage.id,
      name: stage.name ?? null,
      mode: stage.mode ?? null,
      execution_kind: resolveStageExecutionKind(stage),
      ...(resolveAllowedActions(stage).length > 0 ? { allowed_actions: resolveAllowedActions(stage) } : {}),
      ...(stage.roster ? { roster: stage.roster } : {}),
      gate_type: stage.gate?.type ?? null,
    }));

    const edges: TaskBlueprintDto['edges'] = [];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      const nextStageId = stages[index + 1]?.id;
      if (nextStageId) {
        edges.push({
          from: stage.id,
          to: nextStageId,
          kind: 'advance',
        });
      }
      if (stage.reject_target) {
        edges.push({
          from: stage.id,
          to: stage.reject_target,
          kind: 'reject',
        });
      }
    }

    return {
      graph_version: 1,
      entry_nodes: stages[0] ? [stages[0].id] : [],
      controller_ref: resolveControllerRef(task.team.members),
      nodes,
      edges,
      artifact_contracts: stages
        .filter((stage) => stage.mode === 'execute')
        .map((stage) => ({
          node_id: stage.id,
          artifact_type: 'stage_output',
        })),
      role_bindings: task.team.members,
    };
  }

  private buildTeam(template: TaskTemplate): TaskRecord['team'] {
    const members = Object.entries(template.defaultTeam ?? {}).map(([role, config]) => ({
      role,
      agentId: config.suggested?.[0] ?? role,
      ...(config.member_kind ? { member_kind: config.member_kind } : {}),
      model_preference: config.model_preference ?? '',
    }));
    return { members };
  }

  private buildTaskBrainWorkspaceRequest(task: TaskRecord, templateId: string) {
    const projectBrainContexts = this.buildProjectBrainContexts(task);
    return {
      task_id: task.id,
      project_id: task.project_id ?? null,
      locale: task.locale,
      title: task.title,
      description: task.description ?? '',
      type: task.type,
      priority: task.priority,
      creator: task.creator,
      template_id: templateId,
      control_mode: task.control?.mode ?? 'normal',
      state: task.state,
      controller_ref: resolveControllerRef(task.team.members),
      current_stage: task.current_stage,
      current_stage_participants: this.stageRosterService.resolveDesiredRefs(
        task.team,
        task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : undefined,
      ),
      workflow_stages: (task.workflow.stages ?? []).map((stage) => ({
        id: stage.id,
        ...(stage.name ? { name: stage.name } : {}),
        ...(stage.mode ? { mode: stage.mode } : {}),
        ...(stage.execution_kind ? { execution_kind: stage.execution_kind } : {}),
        ...(stage.allowed_actions ? { allowed_actions: stage.allowed_actions } : {}),
        ...(stage.roster ? { roster: stage.roster } : {}),
        ...(stage.gate ? { gate: { ...(stage.gate.type ? { type: stage.gate.type } : {}) } } : {}),
      })),
      team_members: task.team.members.map((member) => ({
        role: member.role,
        agentId: member.agentId,
        ...(member.member_kind ? { member_kind: member.member_kind } : {}),
        model_preference: member.model_preference,
        ...(member.agent_origin ? { agent_origin: member.agent_origin } : {}),
        ...(member.briefing_mode ? { briefing_mode: member.briefing_mode } : {}),
      })),
      ...(projectBrainContexts
        ? {
            project_brain_contexts: projectBrainContexts,
          }
        : {}),
    } satisfies Parameters<NonNullable<TaskBrainWorkspacePort>['createWorkspace']>[0];
  }

  private buildProjectBrainContexts(task: TaskRecord): Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> | null {
    if (!task.project_id || !this.projectBrainAutomationService) {
      return null;
    }
    const allowedCitizenIds = task.team.members
      .filter((member) => member.member_kind === 'citizen')
      .map((member) => member.agentId);
    const contexts: Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> = {};
    for (const audience of TASK_BRAIN_CONTEXT_AUDIENCES) {
      const context = this.projectBrainAutomationService.buildBootstrapContext({
        project_id: task.project_id,
        task_id: task.id,
        task_title: task.title,
        ...(task.description ? { task_description: task.description } : {}),
        ...(allowedCitizenIds.length > 0 ? { allowed_citizen_ids: allowedCitizenIds } : {}),
        audience,
      });
      contexts[audience] = {
        audience: context.audience,
        source_documents: context.source_documents,
        markdown: context.markdown,
      };
    }
    return contexts;
  }

  private refreshTaskBrainWorkspace(task: TaskRecord) {
    if (!this.taskBrainWorkspacePort || !this.taskBrainBindingService) {
      return;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    this.taskBrainWorkspacePort.updateWorkspace({
      brain_pack_ref: binding.brain_pack_ref,
      brain_task_id: binding.brain_task_id,
      workspace_path: binding.workspace_path,
      metadata: binding.metadata,
    }, this.buildTaskBrainWorkspaceRequest(task, task.type));
  }

  private materializeExecutionBrief(
    task: TaskRecord,
    input: {
      subtask_id: string;
      subtask_title: string;
      assignee: string;
      adapter: string;
      mode: 'one_shot' | 'interactive';
      prompt: string | null;
      workdir: string | null;
    },
  ): string | null {
    if (!this.taskBrainWorkspacePort || !this.taskBrainBindingService) {
      return null;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return null;
    }
    const workspacePath = binding.workspace_path;
    const roleBriefPath = join(workspacePath, '05-agents', input.assignee, '00-role-brief.md');
    const projectBrainContextPath = resolveProjectBrainContextPath(
      workspacePath,
      resolveTaskBrainContextAudienceForAssignee(task, input.assignee),
    );
    const currentStage = task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : null;
    const controllerRef = resolveControllerRef(task.team.members);
    const currentStageParticipants = this.stageRosterService.resolveDesiredRefs(task.team, currentStage ?? undefined);
    const orderedParticipants = controllerRef && currentStageParticipants.includes(controllerRef)
      ? [controllerRef, ...currentStageParticipants.filter((participantRef) => participantRef !== controllerRef)]
      : currentStageParticipants;
    return this.taskBrainWorkspacePort.writeExecutionBrief({
      brain_pack_ref: binding.brain_pack_ref,
      brain_task_id: binding.brain_task_id,
      workspace_path: binding.workspace_path,
      metadata: binding.metadata,
    }, {
      task_id: task.id,
      project_id: task.project_id ?? null,
      locale: task.locale,
      title: task.title,
      description: task.description ?? '',
      controller_ref: controllerRef,
      current_stage: task.current_stage,
      current_stage_participants: orderedParticipants,
      subtask_id: input.subtask_id,
      subtask_title: input.subtask_title,
      assignee: input.assignee,
      adapter: input.adapter,
      mode: input.mode,
      prompt: input.prompt,
      workdir: input.workdir,
      references: {
        current_path: join(workspacePath, '00-current.md'),
        task_brief_path: join(workspacePath, '01-task-brief.md'),
        roster_path: join(workspacePath, '02-roster.md'),
        stage_state_path: join(workspacePath, '03-stage-state.md'),
        role_brief_path: existsSync(roleBriefPath) ? roleBriefPath : null,
        project_brain_context_path: existsSync(projectBrainContextPath) ? projectBrainContextPath : null,
      },
    }).brief_path;
  }

  private enrichTeam(team: TaskRecord['team']): TaskRecord['team'] {
    return {
      members: team.members.map((member) => {
        const resolved = this.agentRuntimePort?.resolveAgent(member.agentId);
        const agentOrigin: 'agora_managed' | 'user_managed' = member.agent_origin
          ?? resolved?.agent_origin
          ?? 'user_managed';
        const briefingMode: 'overlay_full' | 'overlay_delta' = member.briefing_mode
          ?? resolved?.briefing_mode
          ?? (agentOrigin === 'agora_managed' ? 'overlay_delta' : 'overlay_full');
        return {
          ...member,
          agent_origin: agentOrigin,
          briefing_mode: briefingMode,
        };
      }),
    };
  }

  private loadTemplate(taskType: string): TaskTemplate {
    const stored = this.templateRepository.getTemplate(taskType);
    if (!stored) {
      throw new NotFoundError(`Template not found: ${taskType}`);
    }
    return stored.template as TaskTemplate;
  }

  private tryLoadTemplate(taskType: string): TaskTemplate | null {
    const stored = this.templateRepository.getTemplate(taskType);
    return stored ? stored.template as TaskTemplate : null;
  }

  private getTaskOrThrow(taskId: string): TaskRecord {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  private withControllerRef(task: TaskRecord): TaskRecord & {
    controller_ref: string | null;
    authority: ReturnType<TaskAuthorityService['getTaskAuthority']>;
  } {
    return {
      ...task,
      authority: this.taskAuthorities.getTaskAuthority(task.id),
      controller_ref: resolveControllerRef(task.team.members),
    };
  }

  private assertApprovalAuthority(task: TaskRecord, actorAccountId: number | null) {
    const authority = this.taskAuthorities.getTaskAuthority(task.id);
    const requiredApproverAccountId = authority?.approver_account_id ?? null;
    if (requiredApproverAccountId == null) {
      return;
    }
    if (actorAccountId == null || actorAccountId !== requiredApproverAccountId) {
      throw new PermissionDeniedError(`task ${task.id} requires approver account ${requiredApproverAccountId}`);
    }
  }

  private getCurrentStageOrThrow(task: TaskRecord) {
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    return this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
  }

  private assertTaskActive(task: TaskRecord) {
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${task.id} is in state '${task.state}', expected 'active'`);
    }
  }

  private assertStageRosterAction(
    task: TaskRecord,
    stage: WorkflowStageLike,
    callerId: string,
    action: 'advance' | 'approve' | 'reject' | 'confirm' | 'archon-approve' | 'archon-reject',
  ) {
    const controllerRef = resolveControllerRef(task.team.members);
    if (this.permissions.isArchon(callerId) || (controllerRef !== null && callerId === controllerRef)) {
      return;
    }
    const desiredRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage);
    if (desiredRefs.includes(callerId)) {
      return;
    }
    throw new PermissionDeniedError(`caller ${callerId} is outside current stage roster for ${action}`);
  }

  private getStageByIdOrThrow(task: TaskRecord, stageId: string) {
    const stage = (task.workflow.stages ?? []).find((item) => item.id === stageId);
    if (!stage) {
      throw new Error(`Task ${task.id} is missing workflow stage '${stageId}'`);
    }
    return stage;
  }

  private buildBootstrapMessages(
    task: TaskRecord,
    brainWorkspace: ReturnType<NonNullable<TaskBrainWorkspacePort['createWorkspace']>> | null,
    imParticipantRefs: string[],
  ): IMPublishMessageInput[] {
    const skillCatalog = new Map<string, SkillCatalogEntry>(
      (this.skillCatalogPort?.listSkills({ refresh: true }) ?? []).map((entry) => [entry.skill_ref, entry]),
    );
    return this.taskBroadcastService.buildBootstrapMessages({
      task,
      workspacePath: brainWorkspace?.workspace_path ?? null,
      imParticipantRefs,
      skillCatalog,
    });
  }

  private publishGateDecisionBroadcast(
    task: TaskRecord,
    input: {
      decision: 'approved' | 'rejected';
      reviewer: string;
      gateType: 'approval' | 'archon_review';
      comment?: string;
      reason?: string;
    },
  ) {
    this.taskBroadcastService.publishGateDecisionBroadcast(task, input);
  }

  private materializeTaskCloseRecap(task: TaskRecord, actor: string, reason?: string) {
    if (!task.project_id || !this.taskBrainBindingService) {
      return;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    const proposal = this.projectContextWriter.buildTaskCloseoutProposal({
      task,
      binding,
      actor,
      ...(reason ? { reason } : {}),
    });
    this.projectContextWriter.applyTaskCloseoutProposal(proposal);
  }

  private ensureApprovalRequestForGate(
    task: TaskRecord,
    stage: NonNullable<TaskRecord['workflow']['stages']>[number],
    requester: string,
  ) {
    const gateType = stage.gate?.type;
    if (gateType !== 'approval' && gateType !== 'archon_review') {
      return null;
    }
    const existing = this.approvalRequestRepository.getLatestPending(task.id, stage.id);
    if (existing) {
      return {
        request: existing,
        shouldBroadcast: false,
      };
    }
    const brainBinding = this.taskBrainBindingService?.getActiveBinding(task.id) ?? null;
    return {
      request: this.approvalRequestRepository.insert({
      task_id: task.id,
      stage_id: stage.id,
      gate_type: gateType,
      requested_by: requester,
      summary_path: brainBinding ? join(brainBinding.workspace_path, '00-current.md') : null,
      metadata: {
        controller_ref: resolveControllerRef(task.team.members),
        current_stage: task.current_stage,
        waiting_broadcasted_at: new Date().toISOString(),
      },
      }),
      shouldBroadcast: true,
    };
  }

  private resolvePendingApprovalRequest(
    taskId: string,
    stageId: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    resolutionComment: string,
  ) {
    const pending = this.approvalRequestRepository.getLatestPending(taskId, stageId);
    if (!pending) {
      return null;
    }
    return this.approvalRequestRepository.resolve(pending.id, {
      status,
      resolved_by: resolvedBy,
      resolution_comment: resolutionComment,
      metadata: {
        ...(pending.metadata ?? {}),
        resolution_source: 'task_action',
      },
    });
  }

  private publishTaskStateBroadcast(
    task: TaskRecord,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
  ) {
    this.taskBroadcastService.publishTaskStateBroadcast(task, fromState, toState, reason);
  }

  private publishControllerCloseoutReminder(task: TaskRecord, archiveJob: ReturnType<TaskService['ensureArchiveJobForTask']>) {
    const closeout = (archiveJob.payload as Record<string, unknown> | null)?.closeout_review as Record<string, unknown> | undefined;
    const workspacePath = typeof closeout?.workspace_path === 'string' ? closeout.workspace_path : null;
    const harvestDraftPath = typeof closeout?.harvest_draft_path === 'string' ? closeout.harvest_draft_path : null;
    const nomosRuntime = closeout?.nomos_runtime && typeof closeout.nomos_runtime === 'object'
      ? closeout.nomos_runtime as Record<string, unknown>
      : null;
    const closeoutPromptPath = typeof nomosRuntime?.closeout_review_prompt_path === 'string'
      ? nomosRuntime.closeout_review_prompt_path
      : null;
    this.taskBroadcastService.publishControllerCloseoutReminder(task, {
      workspacePath,
      harvestDraftPath,
      closeoutPromptPath,
    });
  }

  private publishTaskStatusBroadcast(
    task: TaskRecord,
    input: {
      kind: string;
      bodyLines: string[];
      participantRefs?: string[];
      occurredAt?: string;
      ensureParticipantRefsJoined?: string[];
    },
  ) {
    this.taskBroadcastService.publishTaskStatusBroadcast(task, input);
  }

  private buildSmokeStageEntryCommands(task: TaskRecord, stage: WorkflowStageLike): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    const executionKind = resolveStageExecutionKind(stage);
    const controllerRef = resolveControllerRef(task.team.members) ?? 'controller';
    if (executionKind !== 'citizen_execute' && executionKind !== 'craftsman_dispatch') {
      return [];
    }
    return [
      '',
      'Smoke Next Step:',
      `- Controller should create execute-mode subtasks now: \`agora subtasks create ${task.id} --caller-id ${controllerRef} --file subtasks.json\``,
      '- Every subtask must declare `execution_target` explicitly: use `craftsman` for auto-dispatch or `manual` for purely human/agent work.',
      '- In smoke mode, craftsman-capable stages should use `execution_target: "craftsman"` plus a full `craftsman` block.',
    ];
  }

  private buildSmokeSubtaskCommands(
    task: TaskRecord,
    callerId: string,
    createdSubtasks: Array<{ id: string }>,
    dispatchedExecutions: Array<{ execution_id: string }>,
  ): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    const lines = [
      '',
      'Smoke Next Step:',
      `- If no execution was auto-dispatched, dispatch from a subtask explicitly: \`agora craftsman dispatch ${task.id} <subtaskId> <adapter> --caller-id ${callerId}\``,
      `- Inspect subtasks now: \`agora subtasks list ${task.id}\``,
    ];
    if (dispatchedExecutions.length > 0) {
      const first = dispatchedExecutions[0]!;
      lines.push(`- First execution ready: \`${first.execution_id}\``);
      lines.push(`- If it pauses for input, continue with: \`agora craftsman input-text ${first.execution_id} "<text>"\``);
    } else if (createdSubtasks.length > 0) {
      lines.push('- No execution was auto-dispatched. If this was supposed to be a craftsman run, recreate the subtask with `execution_target: "craftsman"` and a full `craftsman` block.');
    }
    return lines;
  }

  private sendImmediateCraftsmanNotification(taskId: string, executionId: string, subtaskId: string) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }
    const execution = this.craftsmanExecutions.getExecution(executionId);
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!execution || !subtask) {
      return;
    }
    this.taskBroadcastService.publishCraftsmanExecutionUpdate({
      task,
      subtask,
      execution,
    });
  }

  private rewindRejectedStage(
    task: TaskRecord,
    currentStageId: string,
    decisionEvent: 'rejected' | 'archon_rejected',
    actor: string,
    reason: string,
  ): TaskRecord {
    const rejectStage = this.stateMachine.getRejectStage(task.workflow, currentStageId);
    if (!rejectStage) {
      return task;
    }

    this.reconcileStageExitSubtasks(task.id, currentStageId, 'archived', decisionEvent);
    this.exitStage(task.id, currentStageId, decisionEvent);
    const updated = this.taskRepository.updateTask(task.id, task.version, {
      current_stage: rejectStage.id,
    });
    this.enterStage(task.id, rejectStage.id);
    this.flowLogRepository.insertFlowLog({
      task_id: task.id,
      kind: 'flow',
      event: 'stage_rewound',
      stage_id: rejectStage.id,
      detail: {
        from_stage: currentStageId,
        to_stage: rejectStage.id,
        reason,
        decision_event: decisionEvent,
      },
      actor,
    });
    this.progressLogRepository.insertProgressLog({
      task_id: task.id,
      kind: 'progress',
      stage_id: rejectStage.id,
      content: `Rewound to stage ${rejectStage.id} after ${decisionEvent}`,
      artifacts: {
        from_stage: currentStageId,
        to_stage: rejectStage.id,
        reason,
      },
      actor,
    });
    this.refreshTaskBrainWorkspace(updated);
    this.reconcileStageParticipants(updated, rejectStage);
    return updated;
  }

  private collectImParticipantRefs(
    task: Pick<TaskRecord, 'team'>,
    stage: WorkflowStageLike | null,
    explicitRefs?: string[] | null,
  ): string[] {
    const rosterRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage ?? undefined);
    return Array.from(new Set([
      ...rosterRefs,
      ...(explicitRefs ?? []),
    ]));
  }

  private buildCurrentStageRoster(task: TaskRecord): TaskStatusDto['current_stage_roster'] {
    if (!task.current_stage) {
      return undefined;
    }
    const stage = this.getStageByIdOrThrow(task, task.current_stage);
    const desiredParticipantRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage);
    const controllerRef = resolveControllerRef(task.team.members);
    const orderedDesiredParticipantRefs = controllerRef && desiredParticipantRefs.includes(controllerRef)
      ? [controllerRef, ...desiredParticipantRefs.filter((participantRef) => participantRef !== controllerRef)]
      : desiredParticipantRefs;
    const participants = this.taskParticipationService?.listParticipants(task.id) ?? [];
    const joinedParticipantRefs = participants
      .filter((participant) => participant.join_status === 'joined')
      .map((participant) => participant.agent_ref)
      .filter((participantRef) => orderedDesiredParticipantRefs.includes(participantRef));
    const runtimeSessions = this.taskParticipationService?.listRuntimeSessions(task.id) ?? [];
    const runtimeByParticipantId = new Map(runtimeSessions.map((session) => [session.participant_binding_id, session]));
    return {
      stage_id: stage.id,
      roster: stage.roster ?? undefined,
      desired_participant_refs: orderedDesiredParticipantRefs,
      joined_participant_refs: joinedParticipantRefs,
      participant_states: participants.map((participant) => {
        const runtime = runtimeByParticipantId.get(participant.id);
        return {
          agent_ref: participant.agent_ref,
          task_role: participant.task_role,
          join_status: participant.join_status,
          desired_exposure: participant.desired_exposure as 'in_thread' | 'hidden',
          exposure_reason: participant.exposure_reason,
          runtime_provider: runtime?.runtime_provider ?? participant.runtime_provider,
          runtime_session_ref: runtime?.runtime_session_ref ?? null,
          presence_state: runtime?.presence_state ?? null,
          runtime_binding_reason: runtime?.binding_reason ?? null,
          desired_runtime_presence: (runtime?.desired_runtime_presence as 'attached' | 'detached' | null | undefined) ?? null,
          runtime_reconcile_stage_id: runtime?.reconcile_stage_id ?? null,
          runtime_reconciled_at: runtime?.reconciled_at ?? null,
          runtime_closed_at: runtime?.closed_at ?? null,
        };
      }),
    };
  }

  private getApproverRole(stage: NonNullable<TaskRecord['workflow']['stages']>[number]) {
    const raw = stage.gate?.approver_role ?? stage.gate?.approver;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'reviewer';
  }

  private buildSchedulerSnapshot(task: TaskRecord, reason: string) {
    const pendingSubtasks = this.subtaskRepository
      .listByTask(task.id)
      .filter((subtask) => !TERMINAL_SUBTASK_STATES.has(subtask.status))
      .map((subtask) => ({
        id: subtask.id,
        stage_id: subtask.stage_id,
        status: subtask.status,
        dispatch_status: subtask.dispatch_status,
      }));

    const inflightExecutions = pendingSubtasks.flatMap((subtask) => this.craftsmanExecutions
      .listBySubtask(task.id, subtask.id)
      .filter((execution) => !TERMINAL_EXECUTION_STATUSES.has(execution.status))
      .map((execution) => ({
        execution_id: execution.execution_id,
        subtask_id: execution.subtask_id,
        status: execution.status,
        adapter: execution.adapter,
      })));

    return {
      captured_at: new Date().toISOString(),
      reason,
      state: task.state,
      current_stage: task.current_stage,
      error_detail: task.error_detail,
      pending_subtasks: pendingSubtasks,
      inflight_executions: inflightExecutions,
    };
  }

  private applyStateTransitionSideEffects(task: TaskRecord, newState: TaskState, options: UpdateTaskStateOptions) {
    if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
      return {
        action: 'resume',
        resumed_subtasks: this.resumeArchivedSubtasks(task),
      };
    }
    if (newState === TaskState.PAUSED) {
      return {
        action: 'pause',
        archived_subtasks: this.archiveOpenSubtasks(task.id, 'task_paused'),
      };
    }
    if (task.state === TaskState.BLOCKED && newState === TaskState.ACTIVE) {
      if (options.action === 'retry') {
        return {
          action: 'retry',
          retried_subtasks: this.retryFailedSubtasks(task),
        };
      }
      if (options.action === 'skip') {
        return {
          action: 'skip',
          skipped_subtasks: this.skipFailedSubtasks(task, options.reason),
        };
      }
      if (options.action === 'reassign') {
        if (!options.assignee) {
          throw new Error('unblock action=reassign requires assignee');
        }
        return {
          action: 'reassign',
          reassigned_subtasks: this.reassignFailedSubtasks(task, options.assignee, options.craftsman_type),
          assignee: options.assignee,
          craftsman_type: options.craftsman_type ?? null,
        };
      }
    }
    return options.action ? { action: options.action } : undefined;
  }

  private assertCraftsmanGovernanceForSubtasks(subtasks: CreateSubtasksRequestDto['subtasks']) {
    const plannedByAssignee = new Map<string, number>();
    for (const subtask of subtasks) {
      if (!subtask.craftsman) {
        continue;
      }
      plannedByAssignee.set(subtask.assignee, (plannedByAssignee.get(subtask.assignee) ?? 0) + 1);
    }
    for (const [assignee, planned] of plannedByAssignee) {
      this.assertCraftsmanDispatchAllowed(assignee, planned);
    }
  }

  private assertCraftsmanDispatchAllowed(assignee: string, additionalPlanned = 1) {
    this.assertHostResourcesAllowDispatch();
    const limit = this.craftsmanGovernance.maxConcurrentPerAgent;
    if (limit === null) {
      return;
    }
    const active = this.craftsmanExecutions.countActiveExecutionsByAssignee(assignee);
    if (active + additionalPlanned > limit) {
      throw new Error(
        `Craftsman per-agent concurrency limit exceeded for ${assignee}: ${active + additionalPlanned}/${limit}`,
      );
    }
  }

  private assertCraftsmanInteractionGuard(
    mode: 'one_shot' | 'interactive',
    interactionExpectation: 'one_shot' | 'needs_input' | 'awaiting_choice',
    scope: string,
  ) {
    if (mode === 'one_shot' && interactionExpectation !== 'one_shot') {
      throw new Error(
        `${scope} declares interaction_expectation='${interactionExpectation}', but execution_mode='one_shot' only supports one-pass runs. Use execution_mode='interactive' for continued input or menu loops.`,
      );
    }
  }

  private assertHostResourcesAllowDispatch() {
    if (!this.hostResourcePort) {
      return;
    }
    const snapshot = this.hostResourcePort.readSnapshot();
    if (!snapshot) {
      return;
    }
    const memoryLimit = this.craftsmanGovernance.hostMemoryUtilizationLimit;
    const memoryPressure = snapshot.memory_pressure ?? null;
    const useDarwinPressure = snapshot.platform === 'darwin' && memoryPressure !== null;
    if (
      memoryLimit !== null
      && useDarwinPressure
      && memoryPressure !== null
      && memoryPressure > memoryLimit
    ) {
      throw new Error(
        `Host memory pressure ${memoryPressure.toFixed(2)} exceeds limit ${memoryLimit.toFixed(2)}`,
      );
    }
    if (
      memoryLimit !== null
      && !useDarwinPressure
      && snapshot.memory_utilization !== null
      && snapshot.memory_utilization > memoryLimit
    ) {
      throw new Error(
        `Host memory utilization ${snapshot.memory_utilization.toFixed(2)} exceeds limit ${memoryLimit.toFixed(2)}`,
      );
    }
    const swapLimit = this.craftsmanGovernance.hostSwapUtilizationLimit;
    if (
      !useDarwinPressure
      && 
      swapLimit !== null
      && snapshot.swap_utilization !== null
      && snapshot.swap_utilization > swapLimit
    ) {
      throw new Error(
        `Host swap utilization ${snapshot.swap_utilization.toFixed(2)} exceeds limit ${swapLimit.toFixed(2)}`,
      );
    }
    const loadLimit = this.craftsmanGovernance.hostLoadPerCpuLimit;
    const normalizedLoad = snapshot.load_1m !== null && snapshot.cpu_count !== null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadLimit !== null
      && normalizedLoad !== null
      && normalizedLoad > loadLimit
    ) {
      throw new Error(
        `Host load-per-cpu ${normalizedLoad.toFixed(2)} exceeds limit ${loadLimit.toFixed(2)}`,
      );
    }
  }

  private failMissingCraftsmanSessionsOnResume(taskId: string) {
    if (!this.isCraftsmanSessionAlive) {
      return;
    }
    this.failMissingCraftsmanSessions(taskId, {
      event: 'craftsman_session_missing_on_resume',
      messagePrefix: 'Craftsman session not alive on resume',
    });
  }

  private isSubtaskRunning(status: string, dispatchStatus: string | null) {
    return status === 'in_progress'
      || status === 'waiting_input'
      || dispatchStatus === 'running'
      || dispatchStatus === 'needs_input'
      || dispatchStatus === 'awaiting_choice';
  }

  private isHostHealthDegraded(snapshot: HostResourceSnapshotDto) {
    return this.resolveHostPressureStatus(snapshot) !== 'healthy';
  }

  private resolveHostPressureStatus(snapshot: HostResourceSnapshotDto | null) {
    if (!snapshot) {
      return 'unavailable' as const;
    }
    const memorySignal = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
      ? snapshot.memory_pressure
      : snapshot.memory_utilization;
    if (memorySignal != null && this.craftsmanGovernance.hostMemoryUtilizationLimit != null && memorySignal > this.craftsmanGovernance.hostMemoryUtilizationLimit) {
      return 'hard_limit' as const;
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapUtilizationLimit
    ) {
      return 'hard_limit' as const;
    }
    const loadPerCpu = snapshot.load_1m != null && snapshot.cpu_count != null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuLimit
    ) {
      return 'hard_limit' as const;
    }
    if (
      memorySignal != null
      && this.craftsmanGovernance.hostMemoryWarningUtilizationLimit != null
      && memorySignal > this.craftsmanGovernance.hostMemoryWarningUtilizationLimit
    ) {
      return 'warning' as const;
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapWarningUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapWarningUtilizationLimit
    ) {
      return 'warning' as const;
    }
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuWarningLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuWarningLimit
    ) {
      return 'warning' as const;
    }
    return 'healthy' as const;
  }

  private buildHostGovernanceWarnings(snapshot: HostResourceSnapshotDto | null) {
    if (!snapshot) {
      return [];
    }
    const warnings: string[] = [];
    const memorySignal = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
      ? snapshot.memory_pressure
      : snapshot.memory_utilization;
    if (
      memorySignal != null
      && this.craftsmanGovernance.hostMemoryWarningUtilizationLimit != null
      && memorySignal > this.craftsmanGovernance.hostMemoryWarningUtilizationLimit
    ) {
      const label = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
        ? 'memory pressure'
        : 'memory utilization';
      warnings.push(`Host ${label} warning: ${memorySignal.toFixed(2)}`);
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapWarningUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapWarningUtilizationLimit
    ) {
      warnings.push(`Host swap warning: ${snapshot.swap_utilization.toFixed(2)}`);
    }
    const loadPerCpu = snapshot.load_1m != null && snapshot.cpu_count != null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuWarningLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuWarningLimit
    ) {
      warnings.push(`Host load-per-cpu warning: ${loadPerCpu.toFixed(2)}`);
    }
    return warnings;
  }

  private getSubtaskOrThrow(taskId: string, subtaskId: string) {
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${subtaskId} not found in task ${taskId}`);
    }
    return subtask;
  }

  private assertSubtaskControl(task: TaskRecord, subtask: { id: string; assignee: string }, callerId: string) {
    const controllerRef = resolveControllerRef(task.team.members);
    const allowed = this.permissions.isArchon(callerId)
      || callerId === subtask.assignee
      || (controllerRef !== null && callerId === controllerRef);
    if (!allowed) {
      throw new PermissionDeniedError(
        `${callerId} cannot control subtask ${subtask.id} (assignee=${subtask.assignee}, controller=${controllerRef ?? '-'})`,
      );
    }
  }

  private assertTaskRuntimeControl(task: TaskRecord, callerId: string, action: string) {
    const controllerRef = resolveControllerRef(task.team.members);
    const allowed = this.permissions.isArchon(callerId)
      || (controllerRef !== null && callerId === controllerRef);
    if (!allowed) {
      throw new PermissionDeniedError(
        `${callerId} cannot request ${action} (controller=${controllerRef ?? '-'})`,
      );
    }
  }

  private resolveTaskRuntimeParticipant(task: TaskRecord, agentRef: string) {
    const member = task.team.members.find((item) => item.agentId === agentRef);
    if (!member) {
      throw new NotFoundError(`Agent ${agentRef} is not part of task ${task.id}`);
    }
    return this.agentRuntimePort?.resolveAgent(agentRef) ?? {
      agent_ref: agentRef,
      runtime_provider: null,
      runtime_actor_ref: null,
    };
  }

  private failMissingCraftsmanSessions(
    taskId: string,
    options: { event: string; messagePrefix: string },
  ) {
    if (!this.isCraftsmanSessionAlive) {
      return [] as Array<{ subtask_id: string; execution_ids: string[] }>;
    }

    const now = new Date().toISOString();
    const impacts: Array<{ subtask_id: string; execution_ids: string[] }> = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status) || !subtask.craftsman_session) {
        continue;
      }
      if (!this.isSubtaskRunning(subtask.status, subtask.dispatch_status)) {
        continue;
      }
      if (this.isCraftsmanSessionAlive(subtask.craftsman_session)) {
        continue;
      }

      const error = `${options.messagePrefix}: ${subtask.craftsman_session}`;
      const executionIds = this.craftsmanExecutions
        .listBySubtask(taskId, subtask.id)
        .filter((execution) => !TERMINAL_EXECUTION_STATUSES.has(execution.status))
        .map((execution) => {
          this.craftsmanExecutions.updateExecution(execution.execution_id, {
            status: 'failed',
            error,
            finished_at: now,
          });
          return execution.execution_id;
        });

      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'failed',
        output: error,
        dispatch_status: 'failed',
        done_at: now,
      });
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: options.event,
        stage_id: subtask.stage_id,
        detail: {
          subtask_id: subtask.id,
          session_id: subtask.craftsman_session,
          execution_ids: executionIds,
          reason: error,
        },
        actor: 'system',
      });
      impacts.push({
        subtask_id: subtask.id,
        execution_ids: executionIds,
      });
    }
    return impacts;
  }

  private buildStateChangeDetail(options: UpdateTaskStateOptions, actionDetail?: Record<string, unknown>) {
    const detail: Record<string, unknown> = {};
    if (options.reason) {
      detail.reason = options.reason;
    }
    if (actionDetail) {
      Object.assign(detail, actionDetail);
    }
    return Object.keys(detail).length > 0 ? detail : undefined;
  }

  private cancelOpenWork(taskId: string, reason: string) {
    const message = `Task cancelled: ${reason}`;
    const now = new Date().toISOString();
    const subtasks = this.subtaskRepository.listByTask(taskId);

    for (const subtask of subtasks) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'cancelled',
        output: message,
        dispatch_status: subtask.dispatch_status && !TERMINAL_EXECUTION_STATUSES.has(subtask.dispatch_status)
          ? 'failed'
          : subtask.dispatch_status,
        done_at: now,
      });
    }

    for (const subtask of subtasks) {
      for (const execution of this.craftsmanExecutions.listBySubtask(taskId, subtask.id)) {
        if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
          continue;
        }
        this.craftsmanExecutions.updateExecution(execution.execution_id, {
          status: 'cancelled',
          error: message,
          finished_at: now,
        });
      }
    }
  }

  private archiveOpenSubtasks(taskId: string, reason: string) {
    const now = new Date().toISOString();
    const archived: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'archived',
        output: subtask.output ?? `Subtask archived: ${reason}`,
        done_at: now,
      });
      archived.push(subtask.id);
    }
    return archived;
  }

  private resumeArchivedSubtasks(task: TaskRecord) {
    const resumed: string[] = [];
    if (!task.current_stage) {
      return resumed;
    }
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'archived') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: this.restoreSubtaskStatus(subtask.dispatch_status),
        done_at: null,
      });
      resumed.push(subtask.id);
    }
    return resumed;
  }

  private reconcileStageExitSubtasks(
    taskId: string,
    stageId: string,
    targetStatus: 'archived' | 'cancelled',
    reason: string,
  ) {
    const now = new Date().toISOString();
    const impacted: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (subtask.stage_id !== stageId || TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: targetStatus,
        output: subtask.output ?? `Subtask ${targetStatus}: ${reason}`,
        done_at: now,
      });
      impacted.push(subtask.id);
    }
    return impacted;
  }

  private restoreSubtaskStatus(dispatchStatus: string | null) {
    if (dispatchStatus === 'needs_input' || dispatchStatus === 'awaiting_choice') {
      return 'waiting_input';
    }
    if (dispatchStatus === 'running' || dispatchStatus === 'queued') {
      return 'in_progress';
    }
    return 'pending';
  }

  private retryFailedSubtasks(task: TaskRecord) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const retried: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'pending',
        output: null,
        craftsman_session: null,
        dispatch_status: null,
        dispatched_at: null,
        done_at: null,
      });
      retried.push(subtask.id);
    }
    return retried;
  }

  private skipFailedSubtasks(task: TaskRecord, reason: string) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const skipped: string[] = [];
    const output = reason ? `Skipped by archon: ${reason}` : 'Skipped by archon';
    const now = new Date().toISOString();

    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'done',
        output,
        craftsman_session: null,
        dispatch_status: 'skipped',
        done_at: now,
      });
      skipped.push(subtask.id);
    }
    return skipped;
  }

  private reassignFailedSubtasks(task: TaskRecord, assignee: string, craftsmanType?: string) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const reassigned: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'pending',
        output: null,
        craftsman_type: craftsmanType ?? subtask.craftsman_type,
        craftsman_session: null,
        dispatch_status: null,
        dispatched_at: null,
        done_at: null,
      });
      this.db.prepare(`
        UPDATE subtasks
        SET assignee = ?
        WHERE task_id = ? AND id = ?
      `).run(assignee, task.id, subtask.id);
      reassigned.push(subtask.id);
    }
    return reassigned;
  }

  private ensureArchiveJobForTask(taskId: string) {
    const existing = this.archiveJobRepository.listArchiveJobs({ taskId });
    if (existing.length > 0) {
      return existing[0]!;
    }

    const task = this.getTaskOrThrow(taskId);
    const binding = this.taskBrainBindingService?.getActiveBinding(task.id);
    const nomosRuntime = task.project_id && this.projectNomosAuthoringPort?.resolveProjectNomosRuntimeContext
      ? this.projectNomosAuthoringPort.resolveProjectNomosRuntimeContext(task.project_id)
      : null;
    return this.archiveJobRepository.insertArchiveJob({
      task_id: task.id,
      status: 'pending',
      target_path: this.buildArchiveTargetPath(task),
      payload: {
        task_id: task.id,
        title: task.title,
        type: task.type,
        state: task.state,
        ...(task.project_id ? { project_id: task.project_id } : {}),
        closeout_review: {
          required: true,
          state: 'advisory',
          task_state: task.state,
          candidate_updates: [
            ...(task.project_id ? [{
              kind: 'recap',
              slug: task.id,
              project_id: task.project_id,
            }] : []),
          ],
          ...(binding?.workspace_path ? { workspace_path: binding.workspace_path } : {}),
          ...(binding?.workspace_path ? { harvest_draft_path: join(binding.workspace_path, '07-outputs', 'project-harvest-draft.md') } : {}),
          ...(nomosRuntime ? { nomos_runtime: nomosRuntime } : {}),
        },
      },
      writer_agent: 'writer-agent',
    });
  }

  private buildArchiveTargetPath(task: TaskRecord) {
    return `ZeYu-AI-Brain/agora/${task.id}-${slugify(task.title)}.md`;
  }

  private getStateActionEvent(fromState: TaskState, toState: TaskState): string | null {
    if (toState === TaskState.PAUSED) {
      return 'paused';
    }
    if (toState === TaskState.BLOCKED) {
      return 'blocked';
    }
    if (toState === TaskState.CANCELLED) {
      return 'cancelled';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      return 'resumed';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      return 'unblocked';
    }
    return null;
  }

  private buildStateConversationBody(
    fromState: TaskState,
    toState: TaskState,
    options: UpdateTaskStateOptions,
  ): string | null {
    if (toState === TaskState.PAUSED) {
      return options.reason ? `Task paused: ${options.reason}` : 'Task paused';
    }
    if (toState === TaskState.CANCELLED) {
      return options.reason ? `Task cancelled: ${options.reason}` : 'Task cancelled';
    }
    if (toState === TaskState.BLOCKED) {
      return options.reason ? `Task blocked: ${options.reason}` : 'Task blocked';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      return 'Task resumed';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      return options.reason ? `Task unblocked: ${options.reason}` : 'Task unblocked';
    }
    return null;
  }

  private syncImContextForTaskState(
    taskId: string,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
    onSuccess?: () => void,
  ) {
    this.taskBroadcastService.syncImContextForTaskState(taskId, fromState, toState, reason, onSuccess);
  }

  private describeGateState(stage: WorkflowStageLike | null) {
    if (!stage?.gate?.type) {
      return [];
    }
    switch (stage.gate.type) {
      case 'approval':
        return ['Waiting human approval before further progress.'];
      case 'archon_review':
        return ['Waiting Archon review before further progress.'];
      case 'quorum':
        return ['Waiting quorum confirmation before further progress.'];
      default:
        return [`Gate: ${stage.gate.type}`];
    }
  }

  private mirrorConversationEntry(taskId: string, input: {
    actor: string | null;
    body: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  }) {
    this.taskBroadcastService.mirrorConversationEntry(taskId, input);
  }

  private mirrorProvisioningConversationEntry(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    body: string,
  ) {
    this.taskBroadcastService.mirrorProvisioningConversationEntry(taskId, binding, body);
  }

  private mirrorPublishedMessagesToConversation(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    messages: IMPublishMessageInput[],
  ) {
    this.taskBroadcastService.mirrorPublishedMessagesToConversation(taskId, binding, messages);
  }

  private reconcileStageParticipants(task: TaskRecord, stage: WorkflowStageLike | null) {
    this.taskParticipantSyncService.reconcileStageParticipants(task, stage);
  }

  private trackBackgroundOperation<T>(operation: Promise<T>): Promise<T> {
    const tracked = Promise.resolve(operation)
      .then(() => undefined, () => undefined)
      .finally(() => {
        this.pendingBackgroundOperations.delete(tracked);
      });
    this.pendingBackgroundOperations.add(tracked);
    return operation;
  }

  private enterStage(taskId: string, stageId: string) {
    this.db.prepare(`
      INSERT INTO stage_history (task_id, stage_id)
      VALUES (?, ?)
    `).run(taskId, stageId);
  }

  private exitStage(taskId: string, stageId: string, reason: string) {
    this.db.prepare(`
      UPDATE stage_history
      SET exited_at = datetime('now'), exit_reason = ?
      WHERE id = (
        SELECT id
        FROM stage_history
        WHERE task_id = ? AND stage_id = ? AND exited_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      )
    `).run(reason, taskId, stageId);
  }

  private resolveLatestBusinessActivityMs(task: TaskRecord) {
    const escalationEvents = new Set(['controller_pinged', 'roster_pinged', 'human_approval_pinged', 'inbox_escalated']);
    const conversationEntries = this.taskConversationRepository.listByTask(task.id);
    const systemEchoTimesByKey = new Map<string, number[]>();
    for (const entry of conversationEntries) {
      if (entry.author_kind !== 'system') {
        continue;
      }
      const occurredAtMs = parseTimestamp(entry.occurred_at);
      if (!Number.isFinite(occurredAtMs)) {
        continue;
      }
      const key = buildConversationEchoKey(entry);
      const existing = systemEchoTimesByKey.get(key);
      if (existing) {
        existing.push(occurredAtMs);
      } else {
        systemEchoTimesByKey.set(key, [occurredAtMs]);
      }
    }
    const flowMs = this.flowLogRepository.listByTask(task.id)
      .filter((entry) => !escalationEvents.has(entry.event))
      .map((entry) => parseTimestamp(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const progressMs = this.progressLogRepository.listByTask(task.id)
      .map((entry) => parseTimestamp(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const conversationMs = conversationEntries
      .filter((entry) => entry.author_kind !== 'system')
      .filter((entry) => !isSystemEchoConversationEntry(entry, systemEchoTimesByKey))
      .map((entry) => parseTimestamp(entry.occurred_at))
      .filter((value) => Number.isFinite(value));
    return Math.max(
      parseTimestamp(task.updated_at),
      ...flowMs,
      ...progressMs,
      ...conversationMs,
    );
  }

  private getProbeState(taskId: string, latestActivityMs: number) {
    const flows = this.flowLogRepository.listByTask(taskId);
    const notifiedAfterActivity = (event: string) => flows.some((entry) => entry.event === event && parseTimestamp(entry.created_at) > latestActivityMs);
    return {
      controllerNotified: notifiedAfterActivity('controller_pinged'),
      rosterNotified: notifiedAfterActivity('roster_pinged'),
      humanApprovalNotified: notifiedAfterActivity('human_approval_pinged'),
      inboxRaised: notifiedAfterActivity('inbox_escalated'),
    };
  }

  private resolveApprovalWaitProbe(task: TaskRecord) {
    if (!task.current_stage) {
      return null;
    }
    const request = this.approvalRequestRepository.getLatestPending(task.id, task.current_stage);
    if (!request) {
      return null;
    }
    if (request.gate_type !== 'approval' && request.gate_type !== 'archon_review') {
      return null;
    }
    const provider = this.taskContextBindingService?.getLatestBinding(task.id)?.im_provider;
    const participantRefs = provider && this.resolveHumanReminderParticipantRefs
      ? Array.from(new Set(
          this.resolveHumanReminderParticipantRefs({
            task,
            provider,
            reason: 'approval_waiting',
          }).filter((participantRef) => participantRef.trim().length > 0),
        ))
      : [];
    return {
      request,
      participantRefs,
    };
  }

  private resolveEscalationPolicy(options: InactiveTaskProbeOptions) {
    return {
      controllerAfterMs: options.controllerAfterMs ?? this.escalationPolicy.controllerAfterMs,
      rosterAfterMs: options.rosterAfterMs ?? this.escalationPolicy.rosterAfterMs,
      inboxAfterMs: options.inboxAfterMs ?? this.escalationPolicy.inboxAfterMs,
    };
  }

  private getCraftsmanProbeState(executionId: string, latestActivityMs: number): CraftsmanProbeState {
    const current = this.craftsmanProbeStateByExecution.get(executionId);
    if (!current || current.activityMs !== latestActivityMs) {
      const resetState: CraftsmanProbeState = {
        activityMs: latestActivityMs,
        lastProbeMs: null,
        attempts: 0,
      };
      this.craftsmanProbeStateByExecution.set(executionId, resetState);
      return resetState;
    }
    return current;
  }

  private noteCraftsmanAutoProbe(executionId: string, latestActivityMs: number, nowMs: number) {
    this.craftsmanProbeStateByExecution.set(executionId, {
      activityMs: latestActivityMs,
      lastProbeMs: nowMs,
      attempts: (this.craftsmanProbeStateByExecution.get(executionId)?.attempts ?? 0) + 1,
    });
  }

  private shouldProbeCraftsmanExecution(nowMs: number, thresholdMs: number, probeState: CraftsmanProbeState) {
    if (probeState.attempts === 0 || probeState.lastProbeMs === null) {
      return true;
    }
    const multiplierIndex = Math.min(
      probeState.attempts - 1,
      TaskService.CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS.length - 1,
    );
    const cooldownMs = thresholdMs * TaskService.CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS[multiplierIndex]!;
    return nowMs - probeState.lastProbeMs >= cooldownMs;
  }

  private buildEscalationSnapshot(
    tasks: TaskRecord[],
    runtimeAgents: Array<{ agent_id: string; status: 'active' | 'idle' | 'closed'; session_count: number; last_event_at: string | null }>,
  ): UnifiedHealthSnapshotDto['escalation'] {
    const activeTasks = tasks.filter((task) => task.state === TaskState.ACTIVE);
    let controllerPingedTasks = 0;
    let rosterPingedTasks = 0;
    let inboxEscalatedTasks = 0;

    for (const task of activeTasks) {
      const latestActivityMs = this.resolveLatestBusinessActivityMs(task);
      const probeState = this.getProbeState(task.id, latestActivityMs);
      if (probeState.inboxRaised) {
        inboxEscalatedTasks += 1;
      } else if (probeState.rosterNotified) {
        rosterPingedTasks += 1;
      } else if (probeState.controllerNotified) {
        controllerPingedTasks += 1;
      }
    }

    const unhealthyRuntimeAgents = runtimeAgents.filter((agent) => agent.status === 'closed').length;
    const runtimeUnhealthy = !!this.liveSessionStore && unhealthyRuntimeAgents > 0;

    return {
      status: controllerPingedTasks > 0 || rosterPingedTasks > 0 || inboxEscalatedTasks > 0 || runtimeUnhealthy
        ? 'degraded'
        : 'healthy',
      policy: {
        controller_after_ms: this.escalationPolicy.controllerAfterMs,
        roster_after_ms: this.escalationPolicy.rosterAfterMs,
        inbox_after_ms: this.escalationPolicy.inboxAfterMs,
      },
      controller_pinged_tasks: controllerPingedTasks,
      roster_pinged_tasks: rosterPingedTasks,
      inbox_escalated_tasks: inboxEscalatedTasks,
      unhealthy_runtime_agents: unhealthyRuntimeAgents,
      runtime_unhealthy: runtimeUnhealthy,
    };
  }

  private requireInteractiveExecution(executionId: string) {
    if (!this.craftsmanInputPort) {
      throw new Error('Craftsman input port is not configured');
    }
    const execution = this.getCraftsmanExecution(executionId);
    const isWaiting = ['needs_input', 'awaiting_choice'].includes(execution.status);
    const isContinuousInteractive = execution.status === 'running'
      && execution.mode === 'interactive'
      && execution.session_id !== null;
    if (!isWaiting && !isContinuousInteractive) {
      throw new Error(`Craftsman execution ${executionId} is not waiting for input or running as an interactive session (status=${execution.status})`);
    }
    return {
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      taskId: execution.task_id,
      subtaskId: execution.subtask_id,
    };
  }

  private recordCraftsmanInput(
    taskId: string,
    subtaskId: string,
    executionId: string,
    inputType: 'text' | 'keys' | 'choice',
    detail: string,
  ) {
    const task = this.getTaskOrThrow(taskId);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'craftsman_input_sent',
      stage_id: task.current_stage,
      detail: {
        subtask_id: subtaskId,
        execution_id: executionId,
        input_type: inputType,
        detail,
      },
      actor: 'archon',
    });
    this.taskBroadcastService.publishCraftsmanInputUpdate({
      task,
      actor: 'archon',
      subtaskId,
      executionId,
      inputType,
      detail,
    });
  }
}

function buildConversationEchoKey(entry: Pick<TaskConversationEntryRecord, 'provider' | 'body'>) {
  return `${entry.provider}\u0000${entry.body}`;
}

function isSystemEchoConversationEntry(
  entry: TaskConversationEntryRecord,
  systemEchoTimesByKey: Map<string, number[]>,
) {
  const occurredAtMs = parseTimestamp(entry.occurred_at);
  if (!Number.isFinite(occurredAtMs)) {
    return false;
  }
  const candidates = systemEchoTimesByKey.get(buildConversationEchoKey(entry));
  if (!candidates || candidates.length === 0) {
    return false;
  }
  return candidates.some((systemOccurredAtMs) => Math.abs(systemOccurredAtMs - occurredAtMs) <= SYSTEM_ECHO_ACTIVITY_WINDOW_MS);
}

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

function resolveTaskLocale(locale: string | null | undefined): TaskLocaleDto {
  return locale === 'en-US' ? 'en-US' : 'zh-CN';
}

function resolveStageExecutionKind(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return null;
  }
  if (stage.execution_kind) {
    return stage.execution_kind;
  }
  if (stage.mode === 'execute') {
    return 'citizen_execute';
  }
  if (stage.mode === 'discuss') {
    return 'citizen_discuss';
  }
  return null;
}

function resolveStageModeFromExecutionKind(executionKind: string | null) {
  if (executionKind === 'citizen_execute' || executionKind === 'craftsman_dispatch') {
    return 'execute';
  }
  if (executionKind === 'citizen_discuss' || executionKind === 'human_approval') {
    return 'discuss';
  }
  return null;
}

function resolveAllowedActions(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return [];
  }
  if (stage.allowed_actions?.length) {
    return stage.allowed_actions;
  }
  switch (resolveStageExecutionKind(stage)) {
    case 'craftsman_dispatch':
      return ['dispatch_craftsman'];
    case 'citizen_execute':
      return ['execute'];
    case 'human_approval':
      return ['approve', 'reject'];
    case 'citizen_discuss':
      return ['discuss'];
    default:
      return [];
  }
}

function stageAllowsCraftsmanDispatch(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return false;
  }
  return resolveStageExecutionKind(stage) === 'craftsman_dispatch'
    || resolveAllowedActions(stage).includes('dispatch_craftsman');
}

function resolveTaskBrainContextAudienceForAssignee(task: TaskRecord, assignee: string): TaskBrainContextAudience {
  const member = task.team.members.find((candidate) => candidate.agentId === assignee);
  switch (member?.member_kind) {
    case 'craftsman':
      return 'craftsman';
    case 'citizen':
      return 'citizen';
    case 'controller':
    default:
      return 'controller';
  }
}

function resolveProjectBrainContextPath(workspacePath: string, audience: TaskBrainContextAudience) {
  return join(workspacePath, '04-context', `project-brain-context-${audience}.md`);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'task';
}
