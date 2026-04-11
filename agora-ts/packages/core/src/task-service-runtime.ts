import type {
  CraftsmanInputKeyDto,
  DatabasePort,
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
  TaskRecord,
} from '@agora-ts/contracts';
import type { CraftsmanCallbackService } from './craftsman-callback-service.js';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import type { CraftsmanExecutionProbePort } from './craftsman-probe-port.js';
import type { CraftsmanExecutionTailPort } from './craftsman-tail-port.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { GateService } from './gate-service.js';
import type { HostResourcePort } from './host-resource-port.js';
import type { IMProvisioningPort } from './im-ports.js';
import type { LiveSessionStore } from './live-session-store.js';
import { ModeController } from './mode-controller.js';
import type { PermissionService } from './permission-service.js';
import { ProgressService } from './progress-service.js';
import type { ContextMaterializationService } from './context-materialization-service.js';
import type { ProjectAgentRosterService } from './project-agent-roster-service.js';
import type { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ProjectMembershipService } from './project-membership-service.js';
import type { ProjectNomosAuthoringPort } from './project-nomos-authoring-port.js';
import type { ProjectService } from './project-service.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { SkillCatalogPort } from './skill-catalog-port.js';
import type { StateMachine } from './state-machine.js';
import { StageRosterService } from './stage-roster-service.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskBrainWorkspacePort } from './task-brain-port.js';
import { TaskBroadcastService } from './task-broadcast-service.js';
import { TaskCoreSupport } from './task-core-support.js';
import { TaskApprovalService } from './task-approval-service.js';
import { TaskCraftsmanService } from './task-craftsman-service.js';
import { TaskLifecycleService } from './task-lifecycle-service.js';
import { TaskLifecycleSupport } from './task-lifecycle-support.js';
import { TaskParticipantSyncService } from './task-participant-sync-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import { TaskRecoveryService } from './task-recovery-service.js';
import { TaskStageService } from './task-stage-service.js';
import { TaskStageSupport } from './task-stage-support.js';
import type { TaskWorktreeService } from './task-worktree-service.js';
import type {
  CreateTaskInputLike,
  CraftsmanGovernanceLimits,
  EscalationPolicy,
  HumanReminderParticipantResolverInput,
} from './task-service-types.js';

export interface TaskServiceRuntimeDeps {
  db: DatabasePort;
  gateQueryPort: GateQueryPort;
  gateService: GateService;
  permissions: PermissionService;
  stateMachine: StateMachine;
  taskRepository: ITaskRepository;
  flowLogRepository: IFlowLogRepository;
  progressLogRepository: IProgressLogRepository;
  subtaskRepository: ISubtaskRepository;
  taskContextBindingRepository: ITaskContextBindingRepository;
  taskConversationRepository: ITaskConversationRepository;
  todoRepository: ITodoRepository;
  archiveJobRepository: IArchiveJobRepository;
  approvalRequestRepository: IApprovalRequestRepository;
  inboxRepository: IInboxRepository;
  craftsmanExecutions: ICraftsmanExecutionRepository;
  templateRepository: ITemplateRepository;
  taskAuthorities: TaskAuthorityService;
  projectMemberships: ProjectMembershipService;
  projectAgentRoster: ProjectAgentRosterService;
  projectService: ProjectService;
  projectContextWriter: ProjectContextWriter;
  taskWorktreeService: TaskWorktreeService;
  craftsmanCallbacks: CraftsmanCallbackService;
  craftsmanDispatcher: CraftsmanDispatcher | undefined;
  craftsmanInputPort: CraftsmanInputPort | undefined;
  isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  imProvisioningPort: IMProvisioningPort | undefined;
  taskBrainWorkspacePort: TaskBrainWorkspacePort | undefined;
  taskBrainBindingService: TaskBrainBindingService | undefined;
  taskContextBindingService: TaskContextBindingService | undefined;
  taskParticipationService: TaskParticipationService | undefined;
  contextMaterializationService: Pick<ContextMaterializationService, 'materializeSync'> | undefined;
  projectBrainAutomationService: ProjectBrainAutomationService | undefined;
  agentRuntimePort: AgentRuntimePort | undefined;
  runtimeRecoveryPort: RuntimeRecoveryPort | undefined;
  craftsmanExecutionProbePort: CraftsmanExecutionProbePort | undefined;
  craftsmanExecutionTailPort: CraftsmanExecutionTailPort | undefined;
  hostResourcePort: HostResourcePort | undefined;
  liveSessionStore: LiveSessionStore | undefined;
  skillCatalogPort: SkillCatalogPort | undefined;
  projectNomosAuthoringPort: ProjectNomosAuthoringPort | undefined;
  craftsmanGovernance: CraftsmanGovernanceLimits;
  escalationPolicy: EscalationPolicy;
  resolveHumanReminderParticipantRefs:
    | ((input: HumanReminderParticipantResolverInput) => string[])
    | undefined;
  taskIdGenerator: () => string;
  createTask: (input: CreateTaskInputLike) => TaskRecord;
  trackBackgroundOperation: <T>(operation: Promise<T>) => Promise<T>;
}

