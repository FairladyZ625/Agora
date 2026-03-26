#!/usr/bin/env tsx
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { buildApp } from "../apps/server/src/app.ts";
import {
  CitizenService,
  DashboardQueryService,
  LiveSessionStore,
  ProjectBrainService,
  ProjectService,
  RolePackService,
  TaskContextBindingService,
  TaskConversationService,
  TaskService,
} from "../packages/core/src/index.ts";
import { FilesystemProjectBrainQueryAdapter } from "../packages/core/src/adapters/filesystem-project-brain-query-adapter.ts";
import { FilesystemProjectKnowledgeAdapter } from "../packages/core/src/adapters/filesystem-project-knowledge-adapter.ts";
import * as pluginModule from "../../extensions/agora-plugin/src/index.ts";
import { createAgoraDatabase, runMigrations } from "../packages/db/src/index.ts";

type HookName =
  | "session_start"
  | "session_end"
  | "message_received"
  | "message_sent"
  | "before_prompt_build"
  | "agent_end";

type RegisteredCommand = {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<{ text: string }>;
};

class FakePluginApi {
  readonly loggerMessages = {
    info: [] as string[],
    error: [] as string[],
  };

  readonly pluginConfig: Record<string, unknown>;

  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly hooks = new Map<HookName, Array<(event: unknown, ctx: unknown) => void | Promise<void>>>();
  private service: { start: () => void | Promise<void>; stop?: () => void | Promise<void> } | null = null;
  private agentEventListener: ((event: unknown) => void) | undefined;

  constructor(serverUrl: string) {
    this.pluginConfig = {
      serverUrl,
      agentId: "smoke",
    };
  }

  readonly logger = {
    info: (message: string) => {
      this.loggerMessages.info.push(message);
    },
    error: (message: string) => {
      this.loggerMessages.error.push(message);
    },
  };

  readonly runtime = {
    events: {
      onAgentEvent: (listener: (event: unknown) => void) => {
        this.agentEventListener = listener;
        return () => {
          this.agentEventListener = undefined;
        };
      },
    },
  };

  registerCommand(command: RegisteredCommand) {
    this.commands.set(command.name, command);
  }

  registerService(service: { start: () => void | Promise<void>; stop?: () => void | Promise<void> }) {
    this.service = service;
  }

  on(hook: HookName, handler: (event: unknown, ctx: unknown) => void | Promise<void>) {
    const current = this.hooks.get(hook) ?? [];
    current.push(handler);
    this.hooks.set(hook, current);
  }

  async runCommand(name: string, ctx: Record<string, unknown>) {
    const command = this.commands.get(name);
    if (!command) {
      throw new Error(`command not registered: ${name}`);
    }
    return command.handler(ctx);
  }

  async startService() {
    await this.service?.start();
  }

  async stopService() {
    await this.service?.stop?.();
  }

  async emitHook(hook: HookName, event: unknown, ctx: unknown) {
    for (const handler of this.hooks.get(hook) ?? []) {
      await handler(event, ctx);
    }
  }

  emitAgentEvent(event: unknown) {
    this.agentEventListener?.(event);
  }
}

