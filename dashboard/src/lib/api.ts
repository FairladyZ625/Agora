import type {
  ApiAgentChannelSummaryDto,
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiCraftsmanExecutionDto,
  ApiCraftsmanGovernanceSnapshotDto,
  ApiDashboardSessionLoginDto,
  ApiDashboardSessionLogoutDto,
  ApiDashboardSessionStatusDto,
  ApiDashboardUserListDto,
  ApiHealthDto,
  ApiObserveCraftsmanExecutionsResponseDto,
  ApiListProjectsResponseDto,
  ApiProjectMembershipDto,
  ApiPromoteTodoResultDto,
  ApiProjectDto,
  ApiProjectWorkbenchDto,
  ApiRuntimeDiagnosisResultDto,
  ApiRuntimeRecoveryActionDto,
  ApiSkillCatalogEntryDto,
  ApiTaskDto,
  ApiTaskConversationListResponseDto,
  ApiTaskConversationSummaryDto,
  ApiTaskStatusDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
  ApiUnifiedHealthSnapshotDto,
} from '@/types/api';
import type { CreateTaskInput } from '@/types/task';
import type { TodoFilter } from '@/types/dashboard';
import {
  agentChannelSummarySchema,
  agentsStatusSchema,
  archiveJobSchema,
  archiveJobReceiptScanResponseSchema,
  craftsmanExecutionSchema,
  craftsmanGovernanceSnapshotSchema,
  dashboardSessionLoginResponseSchema,
  dashboardSessionLogoutResponseSchema,
  dashboardSessionStatusResponseSchema,
  dashboardUserBindIdentityRequestSchema,
  dashboardUserCreateRequestSchema,
  dashboardUserListResponseSchema,
  dashboardUserUpdatePasswordRequestSchema,
  duplicateTemplateRequestSchema,
  healthResponseSchema,
  listProjectsResponseSchema,
  observeCraftsmanExecutionsResponseSchema,
  projectSchema,
  projectWorkbenchResponseSchema,
  projectMembershipSchema,
  promoteTodoResultSchema,
  runtimeDiagnosisResultSchema,
  runtimeRecoveryActionSchema,
  skillCatalogListResponseSchema,
  taskSchema,
  taskConversationListResponseSchema,
  taskConversationMarkReadRequestSchema,
  taskConversationSummarySchema,
  taskStatusSchema,
  templateDetailSchema,
  templateSummarySchema,
  unifiedHealthSnapshotSchema,
  templateValidationResponseSchema,
  todoItemSchema,
  validateWorkflowRequestSchema,
} from '@agora-ts/contracts';
import { z, type ZodType } from 'zod';
import { parseJsonWithContext } from '@/utils/json';

const projectNomosStateSchema = z.object({
  project_id: z.string().min(1),
  project_name: z.string().min(1),
  nomos_id: z.string().min(1),
  activation_status: z.enum(['active_builtin', 'active_project']),
  project_state_root: z.string().min(1),
  profile_path: z.string().min(1),
  profile_installed: z.boolean(),
  repo_path: z.string().nullable(),
  repo_shim_installed: z.boolean(),
  bootstrap_prompts_dir: z.string().min(1),
  lifecycle_modules: z.array(z.string().min(1)),
  draft_root: z.string().min(1),
  draft_profile_path: z.string().min(1),
  draft_profile_installed: z.boolean(),
  active_root: z.string().min(1),
  active_profile_path: z.string().min(1),
  active_profile_installed: z.boolean(),
});

const projectMembershipListResponseSchema = z.object({
  memberships: z.array(projectMembershipSchema),
});

const projectMembershipResponseSchema = z.object({
  membership: projectMembershipSchema,
});

export type ApiProjectNomosStateDto = z.infer<typeof projectNomosStateSchema>;

const projectNomosInstallSchema = z.object({
  project_id: z.string().min(1),
  nomos: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    source: z.string().min(1),
    install_mode: z.string().min(1),
  }),
  project_state_root: z.string().min(1),
  repo_shim_path: z.string().nullable(),
  repo_git_initialized: z.boolean(),
  project_state_git_initialized: z.boolean(),
  bootstrap_task_id: z.string().nullable(),
});

export type ApiProjectNomosInstallDto = z.infer<typeof projectNomosInstallSchema>;

const projectNomosDoctorSchema = z.object({
  project_id: z.string().min(1),
  db_path: z.string().min(1),
  embedding: z.object({
    configured: z.boolean(),
    healthy: z.boolean(),
    provider: z.string().min(1),
    model: z.string().nullable(),
    error: z.string().optional(),
  }),
  vector_index: z.object({
    configured: z.boolean(),
    provider: z.string().min(1),
    healthy: z.boolean(),
    chunk_count: z.number().optional(),
    warning: z.string().optional(),
  }),
  jobs: z.object({
    pending: z.number(),
    running: z.number(),
    failed: z.number(),
    succeeded: z.number(),
  }),
  drift: z.object({
    detected: z.boolean(),
    documents_without_jobs: z.number(),
  }),
});

