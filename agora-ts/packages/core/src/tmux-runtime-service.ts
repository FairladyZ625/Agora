import type { CraftsmanDispatchRequest, CraftsmanDispatchResult } from './craftsman-adapter.js';
import type { GeminiSessionDiscovery, GeminiSessionIdentity } from './adapters/gemini-session-discovery.js';
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
  identitySourceRank?: number;
  identityPath?: string | null;
  sessionObservedAt?: string | null;
  identityConflictCount?: number;
  lastRejectedIdentitySource?: TmuxIdentitySource | null;
  lastRejectedSessionReference?: string | null;
  lastRejectedObservedAt?: string | null;
  lastRecoveryMode: TmuxRecoveryMode | null;
  transportSessionId: string | null;
}

export interface TmuxRuntimeIdentityUpdate {
  sessionReference?: string | null;
  identitySource: TmuxIdentitySource;
  identityPath?: string | null;
  sessionObservedAt?: string | null;
  workspaceRoot?: string | null;
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
  geminiSessionDiscovery?: Pick<GeminiSessionDiscovery, 'resolveIdentity'>;
}

type IdentitySnapshot = Pick<TmuxDoctorPane, 'sessionReference' | 'identitySource' | 'identityPath' | 'sessionObservedAt'>;
type IdentityMergeResult = {
  next: IdentitySnapshot;
  rejected:
    | {
        source: TmuxIdentitySource;
        sessionReference: string | null;
        observedAt: string | null;
      }
    | null;
};

export class TmuxRuntimeService {
  private readonly registry: TmuxPaneRegistry;
  private readonly adapters: Record<string, ProcessCraftsmanAdapter>;
  private readonly geminiSessionDiscovery: Pick<GeminiSessionDiscovery, 'resolveIdentity'> | undefined;

  constructor(options: TmuxRuntimeServiceOptions) {
    this.registry = new TmuxPaneRegistry(options);
    this.adapters = options.adapters;
    this.geminiSessionDiscovery = options.geminiSessionDiscovery;
  }

  up() {
    this.registry.ensureSession();
    return {
      session: this.registry.getSessionName(),
      panes: this.registry.listPanes(),
    };
  }

  status() {
    this.refreshKnownGeminiIdentity();
    return this.up();
  }

  send(agent: string, command: string) {
    const target = this.registry.getPaneTarget(agent);
    this.registry.sendKeys(target, command);
  }

  recordIdentity(agent: string, identity: TmuxRuntimeIdentityUpdate) {
    this.registry.ensureSession();
    const currentState = this.registry.getPaneState(agent);
    const identityMerge = choosePreferredIdentity(
      toIdentitySnapshot(currentState),
      {
        sessionReference: identity.sessionReference ?? null,
        identitySource: identity.identitySource,
        identityPath: identity.identityPath ?? null,
        sessionObservedAt: identity.sessionObservedAt ?? null,
      },
    );
    return this.registry.updatePaneState(agent, {
      sessionReference: identityMerge.next.sessionReference,
      identitySource: identityMerge.next.identitySource,
      identitySourceRank: identitySourcePriority(identityMerge.next.identitySource),
      identityPath: identityMerge.next.identityPath ?? null,
      sessionObservedAt: identityMerge.next.sessionObservedAt ?? null,
      identityConflictCount: (currentState.identityConflictCount ?? 0) + (identityMerge.rejected ? 1 : 0),
      lastRejectedIdentitySource: identityMerge.rejected?.source ?? currentState.lastRejectedIdentitySource ?? null,
      lastRejectedSessionReference: identityMerge.rejected?.sessionReference ?? currentState.lastRejectedSessionReference ?? null,
      lastRejectedObservedAt: identityMerge.rejected?.observedAt ?? currentState.lastRejectedObservedAt ?? null,
      workspaceRoot: identity.workspaceRoot ?? currentState.workspaceRoot ?? null,
    });
  }

