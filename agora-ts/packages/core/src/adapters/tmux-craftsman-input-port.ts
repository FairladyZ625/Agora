import type { CraftsmanInputKeyDto } from '@agora-ts/contracts';
import type { CraftsmanInputPort, CraftsmanInputPortExecution } from '../craftsman-input-port.js';
import type { TmuxRuntimeService } from '../tmux-runtime-service.js';

const TMUX_ADAPTERS = new Set(['codex', 'claude', 'gemini']);

export class TmuxCraftsmanInputPort implements CraftsmanInputPort {
  constructor(private readonly runtime: Pick<TmuxRuntimeService, 'sendText' | 'sendKeys' | 'submitChoice'>) {}

  sendText(execution: CraftsmanInputPortExecution, text: string, submit = true) {
    this.runtime.sendText(this.resolveAgent(execution), text, submit);
  }

  sendKeys(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]) {
    this.runtime.sendKeys(this.resolveAgent(execution), keys);
  }

  submitChoice(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]) {
    this.runtime.submitChoice(this.resolveAgent(execution), keys);
  }

  private resolveAgent(execution: CraftsmanInputPortExecution) {
    if (!TMUX_ADAPTERS.has(execution.adapter)) {
      throw new Error(`tmux craftsman input does not support adapter: ${execution.adapter}`);
    }
    if (execution.sessionId && !execution.sessionId.startsWith('tmux:')) {
      throw new Error(`tmux craftsman input requires a tmux session id, received: ${execution.sessionId}`);
    }
    return execution.adapter;
  }
}
