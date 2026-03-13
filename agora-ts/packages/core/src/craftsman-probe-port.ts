import type { CraftsmanCallbackRequestDto } from '@agora-ts/contracts';

export interface CraftsmanProbePortExecution {
  executionId: string;
  adapter: string;
  sessionId: string | null;
  status: string;
}

export interface CraftsmanExecutionProbePort {
  probe(execution: CraftsmanProbePortExecution): CraftsmanCallbackRequestDto | null;
}
