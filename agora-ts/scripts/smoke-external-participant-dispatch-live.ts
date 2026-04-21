#!/usr/bin/env tsx
import { Command } from 'commander';
import { CcConnectManagementService } from '../packages/core/src/index.js';
import { loadCcConnectProjectTargets } from '../packages/adapters-cc-connect/src/index.js';
import { createServerRuntime } from '../apps/server/src/runtime.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  label: string,
  read: () => T | null | undefined | Promise<T | null | undefined>,
  timeoutMs: number,
  pollMs: number,
) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const value = await read();
    if (value) {
      return value;
    }
    await sleep(pollMs);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const program = new Command();
  program
    .option('--config <path>', 'Agora config path', '/Users/lizeyu/.agora/agora.json')
    .option('--cc-connect-config <path>', 'cc-connect config path', '/Users/lizeyu/.cc-connect/config-immediate.toml')
    .option('--agent-ref <ref>', 'external participant agent ref', 'cc-connect:agora-codex-immediate')
    .option('--project <name>', 'cc-connect project name', 'agora-codex-immediate')
    .option('--task-id <id>', 'task id override')
    .option('--timeout-ms <ms>', 'overall wait timeout', '60000')
    .option('--poll-ms <ms>', 'poll interval', '1500')
    .option('--expect-reply', 'send a nonce prompt and wait for bridge reply relay health', false)
    .option('--reply-timeout-ms <ms>', 'reply relay wait timeout', '120000')
    .option('--keep-thread', 'do not archive the Discord thread after smoke', false)
    .parse(process.argv);

  const options = program.opts<{
    config: string;
    ccConnectConfig: string;
    agentRef: string;
    project: string;
    taskId?: string;
    timeoutMs: string;
    pollMs: string;
    expectReply: boolean;
    replyTimeoutMs: string;
    keepThread: boolean;
  }>();

  process.env.AGORA_CONFIG_PATH = options.config;
  process.env.AGORA_CC_CONNECT_CONFIG_PATHS = options.ccConnectConfig;

  const taskId = options.taskId ?? `OC-H9B-LIVE-${Date.now()}`;
  const agoraProjectId = `h9-entry-cutover-${taskId.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
  const goal = `live external participant dispatch smoke ${taskId}`;
  const timeoutMs = Number(options.timeoutMs);
  const pollMs = Number(options.pollMs);
  const replyTimeoutMs = Number(options.replyTimeoutMs);
  const runtime = createServerRuntime({ configPath: options.config });
  const maybeReady = runtime.ccConnectBridgeRuntimeService as unknown as { whenReady?: () => Promise<void> } | undefined;
  let threadRef: string | null = null;
  let bindingId: string | null = null;

  try {
    await maybeReady?.whenReady?.();

    runtime.projectService.createProject({
      id: agoraProjectId,
      name: `H9 Entry Cutover ${taskId}`,
      metadata: {
        runtime_targets: {
          default_coding: options.agentRef,
          flavors: {
            codex: options.agentRef,
          },
        },
      },
    });

    const task = runtime.taskService.createTask({
      title: `H9B live external dispatch ${taskId}`,
      type: 'custom',
      creator: 'archon',
      description: goal,
      priority: 'normal',
      project_id: agoraProjectId,
      team_override: {
        members: [
          {
            role: 'developer',
            agentId: 'developer',
            member_kind: 'citizen',
            model_preference: 'codex',
          },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'dispatch',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            roster: { include_roles: ['developer'] },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    const actualTaskId = task.id;
    await runtime.taskService.drainBackgroundOperations();
    const taskStatus = runtime.taskService.getTaskStatus(actualTaskId);
    const member = taskStatus?.task.team?.members.find((item) => item.role === 'developer');
    assert(member, 'expected developer team member in task status');
    assert(member.agentId === options.agentRef, `expected project runtime target resolution to pick ${options.agentRef}`);
    assert(member.runtime_target_ref === options.agentRef, 'expected runtime target ref in task status');
    assert(member.runtime_flavor === 'codex', 'expected runtime flavor in task status');
    assert(member.runtime_selection_source === 'project_flavor_default', 'expected runtime selection source in task status');
    assert(
      member.runtime_selection_reason === 'project runtime_targets.flavors.codex',
      'expected runtime selection reason in task status',
    );
    const binding = await waitFor('task context binding', () => runtime.taskContextBindingService.getActiveBinding(actualTaskId), timeoutMs, pollMs);
    bindingId = binding.id;
    threadRef = binding.thread_ref;
    assert(threadRef, 'expected Discord thread ref');

    const participant = await waitFor('external participant binding', () => (
      runtime.taskParticipationService.listParticipants(actualTaskId)
        .find((item) => item.agent_ref === options.agentRef) ?? null
    ), timeoutMs, pollMs);
    const expectedSessionKey = `agora-${binding.im_provider}:${threadRef}:${participant.id}`;

    const runtimeSession = await waitFor('cc-connect runtime session binding', () => (
      (() => {
        const session = runtime.taskParticipationService.getRuntimeSessionByParticipant(participant.id);
        return session?.runtime_provider === 'cc-connect' && session.runtime_session_ref === expectedSessionKey
          ? session
          : null;
      })()
    ), timeoutMs, pollMs);
    assert(runtimeSession.runtime_provider === 'cc-connect', `expected cc-connect runtime session, got ${runtimeSession.runtime_provider}`);

    const target = loadCcConnectProjectTargets()
      .find((candidate) => candidate.projectName === options.project);
    assert(target?.management.enabled && target.management.baseUrl && target.management.token, `cc-connect management target not configured for ${options.project}`);

    const management = new CcConnectManagementService();
    const sessionDetail = await waitFor('cc-connect session history containing role brief', async () => {
      const sessions = await management.listSessions({
        configPath: target.configPath,
        managementBaseUrl: target.management.baseUrl!,
        managementToken: target.management.token!,
        project: target.projectName,
      });
      const session = sessions.find((candidate) => candidate.session_key === runtimeSession.runtime_session_ref);
      if (!session) {
        return null;
      }
      const detail = await management.getSession({
        configPath: target.configPath,
        managementBaseUrl: target.management.baseUrl!,
        managementToken: target.management.token!,
        project: target.projectName,
        sessionId: session.id,
        historyLimit: 20,
      });
      const matched = detail.history.some((message) => (
        message.content.includes(goal)
        && message.content.includes(`角色简报 ${options.agentRef}`)
        && message.content.includes('选择来源: project_flavor_default')
        && message.content.includes('选择原因: project runtime_targets.flavors.codex')
      ));
      return matched ? detail : null;
    }, timeoutMs, pollMs);

    let relayHealth: Record<string, unknown> | null = null;
    let replyConversationEntryId: string | null = null;
    if (options.expectReply) {
      const nonce = `H9D_RELAY_${Date.now()}`;
      await management.sendMessage({
        configPath: target.configPath,
        managementBaseUrl: target.management.baseUrl!,
        managementToken: target.management.token!,
        project: target.projectName,
        sessionKey: runtimeSession.runtime_session_ref,
        message: `Reply with exactly this token and no extra prose: ${nonce}`,
      });
      const relayed = await waitFor('cc-connect reply relay conversation entry', () => {
        const entries = runtime.taskConversationService.listByTask(actualTaskId);
        return entries.find((entry) => (
          entry.direction === 'outbound'
          && entry.author_kind === 'agent'
          && entry.author_ref === options.agentRef
          && entry.body.includes(nonce)
        )) ?? null;
      }, replyTimeoutMs, pollMs);
      replyConversationEntryId = relayed.id;
      relayHealth = readRelayHealth(runtime.liveSessionStore.get(runtimeSession.runtime_session_ref)?.metadata);
      assert(relayHealth?.discord_publish_status === 'succeeded', `expected relay health publish success, got ${JSON.stringify(relayHealth)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      requested_task_id: taskId,
      task_id: actualTaskId,
      project_id: agoraProjectId,
      thread_ref: threadRef,
      external_agent_ref: options.agentRef,
      runtime_target_ref: member.runtime_target_ref,
      runtime_flavor: member.runtime_flavor,
      runtime_selection_source: member.runtime_selection_source,
      runtime_selection_reason: member.runtime_selection_reason,
      runtime_session_ref: runtimeSession.runtime_session_ref,
      cc_connect_session_id: sessionDetail.id,
      cc_connect_history_count: sessionDetail.history_count,
      ...(options.expectReply ? {
        reply_conversation_entry_id: replyConversationEntryId,
        relay_health: relayHealth,
      } : {}),
      cleanup: options.keepThread ? 'kept' : 'archived',
    }, null, 2));
  } finally {
    await runtime.taskService.drainBackgroundOperations();
    if (!options.keepThread && bindingId && threadRef && runtime.imProvisioningPort) {
      await runtime.imProvisioningPort.archiveContext({
        binding_id: bindingId,
        thread_ref: threadRef,
        mode: 'archive',
        reason: 'external participant dispatch live smoke cleanup',
      });
    }
    runtime.dispose();
    runtime.db.close();
  }
}

function readRelayHealth(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const relayHealth = (metadata as Record<string, unknown>).relay_health;
  return relayHealth && typeof relayHealth === 'object' && !Array.isArray(relayHealth)
    ? relayHealth as Record<string, unknown>
    : null;
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