export type ApiProjectNomosDoctorDto = z.infer<typeof projectNomosDoctorSchema>;

const projectNomosPackSummarySchema = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  lifecycle_modules: z.array(z.string().min(1)),
  doctor_checks: z.array(z.string().min(1)),
  source: z.string().min(1),
  root: z.string().min(1),
  profile_path: z.string().min(1),
});

const projectNomosReviewSchema = z.object({
  project_id: z.string().min(1),
  activation_status: z.enum(['active_builtin', 'active_project']),
  can_activate: z.boolean(),
  issues: z.array(z.string()),
  active: projectNomosPackSummarySchema,
  draft: projectNomosPackSummarySchema.nullable(),
});

export type ApiProjectNomosReviewDto = z.infer<typeof projectNomosReviewSchema>;

const projectNomosActivationSchema = z.object({
  project_id: z.string().min(1),
  nomos_id: z.string().min(1),
  activation_status: z.literal('active_project'),
  active_root: z.string().min(1),
  active_profile_path: z.string().min(1),
  activated_at: z.string().min(1),
  activated_by: z.string().min(1),
});

export type ApiProjectNomosActivationDto = z.infer<typeof projectNomosActivationSchema>;

const projectNomosValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
});

const projectNomosValidationSchema = z.object({
  project_id: z.string().min(1),
  target: z.enum(['draft', 'active']),
  valid: z.boolean(),
  activation_status: z.enum(['active_builtin', 'active_project']),
  pack: projectNomosPackSummarySchema.nullable(),
  issues: z.array(projectNomosValidationIssueSchema),
});

export type ApiProjectNomosValidationDto = z.infer<typeof projectNomosValidationSchema>;

const projectNomosDiffSchema = z.object({
  project_id: z.string().min(1),
  base: z.enum(['builtin', 'active']),
  candidate: z.enum(['draft', 'active']),
  changed: z.boolean(),
  base_pack: projectNomosPackSummarySchema.nullable(),
  candidate_pack: projectNomosPackSummarySchema.nullable(),
  differences: z.array(z.object({
    field: z.string().min(1),
    from: z.unknown(),
    to: z.unknown(),
  })),
});

export type ApiProjectNomosDiffDto = z.infer<typeof projectNomosDiffSchema>;

const projectNomosExportSchema = z.object({
  project_id: z.string().min(1),
  target: z.enum(['draft', 'active']),
  output_dir: z.string().min(1),
  pack: projectNomosPackSummarySchema.nullable(),
});

export type ApiProjectNomosExportDto = z.infer<typeof projectNomosExportSchema>;

const projectNomosInstallPackSchema = z.object({
  project_id: z.string().min(1),
  pack: projectNomosPackSummarySchema,
  installed_root: z.string().min(1),
  installed_profile_path: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
});

export type ApiProjectNomosInstallPackDto = z.infer<typeof projectNomosInstallPackSchema>;

const publishedNomosCatalogSummarySchema = z.object({
  pack_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  published_at: z.string().min(1),
  source_kind: z.enum(['project_publish', 'share_bundle', 'pack_root']),
  published_by: z.string().nullable(),
  source_project_id: z.string().min(1),
  source_target: z.enum(['draft', 'active']),
  source_repo_path: z.string().nullable(),
});

const publishedNomosCatalogEntrySchema = z.object({
  schema_version: z.literal(1),
  pack_id: z.string().min(1),
  published_at: z.string().min(1),
  source_kind: z.enum(['project_publish', 'share_bundle', 'pack_root']),
  published_by: z.string().nullable(),
  published_note: z.string().nullable(),
  source_project_id: z.string().min(1),
  source_target: z.enum(['draft', 'active']),
  source_activation_status: z.enum(['active_builtin', 'active_project']),
  source_repo_path: z.string().nullable(),
  published_root: z.string().min(1),
  manifest_path: z.string().min(1),
  pack: projectNomosPackSummarySchema,
});

const publishedNomosCatalogListSchema = z.object({
  catalog_root: z.string().min(1),
  total: z.number(),
  summaries: z.array(publishedNomosCatalogSummarySchema),
  entries: z.array(publishedNomosCatalogEntrySchema),
});

export type ApiPublishedNomosCatalogSummaryDto = z.infer<typeof publishedNomosCatalogSummarySchema>;
export type ApiPublishedNomosCatalogEntryDto = z.infer<typeof publishedNomosCatalogEntrySchema>;
export type ApiPublishedNomosCatalogListDto = z.infer<typeof publishedNomosCatalogListSchema>;

const projectNomosPublishSchema = z.object({
  project_id: z.string().min(1),
  target: z.enum(['draft', 'active']),
  catalog_root: z.string().min(1),
  catalog_pack_root: z.string().min(1),
  manifest_path: z.string().min(1),
  entry: publishedNomosCatalogEntrySchema,
});

