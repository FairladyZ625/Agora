/**
 * Repository interfaces for Core data access.
 *
 * These interfaces define the contracts that Core depends on.
 * Concrete implementations live in @agora-ts/db and are bound
 * at the composition root (apps/server, apps/cli).
 *
 * Design rules:
 * - Return types use domain record types from './domain-types.js'
 * - Complex DB-specific input shapes use Record<string, unknown> since
 *   Core never constructs these directly -- they are assembled inside
 *   Core services before passing to repos.
 * - Method signatures mirror the actual repository methods Core calls
 */

import type {
  ApprovalRequestRecord,
  ArchiveJobRecord,
  CitizenRecord,
  CraftsmanExecutionRecord,
  FlowLogRecord,
  HumanAccountRecord,
  HumanIdentityBindingRecord,
  InboxItemRecord,
  InsertCraftsmanExecutionInput,
  InsertCitizenInput,
  InsertHumanAccountInput,
  InsertNotificationOutboxInput,
  InsertParticipantBindingInput,
  InsertProjectInput,
  InsertTaskConversationEntryInput,
  NotificationOutboxRecord,
  ParticipantBindingRecord,
  ProgressLogRecord,
  ProjectAgentRosterEntryRecord,
  ProjectBrainIndexJobRecord,
  ProjectBrainIndexJobStatus,
  ProjectMembershipRecord,
  ProjectRecord,
  ProjectWriteLockRecord,
  ReconcileRuntimeSessionBindingInput,
  RoleDefinitionRecord,
  RuntimeSessionBindingRecord,
  SubtaskRecord,
  TaskAuthorityRecord,
  TaskBrainBindingRecord,
  TaskContextBindingRecord,
  TaskConversationEntryRecord,
  TaskConversationReadCursorRecord,
  TaskRecord,
  TemplateRecord,
  TodoRecord,
  UpdateCraftsmanExecutionInput,
  UpdateHumanAccountInput,
  UpdateInboxItemInput,
  UpdateProjectInput,
  UpdateProjectMembershipInput,
  UpdateTaskInput,
  UpdateTodoInput,
  UpsertProjectAgentRosterEntryInput,
  UpsertProjectMembershipInput,
  UpsertRuntimeSessionBindingInput,
  UpsertTaskAuthorityInput,
} from './domain-types.js';

import type {
  TaskLocaleDto,
  TeamDto,
  WorkflowDto,
} from './task-api.js';

// ---------------------------------------------------------------------------
// Gate query / command — used by StateMachine and GateService
// ---------------------------------------------------------------------------

export interface GateQueryPort {
  /** Return the latest archon review decision for a task+stage, or null. */
  getLatestArchonReview(
    taskId: string,
    stageId: string,
  ): { decision: string } | undefined;

  /** Return all subtask statuses for a task+stage. */
  getSubtaskStatuses(
    taskId: string,
    stageId: string,
  ): Array<{ status: string }>;

  /** Return whether an approval exists for a task+stage. */
  hasApproval(taskId: string, stageId: string): boolean;

  /** Return the count of approve votes for a quorum gate. */
  getQuorumApproveCount(taskId: string, stageId: string): number;

  /** Return the most recent stage_entry timestamp, or null. */
  getStageEntryTime(
    taskId: string,
    stageId: string,
  ): string | undefined;
}

export interface GateCommandPort {
  recordArchonReview(
    taskId: string,
    stageId: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
    comment: string,
  ): void;

  recordApproval(
    taskId: string,
    stageId: string,
    approverRole: string,
    approverId: string,
    comment: string,
  ): void;

  recordQuorumVote(
    taskId: string,
    stageId: string,
    voterId: string,
    vote: string,
    comment: string,
  ): { approved: number; total: number };
}

// ---------------------------------------------------------------------------
// Transaction management
// ---------------------------------------------------------------------------

export interface TransactionManager {
  begin(): void;
  commit(): void;
  rollback(): void;
}

// ---------------------------------------------------------------------------
// 26 Repository interfaces
// ---------------------------------------------------------------------------

// ─── 1. Task ──────────────────────────────────────────────────────────────

export interface ITaskRepository {
  getTask(taskId: string): TaskRecord | null;
  insertTask(input: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    priority: string;
    creator: string;
    locale: TaskLocaleDto;
    project_id?: string | null;
    team: TeamDto;
    workflow: WorkflowDto;
  }): TaskRecord;
  updateTask(
    taskId: string,
    version: number,
    updates: UpdateTaskInput,
  ): TaskRecord;
  listTasks(state?: string, projectId?: string): TaskRecord[];
}

// ─── 2. Subtask ───────────────────────────────────────────────────────────

