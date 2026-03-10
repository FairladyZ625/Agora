import type {
  ApiAgentChannelSummaryDto,
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiHealthDto,
  ApiPromoteTodoResultDto,
  ApiTaskDto,
  ApiTaskConversationListResponseDto,
  ApiTaskStatusDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
} from '@/types/api';
import type { CreateTaskInput } from '@/types/task';
import type { TodoFilter } from '@/types/dashboard';
import {
  agentChannelSummarySchema,
  agentsStatusSchema,
  archiveJobSchema,
  archiveJobReceiptScanResponseSchema,
  healthResponseSchema,
  promoteTodoResultSchema,
  taskSchema,
  taskConversationListResponseSchema,
  taskStatusSchema,
  templateDetailSchema,
  templateSummarySchema,
  todoItemSchema,
} from '@agora-ts/contracts';
import { z, type ZodType } from 'zod';

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
  try {
    if (typeof localStorage?.getItem !== 'function') {
      return { apiBase: '/api', apiToken: '' };
    }
    const raw = localStorage.getItem('agora-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiBase: parsed?.state?.apiBase ?? '/api',
        apiToken: parsed?.state?.apiToken ?? '',
      };
    }
  } catch {
    // ignore
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

  const res = await fetch(`${apiBase}${path}`, {
    method: init?.method ?? 'GET',
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

// ── Task APIs ────────────────────────────────────

export function listTasks(state?: string): Promise<ApiTaskDto[]> {
  const params = state ? `?state=${encodeURIComponent(state)}` : '';
  return request<ApiTaskDto[]>(`/tasks${params}`, z.array(taskSchema));
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

export function createTask(input: CreateTaskInput): Promise<ApiTaskDto> {
  return request<ApiTaskDto>('/tasks', taskSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

// ── Agents / Archive / Todos / Templates ────────

export function getAgentsStatus(): Promise<ApiAgentsStatusDto> {
  return request<ApiAgentsStatusDto>('/agents/status', agentsStatusSchema);
}

export function getAgentChannelDetail(channel: string): Promise<ApiAgentChannelSummaryDto> {
  return request<ApiAgentChannelSummaryDto>(`/agents/channels/${encodeURIComponent(channel)}`, agentChannelSummarySchema);
}

export function getTmuxTail(agent: string, lines = 20): Promise<{ output: string | null }> {
  return request<{ output: string | null }>(
    `/craftsmen/tmux/tail/${encodeURIComponent(agent)}?lines=${encodeURIComponent(String(lines))}`,
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

export function listTodos(status?: Exclude<TodoFilter, 'all'>): Promise<ApiTodoDto[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<ApiTodoDto[]>(`/todos${params}`, z.array(todoItemSchema));
}

export function createTodo(input: {
  text: string;
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

export { ApiError };
