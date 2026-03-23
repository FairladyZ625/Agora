import type { CommandContext, OpenClawPluginApi } from "./types";

export type PluginTraceEvent = {
  event:
    | "dispatch"
    | "wizard_start"
    | "wizard_prompt"
    | "wizard_invalid"
    | "wizard_complete"
    | "wizard_cancel";
  command: "task" | "project";
  subcommand?: string;
  tokens?: string[];
  wizardSessionKey?: string;
  wizardState?: string;
  note?: string;
};

export interface PluginTrace {
  readonly enabled: boolean;
  slash(ctx: CommandContext, event: PluginTraceEvent): void;
}

export const noopPluginTrace: PluginTrace = {
  enabled: false,
  slash() {},
};

export function createPluginTrace(api: OpenClawPluginApi): PluginTrace {
  const enabled = resolveTraceEnabled(api.pluginConfig);
  if (!enabled) {
    return noopPluginTrace;
  }
  return {
    enabled: true,
    slash(ctx, event) {
      api.logger.info(
        `[agora-plugin-trace] ${JSON.stringify({
          event: event.event,
          command: event.command,
          subcommand: event.subcommand ?? null,
          tokens: event.tokens ?? [],
          wizard_session_key: event.wizardSessionKey ?? null,
          wizard_state: event.wizardState ?? null,
          note: event.note ?? null,
          args: ctx.args ?? null,
          command_body: ctx.commandBody ?? null,
          sender_id: ctx.senderId ?? null,
          from: ctx.from ?? null,
          provider: ctx.provider ?? null,
          channel_id: ctx.channelId ?? null,
          conversation_id: ctx.conversationId ?? null,
          thread_id: ctx.threadId ?? null,
        })}`,
      );
    },
  };
}

function resolveTraceEnabled(pluginConfig: Record<string, unknown> | undefined): boolean {
  const configValue = pluginConfig?.traceNativeSlash;
  if (typeof configValue === "boolean") {
    return configValue;
  }
  if (typeof configValue === "string") {
    return configValue === "1" || configValue.toLowerCase() === "true";
  }
  const envValue = process.env.AGORA_PLUGIN_TRACE_NATIVE_SLASH;
  return envValue === "1" || envValue?.toLowerCase() === "true";
}