export type ApiProjectNomosPublishDto = z.infer<typeof projectNomosPublishSchema>;

const projectNomosInstallCatalogPackSchema = z.object({
  project_id: z.string().min(1),
  pack: projectNomosPackSummarySchema,
  installed_root: z.string().min(1),
  installed_profile_path: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  catalog_entry: publishedNomosCatalogEntrySchema,
});

export type ApiProjectNomosInstallCatalogPackDto = z.infer<typeof projectNomosInstallCatalogPackSchema>;

const nomosSourceImportSchema = z.object({
  source_dir: z.string().min(1),
  source_kind: z.enum(['share_bundle', 'pack_root']),
  manifest_path: z.string().nullable(),
  entry: publishedNomosCatalogEntrySchema,
});

export type ApiNomosSourceImportDto = z.infer<typeof nomosSourceImportSchema>;

const registeredNomosSourceEntrySchema = z.object({
  schema_version: z.literal(1),
  source_id: z.string().min(1),
  source_kind: z.enum(['share_bundle', 'pack_root', 'git_working_copy']),
  source_dir: z.string().min(1),
  registered_at: z.string().min(1),
  last_synced_at: z.string().nullable(),
  last_sync_status: z.enum(['never', 'ok', 'error']),
  last_sync_error: z.string().nullable(),
  last_catalog_pack_id: z.string().nullable(),
  last_imported_source_kind: z.enum(['share_bundle', 'pack_root']).nullable(),
  last_manifest_path: z.string().nullable(),
  entry_path: z.string().min(1),
});

export type ApiRegisteredNomosSourceEntryDto = z.infer<typeof registeredNomosSourceEntrySchema>;

const registeredNomosSourceListSchema = z.object({
  registry_root: z.string().min(1),
  total: z.number(),
  entries: z.array(registeredNomosSourceEntrySchema),
});

export type ApiRegisteredNomosSourceListDto = z.infer<typeof registeredNomosSourceListSchema>;

const syncRegisteredNomosSourceSchema = z.object({
  source: registeredNomosSourceEntrySchema,
  imported: nomosSourceImportSchema,
});

export type ApiSyncRegisteredNomosSourceDto = z.infer<typeof syncRegisteredNomosSourceSchema>;

const projectNomosInstallFromSourceSchema = z.object({
  project_id: z.string().min(1),
  pack: projectNomosPackSummarySchema,
  installed_root: z.string().min(1),
  installed_profile_path: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  catalog_entry: publishedNomosCatalogEntrySchema,
  imported: nomosSourceImportSchema,
});

export type ApiProjectNomosInstallFromSourceDto = z.infer<typeof projectNomosInstallFromSourceSchema>;

const projectNomosInstallFromRegisteredSourceSchema = z.object({
  project_id: z.string().min(1),
  pack: projectNomosPackSummarySchema,
  installed_root: z.string().min(1),
  installed_profile_path: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  catalog_entry: publishedNomosCatalogEntrySchema,
  source: registeredNomosSourceEntrySchema,
  imported: nomosSourceImportSchema,
});

export type ApiProjectNomosInstallFromRegisteredSourceDto = z.infer<typeof projectNomosInstallFromRegisteredSourceSchema>;

