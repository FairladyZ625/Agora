import type { CraftsmanExecutionTailResponseDto } from '@agora-ts/contracts';

export interface CraftsmanTailPortExecution {
  executionId: string;
  adapter: string;
  sessionId: string | null;
  workdir: string | null;
  status: string;
}

export interface CraftsmanExecutionTailPort {
  tail(execution: CraftsmanTailPortExecution, lines: number): CraftsmanExecutionTailResponseDto | null;
}
