import type { CraftsmanDispatchRequest } from '@agora-ts/core';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';

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

  createInteractiveStartSpec() {
    return {
      command: 'claude',
      args: ['--dangerously-skip-permissions', '--model', 'claude-sonnet-4-6'],
    };
  }

  createInteractiveResumeSpec(sessionReference: string | null): InteractiveResumeCommand {
    if (!sessionReference) {
      return {
        recoveryMode: 'fresh_start',
        spec: this.createInteractiveStartSpec(),
      };
    }
    return {
      recoveryMode: 'resume_exact',
      spec: {
        command: 'claude',
        args: ['--resume', sessionReference, '--dangerously-skip-permissions', '--model', 'claude-sonnet-4-6'],
      },
    };
  }
}
