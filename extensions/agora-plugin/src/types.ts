export interface CommandContext {
  args?: string;
  senderId?: string;
  from?: string;
}

export interface CommandResult {
  text: string;
}

export interface PluginLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerCommand(def: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: CommandContext) => Promise<CommandResult>;
  }): void;
}
