import type { CraftsmanDispatchRequest } from '../craftsman-adapter.js';
import { ProcessCraftsmanAdapter, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

export class CodexCraftsmanAdapter extends ProcessCraftsmanAdapter {
  constructor(options: ProcessCraftsmanAdapterOptions = {}) {
    super('codex', options);
  }

  protected buildCommand(request: CraftsmanDispatchRequest) {
    return {
      command: 'codex',
      args: ['exec', request.prompt ?? ''],
    };
  }
}
