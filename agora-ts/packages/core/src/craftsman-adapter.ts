import type {
  CraftsmanCallbackRequestDto,
  CraftsmanExecutionPayloadDto,
  CraftsmanExecutionStatusDto,
  CraftsmanModeDto,
} from '@agora-ts/contracts';

export interface CraftsmanDispatchRequest {
  execution_id: string;
  task_id: string;
  stage_id: string;
  subtask_id: string;
  adapter: string;
  mode: CraftsmanModeDto;
  workdir: string | null;
  prompt: string | null;
  brief_path: string | null;
}

export interface CraftsmanDispatchResult {
  status: Exclude<CraftsmanExecutionStatusDto, 'queued' | 'succeeded' | 'cancelled'>;
  session_id: string | null;
  started_at: string | null;
  payload?: CraftsmanExecutionPayloadDto | null;
}

export interface CraftsmanAdapter {
  name: string;
  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult;
  attachSession?(sessionId: string): void;
  resumeSession?(sessionId: string): void;
  normalizeCallback?(payload: unknown): CraftsmanCallbackRequestDto;
}

export class StubCraftsmanAdapter implements CraftsmanAdapter {
  constructor(
    public readonly name: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    return {
      status: 'running',
      session_id: `${request.adapter}:${request.execution_id}`,
      started_at: this.now(),
      payload: null,
    };
  }
}

export class ShellCraftsmanAdapter extends StubCraftsmanAdapter {
  constructor(now?: () => string) {
    super('shell', now);
  }
}
