import type { CraftsmanCallbackRequestDto, CraftsmanDispatchRequestDto, CraftsmanExecutionTailResponseDto, CraftsmanInputKeyDto, CraftsmanStopExecutionRequestDto, CreateSubtasksRequestDto, CreateSubtasksResponseDto, DatabasePort, GateQueryPort, IApprovalRequestRepository, IArchiveJobRepository, ICraftsmanExecutionRepository, IFlowLogRepository, IInboxRepository, IProgressLogRepository, ISubtaskRepository, ITaskContextBindingRepository, ITaskConversationRepository, ITaskRepository, ITemplateRepository, ITodoRepository, PromoteTodoRequestDto, RuntimeDiagnosisResultDto, RuntimeRecoveryActionDto, RuntimeRecoveryRequestDto, TaskRecord, TaskStatusDto, UnifiedHealthSnapshotDto } from '@agora-ts/contracts';
import type { CraftsmanCallbackService } from './craftsman-callback-service.js';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { GateService } from './gate-service.js';
import { TaskState } from './enums.js';
import { PermissionService } from './permission-service.js';
import type { ProjectService } from './project-service.js';
import { StateMachine } from './state-machine.js';
import type { IMMessagingPort, IMProvisioningPort } from './im-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import type { SkillCatalogPort } from './skill-catalog-port.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { CraftsmanExecutionProbePort } from './craftsman-probe-port.js';
import type { CraftsmanExecutionTailPort } from './craftsman-tail-port.js';
import type { HostResourcePort } from './host-resource-port.js';
import type { TaskRecoveryService } from './task-recovery-service.js';
import type { TaskLifecycleService } from './task-lifecycle-service.js';
import type { TaskApprovalService } from './task-approval-service.js';
import type { TaskStageService } from './task-stage-service.js';
import type { TaskCraftsmanService } from './task-craftsman-service.js';
import type {
  CraftsmanDispatchResult,
  HandleCraftsmanCallbackResult,
  ProbeCraftsmanExecutionResult,
  TaskCraftsmanExecutionView,
} from './task-craftsman-service.js';
import type { TaskCoreSupport } from './task-core-support.js';
import type { TaskLifecycleSupport } from './task-lifecycle-support.js';
import { buildTaskServiceRuntime } from './task-service-runtime.js';
import type { TaskStageSupport } from './task-stage-support.js';
import { defaultTaskIdGenerator, defaultTemplatesDir } from './task-service-types.js';
import type {
  AdvanceTaskOptions,
  ApproveTaskOptions,
  ArchonDecisionOptions,
  CompleteSubtaskOptions,
  ConfirmTaskOptions,
  CreateTaskInputLike,
  CraftsmanGovernanceLimits,
  EscalationPolicy,
  ForceAdvanceOptions,
  HumanReminderParticipantResolverInput,
  InactiveTaskProbeOptions,
  InactiveTaskProbeResult,
  ObserveCraftsmanExecutionsOptions,
  ObserveCraftsmanExecutionsResult,
  RejectTaskOptions,
  StartupRecoveryScanResult,
  SubtaskLifecycleOptions,
  TaskServiceOptions,
  UpdateTaskStateOptions,
} from './task-service-types.js';
import type {
  TaskBrainWorkspacePort,
} from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import type { TaskParticipantSyncService } from './task-participant-sync-service.js';
import type { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import type { ProjectAgentRosterService } from './project-agent-roster-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ProjectMembershipService } from './project-membership-service.js';
import type { ProjectNomosAuthoringPort } from './project-nomos-authoring-port.js';
import type { StageRosterService } from './stage-roster-service.js';
import type { TaskBroadcastService } from './task-broadcast-service.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import { TaskWorktreeService } from './task-worktree-service.js';
import type { LiveSessionStore } from './live-session-store.js';
export class TaskService {
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
  private readonly taskCoreSupport: TaskCoreSupport;
  private readonly taskLifecycleSupport: TaskLifecycleSupport;
  private readonly taskStageSupport: TaskStageSupport;
  private readonly taskRecoveryService: TaskRecoveryService;
  private readonly taskLifecycleService: TaskLifecycleService;
  private readonly taskApprovalService: TaskApprovalService;
  private readonly taskStageService: TaskStageService;
  private readonly taskCraftsmanService: TaskCraftsmanService;
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
  private readonly craftsmanProbeStateByExecution!: Map<string, { activityMs: number; lastProbeMs: number | null; attempts: number }>;
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
    const runtime = buildTaskServiceRuntime({
      db: this.db,
      gateQueryPort: this.gateQueryPort,
      gateService: this.gateService,
      permissions: this.permissions,
      stateMachine: this.stateMachine,
      taskRepository: this.taskRepository,
      flowLogRepository: this.flowLogRepository,
      progressLogRepository: this.progressLogRepository,
      subtaskRepository: this.subtaskRepository,
      taskContextBindingRepository: this.taskContextBindingRepository,
      taskConversationRepository: this.taskConversationRepository,
      todoRepository: this.todoRepository,
      archiveJobRepository: this.archiveJobRepository,
      approvalRequestRepository: this.approvalRequestRepository,
      inboxRepository: this.inboxRepository,
      craftsmanExecutions: this.craftsmanExecutions,
      templateRepository: this.templateRepository,
      taskAuthorities: this.taskAuthorities,
      projectMemberships: this.projectMemberships,
      projectAgentRoster: this.projectAgentRoster,
      projectService: this.projectService,
      projectContextWriter: this.projectContextWriter,
      taskWorktreeService: this.taskWorktreeService,
      craftsmanCallbacks: this.craftsmanCallbacks,
      craftsmanDispatcher: this.craftsmanDispatcher,
      craftsmanInputPort: this.craftsmanInputPort,
      isCraftsmanSessionAlive: this.isCraftsmanSessionAlive,
      imProvisioningPort: this.imProvisioningPort,
      taskBrainWorkspacePort: this.taskBrainWorkspacePort,
      taskBrainBindingService: this.taskBrainBindingService,
      taskContextBindingService: this.taskContextBindingService,
      taskParticipationService: this.taskParticipationService,
      projectBrainAutomationService: this.projectBrainAutomationService,
      agentRuntimePort: this.agentRuntimePort,
      runtimeRecoveryPort: this.runtimeRecoveryPort,
      craftsmanExecutionProbePort: this.craftsmanExecutionProbePort,
      craftsmanExecutionTailPort: this.craftsmanExecutionTailPort,
      hostResourcePort: this.hostResourcePort,
      liveSessionStore: this.liveSessionStore,
      skillCatalogPort: this.skillCatalogPort,
      projectNomosAuthoringPort: this.projectNomosAuthoringPort,
      craftsmanGovernance: this.craftsmanGovernance,
      escalationPolicy: this.escalationPolicy,
      resolveHumanReminderParticipantRefs: this.resolveHumanReminderParticipantRefs,
      taskIdGenerator: this.taskIdGenerator,
      createTask: (input) => this.createTask(input),
      trackBackgroundOperation: (operation) => this.trackBackgroundOperation(operation),
    });
    this.stageRosterService = runtime.stageRosterService;
    this.taskBroadcastService = runtime.taskBroadcastService;
    this.taskParticipantSyncService = runtime.taskParticipantSyncService;
    this.taskLifecycleSupport = runtime.taskLifecycleSupport;
    this.taskCoreSupport = runtime.taskCoreSupport;
    this.craftsmanProbeStateByExecution = runtime.taskCoreSupport.craftsmanProbeStateByExecution;
    this.taskStageSupport = runtime.taskStageSupport;
    this.taskRecoveryService = runtime.taskRecoveryService;
    this.taskLifecycleService = runtime.taskLifecycleService;
    this.taskApprovalService = runtime.taskApprovalService;
    this.taskStageService = runtime.taskStageService;
    this.taskCraftsmanService = runtime.taskCraftsmanService;
  }

  async drainBackgroundOperations(): Promise<void> {
    while (this.pendingBackgroundOperations.size > 0) {
      await Promise.allSettled([...this.pendingBackgroundOperations]);
    }
  }

  createTask(input: CreateTaskInputLike): TaskRecord {
    const { task: createdTask, brainWorkspaceBinding } = this.taskLifecycleService.createTaskCore(input);
    const taskId = createdTask.id;
    const initialStage = createdTask.current_stage
      ? this.taskLifecycleSupport.getStageByIdOrThrow(createdTask, createdTask.current_stage)
      : null;
    const imParticipantRefs = this.taskLifecycleSupport.collectImParticipantRefs(createdTask, initialStage, input.im_target?.participant_refs);
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
        this.taskStageSupport.mirrorProvisioningConversationEntry(taskId, binding, `Task **${taskId}** created: ${input.title}`);
        await this.taskParticipantSyncService.joinProvisionedParticipants(taskId, binding, imParticipantRefs);
        const bootstrapMessages = this.taskLifecycleSupport.buildBootstrapMessages(createdTask, brainWorkspace, imParticipantRefs);
        if (bootstrapMessages.length > 0) {
          await provisioningPort.publishMessages({
            binding_id: binding.id,
            ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
            ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
            messages: bootstrapMessages,
          });
          this.taskStageSupport.mirrorPublishedMessagesToConversation(taskId, binding, bootstrapMessages);
        }
      }).catch((err: unknown) => {
        console.error(`[TaskService] IM provisioning failed for task ${taskId}:`, err);
      }));
    }

    return createdTask;
  }

  getTask(taskId: string): TaskRecord | null {
    return this.taskLifecycleService.getTask(taskId);
  }

  listTasks(state?: string, projectId?: string): TaskRecord[] {
    return this.taskLifecycleService.listTasks(state, projectId);
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    return this.taskLifecycleService.getTaskStatus(taskId);
  }

  advanceTask(taskId: string, options: AdvanceTaskOptions): TaskRecord {
    return this.taskStageService.advanceTask(taskId, options);
  }

  approveTask(taskId: string, options: ApproveTaskOptions): TaskRecord {
    return this.taskApprovalService.approveTask(taskId, options);
  }

  rejectTask(taskId: string, options: RejectTaskOptions): TaskRecord {
    return this.taskApprovalService.rejectTask(taskId, options);
  }

  archonApproveTask(taskId: string, options: ArchonDecisionOptions): TaskRecord {
    return this.taskApprovalService.archonApproveTask(taskId, options);
  }

  archonRejectTask(taskId: string, options: ArchonDecisionOptions): TaskRecord {
    return this.taskApprovalService.archonRejectTask(taskId, options);
  }

  completeSubtask(taskId: string, options: CompleteSubtaskOptions): TaskRecord {
    return this.taskCraftsmanService.completeSubtask(taskId, options);
  }

  archiveSubtask(taskId: string, options: SubtaskLifecycleOptions): TaskRecord {
    return this.taskCraftsmanService.archiveSubtask(taskId, options);
  }

  cancelSubtask(taskId: string, options: SubtaskLifecycleOptions): TaskRecord {
    return this.taskCraftsmanService.cancelSubtask(taskId, options);
  }

  createSubtasks(taskId: string, options: CreateSubtasksRequestDto): CreateSubtasksResponseDto {
    return this.taskCraftsmanService.createSubtasks(taskId, options);
  }

  listSubtasks(taskId: string) {
    return this.taskCraftsmanService.listSubtasks(taskId);
  }

  handleCraftsmanCallback(input: CraftsmanCallbackRequestDto): HandleCraftsmanCallbackResult {
    return this.taskCraftsmanService.handleCraftsmanCallback(input);
  }

  dispatchCraftsman(input: CraftsmanDispatchRequestDto): CraftsmanDispatchResult {
    return this.taskCraftsmanService.dispatchCraftsman(input);
  }

  getCraftsmanExecution(executionId: string): TaskCraftsmanExecutionView {
    return this.taskCraftsmanService.getCraftsmanExecution(executionId);
  }

  getCraftsmanExecutionTail(executionId: string, lines = 120): CraftsmanExecutionTailResponseDto {
    return this.taskCraftsmanService.getCraftsmanExecutionTail(executionId, lines);
  }

  listCraftsmanExecutions(taskId: string, subtaskId: string) {
    return this.taskCraftsmanService.listCraftsmanExecutions(taskId, subtaskId);
  }

  getCraftsmanGovernanceSnapshot() {
    return this.taskCraftsmanService.getCraftsmanGovernanceSnapshot();
  }

  getHealthSnapshot(): UnifiedHealthSnapshotDto {
    return this.taskRecoveryService.getHealthSnapshot();
  }

  requestRuntimeDiagnosis(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeDiagnosisResultDto {
    return this.taskRecoveryService.requestRuntimeDiagnosis(taskId, options);
  }

  restartCitizenRuntime(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeRecoveryActionDto {
    return this.taskRecoveryService.restartCitizenRuntime(taskId, options);
  }

  stopCraftsmanExecution(executionId: string, options: CraftsmanStopExecutionRequestDto & { caller_id: string }): RuntimeRecoveryActionDto {
    return this.taskRecoveryService.stopCraftsmanExecution(executionId, options);
  }

  sendCraftsmanInputText(executionId: string, text: string, submit = true) {
    return this.taskCraftsmanService.sendCraftsmanInputText(executionId, text, submit);
  }

  sendCraftsmanInputKeys(executionId: string, keys: CraftsmanInputKeyDto[]) {
    return this.taskCraftsmanService.sendCraftsmanInputKeys(executionId, keys);
  }

  submitCraftsmanChoice(executionId: string, keys: CraftsmanInputKeyDto[] = []) {
    return this.taskCraftsmanService.submitCraftsmanChoice(executionId, keys);
  }

  probeCraftsmanExecution(executionId: string): ProbeCraftsmanExecutionResult {
    return this.taskCraftsmanService.probeCraftsmanExecution(executionId);
  }

  observeCraftsmanExecutions(options: ObserveCraftsmanExecutionsOptions): ObserveCraftsmanExecutionsResult {
    return this.taskCraftsmanService.observeCraftsmanExecutions(options);
  }

  forceAdvanceTask(taskId: string, options: ForceAdvanceOptions): TaskRecord {
    return this.taskStageService.forceAdvanceTask(taskId, options);
  }

  confirmTask(taskId: string, options: ConfirmTaskOptions): TaskRecord & { quorum: { approved: number; total: number } } {
    return this.taskApprovalService.confirmTask(taskId, options);
  }

  pauseTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.taskStageService.updateTaskState(taskId, TaskState.PAUSED, options);
  }

  resumeTask(taskId: string): TaskRecord {
    return this.taskStageService.updateTaskState(taskId, TaskState.ACTIVE, { reason: 'resumed' });
  }

  cancelTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.taskStageService.updateTaskState(taskId, TaskState.CANCELLED, options);
  }

  unblockTask(taskId: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.taskStageService.updateTaskState(taskId, TaskState.ACTIVE, options);
  }

  updateTaskState(taskId: string, newState: string, options: UpdateTaskStateOptions): TaskRecord {
    return this.taskStageService.updateTaskState(taskId, newState, options);
  }

  promoteTodo(todoId: number, options: PromoteTodoRequestDto) {
    return this.taskLifecycleService.promoteTodo(todoId, options);
  }

  cleanupOrphaned(taskId?: string): number {
    return this.taskLifecycleService.cleanupOrphaned(taskId);
  }

  startupRecoveryScan(): StartupRecoveryScanResult {
    return this.taskRecoveryService.startupRecoveryScan();
  }

  probeInactiveTasks(options: InactiveTaskProbeOptions): InactiveTaskProbeResult {
    return this.taskRecoveryService.probeInactiveTasks(options);
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

}
