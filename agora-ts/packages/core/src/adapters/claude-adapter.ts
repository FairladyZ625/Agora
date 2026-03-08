import type { CraftsmanDispatchRequest } from '../craftsman-adapter.js';
import { ProcessCraftsmanAdapter, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

export class ClaudeCraftsmanAdapter extends ProcessCraftsmanAdapter {
  constructor(options: ProcessCraftsmanAdapterOptions = {}) {
    super('claude', options);
  }

  protected buildCommand(request: CraftsmanDispatchRequest) {
    return {
      command: 'claude',
      args: ['--dangerously-skip-permissions', '-p', request.prompt ?? ''],
    };
  }
}
