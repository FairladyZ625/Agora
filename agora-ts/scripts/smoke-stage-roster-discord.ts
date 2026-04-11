#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { DiscordHttpClient, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';
import { loadOpenClawDiscordAccountTokens } from '@agora-ts/adapters-openclaw';
import { loadAgoraConfig } from '@agora-ts/config';
import { TaskContextBindingService, TaskParticipationService } from '@agora-ts/core';
import { createAgoraDatabase, runMigrations, ParticipantBindingRepository, RuntimeSessionBindingRepository, TaskContextBindingRepository } from '@agora-ts/db';
import { createTaskServiceFromDb } from '@agora-ts/testing';

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

async function resolveUserIds(client: DiscordHttpClient, participantTokens: Record<string, string>, refs: string[]) {
  const pairs = await Promise.all(refs.map(async (ref) => {
    const token = participantTokens[ref];
    if (!token) {
      throw new Error(`missing discord token for participant ${ref}`);
    }
    const decodedUserId = decodeDiscordTokenUserId(token);
    if (decodedUserId) {
      return [ref, decodedUserId] as const;
    }
    const user = await new DiscordHttpClient({ botToken: token }).getCurrentUser();
    return [ref, user.id] as const;
  }));
  return new Map<string, string>(pairs);
}

function decodeDiscordTokenUserId(token: string): string | null {
  const [rawPrefix] = token.split('.');
  if (!rawPrefix) {
    return null;
  }
  try {
    const normalized = rawPrefix.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8').trim();
    return /^[0-9]{15,25}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function main() {
  const program = new Command();
  program
    .option('--config <path>', 'Agora config path override')
    .option('--openclaw-config <path>', 'OpenClaw config path override')
    .option('--task-id <id>', 'task id override', `OC-STAGE-ROSTER-SMOKE-${Date.now()}`)
    .option('--cleanup-mode <mode>', 'delete|archive', 'delete')
    .option('--timeout-ms <ms>', 'overall wait timeout', '30000')
    .option('--poll-ms <ms>', 'poll interval', '1500')
    .option('--keep-db', 'keep temporary db', false)
    .parse(process.argv);

  const options = program.opts<{
    config?: string;
    openclawConfig?: string;
    taskId: string;
    cleanupMode: 'delete' | 'archive';
    timeoutMs: string;
    pollMs: string;
    keepDb: boolean;
  }>();

  const config = loadAgoraConfig(options.config ?? process.env.AGORA_CONFIG_PATH ?? '');
  if (config.im.provider !== 'discord' || !config.im.discord?.bot_token || !config.im.discord.default_channel_id) {
    throw new Error('Agora discord IM is not configured with bot_token + default_channel_id');
  }
  const participantTokens = loadOpenClawDiscordAccountTokens(
    options.openclawConfig ? { configPath: options.openclawConfig } : {},
  );
  for (const ref of ['glm5', 'glm47', 'haiku']) {
    if (!participantTokens[ref]) {
      throw new Error(`OpenClaw discord token missing for required participant ${ref}`);
    }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'agora-stage-roster-smoke-'));
  const dbPath = join(tempDir, 'smoke.db');
  const db = createAgoraDatabase({ dbPath });
  const bindingRepository = new TaskContextBindingRepository(db);
  const bindingService = new TaskContextBindingService({ repository: bindingRepository });
  const taskParticipation = new TaskParticipationService({
    participantRepository: new ParticipantBindingRepository(db),
    runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
    taskBindingRepository: bindingRepository,
    participantIdGenerator: (() => {
      let i = 0;
      return () => `pb-smoke-${++i}`;
    })(),
  });
  const primaryAccountId = Object.entries(participantTokens).find(([, token]) => token === config.im.discord?.bot_token)?.[0] ?? null;
  const provisioning = new DiscordIMProvisioningAdapter({
    botToken: config.im.discord.bot_token,
    defaultChannelId: config.im.discord.default_channel_id,
    participantTokens,
    primaryAccountId,
  });
  const botClient = new DiscordHttpClient({ botToken: config.im.discord.bot_token });

  const cleanup = async (threadRef?: string | null, bindingId?: string | null) => {
    try {
      if (threadRef && bindingId) {
        await provisioning.archiveContext({
          binding_id: bindingId,
          thread_ref: threadRef,
          mode: options.cleanupMode,
          reason: 'stage roster smoke cleanup',
        });
      }
    } finally {
      db.close();
      if (!options.keepDb) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  };

  let threadRef: string | null = null;
  let bindingId: string | null = null;

  try {
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db, {
      templatesDir: join(process.cwd(), 'templates'),
      taskIdGenerator: () => options.taskId,
      imProvisioningPort: provisioning,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
      archonUsers: ['admin'],
    });

    taskService.createTask({
      title: `Stage roster smoke ${options.taskId}`,
      type: 'custom',
      creator: 'archon',
      description: 'real discord thread member reconcile smoke',
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
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: { include_roles: ['reviewer'], keep_controller: true },
            gate: { type: 'approval', approver: 'reviewer' },
            reject_target: 'draft',
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    const binding = await waitFor(
      'task context binding',
      () => bindingService.getActiveBinding(options.taskId),
      Number(options.timeoutMs),
      Number(options.pollMs),
    );
    threadRef = binding.thread_ref ?? null;
    bindingId = binding.id;
    if (!threadRef) {
      throw new Error('task binding has no thread_ref');
    }

    const expectedUserIds = await resolveUserIds(botClient, participantTokens, ['glm5', 'glm47', 'haiku']);
    const listMembers = async () => {
      const members = await botClient.listThreadMembers(threadRef!);
      return new Set(members.map((member) => String(
        (member as { user_id?: string; id?: string; user?: { id?: string } }).user_id
          ?? (member as { user_id?: string; id?: string; user?: { id?: string } }).user?.id
          ?? (member as { user_id?: string; id?: string; user?: { id?: string } }).id
          ?? '',
      )));
    };
    const assertMembership = async (label: string, expectedPresent: string[], expectedAbsent: string[]) => {
      const members = await waitFor(
        `${label} membership`,
        async () => {
          const current = await listMembers();
          const okPresent = expectedPresent.every((ref) => current.has(expectedUserIds.get(ref)!));
          const okAbsent = expectedAbsent.every((ref) => !current.has(expectedUserIds.get(ref)!));
          return okPresent && okAbsent ? current : null;
        },
        Number(options.timeoutMs),
        Number(options.pollMs),
      );
      process.stdout.write(`[${label}] members=${Array.from(members).join(',')}\n`);
    };
    const assertParticipantStates = async (
      label: string,
      expectedStates: Partial<Record<'glm5' | 'glm47' | 'haiku', 'joined' | 'left' | 'pending'>>,
    ) => {
      const participants = await waitFor(
        `${label} participant states`,
        async () => {
          const current = new Map(taskParticipation.listParticipants(options.taskId).map((participant) => [
            participant.agent_ref,
            participant.join_status,
          ]));
          const ok = Object.entries(expectedStates).every(([participantRef, expectedState]) => (
            current.get(participantRef) === expectedState
          ));
          return ok ? current : null;
        },
        Number(options.timeoutMs),
        Number(options.pollMs),
      );
      process.stdout.write(
        `[${label}] participant_states=${JSON.stringify(Object.fromEntries(participants.entries()))}\n`,
      );
    };

    process.stdout.write(`task=${options.taskId} thread=${threadRef}\n`);
    await assertMembership('create', ['glm5', 'glm47'], ['haiku']);
    await assertParticipantStates('create', {
      glm5: 'joined',
      glm47: 'joined',
      haiku: 'pending',
    });

    taskService.advanceTask(options.taskId, { callerId: 'admin' });
    await assertMembership('advance', ['glm5', 'haiku'], ['glm47']);
    await assertParticipantStates('advance', {
      glm5: 'joined',
      glm47: 'left',
      haiku: 'joined',
    });

    taskService.rejectTask(options.taskId, {
      rejectorId: 'haiku',
      reason: 'smoke reject back to draft',
    });
    await assertMembership('reject', ['glm5', 'glm47'], ['haiku']);
    await assertParticipantStates('reject', {
      glm5: 'joined',
      glm47: 'joined',
      haiku: 'left',
    });

    process.stdout.write(`smoke=ok db=${dbPath}\n`);
    await cleanup(threadRef, bindingId);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (threadRef && bindingId) {
      await cleanup(threadRef, bindingId);
    } else {
      db.close();
      if (!options.keepDb) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
    process.exit(1);
  }
}

void main();
