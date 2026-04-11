/**
 * Domain record types — storage-agnostic data shapes used across Core.
 *
 * These types mirror the DB StoredXxx shapes exactly (same field names, same nullability)
 * so that DB repos can implement the repo interfaces without mapping overhead.
 * The DB layer aliases its StoredXxx types to these.
 *
 * IMPORTANT: do NOT add methods, computed properties, or view-specific projections here.
 * These are pure data records.
 */

import type { CitizenDefinitionDto } from './citizen.js';
import type { CraftsmanExecutionPayloadDto } from './craftsman.js';
import type { RoleDefinitionDto } from './roles.js';
import type {
  TaskConversationDirection,
  TaskConversationAuthorKind,
  TaskConversationBodyFormat,
} from './task-conversation.js';
import type { TemplateDetailDto } from './dashboard.js';
import type {
  SubtaskStatusDto,
  TaskControlDto,
  TaskLocaleDto,
  TaskSkillPolicyDto,
  TeamDto,
  WorkflowDto,
} from './task-api.js';

// ─── Scheduler snapshot ──────────────────────────────────────────────────

export interface SchedulerSnapshot {
  captured_at: string;
  reason: string;
  state: string;
  current_stage: string | null;
  error_detail: string | null;
  pending_subtasks: Array<{
    id: string;
    stage_id: string;
    status: string;
    dispatch_status: string | null;
  }>;
  inflight_executions: Array<{
    execution_id: string;
    subtask_id: string;
    status: string;
    adapter: string;
  }>;
}

// ─── Task ────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  creator: string;
  locale: TaskLocaleDto;
  project_id?: string | null;
  state: string;
  archive_status: string | null;
  current_stage: string | null;
  skill_policy: TaskSkillPolicyDto | null;
  team: TeamDto;
  workflow: WorkflowDto;
  control: TaskControlDto | null;
  scheduler: unknown;
  scheduler_snapshot: SchedulerSnapshot | null;
  discord: unknown;
  metrics: unknown;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Subtask ─────────────────────────────────────────────────────────────

export interface SubtaskRecord {
  id: string;
  task_id: string;
  stage_id: string;
  title: string;
  assignee: string;
  status: SubtaskStatusDto;
  output: string | null;
  craftsman_type: string | null;
  craftsman_session: string | null;
  craftsman_workdir: string | null;
  craftsman_prompt: string | null;
  dispatch_status: string | null;
  dispatched_at: string | null;
  done_at: string | null;
}

// ─── Project ─────────────────────────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  owner: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ─── Task context / conversation ─────────────────────────────────────────