class ApiError extends Error {
  status: number;
  statusText: string;
  body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

function getConfig() {
  // Read from localStorage directly — stores may not be hydrated yet
  if (typeof localStorage?.getItem !== 'function') {
    return { apiBase: '/api', apiToken: '' };
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem('agora-settings');
  } catch (error) {
    throw new Error(`Failed to read dashboard settings: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw) {
    const parsed = parseJsonWithContext<{ state?: { apiBase?: unknown; apiToken?: unknown } }>(raw, 'dashboard settings');
    return {
      apiBase: typeof parsed?.state?.apiBase === 'string'
        ? parsed.state?.apiBase ?? '/api'
        : '/api',
      apiToken: typeof parsed?.state?.apiToken === 'string'
        ? parsed.state?.apiToken ?? ''
        : '',
    };
  }
  return { apiBase: '/api', apiToken: '' };
}

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const { apiBase, apiToken } = getConfig();
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  const url = resolveRequestUrl(`${apiBase}${path}`);
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    credentials: init?.credentials ?? 'include',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, res.statusText, body);
  }

  const json = await res.json();
  return schema.parse(json);
}

function resolveRequestUrl(input: string) {
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(input, window.location.origin).toString();
  }
  return input;
}

// ── Task APIs ────────────────────────────────────

export function listTasks(state?: string, projectId?: string): Promise<ApiTaskDto[]> {
  const params = new URLSearchParams();
  if (state) {
    params.set('state', state);
  }
  if (projectId) {
    params.set('project_id', projectId);
  }
  const query = params.toString();
  return request<ApiTaskDto[]>(`/tasks${query ? `?${query}` : ''}`, z.array(taskSchema));
}

export function getTask(taskId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}`, taskSchema);
}

export function getTaskStatus(taskId: string): Promise<ApiTaskStatusDto> {
  return request<ApiTaskStatusDto>(`/tasks/${taskId}/status`, taskStatusSchema);
}

export function getTaskConversation(taskId: string): Promise<ApiTaskConversationListResponseDto> {
  return request<ApiTaskConversationListResponseDto>(
    `/tasks/${taskId}/conversation`,
    taskConversationListResponseSchema,
  );
}

export function closeSubtask(
  taskId: string,
  subtaskId: string,
  callerId: string,
  note: string,
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(
    `/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/close`,
    taskSchema,
    {
      method: 'POST',
      body: JSON.stringify({ caller_id: callerId, note }),
    },
  );
}

export function archiveSubtask(
  taskId: string,
  subtaskId: string,
  callerId: string,
  note: string,
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(
    `/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/archive`,
    taskSchema,
    {
      method: 'POST',
      body: JSON.stringify({ caller_id: callerId, note }),
    },
  );
}

export function cancelSubtask(
  taskId: string,
  subtaskId: string,
  callerId: string,
  note: string,
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(
    `/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/cancel`,
    taskSchema,
    {
      method: 'POST',
      body: JSON.stringify({ caller_id: callerId, note }),
    },
  );
}

export function listSubtaskExecutions(taskId: string, subtaskId: string): Promise<ApiCraftsmanExecutionDto[]> {
  return request<ApiCraftsmanExecutionDto[]>(
    `/craftsmen/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/executions`,
    z.array(craftsmanExecutionSchema),
  );
}

export function getCraftsmanGovernance(): Promise<ApiCraftsmanGovernanceSnapshotDto> {
  return request<ApiCraftsmanGovernanceSnapshotDto>(
    '/craftsmen/governance',
    craftsmanGovernanceSnapshotSchema,
  );
}

export function getHealthSnapshot(): Promise<ApiUnifiedHealthSnapshotDto> {
  return request<ApiUnifiedHealthSnapshotDto>('/health/snapshot', unifiedHealthSnapshotSchema);
}

export function observeCraftsmanExecutions(input?: {
  running_after_ms?: number;
  waiting_after_ms?: number;
}): Promise<ApiObserveCraftsmanExecutionsResponseDto> {
  return request<ApiObserveCraftsmanExecutionsResponseDto>(
    '/craftsmen/observe',
    observeCraftsmanExecutionsResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function probeCraftsmanExecution(executionId: string): Promise<{
  ok: boolean;
  execution_id: string;
  status: string;
  probed: boolean;
}> {
  return request(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/probe`,
    z.object({
      ok: z.boolean(),
      execution_id: z.string(),
      status: z.string(),
      probed: z.boolean(),
    }),
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function getCraftsmanExecutionTail(
  executionId: string,
  lines = 120,
): Promise<{
  execution_id: string;
  available: boolean;
  output: string | null;
  source: 'tmux' | 'acpx' | 'unavailable';
}> {
  return request(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/tail?lines=${encodeURIComponent(String(lines))}`,
    z.object({
      execution_id: z.string(),
      available: z.boolean(),
      output: z.string().nullable(),
      source: z.enum(['tmux', 'acpx', 'unavailable']),
    }),
  );
}

export function stopCraftsmanExecution(
  executionId: string,
  input: { caller_id: string; reason?: string },
): Promise<ApiRuntimeRecoveryActionDto> {
  return request<ApiRuntimeRecoveryActionDto>(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/stop`,
    runtimeRecoveryActionSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function diagnoseRuntime(input: {
  task_id: string;
  agent_ref: string;
  caller_id: string;
  reason?: string;
}): Promise<ApiRuntimeDiagnosisResultDto> {
  return request<ApiRuntimeDiagnosisResultDto>('/runtime/diagnose', runtimeDiagnosisResultSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function restartRuntime(input: {
  task_id: string;
  agent_ref: string;
  caller_id: string;
  reason?: string;
}): Promise<ApiRuntimeRecoveryActionDto> {
  return request<ApiRuntimeRecoveryActionDto>('/runtime/restart', runtimeRecoveryActionSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function sendCraftsmanExecutionInputText(
  executionId: string,
  input: { text: string; submit?: boolean },
): Promise<{ ok: boolean; execution_id: string }> {
  return request(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/input-text`,
    z.object({
      ok: z.boolean(),
      execution_id: z.string(),
    }),
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function sendCraftsmanExecutionInputKeys(
  executionId: string,
  input: { keys: string[] },
): Promise<{ ok: boolean; execution_id: string }> {
  return request(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/input-keys`,
    z.object({
      ok: z.boolean(),
      execution_id: z.string(),
    }),
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function submitCraftsmanExecutionChoice(
  executionId: string,
  input: { keys?: string[] } = {},
): Promise<{ ok: boolean; execution_id: string }> {
  return request(
    `/craftsmen/executions/${encodeURIComponent(executionId)}/submit-choice`,
    z.object({
      ok: z.boolean(),
      execution_id: z.string(),
    }),
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function getTaskConversationSummary(taskId: string): Promise<ApiTaskConversationSummaryDto> {
  return request<ApiTaskConversationSummaryDto>(
    `/tasks/${taskId}/conversation/summary`,
    taskConversationSummarySchema,
  );
}

export function markTaskConversationRead(
  taskId: string,
  input: { last_read_entry_id?: string; read_at?: string } = {},
): Promise<ApiTaskConversationSummaryDto> {
  const payload = taskConversationMarkReadRequestSchema.parse(input);
  return request<ApiTaskConversationSummaryDto>(
    `/tasks/${taskId}/conversation/read`,
    taskConversationSummarySchema,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function createTask(input: CreateTaskInput): Promise<ApiTaskDto> {
  return request<ApiTaskDto>('/tasks', taskSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listSkills(): Promise<ApiSkillCatalogEntryDto[]> {
  return request('/skills', skillCatalogListResponseSchema).then((response) => response.skills);
}

// ── Task Operations ──────────────────────────────

export function advanceTask(taskId: string, callerId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/advance`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ caller_id: callerId }),
  });
}

export function approveTask(taskId: string, approverId: string, comment = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/approve`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ approver_id: approverId, comment }),
  });
}

export function rejectTask(taskId: string, rejectorId: string, reason: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/reject`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ rejector_id: rejectorId, reason }),
  });
}