export interface TaskServiceRuntime {
  stageRosterService: StageRosterService;
  taskBroadcastService: TaskBroadcastService;
  taskParticipantSyncService: TaskParticipantSyncService;
  taskLifecycleSupport: TaskLifecycleSupport;
  taskCoreSupport: TaskCoreSupport;
  taskStageSupport: TaskStageSupport;
  taskRecoveryService: TaskRecoveryService;
  taskLifecycleService: TaskLifecycleService;
  taskApprovalService: TaskApprovalService;
  taskStageService: TaskStageService;
  taskCraftsmanService: TaskCraftsmanService;
}

export function buildTaskServiceRuntime(deps: TaskServiceRuntimeDeps): TaskServiceRuntime {
  const stageRosterService = new StageRosterService();
  const taskBroadcastService = new TaskBroadcastService({
    taskContextBindingRepository: deps.taskContextBindingRepository,
    taskConversationRepository: deps.taskConversationRepository,
    imProvisioningPort: deps.imProvisioningPort,
    getTaskBrainWorkspacePath: (taskId) => deps.taskBrainBindingService?.getActiveBinding(taskId)?.workspace_path ?? null,
    trackBackgroundOperation: deps.trackBackgroundOperation,
  });
  const taskParticipantSyncService = new TaskParticipantSyncService({
    taskContextBindingRepository: deps.taskContextBindingRepository,
    taskParticipationService: deps.taskParticipationService,
    imProvisioningPort: deps.imProvisioningPort,
    stageRosterService,
    trackBackgroundOperation: deps.trackBackgroundOperation,
  });
  const taskLifecycleSupport = new TaskLifecycleSupport({
    templateRepository: deps.templateRepository,
    taskAuthorities: deps.taskAuthorities,
    stageRosterService,
    taskBroadcastService,
    agentRuntimePort: deps.agentRuntimePort,
    taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
    taskBrainBindingService: deps.taskBrainBindingService,
    taskParticipationService: deps.taskParticipationService,
    contextMaterializationService: deps.contextMaterializationService,
    projectBrainAutomationService: deps.projectBrainAutomationService,
    skillCatalogPort: deps.skillCatalogPort,
  });
  const taskCoreSupport = new TaskCoreSupport({
    taskRepository: deps.taskRepository,
    subtaskRepository: deps.subtaskRepository,
    flowLogRepository: deps.flowLogRepository,
    progressLogRepository: deps.progressLogRepository,
    taskConversationRepository: deps.taskConversationRepository,
    approvalRequestRepository: deps.approvalRequestRepository,
    craftsmanExecutions: deps.craftsmanExecutions,
    taskAuthorities: deps.taskAuthorities,
    permissions: deps.permissions,
    stateMachine: deps.stateMachine,
    stageRosterService,
    taskBroadcastService,
    agentRuntimePort: deps.agentRuntimePort,
    taskContextBindingService: deps.taskContextBindingService,
    resolveHumanReminderParticipantRefs: deps.resolveHumanReminderParticipantRefs,
    craftsmanInputPort: deps.craftsmanInputPort,
    hostResourcePort: deps.hostResourcePort,
    isCraftsmanSessionAlive: deps.isCraftsmanSessionAlive,
    craftsmanGovernance: deps.craftsmanGovernance,
  });
  const taskStageSupport = new TaskStageSupport({
    databasePort: deps.db,
    taskRepository: deps.taskRepository,
    flowLogRepository: deps.flowLogRepository,
    progressLogRepository: deps.progressLogRepository,
    subtaskRepository: deps.subtaskRepository,
    archiveJobRepository: deps.archiveJobRepository,
    approvalRequestRepository: deps.approvalRequestRepository,
    craftsmanExecutions: deps.craftsmanExecutions,
    taskBroadcastService,
    taskParticipantSyncService,
    taskBrainBindingService: deps.taskBrainBindingService,
    projectContextWriter: deps.projectContextWriter,
    projectNomosAuthoringPort: deps.projectNomosAuthoringPort,
  });

  const taskStageServiceRef: { current: TaskStageService | null } = { current: null };
  const runTaskDoneAutomation = (task: TaskRecord) => {
    const authoring = task.control?.nomos_authoring;
    if (!authoring || authoring.kind !== 'project_nomos' || authoring.auto_refine_on_done === false) {
      return;
    }
    if (!task.project_id) {
      return;
    }
    if (!deps.projectNomosAuthoringPort) {
      throw new Error('Project Nomos authoring port is not configured');
    }
    deps.projectNomosAuthoringPort.refineProjectNomosDraft(task.project_id);
  };

  const taskRecoveryService = new TaskRecoveryService({
    databasePort: deps.db,
    taskRepository: deps.taskRepository,
    taskContextBindingRepository: deps.taskContextBindingRepository,
    flowLogRepository: deps.flowLogRepository,
    inboxRepository: deps.inboxRepository,
    escalationPolicy: deps.escalationPolicy,
    runtimeRecoveryPort: deps.runtimeRecoveryPort,
    listLiveSessions: deps.liveSessionStore ? () => deps.liveSessionStore!.listAll() : undefined,
    getRuntimeStaleAfterMs: deps.liveSessionStore ? () => deps.liveSessionStore!.getStaleAfterMs() : undefined,
    getCraftsmanGovernanceSnapshot: () => taskCraftsmanService.getCraftsmanGovernanceSnapshot(),
    assertTaskRuntimeControl: (task, callerId, action) => taskCoreSupport.assertTaskRuntimeControl(task, callerId, action),
    resolveTaskRuntimeParticipant: (task, agentRef) => taskCoreSupport.resolveTaskRuntimeParticipant(task, agentRef),
    getCraftsmanExecution: (executionId) => taskCraftsmanService.getCraftsmanExecution(executionId),
    getSubtaskOrThrow: (taskId, subtaskId) => taskCoreSupport.getSubtaskOrThrow(taskId, subtaskId),
    assertSubtaskControl: (task, subtask, callerId) => taskCoreSupport.assertSubtaskControl(task, subtask, callerId),
    publishTaskStatusBroadcast: (task, input) => taskStageSupport.publishTaskStatusBroadcast(task, input),
    mirrorConversationEntry: (taskId, input) => taskStageSupport.mirrorConversationEntry(taskId, input),
    buildSchedulerSnapshot: (task, reason) => taskStageSupport.buildSchedulerSnapshot(task, reason),
    failMissingCraftsmanSessions: (taskId, options) => taskCoreSupport.failMissingCraftsmanSessions(taskId, options),
    resolveLatestBusinessActivityMs: (task) => taskCoreSupport.resolveLatestBusinessActivityMs(task),
    getProbeState: (taskId, latestActivityMs) => taskCoreSupport.getProbeState(taskId, latestActivityMs),
    resolveApprovalWaitProbe: (task) => taskCoreSupport.resolveApprovalWaitProbe(task),
  });

  const taskLifecycleService = new TaskLifecycleService({
    databasePort: deps.db,
    taskRepository: deps.taskRepository,
    flowLogRepository: deps.flowLogRepository,
    progressLogRepository: deps.progressLogRepository,
    subtaskRepository: deps.subtaskRepository,
    todoRepository: deps.todoRepository,
    createTask: deps.createTask,
    tryLoadTemplate: (taskType) => taskLifecycleSupport.tryLoadTemplate(taskType),
    buildWorkflow: (template) => taskLifecycleSupport.buildWorkflow(template),
    buildTeam: (template) => taskLifecycleSupport.buildTeam(template),
    enrichTeam: (team) => taskLifecycleSupport.enrichTeam(team),
    taskIdGenerator: deps.taskIdGenerator,
    validateProjectBinding: ({ projectId, creator, authority }) => {
      deps.projectService.requireProject(projectId);
      if (deps.projectMemberships.hasConfiguredMemberships(projectId)) {
        deps.projectMemberships.requireActiveCreatorMembership(projectId, creator);
        deps.projectMemberships.requireActiveMemberAccounts(projectId, [
          authority?.requester_account_id,
          authority?.owner_account_id,
          authority?.assignee_account_id,
          authority?.approver_account_id,
        ]);
      }
      if (authority?.controller_agent_ref && deps.projectAgentRoster.hasConfiguredRoster(projectId)) {
        deps.projectAgentRoster.requireActiveAgent(projectId, authority.controller_agent_ref);
      }
    },
    enterStage: (taskId, stageId) => taskStageSupport.enterStage(taskId, stageId),
    seedTaskParticipants: ({ taskId, team, firstStage }) => {
      deps.taskParticipationService?.seedParticipants(taskId, team);
      if (firstStage) {
        taskParticipantSyncService.seedStageExposure(taskId, team, firstStage);
      }
    },
    createTaskBrainWorkspace: (task, templateId) => {
      if (!deps.taskBrainWorkspacePort || !deps.taskBrainBindingService) {
        return null;
      }
      const binding = deps.taskBrainWorkspacePort.createWorkspace(taskLifecycleSupport.buildTaskBrainWorkspaceRequest(task, templateId));
      deps.taskBrainBindingService.createBinding({
        task_id: task.id,
        brain_pack_ref: binding.brain_pack_ref,
        brain_task_id: binding.brain_task_id,
        workspace_path: binding.workspace_path,
        metadata: binding.metadata ?? null,
      });
      return {
        ...binding,
        metadata: binding.metadata ?? null,
      };
    },
    destroyTaskBrainWorkspace: (binding) => {
      if (!deps.taskBrainWorkspacePort) {
        return;
      }
      deps.taskBrainWorkspacePort.destroyWorkspace(binding);
    },
    recordProjectTaskBinding: ({ projectId, taskId, title, state, workspacePath }) => {
      deps.projectService.recordTaskBinding({
        project_id: projectId,
        task_id: taskId,
        title,
        state,
        workspace_path: workspacePath,
        bound_at: new Date().toISOString(),
      });
    },
    persistTaskAuthority: (taskId, authority) => {
      if (!authority) {
        return;
      }
      deps.taskAuthorities.createOrUpdate({
        task_id: taskId,
        requester_account_id: authority.requester_account_id ?? null,
        owner_account_id: authority.owner_account_id ?? null,
        assignee_account_id: authority.assignee_account_id ?? null,
        approver_account_id: authority.approver_account_id ?? null,
        controller_agent_ref: authority.controller_agent_ref ?? null,
      });
    },
    withControllerRef: (task) => taskLifecycleSupport.withControllerRef(task),
    buildTaskBlueprint: (task) => taskLifecycleSupport.buildTaskBlueprint(task),
    buildCurrentStageRoster: (task) => taskLifecycleSupport.buildCurrentStageRoster(task),
  });

  const taskApprovalService = new TaskApprovalService({
    getTaskOrThrow: (taskId) => taskCoreSupport.getTaskOrThrow(taskId),
    assertTaskActive: (task) => taskCoreSupport.assertTaskActive(task),
    getCurrentStageOrThrow: (task) => taskCoreSupport.getCurrentStageOrThrow(task),
    assertStageRosterAction: (task, stage, callerId, action) => taskCoreSupport.assertStageRosterAction(task, stage, callerId, action),
    assertApprovalAuthority: (task, actorAccountId) => taskCoreSupport.assertApprovalAuthority(task, actorAccountId),
    routeGateCommand: (task, stage, command, callerId) => deps.gateService.routeGateCommand(task, stage, command, callerId),
    getApproverRole: (stage) => taskStageSupport.getApproverRole(stage),
    recordApproval: (taskId, stageId, approverRole, approverId, comment) => {
      deps.gateService.recordApproval(taskId, stageId, approverRole, approverId, comment);
    },
    recordArchonReview: (taskId, stageId, decision, reviewerId, note) => {
      deps.gateService.recordArchonReview(taskId, stageId, decision, reviewerId, note);
    },
    recordQuorumVote: (taskId, stageId, voterId, vote, comment) => deps.gateService.recordQuorumVote(taskId, stageId, voterId, vote, comment),
    insertFlowLog: (input) => deps.flowLogRepository.insertFlowLog(input),
    mirrorConversationEntry: (taskId, input) => taskStageSupport.mirrorConversationEntry(taskId, input),
    resolvePendingApprovalRequest: (taskId, stageId, status, resolvedBy, resolutionComment) => {
      taskStageSupport.resolvePendingApprovalRequest(taskId, stageId, status, resolvedBy, resolutionComment);
    },
    advanceSatisfiedStage: (task, actor) => taskStageServiceRef.current!.advanceSatisfiedStage(task, actor),
    rewindRejectedStage: (task, currentStageId, decisionEvent, actor, reason) => taskStageServiceRef.current!.rewindRejectedStage(task, currentStageId, decisionEvent, actor, reason),
    publishGateDecisionBroadcast: (task, input) => taskStageSupport.publishGateDecisionBroadcast(task, input),
  });

  const taskStageService = new TaskStageService({
    getTaskOrThrow: (taskId) => taskCoreSupport.getTaskOrThrow(taskId),
    getCurrentStageOrThrow: (task) => taskCoreSupport.getCurrentStageOrThrow(task),
    assertStageRosterAction: (task, stage, callerId, action) => taskCoreSupport.assertStageRosterAction(task, stage, callerId, action),
    routeGateCommand: (task, stage, command, callerId) => deps.gateService.routeGateCommand(task, stage, command, callerId),
    checkGate: (task, stage, callerId) => deps.stateMachine.checkGate(deps.gateQueryPort, task, stage, callerId),
    ensureApprovalRequestForGate: (task, stage, requester) => taskStageSupport.ensureApprovalRequestForGate(task, stage, requester),
    publishTaskStatusBroadcast: (task, input) => taskStageSupport.publishTaskStatusBroadcast(task, input),
    advanceWorkflow: (task, nextStageId) => deps.stateMachine.advance(task.workflow, task.current_stage!, nextStageId),
    getRejectStage: (task, currentStageId) => deps.stateMachine.getRejectStage(task.workflow, currentStageId),
    reconcileStageExitSubtasks: (taskId, stageId, targetStatus, reason) => taskStageSupport.reconcileStageExitSubtasks(taskId, stageId, targetStatus, reason),
    exitStage: (taskId, stageId, reason) => taskStageSupport.exitStage(taskId, stageId, reason),
    runTaskDoneAutomation,
    updateTask: (taskId, version, patch) => deps.taskRepository.updateTask(taskId, version, patch),
    refreshTaskBrainWorkspace: (task) => taskLifecycleSupport.refreshTaskBrainWorkspace(task),
    materializeTaskCloseRecap: (task, actor, reason) => taskStageSupport.materializeTaskCloseRecap(task, actor, reason),
    ensureArchiveJobForTask: (taskId) => taskStageSupport.ensureArchiveJobForTask(taskId),
    insertFlowLog: (input) => deps.flowLogRepository.insertFlowLog(input),
    mirrorConversationEntry: (taskId, input) => taskStageSupport.mirrorConversationEntry(taskId, input),
    publishControllerCloseoutReminder: (task, archiveJob) => taskStageSupport.publishControllerCloseoutReminder(task, archiveJob as { payload?: unknown }),
    enterStage: (taskId, stageId) => taskStageSupport.enterStage(taskId, stageId),
    insertProgressLog: (input) => deps.progressLogRepository.insertProgressLog(input),
    describeGateState: (stage) => taskStageSupport.describeGateState(stage),
    buildSmokeStageEntryCommands: (task, stage) => taskStageSupport.buildSmokeStageEntryCommands(task, stage),
    reconcileStageParticipants: (task, stage) => taskStageSupport.reconcileStageParticipants(task, stage),
    validateTransition: (fromState, toState) => deps.stateMachine.validateTransition(fromState, toState),
    buildSchedulerSnapshot: (task, reason) => taskStageSupport.buildSchedulerSnapshot(task, reason),
    dbBegin: () => deps.db.exec('BEGIN'),
    dbCommit: () => deps.db.exec('COMMIT'),
    dbRollback: () => deps.db.exec('ROLLBACK'),
    applyStateTransitionSideEffects: (task, newState, options) => taskStageSupport.applyStateTransitionSideEffects(task, newState, options),
    cancelOpenWork: (taskId, reason) => taskStageSupport.cancelOpenWork(taskId, reason),
    buildStateChangeDetail: (options, actionDetail) => taskStageSupport.buildStateChangeDetail(options, actionDetail),
    buildStateConversationBody: (fromState, toState, options) => taskStageSupport.buildStateConversationBody(fromState, toState, options),
    getStateActionEvent: (fromState, toState) => taskStageSupport.getStateActionEvent(fromState, toState),
    resumeDeferredCallbacks: (taskId) => deps.craftsmanCallbacks.resumeDeferredCallbacks(taskId),
    failMissingCraftsmanSessionsOnResume: (taskId) => taskCoreSupport.failMissingCraftsmanSessionsOnResume(taskId),
    syncImContextForTaskState: (taskId, fromState, toState, reason, onSuccess) => {
      taskStageSupport.syncImContextForTaskState(taskId, fromState, toState, reason, onSuccess);
    },
    publishTaskStateBroadcast: (task, fromState, toState, reason) => taskStageSupport.publishTaskStateBroadcast(task, fromState, toState, reason),
    getDoneStateBroadcastLines: () => ['Task reached done state and has been queued for archive handling.'],
  });

  const taskCraftsmanService = new TaskCraftsmanService({
    getTaskOrThrow: (taskId) => taskCoreSupport.getTaskOrThrow(taskId),
    withControllerRef: (task) => taskLifecycleSupport.withControllerRef(task),
    listSubtasksByTask: (taskId) => deps.subtaskRepository.listByTask(taskId),
    getSubtaskOrThrow: (taskId, subtaskId) => taskCoreSupport.getSubtaskOrThrow(taskId, subtaskId),
    getCurrentStageOrThrow: (task) => taskCoreSupport.getCurrentStageOrThrow(task),
    getStageByIdOrThrow: (task, stageId) => taskLifecycleSupport.getStageByIdOrThrow(task, stageId),
    assertSubtaskControl: (task, subtask, callerId) => taskCoreSupport.assertSubtaskControl(task, subtask, callerId),
    updateSubtask: (taskId, subtaskId, patch) => deps.subtaskRepository.updateSubtask(taskId, subtaskId, patch),
    assertCraftsmanInteractionGuard: (mode, interactionExpectation, scope) => taskCoreSupport.assertCraftsmanInteractionGuard(mode, interactionExpectation, scope),
    assertCraftsmanDispatchAllowed: (assignee, additionalPlanned) => taskCoreSupport.assertCraftsmanDispatchAllowed(assignee, additionalPlanned),
    resolveDispatchWorkdir: (task) => deps.taskWorktreeService.resolveDispatchWorkdir(task) as string,
    materializeExecutionBrief: (task, input) => taskLifecycleSupport.materializeExecutionBrief(task, input),
    enterExecuteMode: (taskId, stageId, executeDefs) => {
      const controller = new ModeController({
        subtaskRepository: deps.subtaskRepository,
        progressService: new ProgressService({
          flowLogRepository: deps.flowLogRepository,
          progressLogRepository: deps.progressLogRepository,
        }),
        ...(deps.craftsmanDispatcher ? { dispatcher: deps.craftsmanDispatcher } : {}),
      });
      controller.enterExecuteMode(taskId, stageId, executeDefs);
    },
    listExecutionsBySubtask: (taskId, subtaskId) => deps.craftsmanExecutions.listBySubtask(taskId, subtaskId),
    updateExecution: (executionId, patch) => deps.craftsmanExecutions.updateExecution(executionId, patch),
    getExecution: (executionId) => deps.craftsmanExecutions.getExecution(executionId),
    ...(deps.craftsmanExecutionTailPort
      ? {
          tailExecution: (execution: {
            execution_id: string;
            adapter: string;
            session_id: string | null;
            workdir: string | null;
            status: string;
          }, lines: number) => deps.craftsmanExecutionTailPort!.tail({
            executionId: execution.execution_id,
            adapter: execution.adapter,
            sessionId: execution.session_id,
            workdir: execution.workdir,
            status: execution.status,
          }, lines),
        }
      : {}),
    insertFlowLog: (input) => deps.flowLogRepository.insertFlowLog(input),
    mirrorConversationEntry: (taskId, input) => taskStageSupport.mirrorConversationEntry(taskId, input),
    publishTaskStatusBroadcast: (task, input) => taskStageSupport.publishTaskStatusBroadcast(task, input),
    countActiveExecutions: () => deps.craftsmanExecutions.countActiveExecutions(),
    listActiveExecutionCountsByAssignee: () => deps.craftsmanExecutions.listActiveExecutionCountsByAssignee(),
    listActiveExecutions: () => deps.craftsmanExecutions.listActiveExecutions(),
    readHostSnapshot: () => deps.hostResourcePort?.readSnapshot() ?? null,
    resolveHostPressureStatus: (snapshot) => taskCoreSupport.resolveHostPressureStatus(snapshot),
    buildHostGovernanceWarnings: (snapshot) => taskCoreSupport.buildHostGovernanceWarnings(snapshot),
    governanceLimits: deps.craftsmanGovernance,
    requireInteractiveExecution: (executionId) => taskCoreSupport.requireInteractiveExecution(executionId),
    ...(deps.craftsmanInputPort
      ? {
          sendText: (execution: ReturnType<TaskCoreSupport['requireInteractiveExecution']>, text: string, submit: boolean) => deps.craftsmanInputPort!.sendText(execution, text, submit),
          sendKeys: (execution: ReturnType<TaskCoreSupport['requireInteractiveExecution']>, keys: CraftsmanInputKeyDto[]) => deps.craftsmanInputPort!.sendKeys(execution, keys),
          submitChoice: (execution: ReturnType<TaskCoreSupport['requireInteractiveExecution']>, keys: CraftsmanInputKeyDto[]) => deps.craftsmanInputPort!.submitChoice(execution, keys),
        }
      : {}),
    recordCraftsmanInput: (taskId, subtaskId, executionId, inputType, detail) => taskCoreSupport.recordCraftsmanInput(taskId, subtaskId, executionId, inputType, detail),
    buildSmokeSubtaskCommands: (task, callerId, createdSubtasks, dispatchedExecutions) => taskStageSupport.buildSmokeSubtaskCommands(task, callerId, createdSubtasks, dispatchedExecutions),
    buildSmokeExecutionCommandsForTask: (task, executionId, status) => taskBroadcastService.buildSmokeExecutionCommandsForTask(task, executionId, status),
    ...(deps.craftsmanDispatcher
      ? {
          dispatchSubtask: (input: {
            task_id: string;
            stage_id: string;
            subtask_id: string;
            adapter: string;
            mode: 'one_shot' | 'interactive';
            workdir: string;
            prompt: string | null;
            brief_path: string | null;
          }) => deps.craftsmanDispatcher!.dispatchSubtask(input),
        }
      : {}),
    ...(deps.craftsmanExecutionProbePort
      ? {
          probeViaPort: (execution: {
            executionId: string;
            adapter: string;
            sessionId: string | null;
            workdir: string | null;
            status: string;
          }) => deps.craftsmanExecutionProbePort!.probe(execution),
        }
      : {}),
    processCraftsmanCallback: (input) => deps.craftsmanCallbacks.handleCallback(input),
    publishImmediateCraftsmanNotification: (taskId, executionId, subtaskId) => {
      taskStageSupport.sendImmediateCraftsmanNotification(taskId, executionId, subtaskId);
    },
    getCraftsmanProbeState: (executionId, latestActivityMs) => taskCoreSupport.getCraftsmanProbeState(executionId, latestActivityMs),
    shouldProbeCraftsmanExecution: (nowMs, thresholdMs, probeState) => taskCoreSupport.shouldProbeCraftsmanExecution(nowMs, thresholdMs, probeState),
    noteCraftsmanAutoProbe: (executionId, latestActivityMs, nowMs) => taskCoreSupport.noteCraftsmanAutoProbe(executionId, latestActivityMs, nowMs),
  });

  taskStageServiceRef.current = taskStageService;

  return {
    stageRosterService,
    taskBroadcastService,
    taskParticipantSyncService,
    taskLifecycleSupport,
    taskCoreSupport,
    taskStageSupport,
    taskRecoveryService,
    taskLifecycleService,
    taskApprovalService,
    taskStageService,
    taskCraftsmanService,
  };
}
