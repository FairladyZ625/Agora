import type {
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiHealthDto,
  ApiPromoteTodoResultDto,
  ApiTaskDto,
  ApiTaskStatusDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
} from '@/types/api';
import type { CreateTaskInput } from '@/types/task';
import type { TodoFilter } from '@/types/dashboard';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBase, apiToken } = getConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
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

  return res.json() as Promise<T>;
}

// ── Task APIs ────────────────────────────────────

export function listTasks(state?: string): Promise<ApiTaskDto[]> {
  const params = state ? `?state=${encodeURIComponent(state)}` : '';
  return request<ApiTaskDto[]>(`/tasks${params}`);
}

export function getTask(taskId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}`);
}

export function getTaskStatus(taskId: string): Promise<ApiTaskStatusDto> {
  return request<ApiTaskStatusDto>(`/tasks/${taskId}/status`);
}

export function createTask(input: CreateTaskInput): Promise<ApiTaskDto> {
  return request<ApiTaskDto>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── Task Operations ──────────────────────────────

export function advanceTask(taskId: string, callerId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ caller_id: callerId }),
  });
}

export function approveTask(taskId: string, approverId: string, comment = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approver_id: approverId, comment }),
  });
}

export function rejectTask(taskId: string, rejectorId: string, reason: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/reject`, {
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
  return request<ApiTaskDto>(`/tasks/${taskId}/confirm`, {
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
  return request<ApiTaskDto>(`/tasks/${taskId}/subtask-done`, {
    method: 'POST',
    body: JSON.stringify({ subtask_id: subtaskId, caller_id: callerId, output }),
  });
}

export function forceAdvanceTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/force-advance`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function pauseTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/pause`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function resumeTask(taskId: string): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/resume`, {
    method: 'POST',
  });
}

export function cancelTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unblockTask(taskId: string, reason = ''): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/unblock`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function cleanupTasks(taskId?: string): Promise<{ cleaned: number }> {
  return request<{ cleaned: number }>('/tasks/cleanup', {
    method: 'POST',
    body: JSON.stringify(taskId ? { task_id: taskId } : {}),
  });
}

export function archonApprove(
  taskId: string,
  comment = '',
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/archon-approve`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

export function archonReject(
  taskId: string,
  reason: string,
): Promise<ApiTaskDto> {
  return request<ApiTaskDto>(`/tasks/${taskId}/archon-reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── Health ────────────────────────────────────────

export function healthCheck(): Promise<ApiHealthDto> {
  return request<ApiHealthDto>('/health');
}

// ── Agents / Archive / Todos / Templates ────────

export function getAgentsStatus(): Promise<ApiAgentsStatusDto> {
  return request<ApiAgentsStatusDto>('/agents/status');
}

export function listArchiveJobs(filters?: { status?: string; taskId?: string }): Promise<ApiArchiveJobDto[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.taskId) params.set('task_id', filters.taskId);
  const query = params.toString();
  return request<ApiArchiveJobDto[]>(`/archive/jobs${query ? `?${query}` : ''}`);
}

export function getArchiveJob(jobId: number): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}`);
}

export function retryArchiveJob(jobId: number, reason = ''): Promise<ApiArchiveJobDto> {
  return request<ApiArchiveJobDto>(`/archive/jobs/${jobId}/retry`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function listTodos(status?: Exclude<TodoFilter, 'all'>): Promise<ApiTodoDto[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<ApiTodoDto[]>(`/todos${params}`);
}

export function createTodo(input: {
  text: string;
  due?: string | null;
  tags?: string[];
}): Promise<ApiTodoDto> {
  return request<ApiTodoDto>('/todos', {
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
  return request<ApiTodoDto>(`/todos/${todoId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTodo(todoId: number): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/todos/${todoId}`, {
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
  return request<ApiPromoteTodoResultDto>(`/todos/${todoId}/promote`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listTemplates(): Promise<ApiTemplateSummaryDto[]> {
  return request<ApiTemplateSummaryDto[]>('/templates');
}

export function getTemplate(templateId: string): Promise<ApiTemplateDetailDto> {
  return request<ApiTemplateDetailDto>(`/templates/${templateId}`);
}

export { ApiError };
