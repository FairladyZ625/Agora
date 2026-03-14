import type { CraftsmanExecutionTailResponseDto } from '@agora-ts/contracts';
import type { CraftsmanExecutionTailPort, CraftsmanTailPortExecution } from '../craftsman-tail-port.js';
import type { TmuxRuntimeService } from '../tmux-runtime-service.js';

const TMUX_ADAPTERS = new Set(['codex', 'claude', 'gemini']);

export class TmuxCraftsmanTailPort implements CraftsmanExecutionTailPort {
  constructor(private readonly runtime: Pick<TmuxRuntimeService, 'tail'>) {}

  tail(execution: CraftsmanTailPortExecution, lines: number): CraftsmanExecutionTailResponseDto | null {
    if (!TMUX_ADAPTERS.has(execution.adapter)) {
      return null;
    }
    if (execution.sessionId && !execution.sessionId.startsWith('tmux:')) {
      return null;
    }
    return {
      execution_id: execution.executionId,
      available: true,
      output: this.runtime.tail(execution.adapter, lines),
      source: 'tmux',
    };
  }
}
