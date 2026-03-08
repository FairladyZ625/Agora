import type { CraftsmanDispatchRequest } from '../craftsman-adapter.js';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

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

  createInteractiveStartSpec() {
    return {
      command: 'codex',
      args: ['-a', 'never'],
    };
  }

  createInteractiveResumeSpec(sessionReference: string | null): InteractiveResumeCommand {
    if (sessionReference) {
      return {
        recoveryMode: 'resume_exact',
        spec: {
          command: 'codex',
          args: ['resume', '-a', 'never', sessionReference],
        },
      };
    }
    return {
      recoveryMode: 'resume_last',
      spec: {
        command: 'codex',
        args: ['resume', '-a', 'never', '--last'],
      },
    };
  }
}