export function confirmTask(
  taskId: string,
  voterId: string,
  vote: 'approve' | 'reject',
  comment = '',
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/confirm`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ voter_id: voterId, vote, comment }),
  });
}

export function subtaskDone(
  taskId: string,
  subtaskId: string,
  callerId: string,
  output = '',
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/subtask-done`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ subtask_id: subtaskId, caller_id: callerId, output }),
  });
}

export function forceAdvanceTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/force-advance`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function pauseTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/pause`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function resumeTask(taskId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/resume`, taskSchema, {
    method: 'POST',
  });
}

export function cancelTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/cancel`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unblockTask(
  taskId: string,
  reason = '',
  action?: 'retry' | 'skip' | 'reassign',
  assignee?: string,
  craftsmanType?: string,
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/unblock`, taskSchema, {
    method: 'POST',
    body: JSON.stringify(action ? {
      reason,
      action,
      ...(assignee ? { assignee } : {}),
      ...(craftsmanType ? { craftsman_type: craftsmanType } : {}),
    } : { reason }),
  });
}

export function cleanupTasks(taskId?: string): Promise<{ cleaned: number }> {
  return request<{ cleaned: number }>('/tasks/cleanup', z.object({ cleaned: z.number().int().nonnegative() }), {
    method: 'POST',
    body: JSON.stringify(taskId ? { task_id: taskId } : {}),
  });
}

export function archonApprove(
  taskId: string,
  comment = '',
  reviewerId = 'archon',
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/archon-approve`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ reviewer_id: reviewerId, comment }),
  });
}

export function archonReject(
  taskId: string,
  reason: string,
  reviewerId = 'archon',
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/archon-reject`, taskSchema, {
    method: 'POST',
    body: JSON.stringify({ reviewer_id: reviewerId, reason }),
  });
}

// ── Health ────────────────────────────────────────

export function healthCheck(): Promise<ApiHealthDto> {
  return request<ApiHealthDto>('/health', healthResponseSchema);
}

// ── Dashboard Session / Users ────────────────────

export function getDashboardSessionStatus(): Promise<ApiDashboardSessionStatusDto> {
  return request<ApiDashboardSessionStatusDto>('/dashboard/session', dashboardSessionStatusResponseSchema);
}

export function loginDashboardSession(username: string, password: string): Promise<ApiDashboardSessionLoginDto> {
  return request<ApiDashboardSessionLoginDto>('/dashboard/session/login', dashboardSessionLoginResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });
}

export function logoutDashboardSession(): Promise<ApiDashboardSessionLogoutDto> {
  return request<ApiDashboardSessionLogoutDto>('/dashboard/session/logout', dashboardSessionLogoutResponseSchema, {
    method: 'POST',
    credentials: 'include',
  });
}

export function listDashboardUsers(): Promise<ApiDashboardUserListDto> {
  return request<ApiDashboardUserListDto>('/dashboard/users', dashboardUserListResponseSchema, {
    credentials: 'include',
  });
}

export function createDashboardUser(input: { username: string; password: string }): Promise<ApiDashboardUserListDto> {
  const payload = dashboardUserCreateRequestSchema.parse(input);
  return request<ApiDashboardUserListDto>('/dashboard/users', dashboardUserListResponseSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

export function disableDashboardUser(username: string): Promise<ApiDashboardUserListDto> {
  return request<ApiDashboardUserListDto>(`/dashboard/users/${encodeURIComponent(username)}/disable`, dashboardUserListResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify({}),
    credentials: 'include',
  });
}

export function updateDashboardUserPassword(username: string, password: string): Promise<ApiDashboardUserListDto> {
  const payload = dashboardUserUpdatePasswordRequestSchema.parse({ password });
  return request<ApiDashboardUserListDto>(`/dashboard/users/${encodeURIComponent(username)}/password`, dashboardUserListResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

export function bindDashboardUserIdentity(
  username: string,
  input: { provider: string; external_user_id: string },
): Promise<ApiDashboardUserListDto> {
  const payload = dashboardUserBindIdentityRequestSchema.parse(input);
  return request<ApiDashboardUserListDto>(`/dashboard/users/${encodeURIComponent(username)}/identities`, dashboardUserListResponseSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

// ── Agents / Archive / Todos / Templates ────────

export function getAgentsStatus(): Promise<ApiAgentsStatusDto> {
  return request<ApiAgentsStatusDto>('/agents/status', agentsStatusSchema);
}

export function getAgentChannelDetail(channel: string): Promise<ApiAgentChannelSummaryDto> {
  return request<ApiAgentChannelSummaryDto>(`/agents/channels/${encodeURIComponent(channel)}`, agentChannelSummarySchema);
}

export function getCraftsmanRuntimeTail(agent: string, lines = 20): Promise<{ output: string | null }> {
  return request<{ output: string | null }>(
    `/craftsmen/runtime/tail/${encodeURIComponent(agent)}?lines=${encodeURIComponent(String(lines))}`,
    z.object({ output: z.string().nullable() }),
  );
}

export function listArchiveJobs(filters?: { status?: string; taskId?: string }): Promise<ApiArchiveJobDto[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.taskId) params.set('task_id', filters.taskId);
  const query = params.toString();
  return request<ApiArchiveJobDto[]>(`/archive/jobs${query ? `?${query}` : ''}`, z.array(archiveJobSchema));
}

export function getArchiveJob(jobId: number): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}`, archiveJobSchema);
}