export interface TaskContextBindingRecord {
  id: string;
  task_id: string;
  im_provider: string;
  conversation_ref: string | null;
  thread_ref: string | null;
  message_root_ref: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface TaskConversationEntryRecord {
  id: string;
  task_id: string;
  binding_id: string;
  provider: string;
  provider_message_ref: string | null;
  parent_message_ref: string | null;
  direction: TaskConversationDirection;
  author_kind: TaskConversationAuthorKind;
  author_ref: string | null;
  display_name: string | null;
  body: string;
  body_format: TaskConversationBodyFormat;
  occurred_at: string;
  ingested_at: string;
  dedupe_key: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TaskConversationReadCursorRecord {
  task_id: string;
  account_id: number;
  last_read_entry_id: string | null;
  last_read_at: string;
  updated_at: string;
}

// ─── Task brain binding ──────────────────────────────────────────────────

export interface TaskBrainBindingRecord {
  id: string;
  task_id: string;
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// ─── Task authority ──────────────────────────────────────────────────────

export interface TaskAuthorityRecord {
  task_id: string;
  requester_account_id: number | null;
  owner_account_id: number | null;
  assignee_account_id: number | null;
  approver_account_id: number | null;
  controller_agent_ref: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Participant / runtime session ───────────────────────────────────────

export interface ParticipantBindingRecord {
  id: string;
  task_id: string;
  binding_id: string | null;
  agent_ref: string;
  runtime_provider: string | null;
  task_role: string;
  source: string;
  join_status: string;
  desired_exposure: string;
  exposure_reason: string | null;
  exposure_stage_id: string | null;
  reconciled_at: string | null;
  created_at: string;
  joined_at: string | null;
  left_at: string | null;
}

export interface RuntimeSessionBindingRecord {
  id: string;
  participant_binding_id: string;
  runtime_provider: string;
  runtime_session_ref: string;
  runtime_actor_ref: string | null;
  continuity_ref: string | null;
  presence_state: string;
  binding_reason: string | null;
  desired_runtime_presence: string;
  reconcile_stage_id: string | null;
  reconciled_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// ─── Flow / progress logs ───────────────────────────────────────────────

export interface FlowLogRecord {
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

export interface ProgressLogRecord {
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

// ─── Todo / Inbox ────────────────────────────────────────────────────────

export interface TodoRecord {
  id: number;
  text: string;
  project_id: string | null;
  status: string;
  due: string | null;
  created_at: string;
  completed_at: string | null;
  tags: string[];
  promoted_to: string | null;
}

export interface InboxItemRecord {
  id: number;
  text: string;
  status: string;
  source: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  promoted_to_type: string | null;
  promoted_to_id: string | null;
  metadata: Record<string, unknown> | null;
}

// ─── Archive ─────────────────────────────────────────────────────────────

export interface ArchiveJobRecord {
  id: number;
  task_id: string;
  task_title: string;
  task_type: string;
  status: string;
  target_path: string;
  writer_agent: string;
  commit_hash: string | null;
  requested_at: string;
  completed_at: string | null;
  payload: Record<string, unknown>;
}

// ─── Approval ────────────────────────────────────────────────────────────

export interface ApprovalRequestRecord {
  id: string;
  task_id: string;
  stage_id: string;
  gate_type: string;
  requested_by: string;
  status: 'pending' | 'approved' | 'rejected';
  summary_path: string | null;
  request_comment: string | null;
  resolution_comment: string | null;
  resolved_by: string | null;
  requested_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
}

// ─── Notification ────────────────────────────────────────────────────────

export interface NotificationOutboxRecord {
  id: string;
  task_id: string;
  event_type: string;
  target_binding_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  sequence_no: number;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

// ─── Craftsman execution ─────────────────────────────────────────────────

export interface CraftsmanExecutionRecord {
  execution_id: string;
  task_id: string;
  subtask_id: string;
  adapter: string;
  mode: string;
  session_id: string | null;
  status: string;
  brief_path: string | null;
  workdir: string | null;
  callback_payload: CraftsmanExecutionPayloadDto | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Project membership / roster ─────────────────────────────────────────

export interface ProjectMembershipRecord {
  id: string;
  project_id: string;
  account_id: number;
  role: string;
  status: string;
  added_by_account_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAgentRosterEntryRecord {
  id: string;
  project_id: string;
  agent_ref: string;
  kind: string;
  default_inclusion: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWriteLockRecord {
  project_id: string;
  holder_task_id: string;
  acquired_at: string;
}

// ─── Project brain index job ─────────────────────────────────────────────

export type ProjectBrainIndexJobStatus = 'pending' | 'running' | 'failed' | 'succeeded';

export interface ProjectBrainIndexJobRecord {
  id: number;
  project_id: string;
  document_kind: string;
  document_slug: string;
  reason: string;
  status: ProjectBrainIndexJobStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Template ────────────────────────────────────────────────────────────

export interface TemplateRecord {
  id: string;
  version: number;
  source: string;
  template: TemplateDetailDto;
  created_at: string;
  updated_at: string;
}

// ─── Citizen ─────────────────────────────────────────────────────────────

/** StoredCitizenDefinition is an alias for CitizenDefinitionDto from contracts. */
export type CitizenRecord = CitizenDefinitionDto;

// ─── Role ────────────────────────────────────────────────────────────────

export interface RoleDefinitionRecord {
  id: string;
  version: number;
  name: string;
  member_kind: RoleDefinitionDto['member_kind'];
  source: string;
  source_ref: string | null;
  summary: string;
  prompt_asset_path: string;
  default_model_preference: string | null;
  payload: RoleDefinitionDto;
  created_at: string;
  updated_at: string;
}

// ─── Human account ───────────────────────────────────────────────────────

export interface HumanAccountRecord {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface HumanIdentityBindingRecord {
  id: number;
  account_id: number;
  provider: string;
  external_user_id: string;
  created_at: string;
}

// ─── Repository input types ──────────────────────────────────────────────

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: string;
  locale?: TaskLocaleDto;
  project_id?: string | null;
  state?: string;
  current_stage?: string | null;
  skill_policy?: TaskSkillPolicyDto | null;
  team?: TeamDto;
  workflow?: WorkflowDto;
  control?: TaskControlDto | null;
  scheduler?: unknown;
  scheduler_snapshot?: SchedulerSnapshot | null;
  discord?: unknown;
  metrics?: unknown;
  error_detail?: string | null;
}

export interface InsertCraftsmanExecutionInput {
  execution_id: string;
  task_id: string;
  subtask_id: string;
  adapter: string;
  mode: string;
  session_id?: string | null;
  status?: string;
  brief_path?: string | null;
  workdir?: string | null;
  callback_payload?: CraftsmanExecutionPayloadDto | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface UpdateCraftsmanExecutionInput {
  session_id?: string | null;
  status?: string;
  callback_payload?: CraftsmanExecutionPayloadDto | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface InsertTaskConversationEntryInput {
  id: string;
  task_id: string;
  binding_id: string;
  provider: string;
  provider_message_ref?: string | null;
  parent_message_ref?: string | null;
  direction: TaskConversationDirection;
  author_kind: TaskConversationAuthorKind;
  author_ref?: string | null;
  display_name?: string | null;
  body: string;
  body_format?: TaskConversationBodyFormat;
  occurred_at: string;
  ingested_at?: string;
  dedupe_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpsertTaskAuthorityInput {
  task_id: string;
  requester_account_id?: number | null;
  owner_account_id?: number | null;
  assignee_account_id?: number | null;
  approver_account_id?: number | null;
  controller_agent_ref?: string | null;
}

export interface InsertNotificationOutboxInput {
  id: string;
  task_id: string;
  event_type: string;
  target_binding_id?: string | null;
  payload: Record<string, unknown>;
  sequence_no: number;
  max_retries?: number;
  created_at?: string;
}

export interface InsertProjectInput {
  id: string;
  name: string;
  summary?: string | null;
  owner?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateProjectInput {
  name?: string;
  summary?: string | null;
  status?: string;
  owner?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpsertProjectMembershipInput {
  id: string;
  project_id: string;
  account_id: number;
  role: string;
  status?: string;
  added_by_account_id?: number | null;
}

export interface UpdateProjectMembershipInput {
  role?: string;
  status?: string;
  added_by_account_id?: number | null;
}

export interface UpsertProjectAgentRosterEntryInput {
  id: string;
  project_id: string;
  agent_ref: string;
  kind: string;
  default_inclusion?: boolean;
  status?: string;
}

export interface AcquireProjectWriteLockInput {
  project_id: string;
  holder_task_id: string;
}

export interface InsertCitizenInput {
  citizen_id: string;
  project_id: string;
  role_id: string;
  display_name: string;
  persona?: string | null;
  boundaries?: string[];
  skills_ref?: string[];
  channel_policies?: Record<string, unknown>;
  brain_scaffold_mode?: CitizenDefinitionDto['brain_scaffold_mode'];
  runtime_projection?: CitizenDefinitionDto['runtime_projection'];
}

export interface InsertHumanAccountInput {
  username: string;
  password_hash: string;
  role: string;
  enabled?: boolean;
}

export interface UpdateHumanAccountInput {
  password_hash?: string;
  role?: string;
  enabled?: boolean;
}

export interface InsertParticipantBindingInput {
  id: string;
  task_id: string;
  binding_id?: string | null;
  agent_ref: string;
  runtime_provider?: string | null;
  task_role: string;
  source?: string;
  join_status?: string;
  desired_exposure?: string;
  exposure_reason?: string | null;
  exposure_stage_id?: string | null;
  reconciled_at?: string | null;
  created_at?: string;
  joined_at?: string | null;
  left_at?: string | null;
}

export interface UpsertRuntimeSessionBindingInput {
  id: string;
  participant_binding_id: string;
  runtime_provider: string;
  runtime_session_ref: string;
  runtime_actor_ref?: string | null;
  continuity_ref?: string | null;
  presence_state: string;
  binding_reason?: string | null;
  desired_runtime_presence?: string;
  reconcile_stage_id?: string | null;
  reconciled_at?: string | null;
  last_seen_at: string;
  created_at?: string;
}

export interface ReconcileRuntimeSessionBindingInput {
  binding_reason?: string | null;
  desired_runtime_presence: string;
  reconcile_stage_id?: string | null;
  reconciled_at?: string | null;
}

export interface UpdateTodoInput {
  text?: string;
  project_id?: string | null;
  status?: string;
  due?: string | null;
  completed_at?: string | null;
  tags?: string[];
  promoted_to?: string | null;
}

export interface UpdateInboxItemInput {
  text?: string;
  status?: string;
  source?: string | null;
  notes?: string | null;
  tags?: string[];
  promoted_to_type?: string | null;
  promoted_to_id?: string | null;
  metadata?: Record<string, unknown> | null;
}
