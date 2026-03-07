export class AgoraBridge {
  constructor(
    private readonly serverUrl: string,
    private readonly apiToken?: string,
  ) {}

  async createTask(title: string, type: string, creator: string): Promise<any> {
    return this.request("/api/tasks", {
      method: "POST",
      body: { title, type, creator },
    });
  }

  async listTasks(state?: string): Promise<any[]> {
    const path = state ? `/api/tasks?state=${encodeURIComponent(state)}` : "/api/tasks";
    return this.request(path);
  }

  async getTask(taskId: string): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}`);
  }

  async taskStatus(taskId: string): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/status`);
  }

  async advanceTask(taskId: string, callerId: string): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/advance`, {
      method: "POST",
      body: { caller_id: callerId },
    });
  }

  async approve(taskId: string, approverId: string, comment = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/approve`, {
      method: "POST",
      body: { approver_id: approverId, comment },
    });
  }

  async reject(taskId: string, rejectorId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/reject`, {
      method: "POST",
      body: { rejector_id: rejectorId, reason },
    });
  }

  async archonApprove(taskId: string, reviewerId: string, comment = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/archon-approve`, {
      method: "POST",
      body: { reviewer_id: reviewerId, comment },
    });
  }

  async archonReject(taskId: string, reviewerId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/archon-reject`, {
      method: "POST",
      body: { reviewer_id: reviewerId, reason },
    });
  }

  async confirm(taskId: string, voterId: string, vote = "approve", comment = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/confirm`, {
      method: "POST",
      body: { voter_id: voterId, vote, comment },
    });
  }

  async subtaskDone(taskId: string, subtaskId: string, callerId: string, output = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/subtask-done`, {
      method: "POST",
      body: { subtask_id: subtaskId, caller_id: callerId, output },
    });
  }

  async forceAdvance(taskId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/force-advance`, {
      method: "POST",
      body: { reason },
    });
  }

  async pause(taskId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/pause`, {
      method: "POST",
      body: { reason },
    });
  }

  async resume(taskId: string): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: "POST",
    });
  }

  async cancel(taskId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
      body: { reason },
    });
  }

  async unblock(taskId: string, reason = ""): Promise<any> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/unblock`, {
      method: "POST",
      body: { reason },
    });
  }

  async cleanup(taskId?: string): Promise<any> {
    return this.request("/api/tasks/cleanup", {
      method: "POST",
      body: taskId ? { task_id: taskId } : {},
    });
  }

  private async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiToken && this.apiToken.trim()) {
      headers.Authorization = `Bearer ${this.apiToken.trim()}`;
    }

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: init.method || "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await res.text();
    const payload = text ? safeJson(text) : {};

    if (!res.ok) {
      const detail = typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as Record<string, unknown>).detail)
        : text;
      throw new Error(`Agora API ${res.status}: ${detail}`);
    }

    return payload;
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}