export function approveArchiveJob(jobId: number, approverId = 'dashboard', comment = ''): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}/approve`, archiveJobSchema, {
    method: 'POST',
    body: JSON.stringify({ approver_id: approverId, comment }),
  });
}

export function retryArchiveJob(jobId: number, reason = ''): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}/retry`, archiveJobSchema, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function notifyArchiveJob(jobId: number): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}/notify`, archiveJobSchema, {
    method: 'POST',
  });
}

export function updateArchiveJobStatus(
  jobId: number,
  status: 'notified' | 'synced' | 'failed',
  options: { commitHash?: string; errorMessage?: string } = {},
): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}/status`, archiveJobSchema, {
    method: 'POST',
    body: JSON.stringify({
      status,
      ...(options.commitHash ? { commit_hash: options.commitHash } : {}),
      ...(options.errorMessage ? { error_message: options.errorMessage } : {}),
    }),
  });
}

export function scanStaleArchiveJobs(timeoutMs: number): Promise<{ failed: number }> {
  return request<{ failed: number }>(`/archive/jobs/scan-stale`, z.object({ failed: z.number().int().nonnegative() }), {
    method: 'POST',
    body: JSON.stringify({ timeout_ms: timeoutMs }),
  });
}

export function scanArchiveJobReceipts(): Promise<{ processed: number; synced: number; failed: number }> {
  return request<{ processed: number; synced: number; failed: number }>(
    `/archive/jobs/scan-receipts`,
    archiveJobReceiptScanResponseSchema,
    {
      method: 'POST',
    },
  );
}

export function listProjects(status?: string): Promise<ApiProjectDto[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<ApiListProjectsResponseDto>(`/projects${params}`, listProjectsResponseSchema)
    .then((response) => response.projects);
}

