import type { CraftsmanDispatchRequest, CraftsmanDispatchResult } from './craftsman-adapter.js';

export type RuntimeContinuityBackend = 'claude_session_id' | 'codex_session_file' | 'gemini_session_id' | 'unknown';
export type RuntimeResumeCapability = 'native_resume' | 'resume_last' | 'none';
export type RuntimeIdentitySource =
  | 'registry_default'
  | 'runtime_gateway'
  | 'plugin_event'
  | 'hook_event'
  | 'session_file'
  | 'chat_file'
  | 'latest_fallback'
  | 'manual'
  | 'transport_session';
export type RuntimeRecoveryMode = 'fresh_start' | 'resume_exact' | 'resume_latest' | 'resume_last';

export interface InteractiveRuntimePaneState {
  paneId?: string | null;
  continuityBackend: RuntimeContinuityBackend;
  resumeCapability: RuntimeResumeCapability;
  sessionReference: string | null;
  identitySource: RuntimeIdentitySource;
  identitySourceRank?: number;
  identityPath?: string | null;
  sessionObservedAt?: string | null;
  identityConflictCount?: number;
  lastRejectedIdentitySource?: RuntimeIdentitySource | null;
  lastRejectedSessionReference?: string | null;
  lastRejectedObservedAt?: string | null;
  workspaceRoot?: string | null;
  lastRecoveryMode: RuntimeRecoveryMode | null;
  transportSessionId: string | null;
}

export interface InteractiveRuntimePaneInfo extends InteractiveRuntimePaneState {
  id: string;
  title: string;
  currentCommand: string;
  active: boolean;
}

export interface InteractiveRuntimeDoctorPane {
  agent: string;
  pane: string | null;
  command: string | null;
  active: boolean;
  ready: boolean;
  continuityBackend: RuntimeContinuityBackend;
  resumeCapability: RuntimeResumeCapability;
  sessionReference: string | null;
  identitySource: RuntimeIdentitySource;
  identitySourceRank?: number;
  identityPath?: string | null;
  sessionObservedAt?: string | null;
  identityConflictCount?: number;
  lastRejectedIdentitySource?: RuntimeIdentitySource | null;
  lastRejectedSessionReference?: string | null;
  lastRejectedObservedAt?: string | null;
  lastRecoveryMode: RuntimeRecoveryMode | null;
  transportSessionId: string | null;
}

export interface InteractiveRuntimeStatus {
  session: string;
  panes: InteractiveRuntimePaneInfo[];
}

export interface InteractiveRuntimeDoctor {
  session: string;
  panes: InteractiveRuntimeDoctorPane[];
}

export interface InteractiveRuntimeIdentityUpdate {
  sessionReference?: string | null;
  identitySource: RuntimeIdentitySource;
  identityPath?: string | null;
  sessionObservedAt?: string | null;
  workspaceRoot?: string | null;
}

export interface InteractiveRuntimeStartResult {
  pane: string | null;
  command: string;
  recoveryMode: 'fresh_start';
}

export interface InteractiveRuntimeResumeResult {
  pane: string | null;
  command: string;
  recoveryMode: RuntimeRecoveryMode;
}

export interface InteractiveRuntimePort {
  up(): InteractiveRuntimeStatus;
  status(): InteractiveRuntimeStatus;
  send(agent: string, command: string): void;
  sendText(agent: string, text: string, submit?: boolean): void;
  sendKeys(agent: string, keys: string[]): void;
  submitChoice(agent: string, keys: string[]): void;
  recordIdentity(agent: string, identity: InteractiveRuntimeIdentityUpdate): InteractiveRuntimePaneState;
  start(agent: string, workspaceRoot?: string | null): InteractiveRuntimeStartResult;
  resume(agent: string, sessionReference?: string | null, workspaceRoot?: string | null): InteractiveRuntimeResumeResult;
  task(agent: string, request: CraftsmanDispatchRequest): CraftsmanDispatchResult;
  tail(agent: string, lines?: number): string;
  doctor(): InteractiveRuntimeDoctor;
  down(): void;
}
