import type { CraftsmanCallbackRequestDto } from '@agora-ts/contracts';
import type { AcpRuntimePort, CraftsmanExecutionProbePort, CraftsmanProbePortExecution } from '@agora-ts/core';
import { parseAcpSessionId } from '@agora-ts/core';

const ACP_AGENTS = new Set(['codex', 'claude', 'gemini']);

export class AcpCraftsmanProbePort implements CraftsmanExecutionProbePort {
  constructor(private readonly runtime: AcpRuntimePort) {}

  probe(execution: CraftsmanProbePortExecution): CraftsmanCallbackRequestDto | null {
    const session = this.resolveSession(execution);
    if (!session) {
      return null;
    }
    const status = this.runtime.probeExecution(session);
    if ((execution.status === 'needs_input' || execution.status === 'awaiting_choice') && status.lifecycleState === 'alive') {
      return {
        execution_id: execution.executionId,
        status: 'running',
        session_id: execution.sessionId,
        payload: {
          output: {
            summary: `${execution.adapter} resumed after operator input`,
            text: status.summary,
            stderr: null,
            artifacts: [],
            structured: status.rawStatus,
          },
        },
        error: null,
        finished_at: null,
      };
    }
    if (status.lifecycleState === 'dead' || status.lifecycleState === 'no_session') {
      const tail = this.runtime.tailExecution(session, 40);
      const text = tail.output?.trim() || null;
      const terminalStatus = resolveTerminalStatus(status.rawStatus, text);
      const callbackStatus = status.lifecycleState === 'dead' && terminalStatus === 'succeeded'
        ? 'succeeded'
        : 'failed';
      const error = callbackStatus === 'failed'
        ? text ?? status.summary ?? `${execution.adapter} acpx session is unavailable`
        : null;
      return {
        execution_id: execution.executionId,
        status: callbackStatus,
        session_id: execution.sessionId,
        payload: {
          output: {
            summary: text ?? status.summary ?? `${execution.adapter} acpx session is unavailable`,
            text,
            stderr: callbackStatus === 'failed'
              ? text ?? status.summary ?? `${execution.adapter} acpx session is unavailable`
              : null,
            artifacts: [],
            structured: status.rawStatus,
          },
        },
        error,
        finished_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private resolveSession(execution: CraftsmanProbePortExecution) {
    if (!ACP_AGENTS.has(execution.adapter)) {
      return null;
    }
    const sessionName = parseAcpSessionId(execution.sessionId);
    if (!sessionName) {
      return null;
    }
    return {
      agent: execution.adapter as 'codex' | 'claude' | 'gemini',
      cwd: execution.workdir ?? process.cwd(),
      sessionName,
    };
  }
}

function resolveTerminalStatus(rawStatus: Record<string, unknown> | null, text: string | null) {
  const exitCode = typeof rawStatus?.exitCode === 'number' ? rawStatus.exitCode : null;
  const signal = typeof rawStatus?.signal === 'string' ? rawStatus.signal : null;
  if (exitCode === 0 && !signal) {
    return 'succeeded';
  }
  if (typeof exitCode === 'number' && exitCode !== 0) {
    return 'failed';
  }
  if (signal) {
    return 'failed';
  }
  if (looksLikeSuccessfulTranscript(text)) {
    return 'succeeded';
  }
  return 'failed';
}

function looksLikeSuccessfulTranscript(text: string | null) {
  if (!text) {
    return false;
  }
  return text.includes('\tassistant\t') || text.includes('assistant:');
}
