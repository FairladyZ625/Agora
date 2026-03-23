import type { CommandContext } from "./types";

export type TaskCreateWizardSession = {
  kind: "task";
  step: "title" | "type";
  senderId: string;
  title?: string;
  updatedAt: number;
};

export type ProjectCreateWizardSession = {
  kind: "project";
  step: "name" | "summary";
  senderId: string;
  name?: string;
  updatedAt: number;
};

export type CreateWizardSession = TaskCreateWizardSession | ProjectCreateWizardSession;

export class CreateWizardStore {
  private readonly sessions = new Map<string, CreateWizardSession>();

  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  get(key: string) {
    this.cleanupExpired();
    return this.sessions.get(key) ?? null;
  }

  set(key: string, session: Omit<TaskCreateWizardSession, "updatedAt">): TaskCreateWizardSession;
  set(key: string, session: Omit<ProjectCreateWizardSession, "updatedAt">): ProjectCreateWizardSession;
  set(key: string, session: Omit<CreateWizardSession, "updatedAt">) {
    const next = {
      ...session,
      updatedAt: this.now(),
    } as CreateWizardSession;
    this.sessions.set(key, next);
    return next;
  }

  clear(key: string) {
    this.sessions.delete(key);
  }

  clearAll() {
    this.sessions.clear();
  }

  private cleanupExpired() {
    const now = this.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.ttlMs) {
        this.sessions.delete(key);
      }
    }
  }
}

export const createWizardStore = new CreateWizardStore();

export function resetCreateWizardStore() {
  createWizardStore.clearAll();
}

export function resolveCreateWizardSessionKey(commandName: "task" | "project", ctx: CommandContext) {
  const sender = ctx.senderId || ctx.from || "unknown";
  const provider = ctx.provider || ctx.channelId || "unknown";
  const scope = ctx.threadId || ctx.conversationId || ctx.channelId || "global";
  return `${commandName}:${provider}:${scope}:${sender}`;
}
