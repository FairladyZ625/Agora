import type { CraftsmanExecutionTailResponseDto, CraftsmanInputKeyDto } from '@agora-ts/contracts';

export type AcpRuntimeAgent = 'codex' | 'claude' | 'gemini';
export type AcpRuntimePermissionMode = 'approve_all' | 'approve_reads' | 'deny_all';
export type AcpRuntimeLifecycleState = 'alive' | 'dead' | 'no_session';

export interface AcpRuntimeSessionRef {
  agent: AcpRuntimeAgent;
  cwd: string;
  sessionName: string;
}

export interface AcpRuntimeEnsureSessionRequest extends AcpRuntimeSessionRef {
  model?: string | null;
  timeoutSeconds?: number | null;
  ttlSeconds?: number | null;
  permissionMode?: AcpRuntimePermissionMode;
}

export interface AcpRuntimeEnsureSessionResult {
  sessionName: string;
  created: boolean;
  agentSessionId: string | null;
}

export interface AcpRuntimeStartExecutionRequest extends AcpRuntimeEnsureSessionRequest {
  executionId: string;
  prompt: string;
}

export interface AcpRuntimeStartExecutionResult {
  executionId: string;
  sessionName: string;
  agentSessionId: string | null;
  queued: boolean;
  startedAt: string;
}

export interface AcpRuntimeProbeResult {
  sessionName: string;
  lifecycleState: AcpRuntimeLifecycleState;
  agentSessionId: string | null;
  summary: string | null;
  lastPromptTime: string | null;
  rawStatus: Record<string, unknown> | null;
}

export interface AcpRuntimeSendTextRequest extends AcpRuntimeSessionRef {
  prompt: string;
  model?: string | null;
  timeoutSeconds?: number | null;
  ttlSeconds?: number | null;
  permissionMode?: AcpRuntimePermissionMode;
}

export interface AcpRuntimeStopExecutionRequest extends AcpRuntimeSessionRef {
  timeoutSeconds?: number | null;
  ttlSeconds?: number | null;
}

export interface AcpRuntimePort {
  ensureSession(request: AcpRuntimeEnsureSessionRequest): AcpRuntimeEnsureSessionResult;
  startExecution(request: AcpRuntimeStartExecutionRequest): AcpRuntimeStartExecutionResult;
  probeExecution(request: AcpRuntimeSessionRef): AcpRuntimeProbeResult;
  tailExecution(request: AcpRuntimeSessionRef, lines: number): CraftsmanExecutionTailResponseDto;
  sendText(request: AcpRuntimeSendTextRequest): void;
  sendKeys(request: AcpRuntimeSessionRef, keys: CraftsmanInputKeyDto[]): void;
  submitChoice(request: AcpRuntimeSessionRef, keys: CraftsmanInputKeyDto[]): void;
  stopExecution(request: AcpRuntimeStopExecutionRequest): void;
}