export interface ISubtaskRepository {
  insertSubtask(input: {
    id: string;
    task_id: string;
    stage_id: string;
    title: string;
    assignee: string;
    craftsman_type?: string | null;
  }): SubtaskRecord;
  updateSubtask(
    taskId: string,
    subtaskId: string,
    updates: {
      status?: string;
      output?: string | null;
      craftsman_type?: string | null;
      craftsman_session?: string | null;
      craftsman_workdir?: string | null;
      craftsman_prompt?: string | null;
      dispatch_status?: string | null;
      dispatched_at?: string | null;
      done_at?: string | null;
    },
  ): SubtaskRecord;
  listByTask(taskId: string): SubtaskRecord[];
  listByTaskIds(taskIds: string[]): SubtaskRecord[];
}

// ─── 3. FlowLog ───────────────────────────────────────────────────────────

export interface IFlowLogRepository {
  insertFlowLog(input: {
    task_id: string;
    event: string;
    kind: string;
    stage_id?: string | null;
    from_state?: string | null;
    to_state?: string | null;
    actor?: string;
    detail?: unknown;
  }): FlowLogRecord;
  listByTask(taskId: string): FlowLogRecord[];
}

// ─── 4. ProgressLog ───────────────────────────────────────────────────────

export interface IProgressLogRepository {
  insertProgressLog(input: {
    task_id: string;
    kind: string;
    stage_id?: string | null;
    subtask_id?: string | null;
    content: string;
    artifacts?: unknown;
    actor: string;
  }): ProgressLogRecord;
  listByTask(taskId: string): ProgressLogRecord[];
}

// ─── 5. Todo ──────────────────────────────────────────────────────────────

export interface ITodoRepository {
  insertTodo(input: {
    text: string;
    project_id?: string | null;
    due?: string | null;
    tags?: string[];
  }): TodoRecord;
  getTodo(todoId: number): TodoRecord | null;
  listTodos(status?: string): TodoRecord[];
  updateTodo(todoId: number, updates: UpdateTodoInput): TodoRecord;
  deleteTodo(todoId: number): boolean;
}

// ─── 6. Inbox ─────────────────────────────────────────────────────────────

export interface IInboxRepository {
  insertInboxItem(input: {
    text: string;
    source?: string;
    notes?: string;
    tags?: string[];
    metadata?: Record<string, unknown> | null;
  }): InboxItemRecord;
  getInboxItem(inboxId: number): InboxItemRecord | null;
  listInboxItems(status?: string): InboxItemRecord[];
  updateInboxItem(
    inboxId: number,
    updates: UpdateInboxItemInput,
  ): InboxItemRecord;
  deleteInboxItem(inboxId: number): boolean;
}

// ─── 7. ArchiveJob ────────────────────────────────────────────────────────

export interface IArchiveJobRepository {
  insertArchiveJob(input: {
    task_id: string;
    status: string;
    target_path: string;
    payload: Record<string, unknown>;
    writer_agent: string;
  }): ArchiveJobRecord;
  getArchiveJob(jobId: number): ArchiveJobRecord | null;
  listArchiveJobs(filters?: {
    status?: string;
    taskId?: string;
  }): ArchiveJobRecord[];
  retryArchiveJob(jobId: number): ArchiveJobRecord;
  updateArchiveJob(
    jobId: number,
    updates: {
      status: string;
      commit_hash?: string;
      error_message?: string;
      payload_patch?: Record<string, unknown>;
    },
  ): ArchiveJobRecord;
  failStaleNotifiedJobs(options: {
    timeoutMs: number;
    now?: Date;
  }): number;
}

// ─── 8. ApprovalRequest ───────────────────────────────────────────────────

