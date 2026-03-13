import type {
  AdvanceTaskRequestDto,
  ApproveTaskRequestDto,
  ArchonApproveTaskRequestDto,
  ArchonRejectTaskRequestDto,
  CraftsmanRuntimeIdentityRequestDto,
  ConfirmTaskRequestDto,
  CreateTaskRequestDto,
  IngestTaskConversationEntryRequestDto,
  LiveSessionDto,
  RejectTaskRequestDto,
  SubtaskDoneRequestDto,
  TaskDto,
  TaskStatusDto,
  TaskNoteRequestDto,
} from "@agora-ts/contracts";
import { parseJsonResponse } from "./json";

export class AgoraBridge {
  constructor(
    private readonly serverUrl: string,
    private readonly apiToken?: string,
  ) {}

  async createTask(title: string, type: string, creator: string): Promise<TaskDto> {
    const body: CreateTaskRequestDto = {
      title,
      type,
      creator,
      description: "",
      priority: "normal",
    };
    return this.request("/api/tasks", {
      method: "POST",
      body,
    });
  }

  async listTasks(state?: string): Promise<TaskDto[]> {
    const path = state ? `/api/tasks?state=${encodeURIComponent(state)}` : "/api/tasks";
    return this.request(path);
  }

  async getTask(taskId: string): Promise<TaskDto> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}`);
  }

  async taskStatus(taskId: string): Promise<TaskStatusDto> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/status`);
  }

  async advanceTask(taskId: string, callerId: string): Promise<TaskDto> {
    const body: AdvanceTaskRequestDto = { caller_id: callerId };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/advance`, {
      method: "POST",
      body,
    });
  }

  async approve(taskId: string, approverId: string, comment = ""): Promise<TaskDto> {
    const body: ApproveTaskRequestDto = { approver_id: approverId, comment };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/approve`, {
      method: "POST",
      body,
    });
  }

  async approveCurrent(input: {
    provider?: string;
    threadRef?: string;
    conversationRef?: string;
    actorId?: string;
    comment?: string;
  }): Promise<TaskDto> {
    return this.request("/api/im/tasks/current/approve", {
      method: "POST",
      body: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.threadRef ? { thread_ref: input.threadRef } : {}),
        ...(input.conversationRef ? { conversation_ref: input.conversationRef } : {}),
        ...(input.actorId ? { actor_id: input.actorId } : {}),
        comment: input.comment ?? "",
      },
      headers: input.actorId && input.provider ? this.humanIdentityHeaders(input.provider, input.actorId) : {},
    });
  }

  async reject(taskId: string, rejectorId: string, reason = ""): Promise<TaskDto> {
    const body: RejectTaskRequestDto = { rejector_id: rejectorId, reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/reject`, {
      method: "POST",
      body,
    });
  }

  async rejectCurrent(input: {
    provider?: string;
    threadRef?: string;
    conversationRef?: string;
    actorId?: string;
    reason?: string;
  }): Promise<TaskDto> {
    return this.request("/api/im/tasks/current/reject", {
      method: "POST",
      body: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.threadRef ? { thread_ref: input.threadRef } : {}),
        ...(input.conversationRef ? { conversation_ref: input.conversationRef } : {}),
        ...(input.actorId ? { actor_id: input.actorId } : {}),
        reason: input.reason ?? "",
      },
      headers: input.actorId && input.provider ? this.humanIdentityHeaders(input.provider, input.actorId) : {},
    });
  }

  async archonApprove(taskId: string, reviewerId: string, provider: string, comment = ""): Promise<TaskDto> {
    const body: ArchonApproveTaskRequestDto = { reviewer_id: reviewerId, comment };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/archon-approve`, {
      method: "POST",
      body,
      headers: this.humanIdentityHeaders(provider, reviewerId),
    });
  }

  async archonReject(taskId: string, reviewerId: string, provider: string, reason = ""): Promise<TaskDto> {
    const body: ArchonRejectTaskRequestDto = { reviewer_id: reviewerId, reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/archon-reject`, {
      method: "POST",
      body,
      headers: this.humanIdentityHeaders(provider, reviewerId),
    });
  }

  async confirm(
    taskId: string,
    voterId: string,
    vote: ConfirmTaskRequestDto["vote"] = "approve",
    comment = "",
  ): Promise<TaskDto & { quorum: { approved: number; total: number } }> {
    const body: ConfirmTaskRequestDto = { voter_id: voterId, vote, comment };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/confirm`, {
      method: "POST",
      body,
    });
  }

  async subtaskDone(taskId: string, subtaskId: string, callerId: string, output = ""): Promise<TaskDto> {
    const body: SubtaskDoneRequestDto = { subtask_id: subtaskId, caller_id: callerId, output };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/subtask-done`, {
      method: "POST",
      body,
    });
  }

  async forceAdvance(taskId: string, reason = ""): Promise<TaskDto> {
    const body: TaskNoteRequestDto = { reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/force-advance`, {
      method: "POST",
      body,
    });
  }

  async pause(taskId: string, reason = ""): Promise<TaskDto> {
    const body: TaskNoteRequestDto = { reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/pause`, {
      method: "POST",
      body,
    });
  }

  async resume(taskId: string): Promise<TaskDto> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: "POST",
    });
  }

  async cancel(taskId: string, reason = ""): Promise<TaskDto> {
    const body: TaskNoteRequestDto = { reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
      body,
    });
  }

  async unblock(taskId: string, reason = ""): Promise<TaskDto> {
    const body: TaskNoteRequestDto = { reason };
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/unblock`, {
      method: "POST",
      body,
    });
  }

  async cleanup(taskId?: string): Promise<{ cleaned: number }> {
    return this.request("/api/tasks/cleanup", {
      method: "POST",
      body: taskId ? { task_id: taskId } : {},
    });
  }

  async upsertLiveSession(payload: LiveSessionDto): Promise<{ ok: true } | LiveSessionDto> {
    return this.request("/api/live/openclaw/sessions", {
      method: "POST",
      body: payload,
    });
  }

  async ingestRuntimeIdentity(
    payload: CraftsmanRuntimeIdentityRequestDto,
  ): Promise<{ ok: true; identity: Record<string, unknown> }> {
    return this.request("/api/craftsmen/runtime/identity", {
      method: "POST",
      body: payload,
    });
  }

  async ingestTaskConversationEntry(
    payload: IngestTaskConversationEntryRequestDto,
  ): Promise<{ accepted: false } | { id: string }> {
    return this.request("/api/conversations/ingest", {
      method: "POST",
      body: payload,
    });
  }

  private async request<TResponse>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<TResponse> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (this.apiToken && this.apiToken.trim()) {
      headers.Authorization = `Bearer ${this.apiToken.trim()}`;
    }

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: init.method || "GET",
      headers: { ...headers, ...(init.headers ?? {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await res.text();
    const payload = text
      ? (res.ok ? parseJsonResponse(text, `JSON response from ${path}`) : safeJsonErrorPayload(text))
      : {};

    if (!res.ok) {
      const detail = typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as Record<string, unknown>).detail)
        : text;
      throw new Error(`Agora API ${res.status}: ${detail}`);
    }

    return payload as TResponse;
  }

  private humanIdentityHeaders(provider: string, externalUserId: string): Record<string, string> {
    return {
      'x-agora-human-provider': provider,
      'x-agora-human-external-id': externalUserId,
    };
  }
}

function safeJsonErrorPayload(value: string): unknown {
  try {
    return parseJsonResponse(value, 'error JSON response');
  } catch {
    return { raw: value };
  }
}
