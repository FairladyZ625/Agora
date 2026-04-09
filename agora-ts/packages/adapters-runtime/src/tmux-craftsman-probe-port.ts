import type { CraftsmanCallbackRequestDto } from '@agora-ts/contracts';
import type { CraftsmanExecutionProbePort, CraftsmanProbePortExecution, InteractiveRuntimePort } from '@agora-ts/core';

const TMUX_ADAPTERS = new Set(['codex', 'claude', 'gemini']);
const SHELL_COMMANDS = new Set(['bash', 'zsh', 'sh', 'fish']);
const EXIT_MARKER_PREFIX = '__AGORA_EXIT__';

export class TmuxCraftsmanProbePort implements CraftsmanExecutionProbePort {
  constructor(private readonly runtime: Pick<InteractiveRuntimePort, 'doctor' | 'tail'>) {}

  probe(execution: CraftsmanProbePortExecution): CraftsmanCallbackRequestDto | null {
    if (!TMUX_ADAPTERS.has(execution.adapter)) {
      return null;
    }
    if (execution.sessionId && !execution.sessionId.startsWith('tmux:')) {
      return null;
    }
    const pane = this.runtime.doctor().panes.find((item) => item.agent === execution.adapter);
    if (!pane || !pane.pane || !pane.ready) {
      return {
        execution_id: execution.executionId,
        status: 'failed',
        session_id: execution.sessionId,
        payload: {
          output: {
            summary: null,
            text: null,
            stderr: `tmux pane unavailable for adapter ${execution.adapter}`,
            artifacts: [],
            structured: null,
          },
        },
        error: `tmux pane unavailable for adapter ${execution.adapter}`,
        finished_at: new Date().toISOString(),
      };
    }

    const tail = this.runtime.tail(execution.adapter, 200);
    const exitCode = extractExitCode(execution.executionId, tail);
    if (exitCode !== null) {
      const outputText = stripExitMarkers(tail).trim();
      return {
        execution_id: execution.executionId,
        status: exitCode === 0 ? 'succeeded' : 'failed',
        session_id: execution.sessionId,
        payload: {
          output: {
            summary: exitCode === 0 ? summarizeOutput(outputText, `${execution.adapter} completed`) : null,
            text: outputText || null,
            stderr: exitCode === 0 ? null : (outputText || `${execution.adapter} failed`),
            artifacts: [],
            structured: null,
          },
        },
        error: exitCode === 0 ? null : (outputText || `${execution.adapter} failed with exit code ${exitCode}`),
        finished_at: new Date().toISOString(),
      };
    }

    if (['needs_input', 'awaiting_choice'].includes(execution.status) && pane.command && !SHELL_COMMANDS.has(pane.command)) {
      return {
        execution_id: execution.executionId,
        status: 'running',
        session_id: execution.sessionId,
        payload: {
          output: {
            summary: `${execution.adapter} resumed after operator input`,
            text: null,
            stderr: null,
            artifacts: [],
            structured: null,
          },
        },
        error: null,
        finished_at: null,
      };
    }

    return null;
  }
}

function extractExitCode(executionId: string, text: string) {
  const matcher = new RegExp(`${EXIT_MARKER_PREFIX}:${escapeRegex(executionId)}:(\\d+)`, 'g');
  let match: RegExpExecArray | null = null;
  let lastCode: number | null = null;
  while ((match = matcher.exec(text)) !== null) {
    lastCode = Number(match[1]);
  }
  return Number.isFinite(lastCode) ? lastCode : null;
}

function stripExitMarkers(text: string) {
  return text.replace(new RegExp(`${EXIT_MARKER_PREFIX}:[^\\n]+`, 'g'), '').trim();
}

function summarizeOutput(text: string, fallback: string) {
  const line = text.split('\n').map((entry) => entry.trim()).find(Boolean);
  return line ?? fallback;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