export function createProject(input: {
  id?: string;
  name: string;
  owner: string;
  summary?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
  admins?: Array<{ account_id: number }>;
  members?: Array<{ account_id: number; role: 'admin' | 'member' }>;
}): Promise<ApiProjectDto> {
  return request<ApiProjectDto>('/projects', projectSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listProjectMembers(projectId: string): Promise<ApiProjectMembershipDto[]> {
  return request<{ memberships: ApiProjectMembershipDto[] }>(
    `/projects/${encodeURIComponent(projectId)}/members`,
    projectMembershipListResponseSchema,
  ).then((response) => response.memberships);
}

export function addProjectMember(
  projectId: string,
  input: { account_id: number; role: 'admin' | 'member' },
): Promise<ApiProjectMembershipDto> {
  return request<{ membership: ApiProjectMembershipDto }>(
    `/projects/${encodeURIComponent(projectId)}/members`,
    projectMembershipResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  ).then((response) => response.membership);
}

export function removeProjectMember(projectId: string, accountId: number): Promise<ApiProjectMembershipDto> {
  return request<{ membership: ApiProjectMembershipDto }>(
    `/projects/${encodeURIComponent(projectId)}/members/${accountId}`,
    projectMembershipResponseSchema,
    {
      method: 'DELETE',
    },
  ).then((response) => response.membership);
}

export function getProjectWorkbench(projectId: string): Promise<ApiProjectWorkbenchDto> {
  return request<ApiProjectWorkbenchDto>(`/projects/${encodeURIComponent(projectId)}`, projectWorkbenchResponseSchema);
}

export function getProjectNomosState(projectId: string): Promise<ApiProjectNomosStateDto> {
  return request<ApiProjectNomosStateDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos`,
    projectNomosStateSchema,
  );
}

export function installProjectNomos(
  projectId: string,
  input?: {
    repo_path?: string;
    initialize_repo?: boolean;
    force_write_repo_shim?: boolean;
    skip_bootstrap_task?: boolean;
    creator?: string;
  },
): Promise<ApiProjectNomosInstallDto> {
  return request<ApiProjectNomosInstallDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/install`,
    projectNomosInstallSchema,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function runProjectNomosDoctor(projectId: string): Promise<ApiProjectNomosDoctorDto> {
  return request<ApiProjectNomosDoctorDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/doctor`,
    projectNomosDoctorSchema,
  );
}

export function reviewProjectNomos(projectId: string): Promise<ApiProjectNomosReviewDto> {
  return request<ApiProjectNomosReviewDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/review`,
    projectNomosReviewSchema,
  );
}

export function activateProjectNomos(projectId: string, actor: string): Promise<ApiProjectNomosActivationDto> {
  return request<ApiProjectNomosActivationDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/activate`,
    projectNomosActivationSchema,
    {
      method: 'POST',
      body: JSON.stringify({ actor }),
    },
  );
}

export function validateProjectNomos(
  projectId: string,
  target: 'draft' | 'active' = 'draft',
): Promise<ApiProjectNomosValidationDto> {
  const params = new URLSearchParams({ target });
  return request<ApiProjectNomosValidationDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/validate?${params.toString()}`,
    projectNomosValidationSchema,
  );
}

export function diffProjectNomos(
  projectId: string,
  input: { base?: 'builtin' | 'active'; candidate?: 'draft' | 'active' } = {},
): Promise<ApiProjectNomosDiffDto> {
  const params = new URLSearchParams();
  if (input.base) {
    params.set('base', input.base);
  }
  if (input.candidate) {
    params.set('candidate', input.candidate);
  }
  const query = params.toString();
  return request<ApiProjectNomosDiffDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/diff${query ? `?${query}` : ''}`,
    projectNomosDiffSchema,
  );
}

export function exportProjectNomos(
  projectId: string,
  outputDir: string,
  target: 'draft' | 'active' = 'draft',
): Promise<ApiProjectNomosExportDto> {
  return request<ApiProjectNomosExportDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/export`,
    projectNomosExportSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        output_dir: outputDir,
        target,
      }),
    },
  );
}

export function installProjectNomosPack(projectId: string, packDir: string): Promise<ApiProjectNomosInstallPackDto> {
  return request<ApiProjectNomosInstallPackDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/install-pack`,
    projectNomosInstallPackSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        pack_dir: packDir,
      }),
    },
  );
}

export function publishProjectNomosToCatalog(
  projectId: string,
  input?: { target?: 'draft' | 'active'; published_by?: string; published_note?: string },
): Promise<ApiProjectNomosPublishDto> {
  return request<ApiProjectNomosPublishDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/publish`,
    projectNomosPublishSchema,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function listPublishedNomosCatalog(): Promise<ApiPublishedNomosCatalogListDto> {
  return request<ApiPublishedNomosCatalogListDto>(
    '/nomos/catalog',
    publishedNomosCatalogListSchema,
  );
}

export function showPublishedNomosCatalog(packId: string): Promise<ApiPublishedNomosCatalogEntryDto> {
  return request<ApiPublishedNomosCatalogEntryDto>(
    `/nomos/catalog/${packId}`,
    publishedNomosCatalogEntrySchema,
  );
}

export function installCatalogNomosPack(
  projectId: string,
  packId: string,
): Promise<ApiProjectNomosInstallCatalogPackDto> {
  return request<ApiProjectNomosInstallCatalogPackDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/install-catalog-pack`,
    projectNomosInstallCatalogPackSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        pack_id: packId,
      }),
    },
  );
}

export function importNomosSource(sourceDir: string): Promise<ApiNomosSourceImportDto> {
  return request<ApiNomosSourceImportDto>(
    '/nomos/sources/import',
    nomosSourceImportSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        source_dir: sourceDir,
      }),
    },
  );
}

export function registerNomosSource(
  sourceId: string,
  sourceDir: string,
): Promise<ApiRegisteredNomosSourceEntryDto> {
  return request<ApiRegisteredNomosSourceEntryDto>(
    '/nomos/sources/register',
    registeredNomosSourceEntrySchema,
    {
      method: 'POST',
      body: JSON.stringify({
        source_id: sourceId,
        source_dir: sourceDir,
      }),
    },
  );
}

export function listRegisteredNomosSources(): Promise<ApiRegisteredNomosSourceListDto> {
  return request<ApiRegisteredNomosSourceListDto>(
    '/nomos/sources',
    registeredNomosSourceListSchema,
  );
}

export function showRegisteredNomosSource(sourceId: string): Promise<ApiRegisteredNomosSourceEntryDto> {
  return request<ApiRegisteredNomosSourceEntryDto>(
    `/nomos/sources/${sourceId}`,
    registeredNomosSourceEntrySchema,
  );
}

export function syncRegisteredNomosSource(sourceId: string): Promise<ApiSyncRegisteredNomosSourceDto> {
  return request<ApiSyncRegisteredNomosSourceDto>(
    '/nomos/sources/sync',
    syncRegisteredNomosSourceSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        source_id: sourceId,
      }),
    },
  );
}

export function installProjectNomosFromSource(
  projectId: string,
  sourceDir: string,
): Promise<ApiProjectNomosInstallFromSourceDto> {
  return request<ApiProjectNomosInstallFromSourceDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/install-from-source`,
    projectNomosInstallFromSourceSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        source_dir: sourceDir,
      }),
    },
  );
}

