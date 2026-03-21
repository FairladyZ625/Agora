#!/usr/bin/env tsx
import process from 'node:process';
import { Command } from 'commander';
import { createCliComposition } from '../apps/cli/src/composition.ts';
import { LiveRegressionActor } from '../packages/testing/src/live-regression.ts';

async function main() {
  const program = new Command();
  program
    .option('--config <path>', 'Agora config path override')
    .option('--task-id <id>', 'task id override', `OC-REG-SMOKE-${Date.now()}`)
    .option('--title <title>', 'task title override')
    .option('--goal <goal>', 'regression goal', 'verify real discord regression smoke script')
    .option('--message <message>', 'operator prompt message', 'AgoraBot regression smoke: continue this command-gated task and report blockers here.')
    .option('--cleanup-mode <mode>', 'delete|archive|unarchive', 'archive')
    .option('--keep-thread', 'skip archive/delete cleanup', false)
    .parse(process.argv);

  const options = program.opts<{
    config?: string;
    taskId: string;
    title?: string;
    goal: string;
    message: string;
    cleanupMode: 'delete' | 'archive' | 'unarchive';
    keepThread: boolean;
  }>();

  if (!process.env.AGORA_DEV_REGRESSION_MODE) {
    process.env.AGORA_DEV_REGRESSION_MODE = 'true';
  }

  const composition = createCliComposition(
    options.config ? { configPath: options.config } : {},
  );

  if (!composition.imProvisioningPort) {
    throw new Error('IM provisioning port is not configured');
  }

  const actor = new LiveRegressionActor({
    taskService: composition.taskService,
    taskContextBindingService: composition.taskContextBindingService,
    taskConversationService: composition.taskConversationService,
    imProvisioningPort: composition.imProvisioningPort,
  });

  let bindingId: string | null = null;
  let threadRef: string | null = null;

  try {
    const result = await actor.run({
      target: {
        createTask: {
          title: options.title ?? `Discord Regression Smoke ${options.taskId}`,
          type: 'coding',
          creator: 'archon',
          description: 'real discord live regression smoke',
          priority: 'normal',
          locale: 'zh-CN',
          control: { mode: 'regression_test' },
          workflow_override: {
            type: 'custom',
            stages: [
              {
                id: 'triage',
                mode: 'discuss',
                gate: { type: 'command' },
              },
              {
                id: 'execute',
                mode: 'execute',
                gate: { type: 'all_subtasks_done' },
              },
            ],
          },
          im_target: {
            provider: 'discord',
            visibility: 'private',
          },
        },
      },
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: options.goal,
      message: options.message,
      participantRefs: ['opus'],
    });

    bindingId = result.bindingId;
    threadRef = result.threadRef;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.currentStage !== 'execute') {
      throw new Error(`expected currentStage=execute, got ${result.currentStage}`);
    }
  } finally {
    await composition.taskService.drainBackgroundOperations();
    if (!options.keepThread && bindingId && threadRef && composition.imProvisioningPort) {
      await composition.imProvisioningPort.archiveContext({
        binding_id: bindingId,
        thread_ref: threadRef,
        mode: options.cleanupMode,
        reason: 'discord regression smoke cleanup',
      });
    }
    composition.db.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