async function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "agora-plugin-live-smoke-"));
  const previousAgoraHome = process.env.AGORA_HOME_DIR;
  process.env.AGORA_HOME_DIR = join(tempRoot, "agora-home");

  const dbPath = join(tempRoot, "agora.db");
  const templatesDir = join(tempRoot, "templates");
  const brainPackRoot = join(tempRoot, "brain-pack");
  mkdirSync(join(templatesDir, "tasks"), { recursive: true });
  mkdirSync(brainPackRoot, { recursive: true });
  cpSync(
    resolve(process.cwd(), "templates", "tasks", "coding.json"),
    join(templatesDir, "tasks", "coding.json"),
  );

  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const liveSessionStore = new LiveSessionStore();
  const taskContextBindingService = new TaskContextBindingService(db);
  const taskConversationService = new TaskConversationService(db);
  const projectService = new ProjectService(db, {
    knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
  });
  let taskCounter = 0;
  const taskService = new TaskService(db, {
    templatesDir,
    taskIdGenerator: () => `OC-PLUGIN-SMOKE-${++taskCounter}`,
  });
  const rolePackService = new RolePackService({ db });
  const citizenService = new CitizenService(db, {
    projectService,
    rolePackService,
    projectionPorts: [],
  });
  const projectBrainService = new ProjectBrainService({
    projectService,
    citizenService,
    projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({ brainPackRoot }),
  });
  const dashboardQueryService = new DashboardQueryService(db, {
    templatesDir,
    liveSessions: liveSessionStore,
  });
  const app = buildApp({
    db,
    taskService,
    projectService,
    projectBrainService,
    citizenService,
    dashboardQueryService,
    liveSessionStore,
    taskContextBindingService,
    taskConversationService,
  });

  let origin: string | null = null;
  try {
    origin = await app.listen({ port: 0, host: "127.0.0.1" });
    const api = new FakePluginApi(origin);
    const registerPlugin = resolvePluginRegister(pluginModule);
    registerPlugin(api as never);
    await api.startService();

    const projectId = "proj-plugin-live-smoke";
    const projectName = "Plugin Live Smoke Project";
    const projectCreate = await api.runCommand("project", {
      args: "create Plugin Live Smoke",
      commandBody: `/project create "${projectName}" --id ${projectId} --summary "local plugin smoke"`,
      senderId: "smoke-user",
    });
    const projectList = await api.runCommand("project", {
      args: "list active",
      commandBody: "/project list active",
      senderId: "smoke-user",
    });
    const projectShow = await api.runCommand("project", {
      args: `show ${projectId}`,
      commandBody: `/project show ${projectId}`,
      senderId: "smoke-user",
    });
    const projectNomosReview = await api.runCommand("project", {
      args: `nomos review ${projectId}`,
      commandBody: `/project nomos review ${projectId}`,
      senderId: "smoke-user",
    });
    const projectNomosValidate = await api.runCommand("project", {
      args: `nomos validate ${projectId} --target draft`,
      commandBody: `/project nomos validate ${projectId} --target draft`,
      senderId: "smoke-user",
    });
    const projectNomosDiff = await api.runCommand("project", {
      args: `nomos diff ${projectId} --base builtin --candidate draft`,
      commandBody: `/project nomos diff ${projectId} --base builtin --candidate draft`,
      senderId: "smoke-user",
    });
    const projectNomosActivate = await api.runCommand("project", {
      args: `nomos activate ${projectId}`,
      commandBody: `/project nomos activate ${projectId}`,
      senderId: "smoke-user",
    });
    const targetProjectId = "proj-plugin-live-target";
    const targetProjectName = "Plugin Live Target";
    const targetCreate = await api.runCommand("project", {
      args: `create ${targetProjectName}`,
      commandBody: `/project create "${targetProjectName}" --id ${targetProjectId}`,
      senderId: "smoke-user",
    });
    const exportDir = join(tempRoot, "plugin-exported-pack");
    const projectNomosExport = await api.runCommand("project", {
      args: `nomos export ${projectId} --output-dir ${exportDir}`,
      commandBody: `/project nomos export ${projectId} --output-dir ${exportDir}`,
      senderId: "smoke-user",
    });
    const projectNomosPublish = await api.runCommand("project", {
      args: `nomos publish ${projectId} --note plugin-smoke`,
      commandBody: `/project nomos publish ${projectId} --note plugin-smoke`,
      senderId: "smoke-user",
    });
    const projectNomosCatalogList = await api.runCommand("project", {
      args: "nomos catalog-list",
      commandBody: "/project nomos catalog-list",
      senderId: "smoke-user",
    });
    const projectNomosCatalogShow = await api.runCommand("project", {
      args: `nomos catalog-show project/${projectId}`,
      commandBody: `/project nomos catalog-show project/${projectId}`,
      senderId: "smoke-user",
    });
    const projectNomosInstallFromCatalog = await api.runCommand("project", {
      args: `nomos install-from-catalog ${targetProjectId} --pack-id project/${projectId}`,
      commandBody: `/project nomos install-from-catalog ${targetProjectId} --pack-id project/${projectId}`,
      senderId: "smoke-user",
    });
    const projectNomosInstallPack = await api.runCommand("project", {
      args: `nomos install-pack ${targetProjectId} --pack-dir ${exportDir}`,
      commandBody: `/project nomos install-pack ${targetProjectId} --pack-dir ${exportDir}`,
      senderId: "smoke-user",
    });
    const projectNomosImportSource = await api.runCommand("project", {
      args: `nomos import-source --source-dir ${exportDir}`,
      commandBody: `/project nomos import-source --source-dir ${exportDir}`,
      senderId: "smoke-user",
    });
    const registeredSourceId = "shared/plugin-live";
    const projectNomosRegisterSource = await api.runCommand("project", {
      args: `nomos register-source --source-id ${registeredSourceId} --source-dir ${exportDir}`,
      commandBody: `/project nomos register-source --source-id ${registeredSourceId} --source-dir ${exportDir}`,
      senderId: "smoke-user",
    });
    const projectNomosSourcesList = await api.runCommand("project", {
      args: "nomos sources-list",
      commandBody: "/project nomos sources-list",
      senderId: "smoke-user",
    });
    const projectNomosSourceShow = await api.runCommand("project", {
      args: `nomos source-show ${registeredSourceId}`,
      commandBody: `/project nomos source-show ${registeredSourceId}`,
      senderId: "smoke-user",
    });
    const projectNomosSyncRegisteredSource = await api.runCommand("project", {
      args: `nomos sync-registered-source --source-id ${registeredSourceId}`,
      commandBody: `/project nomos sync-registered-source --source-id ${registeredSourceId}`,
      senderId: "smoke-user",
    });
    const projectNomosInstallFromRegisteredSource = await api.runCommand("project", {
      args: `nomos install-from-registered-source ${targetProjectId} --source-id ${registeredSourceId}`,
      commandBody: `/project nomos install-from-registered-source ${targetProjectId} --source-id ${registeredSourceId}`,
      senderId: "smoke-user",
    });
    const projectNomosInstallFromSource = await api.runCommand("project", {
      args: `nomos install-from-source ${targetProjectId} --source-dir ${exportDir}`,
      commandBody: `/project nomos install-from-source ${targetProjectId} --source-dir ${exportDir}`,
      senderId: "smoke-user",
    });

    if (!projectCreate.text.includes(`Created project ${projectId}`)) {
      throw new Error(`project create failed: ${projectCreate.text}`);
    }
    if (!projectList.text.includes(projectId)) {
      throw new Error(`project list missing ${projectId}: ${projectList.text}`);
    }
    if (!projectShow.text.includes(`${projectId} | active | ${projectName}`)) {
      throw new Error(`project show mismatch: ${projectShow.text}`);
    }
    if (!projectNomosReview.text.includes(`Nomos review for ${projectId}`)) {
      throw new Error(`project nomos review failed: ${projectNomosReview.text}`);
    }
    if (!projectNomosValidate.text.includes("valid=yes")) {
      throw new Error(`project nomos validate failed: ${projectNomosValidate.text}`);
    }
    if (!projectNomosDiff.text.includes("changed=yes")) {
      throw new Error(`project nomos diff failed: ${projectNomosDiff.text}`);
    }
    if (!projectNomosActivate.text.includes("status=active_project")) {
      throw new Error(`project nomos activate failed: ${projectNomosActivate.text}`);
    }
    if (!targetCreate.text.includes(`Created project ${targetProjectId}`)) {
      throw new Error(`target project create failed: ${targetCreate.text}`);
    }
    if (!projectNomosExport.text.includes(`output=${exportDir}`)) {
      throw new Error(`project nomos export failed: ${projectNomosExport.text}`);
    }
    if (!projectNomosPublish.text.includes(`Published Nomos for ${projectId}`)) {
      throw new Error(`project nomos publish failed: ${projectNomosPublish.text}`);
    }
    if (!projectNomosCatalogList.text.includes(`project/${projectId}`)) {
      throw new Error(`project nomos catalog-list failed: ${projectNomosCatalogList.text}`);
    }
    if (!projectNomosCatalogShow.text.includes(`Nomos catalog entry project/${projectId}`)) {
      throw new Error(`project nomos catalog-show failed: ${projectNomosCatalogShow.text}`);
    }
    if (!projectNomosInstallFromCatalog.text.includes(`Installed catalog Nomos into ${targetProjectId}`)) {
      throw new Error(`project nomos install-from-catalog failed: ${projectNomosInstallFromCatalog.text}`);
    }
    if (!projectNomosInstallPack.text.includes(`Installed Nomos pack into ${targetProjectId}`)) {
      throw new Error(`project nomos install-pack failed: ${projectNomosInstallPack.text}`);
    }
    if (!projectNomosImportSource.text.includes(`Imported Nomos source project/${projectId}`)) {
      throw new Error(`project nomos import-source failed: ${projectNomosImportSource.text}`);
    }
    if (!projectNomosRegisterSource.text.includes(`Registered Nomos source ${registeredSourceId}`)) {
      throw new Error(`project nomos register-source failed: ${projectNomosRegisterSource.text}`);
    }
    if (!projectNomosSourcesList.text.includes(registeredSourceId)) {
      throw new Error(`project nomos sources-list failed: ${projectNomosSourcesList.text}`);
    }
    if (!projectNomosSourceShow.text.includes(`Nomos source ${registeredSourceId}`)) {
      throw new Error(`project nomos source-show failed: ${projectNomosSourceShow.text}`);
    }
    if (!projectNomosSyncRegisteredSource.text.includes(`Synced Nomos source ${registeredSourceId}`)) {
      throw new Error(`project nomos sync-registered-source failed: ${projectNomosSyncRegisteredSource.text}`);
    }
    if (!projectNomosInstallFromRegisteredSource.text.includes(`Installed registered source into ${targetProjectId}`)) {
      throw new Error(`project nomos install-from-registered-source failed: ${projectNomosInstallFromRegisteredSource.text}`);
    }
    if (!projectNomosInstallFromSource.text.includes(`Installed source Nomos into ${targetProjectId}`)) {
      throw new Error(`project nomos install-from-source failed: ${projectNomosInstallFromSource.text}`);
    }

    const taskCreate = await api.runCommand("task", {
      args: "create Plugin Live Smoke Task coding",
      commandBody: '/task create "Plugin Live Smoke Task" coding',
      senderId: "smoke-user",
    });
    const taskIdMatch = taskCreate.text.match(/Created (OC-[A-Z0-9-]+)/i);
    const taskId = taskIdMatch?.[1];
    if (!taskId) {
      throw new Error(`task create did not return task id: ${taskCreate.text}`);
    }

    const conversationRef = "plugin-live-smoke";
    const threadRef = "thread-plugin-live-smoke";
    await requestJson(`${origin}/api/tasks/${encodeURIComponent(taskId)}/context-binding`, {
      method: "POST",
      body: {
        im_provider: "discord",
        conversation_ref: conversationRef,
        thread_ref: threadRef,
      },
    });

    const sessionKey = `agent:smoke:discord:channel:${conversationRef}`;
    await api.emitHook(
      "session_start",
      { sessionId: "sess-plugin-live-1", sessionKey },
      { sessionId: "sess-plugin-live-1", sessionKey, agentId: "smoke" },
    );
    await api.emitHook(
      "before_prompt_build",
      { prompt: "run plugin live smoke", messages: [] },
      {
        agentId: "smoke",
        sessionId: "sess-plugin-live-1",
        sessionKey,
        channelId: "discord",
        trigger: "smoke",
      },
    );
    await api.emitHook(
      "message_received",
      {
        content: "please continue plugin smoke",
        timestamp: Date.now(),
        metadata: {
          threadId: threadRef,
          messageId: "msg-in-plugin-smoke",
          senderId: "530383608410800138",
          senderName: "Lizeyu",
        },
      },
      {
        channelId: "discord",
        conversationId: conversationRef,
        sessionKey,
        agentId: "smoke",
        accountId: "530383608410800138",
      },
    );
    await api.emitHook(
      "message_sent",
      {
        content: "plugin smoke acknowledged",
        success: true,
        timestamp: Date.now(),
        metadata: {
          threadId: threadRef,
          messageId: "msg-out-plugin-smoke",
        },
      },
      {
        channelId: "discord",
        conversationId: conversationRef,
        sessionKey,
        agentId: "smoke",
        accountId: "530383608410800138",
      },
    );
    api.emitAgentEvent({
      runId: "run-plugin-live-smoke",
      seq: 1,
      stream: "heartbeat",
      ts: Date.now(),
      sessionKey,
      data: {
        status: "ok",
      },
    });
    await api.emitHook(
      "agent_end",
      {
        success: true,
        durationMs: 12,
      },
      {
        agentId: "smoke",
        sessionId: "sess-plugin-live-1",
        sessionKey,
        channelId: "discord",
        trigger: "smoke",
      },
    );
    await api.emitHook(
      "session_end",
      {
        sessionId: "sess-plugin-live-1",
        sessionKey,
        messageCount: 2,
      },
      {
        sessionId: "sess-plugin-live-1",
        sessionKey,
        agentId: "smoke",
      },
    );

    const sessions = await waitFor(
      async () => {
        const value = await requestJson<Array<Record<string, unknown>>>(`${origin}/api/live/openclaw/sessions`);
        return value.length > 0 ? value : null;
      },
      "live session upsert",
    );
    const conversation = await waitFor(
      async () => {
        const value = await requestJson<{ entries: Array<Record<string, unknown>> }>(
          `${origin}/api/tasks/${encodeURIComponent(taskId)}/conversation`,
        );
        return value.entries.length >= 2 ? value : null;
      },
      "task conversation ingestion",
    );

    if (api.loggerMessages.error.length > 0) {
      throw new Error(`plugin logger errors: ${api.loggerMessages.error.join(" | ")}`);
    }

    const inboundEntry = conversation.entries.find((entry) => entry.direction === "inbound");
    const outboundEntry = conversation.entries.find((entry) => entry.direction === "outbound");
    if (!inboundEntry || !outboundEntry) {
      throw new Error(`expected inbound and outbound conversation entries, got ${JSON.stringify(conversation.entries)}`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "pass",
          project_id: projectId,
          task_id: taskId,
          commands: {
            project_create: projectCreate.text,
            project_list: projectList.text,
            project_show: projectShow.text,
            project_nomos_review: projectNomosReview.text,
            project_nomos_validate: projectNomosValidate.text,
            project_nomos_diff: projectNomosDiff.text,
            project_nomos_activate: projectNomosActivate.text,
            target_project_create: targetCreate.text,
            project_nomos_export: projectNomosExport.text,
            project_nomos_publish: projectNomosPublish.text,
            project_nomos_catalog_list: projectNomosCatalogList.text,
            project_nomos_catalog_show: projectNomosCatalogShow.text,
            project_nomos_install_from_catalog: projectNomosInstallFromCatalog.text,
            project_nomos_install_pack: projectNomosInstallPack.text,
            project_nomos_import_source: projectNomosImportSource.text,
            project_nomos_register_source: projectNomosRegisterSource.text,
            project_nomos_sources_list: projectNomosSourcesList.text,
            project_nomos_source_show: projectNomosSourceShow.text,
            project_nomos_sync_registered_source: projectNomosSyncRegisteredSource.text,
            project_nomos_install_from_registered_source: projectNomosInstallFromRegisteredSource.text,
            project_nomos_install_from_source: projectNomosInstallFromSource.text,
            task_create: taskCreate.text,
          },
          live_session: sessions[0],
          conversation_entries: conversation.entries.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await taskService.drainBackgroundOperations();
    await app.close();
    db.close();
    if (previousAgoraHome === undefined) {
      delete process.env.AGORA_HOME_DIR;
    } else {
      process.env.AGORA_HOME_DIR = previousAgoraHome;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function requestJson<T>(
  url: string,
  input?: {
    method?: string;
    body?: unknown;
  },
) {
  const response = await fetch(url, {
    method: input?.method ?? "GET",
    headers: input?.body ? { "content-type": "application/json" } : undefined,
    body: input?.body ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${input?.method ?? "GET"} ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function waitFor<T>(
  probe: () => Promise<T | null>,
  label: string,
  timeoutMs = 5_000,
  intervalMs = 100,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await probe();
    if (value) {
      return value;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function resolvePluginRegister(moduleValue: Record<string, unknown>) {
  const candidate =
    typeof moduleValue.default === "function"
      ? moduleValue.default
      : moduleValue.default && typeof moduleValue.default === "object" && typeof (moduleValue.default as Record<string, unknown>).default === "function"
        ? (moduleValue.default as Record<string, unknown>).default
        : typeof moduleValue === "function"
          ? moduleValue
          : null;
  if (!candidate) {
    throw new Error("failed to resolve plugin register export");
  }
  return candidate as (api: unknown) => void;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
