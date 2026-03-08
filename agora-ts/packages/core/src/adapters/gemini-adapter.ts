import type { CraftsmanDispatchRequest } from '../craftsman-adapter.js';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

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

  createInteractiveStartSpec() {
    return {
      command: 'gemini',
      args: ['--approval-mode', 'yolo'],
    };
  }

  createInteractiveResumeSpec(sessionReference: string | null): InteractiveResumeCommand {
    return {
      recoveryMode: sessionReference ? 'resume_exact' : 'resume_latest',
      spec: {
        command: 'gemini',
        args: ['--resume', sessionReference ?? 'latest', '--approval-mode', 'yolo'],
      },
    };
  }
}
