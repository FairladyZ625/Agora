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
  ApiProjectContextDeliveryDto,
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
  ApiWorkspaceBootstrapStatusDto,
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
  projectContextDeliveryResponseSchema,
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
  workspaceBootstrapStatusSchema,
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

const ccConnectInspectSchema = z.object({
  binary: z.object({
    command: z.string().min(1),
    found: z.boolean(),
    resolvedPath: z.string().nullable(),
    version: z.string().nullable(),
    reason: z.string().nullable(),
    error: z.string().nullable().optional(),
  }),
  config: z.object({
    path: z.string().min(1),
    exists: z.boolean(),
    management: z.object({
      enabled: z.boolean().nullable(),
      port: z.number().nullable(),
      tokenPresent: z.boolean(),
    }),
  }),
  management: z.object({
    url: z.string().nullable(),
    reachable: z.boolean(),
    version: z.string().nullable(),
    projectsCount: z.number().nullable(),
    bridgeAdapterCount: z.number().nullable(),
    connectedPlatforms: z.array(z.string().min(1)),
    reason: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

const ccConnectSessionMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string(),
  timestamp: z.string().nullable(),
});

const ccConnectProjectSummarySchema = z.object({
  name: z.string().min(1),
  agent_type: z.string().min(1),
  platforms: z.array(z.string().min(1)),
  sessions_count: z.number(),
  heartbeat_enabled: z.boolean(),
});

const ccConnectSessionSummarySchema = z.object({
  id: z.string().min(1),
  session_key: z.string().min(1),
  name: z.string().nullable(),
  platform: z.string().min(1),
  agent_type: z.string().min(1),
  active: z.boolean(),
  live: z.boolean(),
  history_count: z.number(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  user_name: z.string().nullable(),
  chat_name: z.string().nullable(),
  last_message: ccConnectSessionMessageSchema.nullable().optional(),
});

const ccConnectProjectDetailSchema = z.object({
  name: z.string().min(1),
  agent_type: z.string().min(1),
  platforms: z.array(z.object({
    type: z.string().min(1),
    connected: z.boolean(),
  })),
  platform_configs: z.array(z.object({
    type: z.string().min(1),
    allow_from: z.string().nullable(),
  })),
  sessions_count: z.number(),
  active_session_keys: z.array(z.string().min(1)),
  heartbeat: z.object({
    enabled: z.boolean(),
    paused: z.boolean(),
    interval_mins: z.number().nullable(),
    session_key: z.string().nullable(),
  }).nullable().optional().transform((value) => value ?? null),
  settings: z.object({
    language: z.string().nullable(),
    admin_from: z.string().nullable(),
    disabled_commands: z.array(z.string().min(1)),
    quiet: z.boolean().nullable(),
  }),
  work_dir: z.string().nullable(),
  agent_mode: z.string().nullable(),
  mode: z.string().nullable(),
  show_context_indicator: z.boolean().nullable().optional().transform((value) => value ?? null),
});

const ccConnectSessionDetailSchema = z.object({
  id: z.string().min(1),
  session_key: z.string().min(1),
  name: z.string().nullable(),
  platform: z.string().min(1),
  agent_type: z.string().min(1),
  agent_session_id: z.string().nullable(),
  active: z.boolean(),
  live: z.boolean(),
  history_count: z.number(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  history: z.array(ccConnectSessionMessageSchema),
});

const ccConnectBridgeAdapterSummarySchema = z.object({
  platform: z.string().min(1),
  project: z.string().nullable(),
  capabilities: z.array(z.string().min(1)),
  connected_at: z.string().nullable(),
});

const ccConnectSendMessageReceiptSchema = z.object({
  message: z.string(),
});

const ccConnectSessionCreateReceiptSchema = z.object({
  id: z.string().min(1),
  session_key: z.string().min(1),
  name: z.string().nullable(),
  created_at: z.string().nullable(),
});

const ccConnectSessionSwitchReceiptSchema = z.object({
  message: z.string(),
  active_session_id: z.string().min(1),
});

const ccConnectProviderSummarySchema = z.object({
  name: z.string().min(1),
  active: z.boolean(),
  model: z.string().nullable(),
  base_url: z.string().nullable(),
});

const ccConnectProviderListSchema = z.object({
  providers: z.array(ccConnectProviderSummarySchema),
  active_provider: z.string().nullable(),
});

const ccConnectActivateProviderReceiptSchema = z.object({
  active_provider: z.string().min(1),
  message: z.string(),
});

const ccConnectProviderMutationReceiptSchema = z.object({
  name: z.string().nullable().optional(),
  message: z.string(),
});

const ccConnectModelListSchema = z.object({
  models: z.array(z.string().min(1)),
  current: z.string().nullable(),
});

const ccConnectSetModelReceiptSchema = z.object({
  model: z.string().min(1),
  message: z.string(),
});

const ccConnectHeartbeatStatusSchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean(),
  interval_mins: z.number().nullable(),
  only_when_idle: z.boolean().nullable().optional(),
  session_key: z.string().nullable(),
  silent: z.boolean().nullable().optional(),
  run_count: z.number().nullable().optional(),
  error_count: z.number().nullable().optional(),
  skipped_busy: z.number().nullable().optional(),
  last_run: z.string().nullable().optional(),
  last_error: z.string().nullable().optional(),
});

const ccConnectHeartbeatReceiptSchema = z.object({
  message: z.string(),
});

const ccConnectHeartbeatIntervalReceiptSchema = z.object({
  interval_mins: z.number().nullable(),
  message: z.string(),
});

const ccConnectCronJobSchema = z.object({
  id: z.string().min(1),
  project: z.string().nullable(),
  session_key: z.string().min(1),
  cron_expr: z.string().min(1),
  prompt: z.string().nullable(),
  exec: z.string().nullable(),
  work_dir: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  silent: z.boolean().nullable().optional(),
  created_at: z.string().nullable(),
  last_run: z.string().nullable().optional(),
  last_error: z.string().nullable().optional(),
});

const ccConnectCronCreateReceiptSchema = z.object({
  id: z.string().min(1),
  project: z.string().nullable(),
  session_key: z.string().min(1),
  cron_expr: z.string().min(1),
  prompt: z.string().nullable(),
  exec: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  created_at: z.string().nullable(),
});

export type ApiCcConnectInspectionDto = z.infer<typeof ccConnectInspectSchema>;
export type ApiCcConnectProjectSummaryDto = z.infer<typeof ccConnectProjectSummarySchema>;
export type ApiCcConnectSessionMessageDto = z.infer<typeof ccConnectSessionMessageSchema>;
export type ApiCcConnectSessionSummaryDto = z.infer<typeof ccConnectSessionSummarySchema>;
export type ApiCcConnectProjectDetailDto = z.infer<typeof ccConnectProjectDetailSchema>;
export type ApiCcConnectSessionDetailDto = z.infer<typeof ccConnectSessionDetailSchema>;
export type ApiCcConnectBridgeAdapterSummaryDto = z.infer<typeof ccConnectBridgeAdapterSummarySchema>;
export type ApiCcConnectSendMessageReceiptDto = z.infer<typeof ccConnectSendMessageReceiptSchema>;
export type ApiCcConnectSessionCreateReceiptDto = z.infer<typeof ccConnectSessionCreateReceiptSchema>;
export type ApiCcConnectSessionSwitchReceiptDto = z.infer<typeof ccConnectSessionSwitchReceiptSchema>;
export type ApiCcConnectProviderSummaryDto = z.infer<typeof ccConnectProviderSummarySchema>;
export type ApiCcConnectProviderListDto = z.infer<typeof ccConnectProviderListSchema>;
export type ApiCcConnectActivateProviderReceiptDto = z.infer<typeof ccConnectActivateProviderReceiptSchema>;
export type ApiCcConnectProviderMutationReceiptDto = z.infer<typeof ccConnectProviderMutationReceiptSchema>;
export type ApiCcConnectModelListDto = z.infer<typeof ccConnectModelListSchema>;
export type ApiCcConnectSetModelReceiptDto = z.infer<typeof ccConnectSetModelReceiptSchema>;
export type ApiCcConnectHeartbeatStatusDto = z.infer<typeof ccConnectHeartbeatStatusSchema>;
export type ApiCcConnectHeartbeatReceiptDto = z.infer<typeof ccConnectHeartbeatReceiptSchema>;
export type ApiCcConnectHeartbeatIntervalReceiptDto = z.infer<typeof ccConnectHeartbeatIntervalReceiptSchema>;
export type ApiCcConnectCronJobDto = z.infer<typeof ccConnectCronJobSchema>;
export type ApiCcConnectCronCreateReceiptDto = z.infer<typeof ccConnectCronCreateReceiptSchema>;

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

export function getCcConnectDetect(): Promise<ApiCcConnectInspectionDto> {
  return request<ApiCcConnectInspectionDto>(
    '/external-bridges/cc-connect/detect',
    ccConnectInspectSchema,
  );
}

export function getCcConnectStatus(): Promise<ApiCcConnectProjectSummaryDto[]> {
  return request<ApiCcConnectProjectSummaryDto[]>(
    '/external-bridges/cc-connect/status',
    z.array(ccConnectProjectSummarySchema),
  );
}

export function listCcConnectProjects(): Promise<ApiCcConnectProjectSummaryDto[]> {
  return request<ApiCcConnectProjectSummaryDto[]>(
    '/external-bridges/cc-connect/projects',
    z.array(ccConnectProjectSummarySchema),
  );
}

export function getCcConnectProject(project: string): Promise<ApiCcConnectProjectDetailDto> {
  return request<ApiCcConnectProjectDetailDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}`,
    ccConnectProjectDetailSchema,
  );
}

export function listCcConnectSessions(project: string): Promise<ApiCcConnectSessionSummaryDto[]> {
  return request<ApiCcConnectSessionSummaryDto[]>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/sessions`,
    z.array(ccConnectSessionSummarySchema),
  );
}