export interface IApprovalRequestRepository {
  getLatestPending(
    taskId: string,
    stageId: string,
  ): ApprovalRequestRecord | null;
  insert(input: {
    id?: string;
    task_id: string;
    stage_id: string;
    gate_type: string;
    requested_by: string;
    summary_path?: string | null;
    request_comment?: string | null;
    metadata?: Record<string, unknown> | null;
  }): ApprovalRequestRecord;
  resolve(
    id: string,
    input: {
      status: 'approved' | 'rejected';
      resolved_by: string;
      resolution_comment?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): ApprovalRequestRecord;
}

// ─── 9. CraftsmanExecution ────────────────────────────────────────────────

export interface ICraftsmanExecutionRepository {
  countActiveExecutions(): number;
  insertExecution(
    input: InsertCraftsmanExecutionInput,
  ): CraftsmanExecutionRecord;
  updateExecution(
    executionId: string,
    updates: UpdateCraftsmanExecutionInput,
  ): CraftsmanExecutionRecord;
  getExecution(executionId: string): CraftsmanExecutionRecord | null;
  listBySubtask(
    taskId: string,
    subtaskId: string,
  ): CraftsmanExecutionRecord[];
  listByTaskIds(taskIds: string[]): CraftsmanExecutionRecord[];
}

// ─── 10. TaskContextBinding ────────────────────────────────────────────────

export interface ITaskContextBindingRepository {
  insert(input: {
    id: string;
    task_id: string;
    im_provider: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
    status?: string;
  }): TaskContextBindingRecord;
  getActiveByTask(taskId: string): TaskContextBindingRecord | null;
  listByTask(taskId: string): TaskContextBindingRecord[];
  listByTaskBindingsForRefs(input: {
    thread_ref?: string | null;
    conversation_ref?: string | null;
  }): TaskContextBindingRecord[];
  updateStatus(id: string, status: string, closedAt?: string): void;
  getById(id: string): TaskContextBindingRecord | null;
}

// ─── 11. TaskConversation ─────────────────────────────────────────────────

export interface ITaskConversationRepository {
  insert(input: InsertTaskConversationEntryInput): TaskConversationEntryRecord;
  listByTask(
    taskId: string,
    limit?: number,
  ): TaskConversationEntryRecord[];
  getLatestByTask(taskId: string): TaskConversationEntryRecord | null;
  countByTask(taskId: string): number;
  countUnreadByTask(
    taskId: string,
    afterIngestedAt?: string | null,
  ): number;
}

// ─── 12. TaskConversationReadCursor ───────────────────────────────────────

export interface ITaskConversationReadCursorRepository {
  get(
    taskId: string,
    accountId: number,
  ): TaskConversationReadCursorRecord | null;
  upsert(input: {
    task_id: string;
    account_id: number;
    last_read_entry_id?: string | null;
    last_read_at: string;
    updated_at: string;
  }): TaskConversationReadCursorRecord;
}

// ─── 13. TaskBrainBinding ─────────────────────────────────────────────────

export interface ITaskBrainBindingRepository {
  insert(input: {
    id: string;
    task_id: string;
    brain_pack_ref: string;
    brain_task_id: string;
    workspace_path: string;
    metadata?: Record<string, unknown> | null;
    status?: string;
  }): TaskBrainBindingRecord;
  getActiveByTask(taskId: string): TaskBrainBindingRecord | null;
  listByTask(taskId: string): TaskBrainBindingRecord[];
  updateStatus(id: string, status: string): void;
}

// ─── 14. TaskAuthority ────────────────────────────────────────────────────

export interface ITaskAuthorityRepository {
  upsertTaskAuthority(
    input: UpsertTaskAuthorityInput,
  ): TaskAuthorityRecord;
  getTaskAuthority(taskId: string): TaskAuthorityRecord | null;
}

// ─── 15. NotificationOutbox ───────────────────────────────────────────────

export interface INotificationOutboxRepository {
  insert(input: InsertNotificationOutboxInput): NotificationOutboxRecord;
  listPending(limit?: number): NotificationOutboxRecord[];
  markDelivered(id: string): void;
  markFailed(id: string, error: string): void;
}

// ─── 16. Project ──────────────────────────────────────────────────────────

export interface IProjectRepository {
  insertProject(input: InsertProjectInput): ProjectRecord;
  getProject(projectId: string): ProjectRecord | null;
  listProjects(status?: string): ProjectRecord[];
  updateProject(
    projectId: string,
    updates: UpdateProjectInput,
  ): ProjectRecord;
  deleteProject(projectId: string): void;
}

// ─── 17. ProjectMembership ────────────────────────────────────────────────

export interface IProjectMembershipRepository {
  upsertMembership(
    input: UpsertProjectMembershipInput,
  ): ProjectMembershipRecord;
  listByProject(
    projectId: string,
    status?: string,
  ): ProjectMembershipRecord[];
  getByProjectAccount(
    projectId: string,
    accountId: number,
  ): ProjectMembershipRecord | null;
  updateMembership(
    id: string,
    updates: UpdateProjectMembershipInput,
  ): ProjectMembershipRecord;
}

// ─── 18. ProjectAgentRoster ───────────────────────────────────────────────

export interface IProjectAgentRosterRepository {
  upsertEntry(
    input: UpsertProjectAgentRosterEntryInput,
  ): ProjectAgentRosterEntryRecord;
  listByProject(
    projectId: string,
    status?: string,
  ): ProjectAgentRosterEntryRecord[];
  getByProjectAgent(
    projectId: string,
    agentRef: string,
  ): ProjectAgentRosterEntryRecord | null;
}

// ─── 19. ProjectWriteLock ─────────────────────────────────────────────────

export interface IProjectWriteLockRepository {
  acquireLock(
    input: { project_id: string; holder_task_id: string },
  ): ProjectWriteLockRecord | null;
  releaseLock(projectId: string, holderTaskId: string): boolean;
  getLock(projectId: string): ProjectWriteLockRecord | null;
}

// ─── 20. ProjectBrainIndexJob ─────────────────────────────────────────────

export interface IProjectBrainIndexJobRepository {
  enqueue(input: {
    project_id: string;
    document_kind: string;
    document_slug: string;
    reason: string;
  }): ProjectBrainIndexJobRecord;
  listJobs(filters?: {
    project_id?: string;
    status?: ProjectBrainIndexJobStatus;
  }): ProjectBrainIndexJobRecord[];
  claimNextPending(): ProjectBrainIndexJobRecord | null;
  markSucceeded(jobId: number): ProjectBrainIndexJobRecord;
  markFailed(jobId: number, error: string): ProjectBrainIndexJobRecord;
}

// ─── 21. Template ─────────────────────────────────────────────────────────

export interface ITemplateRepository {
  seedFromDir(templatesDir: string): { inserted: number };
  repairMemberKindsFromDir(templatesDir: string): unknown;
  repairStageSemanticsFromDir(templatesDir: string): unknown;
  repairGraphsFromDir(templatesDir: string): unknown;
  listTemplates(): TemplateRecord[];
  getTemplate(templateId: string): TemplateRecord | null;
  saveTemplate(
    templateId: string,
    template: unknown,
    source?: string,
  ): TemplateRecord;
}

// ─── 22. Citizen ──────────────────────────────────────────────────────────

export interface ICitizenRepository {
  insertCitizen(input: InsertCitizenInput): CitizenRecord;
  getCitizen(citizenId: string): CitizenRecord | null;
  listCitizens(projectId?: string, status?: string): CitizenRecord[];
}

// ─── 23. RoleDefinition ───────────────────────────────────────────────────

export interface IRoleDefinitionRepository {
  listRoleDefinitions(): RoleDefinitionRecord[];
  getRoleDefinition(roleId: string): RoleDefinitionRecord | null;
  saveRoleDefinition(definitionInput: unknown): RoleDefinitionRecord;
  seedFromPackDir(packDir: string): {
    inserted: number;
    updated: number;
    manifest: unknown | null;
  };
}

// ─── 24. RoleBinding ──────────────────────────────────────────────────────

export interface IRoleBindingRepository {
  saveBinding(input: {
    id: string;
    role_id: string;
    scope: string;
    scope_ref: string;
    target_kind: string;
    target_adapter: string;
    target_ref: string;
    binding_mode: string;
    metadata?: Record<string, unknown> | null;
  }): unknown;
  getBinding(scope: string, scopeRef: string, roleId: string): unknown;
  listBindingsByScope(scope: string, scopeRef: string): unknown[];
}

// ─── 25. HumanAccount ─────────────────────────────────────────────────────

export interface IHumanAccountRepository {
  insertAccount(input: InsertHumanAccountInput): HumanAccountRecord;
  getById(id: number): HumanAccountRecord | null;
  getByUsername(username: string): HumanAccountRecord | null;
  listAccounts(): HumanAccountRecord[];
  countAccounts(): number;
  updateAccount(
    username: string,
    updates: UpdateHumanAccountInput,
  ): HumanAccountRecord;
}

// ─── 26. HumanIdentityBinding ─────────────────────────────────────────────

export interface IHumanIdentityBindingRepository {
  bindIdentity(
    accountId: number,
    provider: string,
    externalUserId: string,
  ): HumanIdentityBindingRecord;
  getByProviderExternalId(
    provider: string,
    externalUserId: string,
  ): HumanIdentityBindingRecord | null;
  listByAccountId(accountId: number): HumanIdentityBindingRecord[];
}

// ─── 27. ParticipantBinding ───────────────────────────────────────────────

export interface IParticipantBindingRepository {
  insert(input: InsertParticipantBindingInput): ParticipantBindingRecord;
  listByTask(taskId: string): ParticipantBindingRecord[];
  getByTaskAndAgent(
    taskId: string,
    agentRef: string,
  ): ParticipantBindingRecord | null;
  updateJoinState(
    id: string,
    joinStatus: string,
    timestamps?: {
      joined_at?: string | null;
      left_at?: string | null;
    },
  ): void;
  updateExposureState(
    id: string,
    input: {
      desired_exposure: string;
      exposure_reason?: string | null;
      exposure_stage_id?: string | null;
      reconciled_at?: string | null;
    },
  ): void;
}

// ─── 28. RuntimeSessionBinding ────────────────────────────────────────────

export interface IRuntimeSessionBindingRepository {
  upsertByParticipant(
    input: UpsertRuntimeSessionBindingInput,
  ): RuntimeSessionBindingRecord;
  getByParticipantBinding(
    participantBindingId: string,
  ): RuntimeSessionBindingRecord | null;
  listByTask(taskId: string): RuntimeSessionBindingRecord[];
  reconcileByParticipant(
    participantBindingId: string,
    input: ReconcileRuntimeSessionBindingInput,
  ): void;
}
