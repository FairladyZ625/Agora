#!/usr/bin/env tsx
import process from 'node:process';
import { Command } from 'commander';
import { createCliComposition } from '../apps/cli/src/composition.ts';
import { buildLiveRegressionRecipe, LiveRegressionActor, type LiveRegressionRecipeName } from '@agora-ts/testing';

async function main() {
  const program = new Command();
  program
    .option('--config <path>', 'Agora config path override')
    .option('--task-id <id>', 'task id override', `OC-REG-SMOKE-${Date.now()}`)
    .option('--title <title>', 'task title override')
    .option('--recipe <name>', 'command-gated|approval-gated|quorum-gated', 'command-gated')
    .option('--goal <goal>', 'regression goal override')
    .option('--message <message>', 'operator prompt message override')
    .option('--wait-stage <stage>', 'wait until the task reaches this stage')
    .option('--wait-state <state>', 'wait until the task reaches this state')
    .option('--wait-body-includes <text>', 'wait until the latest conversation contains this text')
    .option('--wait-timeout-ms <ms>', 'overall observation timeout in milliseconds')
    .option('--wait-poll-ms <ms>', 'observation poll interval in milliseconds')
    .option('--cleanup-mode <mode>', 'delete|archive|unarchive', 'archive')
    .option('--keep-thread', 'skip archive/delete cleanup', false)
    .parse(process.argv);

  const options = program.opts<{
    config?: string;
    taskId: string;
    title?: string;
    recipe: LiveRegressionRecipeName;
    goal: string;
    message: string;
    waitStage?: string;
    waitState?: string;
    waitBodyIncludes?: string;
    waitTimeoutMs?: string;
    waitPollMs?: string;
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
  const waitFor = (
    options.waitStage
    || options.waitState
    || options.waitBodyIncludes
    || options.waitTimeoutMs
    || options.waitPollMs
  )
    ? {
        ...(options.waitStage ? { currentStage: options.waitStage } : {}),
        ...(options.waitState ? { state: options.waitState } : {}),
        ...(options.waitBodyIncludes ? { latestConversationBodyIncludes: options.waitBodyIncludes } : {}),
        ...(options.waitTimeoutMs ? { timeoutMs: Number(options.waitTimeoutMs) } : {}),
        ...(options.waitPollMs ? { pollIntervalMs: Number(options.waitPollMs) } : {}),
      }
    : undefined;

  try {
    const recipe = buildLiveRegressionRecipe(options.recipe, {
      taskId: options.taskId,
      ...(options.title ? { title: options.title } : {}),
      ...(options.goal ? { goal: options.goal } : {}),
      ...(options.message ? { message: options.message } : {}),
    });
    const result = await actor.run({
      target: recipe.target,
      actorRef: 'agora-bot',
      displayName: 'AgoraBot',
      goal: recipe.goal,
      message: recipe.message,
      participantRefs: recipe.participantRefs,
      ...(recipe.taskAction ? { taskAction: recipe.taskAction } : {}),
      ...(waitFor ? { waitFor } : {}),
    });

    bindingId = result.bindingId;
    threadRef = result.threadRef;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.currentStage !== recipe.expectCurrentStage) {
      throw new Error(`expected currentStage=${recipe.expectCurrentStage}, got ${result.currentStage}`);
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