export function getCcConnectSession(
  project: string,
  sessionId: string,
  historyLimit?: number,
): Promise<ApiCcConnectSessionDetailDto> {
  const params = new URLSearchParams();
  if (historyLimit !== undefined) {
    params.set('historyLimit', String(historyLimit));
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return request<ApiCcConnectSessionDetailDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}${query}`,
    ccConnectSessionDetailSchema,
  );
}

export function createCcConnectSession(
  project: string,
  input: { session_key: string; name?: string },
): Promise<ApiCcConnectSessionCreateReceiptDto> {
  return request<ApiCcConnectSessionCreateReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/sessions`,
    ccConnectSessionCreateReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function switchCcConnectSession(
  project: string,
  input: { session_key: string; session_id: string },
): Promise<ApiCcConnectSessionSwitchReceiptDto> {
  return request<ApiCcConnectSessionSwitchReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/sessions/switch`,
    ccConnectSessionSwitchReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteCcConnectSession(
  project: string,
  sessionId: string,
): Promise<ApiCcConnectSendMessageReceiptDto> {
  return request<ApiCcConnectSendMessageReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}`,
    ccConnectSendMessageReceiptSchema,
    {
      method: 'DELETE',
    },
  );
}

export function listCcConnectProviders(project: string): Promise<ApiCcConnectProviderListDto> {
  return request<ApiCcConnectProviderListDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/providers`,
    ccConnectProviderListSchema,
  );
}

export function activateCcConnectProvider(
  project: string,
  provider: string,
): Promise<ApiCcConnectActivateProviderReceiptDto> {
  return request<ApiCcConnectActivateProviderReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/providers/${encodeURIComponent(provider)}/activate`,
    ccConnectActivateProviderReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function addCcConnectProvider(
  project: string,
  input: {
    name: string;
    api_key?: string;
    base_url?: string;
    model?: string;
    thinking?: string;
    env?: Record<string, string>;
  },
): Promise<ApiCcConnectProviderMutationReceiptDto> {
  return request<ApiCcConnectProviderMutationReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/providers`,
    ccConnectProviderMutationReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function removeCcConnectProvider(
  project: string,
  provider: string,
): Promise<ApiCcConnectSendMessageReceiptDto> {
  return request<ApiCcConnectSendMessageReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/providers/${encodeURIComponent(provider)}`,
    ccConnectSendMessageReceiptSchema,
    {
      method: 'DELETE',
    },
  );
}

