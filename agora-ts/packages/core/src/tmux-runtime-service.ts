import type { CraftsmanDispatchRequest, CraftsmanDispatchResult } from './craftsman-adapter.js';
import type { ProcessCraftsmanAdapter } from './adapters/process-craftsman-adapter.js';
import { TmuxCraftsmanAdapter } from './adapters/tmux-craftsman-adapter.js';
import {
  TmuxPaneRegistry,
  type TmuxPaneInfo,
  type TmuxPaneRegistryOptions,
  type TmuxContinuityBackend,
  type TmuxIdentitySource,
  type TmuxRecoveryMode,
  type TmuxResumeCapability,
} from './adapters/tmux-pane-registry.js';

export interface TmuxDoctorPane {
  agent: string;
  pane: string | null;
  command: string | null;
  active: boolean;
  ready: boolean;
  continuityBackend: TmuxContinuityBackend;
  resumeCapability: TmuxResumeCapability;
  sessionReference: string | null;
  identitySource: TmuxIdentitySource;
  lastRecoveryMode: TmuxRecoveryMode | null;
  transportSessionId: string | null;
}

export interface TmuxStartResult {
  pane: string | null;
  command: string;
  recoveryMode: 'fresh_start';
}

export interface TmuxResumeResult {
  pane: string | null;
  command: string;
  recoveryMode: 'fresh_start' | 'resume_exact' | 'resume_latest' | 'resume_last';
}

export interface TmuxRuntimeServiceOptions extends TmuxPaneRegistryOptions {
  adapters: Record<string, ProcessCraftsmanAdapter>;
}

export class TmuxRuntimeService {
  private readonly registry: TmuxPaneRegistry;
  private readonly adapters: Record<string, ProcessCraftsmanAdapter>;

  constructor(options: TmuxRuntimeServiceOptions) {
    this.registry = new TmuxPaneRegistry(options);
    this.adapters = options.adapters;
  }

  up() {
    this.registry.ensureSession();
    return {
      session: this.registry.getSessionName(),
      panes: this.registry.listPanes(),
    };
  }

  status() {
    return this.up();
  }

  send(agent: string, command: string) {
    const target = this.registry.getPaneTarget(agent);
    this.registry.sendKeys(target, command);
  }

  start(agent: string): TmuxStartResult {
    const adapter = this.requireAdapter(agent);
    const target = this.registry.getPaneTarget(agent);
    const spec = adapter.createInteractiveStartSpec();
    const command = renderShellCommand(spec.command, spec.args);
    this.registry.sendKeys(target, command);
    this.registry.updatePaneState(agent, {
      lastRecoveryMode: 'fresh_start',
    });
    return {
      pane: target,
      command,
      recoveryMode: 'fresh_start',
    };
  }

  resume(agent: string, sessionReference?: string | null): TmuxResumeResult {
    const adapter = this.requireAdapter(agent);
    const target = this.registry.getPaneTarget(agent);
    const currentState = this.registry.getPaneState(agent);
    const nextReference = sessionReference ?? currentState.sessionReference ?? null;
    const resume = adapter.createInteractiveResumeSpec(nextReference);
    const command = renderShellCommand(resume.spec.command, resume.spec.args);
    this.registry.sendKeys(target, command);
    this.registry.updatePaneState(agent, {
      sessionReference: nextReference,
      lastRecoveryMode: resume.recoveryMode,
    });
    return {
      pane: target,
      command,
      recoveryMode: resume.recoveryMode,
    };
  }

  task(agent: string, request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    const inner = this.requireAdapter(agent);
    const adapter = new TmuxCraftsmanAdapter(inner, { registry: this.registry });
    return adapter.dispatchTask(request);
  }

  tail(agent: string, lines = 40) {
    const target = this.registry.getPaneTarget(agent);
    return this.registry.capturePane(target, lines);
  }

  doctor(): { session: string; panes: TmuxDoctorPane[] } {
    const panes = this.registry.listPanes();
    const byTitle = new Map(panes.map((pane) => [pane.title, pane]));
    const titles = ['codex', 'claude', 'gemini'];
    return {
      session: this.registry.getSessionName(),
      panes: titles.map((title) => toDoctorPane(title, byTitle.get(title) ?? null)),
    };
  }

  down() {
    this.registry.killSession();
  }

  private requireAdapter(agent: string) {
    const inner = this.adapters[agent];
    if (!inner) {
      throw new Error(`tmux adapter not configured for agent: ${agent}`);
    }
    return inner;
  }
}

function renderShellCommand(command: string, args: string[]) {
  return [command, ...args.map(quoteShellArg)].join(' ');
}

function quoteShellArg(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function toDoctorPane(agent: string, pane: TmuxPaneInfo | null): TmuxDoctorPane {
  return {
    agent,
    pane: pane?.id ?? null,
    command: pane?.currentCommand ?? null,
    active: pane?.active ?? false,
    ready: pane !== null,
    continuityBackend: pane?.continuityBackend ?? 'unknown',
    resumeCapability: pane?.resumeCapability ?? 'none',
    sessionReference: pane?.sessionReference ?? null,
    identitySource: pane?.identitySource ?? 'registry_default',
    lastRecoveryMode: pane?.lastRecoveryMode ?? null,
    transportSessionId: pane?.transportSessionId ?? null,
  };
}
