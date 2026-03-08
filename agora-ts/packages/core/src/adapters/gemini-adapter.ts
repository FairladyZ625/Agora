import type { CraftsmanDispatchRequest } from '../craftsman-adapter.js';
import { ProcessCraftsmanAdapter, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

export class GeminiCraftsmanAdapter extends ProcessCraftsmanAdapter {
  constructor(options: ProcessCraftsmanAdapterOptions = {}) {
    super('gemini', options);
  }

  protected buildCommand(request: CraftsmanDispatchRequest) {
    return {
      command: 'gemini',
      args: ['-p', request.prompt ?? ''],
    };
  }
}
