import type { CraftsmanInputKeyDto } from '@agora-ts/contracts';

export interface CraftsmanInputPortExecution {
  executionId: string;
  adapter: string;
  sessionId: string | null;
  workdir: string | null;
  taskId: string;
  subtaskId: string;
}

export interface CraftsmanInputPort {
  sendText(execution: CraftsmanInputPortExecution, text: string, submit?: boolean): void;
  sendKeys(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]): void;
  submitChoice(execution: CraftsmanInputPortExecution, keys: CraftsmanInputKeyDto[]): void;
}