export function installProjectNomosFromRegisteredSource(
  projectId: string,
  sourceId: string,
): Promise<ApiProjectNomosInstallFromRegisteredSourceDto> {
  return request<ApiProjectNomosInstallFromRegisteredSourceDto>(
    `/projects/${encodeURIComponent(projectId)}/nomos/install-registered-source`,
    projectNomosInstallFromRegisteredSourceSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        source_id: sourceId,
      }),
    },
  );
}

export function listTodos(status?: Exclude<TodoFilter, 'all'>, projectId?: string): Promise<ApiTodoDto[]> {
  const params = new URLSearchParams();
  if (status) {
    params.set('status', status);
  }
  if (projectId) {
    params.set('project_id', projectId);
  }
  const query = params.toString();
  return request<ApiTodoDto[]>(`/todos${query ? `?${query}` : ''}`, z.array(todoItemSchema));
}

export function createTodo(input: {
  text: string;
  project_id?: string | null;
  due?: string | null;
  tags?: string[];
}): Promise<ApiTodoDto> {
  return request<ApiTodoDto>('/todos', todoItemSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTodo(
  todoId: number,
  input: {
    text?: string;
    project_id?: string | null;
    due?: string | null;
    tags?: string[];
    status?: 'pending' | 'done';
  },
): Promise<ApiTodoDto> {
  return request<ApiTodoDto>(`/todos/${todoId}`, todoItemSchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTodo(todoId: number): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/todos/${todoId}`, z.object({ deleted: z.literal(true) }), {
    method: 'DELETE',
  });
}

export function promoteTodo(
  todoId: number,
  input: {
    type?: string;
    creator?: string;
    priority?: string;
  },
): Promise<ApiPromoteTodoResultDto> {
  return request<ApiPromoteTodoResultDto>(`/todos/${todoId}/promote`, promoteTodoResultSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listTemplates(): Promise<ApiTemplateSummaryDto[]> {
  return request<ApiTemplateSummaryDto[]>('/templates', z.array(templateSummarySchema));
}

export function getTemplate(templateId: string): Promise<ApiTemplateDetailDto> {
  return request<ApiTemplateDetailDto>(`/templates/${templateId}`, templateDetailSchema);
}

export function createTemplate(
  templateId: string,
  input: ApiTemplateDetailDto,
): Promise<{
  id: string;
  saved: boolean;
  template: ApiTemplateDetailDto;
}> {
  return request(
    '/templates',
    z.object({
      id: z.string(),
      saved: z.boolean(),
      template: templateDetailSchema,
    }),
    {
      method: 'POST',
      body: JSON.stringify({
        id: templateId,
        template: input,
      }),
    },
  );
}

export function updateTemplate(templateId: string, input: ApiTemplateDetailDto): Promise<{
  id: string;
  saved: boolean;
  template: ApiTemplateDetailDto;
}> {
  return request(
    `/templates/${templateId}`,
    z.object({
      id: z.string(),
      saved: z.boolean(),
      template: templateDetailSchema,
    }),
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}

export function duplicateTemplate(
  templateId: string,
  input: { new_id: string; name?: string },
): Promise<{ id: string; template: ApiTemplateDetailDto }> {
  return request(
    `/templates/${templateId}/duplicate`,
    z.object({
      id: z.string(),
      template: templateDetailSchema,
    }),
    {
      method: 'POST',
      body: JSON.stringify(duplicateTemplateRequestSchema.parse(input)),
    },
  );
}

export function validateWorkflow(input: {
  defaultWorkflow?: string;
  stages: ApiTemplateDetailDto['stages'];
}) {
  return request(
    '/workflows/validate',
    templateValidationResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(validateWorkflowRequestSchema.parse(input)),
    },
  );
}

export { ApiError };