  start(agent: string, workspaceRoot?: string | null): TmuxStartResult {
    const adapter = this.requireAdapter(agent);
    const target = this.registry.getPaneTarget(agent);
    this.persistWorkspaceRoot(agent, workspaceRoot ?? null);
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

  resume(agent: string, sessionReference?: string | null, workspaceRoot?: string | null): TmuxResumeResult {
    const adapter = this.requireAdapter(agent);
    const target = this.registry.getPaneTarget(agent);
    const currentState = this.registry.getPaneState(agent);
    const nextWorkspaceRoot = workspaceRoot ?? currentState.workspaceRoot ?? null;
    this.persistWorkspaceRoot(agent, nextWorkspaceRoot);
    const discovered = agent === 'gemini' && !sessionReference ? this.resolveGeminiIdentity(nextWorkspaceRoot) : null;
    const resolvedIdentity = sessionReference
      ? ({
          sessionReference,
          identitySource: currentState.sessionReference === sessionReference ? currentState.identitySource : 'manual',
          identityPath: currentState.sessionReference === sessionReference ? currentState.identityPath ?? null : null,
          sessionObservedAt: currentState.sessionReference === sessionReference ? currentState.sessionObservedAt ?? null : null,
        } satisfies IdentitySnapshot)
      : choosePreferredIdentity(toIdentitySnapshot(currentState), discovered).next;
    const nextReference = resolvedIdentity.sessionReference ?? null;
    const resume = adapter.createInteractiveResumeSpec(nextReference);
    const command = renderShellCommand(resume.spec.command, resume.spec.args);
    this.registry.sendKeys(target, command);
    this.registry.updatePaneState(agent, {
      sessionReference: nextReference,
      identitySource: resolvedIdentity.identitySource,
      identityPath: resolvedIdentity.identityPath ?? null,
      sessionObservedAt: resolvedIdentity.sessionObservedAt ?? null,
      lastRecoveryMode: resume.recoveryMode,
    });
    return {
      pane: target,
      command,
      recoveryMode: resume.recoveryMode,
    };
  }

  task(agent: string, request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    this.persistWorkspaceRoot(agent, request.workdir ?? null);
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

  private refreshKnownGeminiIdentity() {
    const currentState = this.registry.getPaneState('gemini');
    const discovered = this.resolveGeminiIdentity(currentState.workspaceRoot ?? null);
    if (!discovered) {
      return;
    }
    const nextIdentity = choosePreferredIdentity(toIdentitySnapshot(currentState), discovered);
    this.registry.updatePaneState('gemini', {
      sessionReference: nextIdentity.next.sessionReference,
      identitySource: nextIdentity.next.identitySource,
      identitySourceRank: identitySourcePriority(nextIdentity.next.identitySource),
      identityPath: nextIdentity.next.identityPath ?? null,
      sessionObservedAt: nextIdentity.next.sessionObservedAt ?? null,
      identityConflictCount: (currentState.identityConflictCount ?? 0) + (nextIdentity.rejected ? 1 : 0),
      lastRejectedIdentitySource: nextIdentity.rejected?.source ?? currentState.lastRejectedIdentitySource ?? null,
      lastRejectedSessionReference: nextIdentity.rejected?.sessionReference ?? currentState.lastRejectedSessionReference ?? null,
      lastRejectedObservedAt: nextIdentity.rejected?.observedAt ?? currentState.lastRejectedObservedAt ?? null,
    });
  }

  private resolveGeminiIdentity(workspaceRoot: string | null): GeminiSessionIdentity | null {
    if (!workspaceRoot || !this.geminiSessionDiscovery) {
      return null;
    }
    return this.geminiSessionDiscovery.resolveIdentity({ workspaceRoot });
  }

  private persistWorkspaceRoot(agent: string, workspaceRoot: string | null) {
    if (!workspaceRoot) {
      return;
    }
    this.registry.updatePaneState(agent, {
      workspaceRoot,
    });
  }
}

function renderShellCommand(command: string, args: string[]) {
  return [command, ...args.map(quoteShellArg)].join(' ');
}

function quoteShellArg(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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
    identitySourceRank: pane?.identitySourceRank ?? 0,
    identityPath: pane?.identityPath ?? null,
    sessionObservedAt: pane?.sessionObservedAt ?? null,
    identityConflictCount: pane?.identityConflictCount ?? 0,
    lastRejectedIdentitySource: pane?.lastRejectedIdentitySource ?? null,
    lastRejectedSessionReference: pane?.lastRejectedSessionReference ?? null,
    lastRejectedObservedAt: pane?.lastRejectedObservedAt ?? null,
    lastRecoveryMode: pane?.lastRecoveryMode ?? null,
    transportSessionId: pane?.transportSessionId ?? null,
  };
}

function toIdentitySnapshot(input: IdentitySnapshot): IdentitySnapshot {
  return {
    sessionReference: input.sessionReference ?? null,
    identitySource: input.identitySource,
    identityPath: input.identityPath ?? null,
    sessionObservedAt: input.sessionObservedAt ?? null,
  };
}

function choosePreferredIdentity(
  current: IdentitySnapshot,
  candidate: GeminiSessionIdentity | IdentitySnapshot | null,
): IdentityMergeResult {
  if (!candidate || !candidate.sessionReference) {
    return { next: current, rejected: null };
  }
  if (!current.sessionReference) {
    return { next: toIdentitySnapshot(candidate), rejected: null };
  }
  const currentPriority = identitySourcePriority(current.identitySource);
  const candidatePriority = identitySourcePriority(candidate.identitySource);
  if (candidatePriority > currentPriority) {
    return { next: toIdentitySnapshot(candidate), rejected: null };
  }
  if (candidatePriority < currentPriority) {
    return {
      next: current,
      rejected: {
        source: candidate.identitySource,
        sessionReference: candidate.sessionReference ?? null,
        observedAt: candidate.sessionObservedAt ?? null,
      },
    };
  }
  if (isMoreRecent(candidate.sessionObservedAt ?? null, current.sessionObservedAt ?? null)) {
    return { next: toIdentitySnapshot(candidate), rejected: null };
  }
  return {
    next: current,
    rejected: {
      source: candidate.identitySource,
      sessionReference: candidate.sessionReference ?? null,
      observedAt: candidate.sessionObservedAt ?? null,
    },
  };
}

function identitySourcePriority(source: TmuxIdentitySource) {
  switch (source) {
    case 'manual':
      return 90;
    case 'runtime_gateway':
      return 80;
    case 'hook_event':
      return 70;
    case 'plugin_event':
      return 60;
    case 'session_file':
    case 'chat_file':
      return 40;
    case 'transport_session':
      return 30;
    case 'latest_fallback':
      return 20;
    case 'registry_default':
    default:
      return 0;
  }
}

function isMoreRecent(candidate: string | null, current: string | null) {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }
  return candidate > current;
}
