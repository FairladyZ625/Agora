import type { IMMessagingPort, NotificationPayload } from '@agora-ts/core';
import { DiscordHttpClient } from './discord-http-client.js';

export interface DiscordIMMessagingAdapterOptions {
  botToken: string;
}

export class DiscordIMMessagingAdapter implements IMMessagingPort {
  private readonly client: DiscordHttpClient;

  constructor(options: DiscordIMMessagingAdapterOptions) {
    this.client = new DiscordHttpClient({ botToken: options.botToken });
  }

  async sendNotification(targetRef: string, payload: NotificationPayload): Promise<void> {
    const content = formatNotification(payload);
    await this.client.sendMessage(targetRef, content);
  }
}

function formatNotification(payload: NotificationPayload): string {
  const { task_id, event_type, data } = payload;
  if (event_type === 'craftsman_completed') {
    const output = (data as Record<string, unknown>)?.display_output ?? (data as Record<string, unknown>)?.output;
    const summary = typeof output === 'string'
      ? summarizeCraftsmanOutputForHuman(output, 'completed')
      : 'completed';
    return `Task **${task_id}** — craftsman finished: ${summary}`;
  }
  return `Task **${task_id}** — ${event_type}`;
}

const TRANSCRIPT_PREFIXES = ['[client]', '[tool]', '[done]'];
const TRANSCRIPT_REJECTIONS = [
  'User refused permission to run tool',
  "The user doesn't want to proceed with this tool use.",
  'STOP what you are doing and wait for the user to tell you how to proceed.',
];

function summarizeCraftsmanOutputForHuman(output: string | null | undefined, fallback = 'completed') {
  const trimmed = output?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!looksLikeCraftsmanTranscript(trimmed)) {
    return trimmed;
  }

  const meaningfulLines = Array.from(new Set(
    trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => isMeaningfulTranscriptLine(line)),
  ));
  const rejection = TRANSCRIPT_REJECTIONS.find((line) => trimmed.includes(line)) ?? null;
  const summaryParts = meaningfulLines.slice(-2);
  if (rejection && !summaryParts.includes(rejection)) {
    summaryParts.push(rejection);
  }
  if (summaryParts.length === 0) {
    return fallback;
  }
  return summaryParts.join(' ').trim();
}

function looksLikeCraftsmanTranscript(output: string) {
  return output.split('\n').some((line) => {
    const trimmed = line.trim();
    return TRANSCRIPT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
      || trimmed.includes('session/request_permission')
      || trimmed.includes('→')
      || trimmed.startsWith('input:')
      || trimmed.startsWith('files:');
  });
}

function isMeaningfulTranscriptLine(line: string) {
  if (!line) {
    return false;
  }
  if (TRANSCRIPT_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return false;
  }
  if (
    line.startsWith('input:')
    || line.startsWith('kind:')
    || line.startsWith('files:')
    || line.startsWith('output:')
    || line.startsWith('```')
    || line.startsWith('<')
    || line.startsWith('...')
    || /^\d+→/.test(line)
  ) {
    return false;
  }
  return true;
}
