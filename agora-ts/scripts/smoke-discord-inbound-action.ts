#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { buildApp } from '../apps/server/src/app.ts';
import { DiscordIMProvisioningAdapter } from '../packages/adapters-discord/src/index.ts';
import { loadAgoraConfig } from '../packages/config/src/index.ts';
import { TaskContextBindingService, TaskConversationService, TaskInboundService } from '../packages/core/src/index.ts';
import { createAgoraDatabase, runMigrations, TaskContextBindingRepository, TaskConversationReadCursorRepository, TaskConversationRepository } from '../packages/db/src/index.ts';
import { createTaskServiceFromDb } from '@agora-ts/testing';
import { loadOpenClawDiscordAccountTokens } from '../packages/adapters-openclaw/src/index.ts';

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitFor<T>(label: string, fn: () => T | null | undefined | Promise<T | null | undefined>, timeoutMs: number, pollMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) {
      return value;
    }
    await sleep(pollMs);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const program = new Command();
  program
    .option('--config <path>', 'Agora config path override')
    .option('--openclaw-config <path>', 'OpenClaw config path override')
    .option('--task-id <id>', 'task id override', `OC-INBOUND-SMOKE-${Date.now()}`)
    .option('--scenario <kind>', 'linear|branch|complete', 'linear')
    .option('--timeout-ms <ms>', 'overall wait timeout', '30000')
    .option('--poll-ms <ms>', 'poll interval', '1500')
    .option('--cleanup-mode <mode>', 'delete|archive', 'delete')
    .option('--keep-db', 'keep temporary db', false)
    .parse(process.argv);

  const options = program.opts<{
    config?: string;
    openclawConfig?: string;
    taskId: string;
    scenario: 'linear' | 'branch' | 'complete';
    timeoutMs: string;
    pollMs: string;
    cleanupMode: 'delete' | 'archive';
    keepDb: boolean;
  }>();

  const config = loadAgoraConfig(options.config ?? process.env.AGORA_CONFIG_PATH ?? '');
  if (config.im.provider !== 'discord' || !config.im.discord?.bot_token || !config.im.discord.default_channel_id) {
    throw new Error('Agora discord IM is not configured with bot_token + default_channel_id');
  }
  const participantTokens = loadOpenClawDiscordAccountTokens(
    options.openclawConfig ? { configPath: options.openclawConfig } : {},
  );
  const primaryAccountId = Object.entries(participantTokens).find(([, token]) => token === config.im.discord?.bot_token)?.[0] ?? null;
  const provisioning = new DiscordIMProvisioningAdapter({
    botToken: config.im.discord.bot_token,
    defaultChannelId: config.im.discord.default_channel_id,
    participantTokens,
    primaryAccountId,
  });

  const tempDir = mkdtempSync(join(tmpdir(), 'agora-inbound-smoke-'));
  const dbPath = join(tempDir, 'smoke.db');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const bindingRepository = new TaskContextBindingRepository(db);
  const conversationRepository = new TaskConversationRepository(db);
  const readCursorRepository = new TaskConversationReadCursorRepository(db);
  const bindings = new TaskContextBindingService({ repository: bindingRepository });
  const conversations = new TaskConversationService({
    bindingRepository,
    conversationRepository,
    readCursorRepository,
  });
  const taskService = createTaskServiceFromDb(db, {
    templatesDir: join(process.cwd(), 'templates'),
    taskIdGenerator: () => options.taskId,
    imProvisioningPort: provisioning,
    taskContextBindingService: bindings,
    allowAgents: {
      glm5: { canCall: [], canAdvance: true },
    },
  });
  const inbound = new TaskInboundService(conversations, bindings, taskService);
  const app = buildApp({
    db,
    taskService,
    taskContextBindingService: bindings,
    taskConversationService: conversations,
    taskInboundService: inbound,
  });

  let threadRef: string | null = null;
  let bindingId: string | null = null;
  const cleanup = async () => {
    try {
      await taskService.drainBackgroundOperations();
      if (bindingId && threadRef) {
        await provisioning.archiveContext({
          binding_id: bindingId,
          thread_ref: threadRef,
          mode: options.cleanupMode,
          reason: 'discord inbound action smoke cleanup',
        });
      }
    } finally {
      await app.close();
      db.close();
      if (!options.keepDb) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  };

  try {
    taskService.createTask({
      title: `Inbound action smoke ${options.taskId}`,
      type: 'custom',
      creator: 'archon',
      description: 'real discord-bound inbound action smoke',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'glm5', member_kind: 'controller', model_preference: 'cost_regression' },
          { role: 'developer', agentId: 'glm47', member_kind: 'citizen', model_preference: 'cost_regression' },
          { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: options.scenario === 'branch'
          ? [
              {
                id: 'triage',
                mode: 'discuss',
                gate: { type: 'command' },
              },
              {
                id: 'fast-path',
                mode: 'execute',
                gate: { type: 'all_subtasks_done' },
              },
              {
                id: 'deep-review',
                mode: 'discuss',
                gate: { type: 'approval', approver: 'reviewer' },
              },
            ]
          : options.scenario === 'complete'
            ? [
                {
                  id: 'deliver',
                  mode: 'execute',
                  gate: { type: 'command' },
                },
              ]
          : [
              {
                id: 'draft',
                mode: 'discuss',
                gate: { type: 'command' },
              },
              {
                id: 'execute',
                mode: 'execute',
                gate: { type: 'all_subtasks_done' },
              },
            ],
        ...(options.scenario === 'branch'
          ? {
              graph: {
                graph_version: 1,
                entry_nodes: ['triage'],
                nodes: [
                  { id: 'triage', kind: 'stage', gate: { type: 'command' } },
                  { id: 'fast-path', kind: 'stage', gate: { type: 'all_subtasks_done' } },
                  { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
                ],
                edges: [
                  { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
                  { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
                ],
              },
            }
          : options.scenario === 'complete'
            ? {
                graph: {
                  graph_version: 1,
                  entry_nodes: ['deliver'],
                  nodes: [
                    { id: 'deliver', kind: 'stage', gate: { type: 'command' } },
                    { id: 'done', kind: 'terminal' },
                  ],
                  edges: [
                    { id: 'deliver__complete__done', from: 'deliver', to: 'done', kind: 'complete' },
                  ],
                },
              }
          : {}),
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    const binding = await waitFor(
      'task context binding',
      () => bindings.getActiveBinding(options.taskId),
      Number(options.timeoutMs),
      Number(options.pollMs),
    );
    threadRef = binding.thread_ref ?? null;
    bindingId = binding.id;
    if (!threadRef) {
      throw new Error('task binding has no thread_ref');
    }

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/conversations/ingest',
      payload: {
        provider: 'discord',
        thread_ref: threadRef,
        direction: 'inbound',
        author_kind: 'agent',
        author_ref: 'glm5',
        display_name: 'glm5',
        body: 'advance from discord thread smoke',
        occurred_at: new Date().toISOString(),
        task_action: {
          kind: 'advance_current',
          actor_ref: 'glm5',
          ...(options.scenario === 'branch' ? { next_stage_id: 'deep-review' } : {}),
        },
      },
    });

    const status = taskService.getTaskStatus(options.taskId);
    if (ingest.statusCode !== 201) {
      throw new Error(`ingest failed: ${ingest.statusCode} ${ingest.body}`);
    }
    const payload = ingest.json();
    process.stdout.write(`${JSON.stringify({
      task_id: options.taskId,
      thread_ref: threadRef,
      current_stage: status.task.current_stage,
      state: status.task.state,
      task_action_result: payload.task_action_result ?? null,
    }, null, 2)}\n`);
    if (options.scenario === 'complete') {
      if (status.task.state !== 'done') {
        throw new Error(`expected state=done, got ${status.task.state}`);
      }
    } else {
      const expectedStage = options.scenario === 'branch' ? 'deep-review' : 'execute';
      if (status.task.current_stage !== expectedStage) {
        throw new Error(`expected current_stage=${expectedStage}, got ${status.task.current_stage}`);
      }
    }
  } finally {
    await cleanup();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