export function listCcConnectModels(project: string): Promise<ApiCcConnectModelListDto> {
  return request<ApiCcConnectModelListDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/models`,
    ccConnectModelListSchema,
  );
}

export function setCcConnectModel(
  project: string,
  model: string,
): Promise<ApiCcConnectSetModelReceiptDto> {
  return request<ApiCcConnectSetModelReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/model`,
    ccConnectSetModelReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({ model }),
    },
  );
}

export function getCcConnectHeartbeat(project: string): Promise<ApiCcConnectHeartbeatStatusDto> {
  return request<ApiCcConnectHeartbeatStatusDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/heartbeat`,
    ccConnectHeartbeatStatusSchema,
  );
}

export function pauseCcConnectHeartbeat(project: string): Promise<ApiCcConnectHeartbeatReceiptDto> {
  return request<ApiCcConnectHeartbeatReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/heartbeat/pause`,
    ccConnectHeartbeatReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function resumeCcConnectHeartbeat(project: string): Promise<ApiCcConnectHeartbeatReceiptDto> {
  return request<ApiCcConnectHeartbeatReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/heartbeat/resume`,
    ccConnectHeartbeatReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function runCcConnectHeartbeat(project: string): Promise<ApiCcConnectHeartbeatReceiptDto> {
  return request<ApiCcConnectHeartbeatReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/heartbeat/run`,
    ccConnectHeartbeatReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function updateCcConnectHeartbeatInterval(
  project: string,
  minutes: number,
): Promise<ApiCcConnectHeartbeatIntervalReceiptDto> {
  return request<ApiCcConnectHeartbeatIntervalReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/heartbeat/interval`,
    ccConnectHeartbeatIntervalReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    },
  );
}

export function listCcConnectCronJobs(project?: string): Promise<ApiCcConnectCronJobDto[]> {
  const params = new URLSearchParams();
  if (project?.trim()) {
    params.set('project', project.trim());
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return request<ApiCcConnectCronJobDto[]>(
    `/external-bridges/cc-connect/cron${query}`,
    z.array(ccConnectCronJobSchema),
  );
}

export function createCcConnectCronPrompt(input: {
  project: string;
  session_key: string;
  cron_expr: string;
  prompt: string;
  description?: string;
  silent?: boolean;
}): Promise<ApiCcConnectCronCreateReceiptDto> {
  return request<ApiCcConnectCronCreateReceiptDto>(
    '/external-bridges/cc-connect/cron',
    ccConnectCronCreateReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteCcConnectCronJob(jobId: string): Promise<ApiCcConnectSendMessageReceiptDto> {
  return request<ApiCcConnectSendMessageReceiptDto>(
    `/external-bridges/cc-connect/cron/${encodeURIComponent(jobId)}`,
    ccConnectSendMessageReceiptSchema,
    {
      method: 'DELETE',
    },
  );
}

export function listCcConnectBridges(): Promise<ApiCcConnectBridgeAdapterSummaryDto[]> {
  return request<ApiCcConnectBridgeAdapterSummaryDto[]>(
    '/external-bridges/cc-connect/bridges',
    z.array(ccConnectBridgeAdapterSummarySchema),
  );
}

export function sendCcConnectProjectMessage(
  project: string,
  input: { session_key: string; message: string },
): Promise<ApiCcConnectSendMessageReceiptDto> {
  return request<ApiCcConnectSendMessageReceiptDto>(
    `/external-bridges/cc-connect/projects/${encodeURIComponent(project)}/send`,
    ccConnectSendMessageReceiptSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
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
  nomos_id?: string;
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

export function getWorkspaceBootstrapStatus(): Promise<ApiWorkspaceBootstrapStatusDto> {
  return request<ApiWorkspaceBootstrapStatusDto>(
    '/workspace/bootstrap',
    workspaceBootstrapStatusSchema,
  );
}

export function getProjectWorkbench(projectId: string): Promise<ApiProjectWorkbenchDto> {
  return request<ApiProjectWorkbenchDto>(`/projects/${encodeURIComponent(projectId)}`, projectWorkbenchResponseSchema);
}

export function getProjectContextDelivery(
  projectId: string,
  input: {
    audience: 'controller' | 'citizen' | 'craftsman';
    task_id?: string;
    citizen_id?: string | null;
    allowed_citizen_ids?: string[];
  },
): Promise<ApiProjectContextDeliveryDto> {
  return request<ApiProjectContextDeliveryDto>(
    `/projects/${encodeURIComponent(projectId)}/context/delivery`,
    projectContextDeliveryResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
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
