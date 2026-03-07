import type { ApiHealthDto, ApiTaskDto, ApiTaskStatusDto } from '@/types/api';

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

// ── Task Operations ──────────────────────────────

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

export { ApiError };
