import type { CraftsmanInputKeyDto } from '@agora-ts/contracts';
import type { AcpRuntimePort } from '../acp-runtime-port.js';
import type { CraftsmanInputPort, CraftsmanInputPortExecution } from '../craftsman-input-port.js';
import { parseAcpSessionId } from '../acp-session-ref.js';

const ACP_AGENTS = new Set(['codex', 'claude', 'gemini']);

export class AcpCraftsmanInputPort implements CraftsmanInputPort {
  constructor(private readonly runtime: AcpRuntimePort) {}

  sendText(execution: CraftsmanInputPortExecution, text: string) {
    const session = this.resolveSession(execution);
    this.runtime.sendText({
      agent: session.agent,
      cwd: session.cwd,
      sessionName: session.sessionName,
      prompt: text,
    });
  }

  sendKeys(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]) {
    const session = this.resolveSession(execution);
    this.runtime.sendKeys(session, keys);
  }

  submitChoice(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]) {
    const session = this.resolveSession(execution);
    this.runtime.submitChoice(session, keys);
  }

  private resolveSession(execution: CraftsmanInputPortExecution) {
    if (!ACP_AGENTS.has(execution.adapter)) {
      throw new Error(`acp craftsman input does not support adapter: ${execution.adapter}`);
    }
    const sessionName = parseAcpSessionId(execution.sessionId);
    if (!sessionName) {
      throw new Error(`acp craftsman input requires an acpx session id, received: ${execution.sessionId}`);
    }
    return {
      agent: execution.adapter as 'codex' | 'claude' | 'gemini',
      cwd: execution.workdir ?? process.cwd(),
      sessionName,
    };
  }
}
