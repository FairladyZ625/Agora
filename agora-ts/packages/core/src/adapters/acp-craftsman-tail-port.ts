import type { CraftsmanExecutionTailPort, CraftsmanTailPortExecution } from '../craftsman-tail-port.js';
import type { AcpRuntimePort } from '../acp-runtime-port.js';
import { parseAcpSessionId } from './acp-session-ref.js';

const ACP_AGENTS = new Set(['codex', 'claude', 'gemini']);

export class AcpCraftsmanTailPort implements CraftsmanExecutionTailPort {
  constructor(private readonly runtime: AcpRuntimePort) {}

  tail(execution: CraftsmanTailPortExecution, lines: number) {
    if (!ACP_AGENTS.has(execution.adapter)) {
      return null;
    }
    const sessionName = parseAcpSessionId(execution.sessionId);
    if (!sessionName) {
      return null;
    }
    return this.runtime.tailExecution({
      agent: execution.adapter as 'codex' | 'claude' | 'gemini',
      cwd: execution.workdir ?? process.cwd(),
      sessionName,
    }, lines);
  }
}
