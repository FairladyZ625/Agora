import type {
  AdvanceTaskRequestDto,
  ApproveTaskRequestDto,
  ArchonApproveTaskRequestDto,
  ArchonRejectTaskRequestDto,
  CraftsmanRuntimeIdentityRequestDto,
  ConfirmTaskRequestDto,
  CreateProjectRequestDto,
  CreateTaskRequestDto,
  IngestTaskConversationEntryRequestDto,
  ListProjectsResponseDto,
  LiveSessionDto,
  ProjectDto,
  ProjectWorkbenchResponseDto,
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
      locale: "zh-CN",
    };
    return this.request("/api/tasks", {
      method: "POST",
      body,
    });
  }

  async createProject(input: {
    name: string;
    id?: string;
    summary?: string;
    owner?: string;
    repoPath?: string;
    initializeRepo?: boolean;
    nomosId?: string;
  }): Promise<ProjectDto> {
    const body: CreateProjectRequestDto = {
      name: input.name,
      summary: input.summary ?? "",
      ...(input.id ? { id: input.id } : {}),
      ...(input.owner ? { owner: input.owner } : {}),
      ...(input.repoPath ? { repo_path: input.repoPath } : {}),
      ...(input.initializeRepo !== undefined ? { initialize_repo: input.initializeRepo } : {}),
      ...(input.nomosId ? { nomos_id: input.nomosId } : {}),
    };
    return this.request("/api/projects", {
      method: "POST",
      body,
    });
  }

  async listProjects(status?: string): Promise<ProjectDto[]> {
    const path = status ? `/api/projects?status=${encodeURIComponent(status)}` : "/api/projects";
    const response = await this.request<ListProjectsResponseDto>(path);
    return response.projects;
  }

  async getProject(projectId: string): Promise<ProjectWorkbenchResponseDto> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}`);
  }

  async reviewProjectNomos(projectId: string): Promise<{
    project_id: string;
    activation_status: "active_builtin" | "active_project";
    can_activate: boolean;
    issues: string[];
    active: { pack_id: string };
    draft: { pack_id: string } | null;
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/review`);
  }

  async activateProjectNomos(projectId: string, actor: string): Promise<{
    project_id: string;
    nomos_id: string;
    activation_status: "active_project";
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/activate`, {
      method: "POST",
      body: { actor },
    });
  }

  async validateProjectNomos(projectId: string, target: "draft" | "active" = "draft"): Promise<{
    project_id: string;
    target: "draft" | "active";
    valid: boolean;
    issues: Array<{ message: string }>;
    pack: { pack_id: string } | null;
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/validate?target=${encodeURIComponent(target)}`);
  }

  async diffProjectNomos(
    projectId: string,
    input: { base?: "builtin" | "active"; candidate?: "draft" | "active" } = {},
  ): Promise<{
    project_id: string;
    changed: boolean;
    differences: Array<{ field: string }>;
    base: "builtin" | "active";
    candidate: "draft" | "active";
  }> {
    const params = new URLSearchParams();
    if (input.base) {
      params.set("base", input.base);
    }
    if (input.candidate) {
      params.set("candidate", input.candidate);
    }
    const query = params.toString();
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/diff${query ? `?${query}` : ""}`);
  }

  async exportProjectNomos(projectId: string, outputDir: string, target: "draft" | "active" = "draft"): Promise<{
    project_id: string;
    target: "draft" | "active";
    output_dir: string;
    pack: { pack_id: string } | null;
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/export`, {
      method: "POST",
      body: { output_dir: outputDir, target },
    });
  }

  async publishProjectNomos(projectId: string, input: {
    target?: "draft" | "active";
    actor?: string;
    note?: string;
  } = {}): Promise<{
    project_id: string;
    target: "draft" | "active";
    entry: { pack_id: string; published_by: string | null; published_note: string | null };
    catalog_pack_root: string;
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/publish`, {
      method: "POST",
      body: {
        target: input.target ?? "draft",
        ...(input.actor ? { published_by: input.actor } : {}),
        ...(input.note ? { published_note: input.note } : {}),
      },
    });
  }

  async installProjectNomosPack(projectId: string, packDir: string): Promise<{
    project_id: string;
    pack: { pack_id: string };
    installed_root: string;
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/install-pack`, {
      method: "POST",
      body: { pack_dir: packDir },
    });
  }

  async listPublishedNomosCatalog(): Promise<{
    catalog_root: string;
    total: number;
    summaries: Array<{
      pack_id: string;
      version: string;
      source_kind: "project_publish" | "share_bundle" | "pack_root";
      published_by: string | null;
      source_project_id: string;
      source_target: "draft" | "active";
    }>;
  }> {
    return this.request("/api/nomos/catalog");
  }

  async showPublishedNomosCatalog(packId: string): Promise<{
    pack_id: string;
    source_kind: "project_publish" | "share_bundle" | "pack_root";
    published_by: string | null;
    published_note: string | null;
    source_project_id: string;
    source_target: "draft" | "active";
    source_activation_status: "active_builtin" | "active_project";
    source_repo_path: string | null;
    published_root: string;
  }> {
    return this.request(`/api/nomos/catalog/${packId}`);
  }

  async installCatalogNomosPack(projectId: string, packId: string): Promise<{
    project_id: string;
    pack: { pack_id: string };
    installed_root: string;
    catalog_entry: { pack_id: string };
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/install-catalog-pack`, {
      method: "POST",
      body: { pack_id: packId },
    });
  }

  async importNomosSource(sourceDir: string): Promise<{
    source_dir: string;
    source_kind: "share_bundle" | "pack_root";
    manifest_path: string | null;
    entry: { pack_id: string; source_kind: "project_publish" | "share_bundle" | "pack_root"; source_project_id: string };
  }> {
    return this.request("/api/nomos/sources/import", {
      method: "POST",
      body: { source_dir: sourceDir },
    });
  }

  async installNomosFromSource(projectId: string, sourceDir: string): Promise<{
    project_id: string;
    pack: { pack_id: string };
    installed_root: string;
    imported: { source_kind: "share_bundle" | "pack_root"; entry: { pack_id: string } };
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/nomos/install-from-source`, {
      method: "POST",
      body: { source_dir: sourceDir },
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
