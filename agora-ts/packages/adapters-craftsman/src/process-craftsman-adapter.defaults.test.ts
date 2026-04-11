import { describe, expect, it, vi } from 'vitest';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanCommandSpec } from './process-craftsman-adapter.js';

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn,
}));

class DefaultProcessCraftsmanAdapter extends ProcessCraftsmanAdapter {
  constructor() {
    super('default-craftsman');
  }

  createInteractiveStartSpec(): ProcessCraftsmanCommandSpec {
    return {
      command: 'default-craftsman',
      args: ['interactive', 'start'],
    };
  }

  createInteractiveResumeSpec(sessionReference: string | null): InteractiveResumeCommand {
    return {
      recoveryMode: 'resume_latest',
      spec: {
        command: 'default-craftsman',
        args: ['interactive', 'resume', sessionReference ?? 'latest'],
      },
    };
  }

  protected buildCommand(): ProcessCraftsmanCommandSpec {
    return {
      command: 'default-craftsman',
      args: ['run', '--default'],
    };
  }
}

describe('ProcessCraftsmanAdapter defaults', () => {
  it('uses the default child-process transport when no spawn override is provided', () => {
    const unref = vi.fn();
    spawn.mockReturnValue({
      pid: 2468,
      unref,
    });

    const adapter = new DefaultProcessCraftsmanAdapter();
    const result = adapter.dispatchTask({
      execution_id: 'exec-default-process',
      task_id: 'OC-default',
      stage_id: 'implement',
      subtask_id: 'sub-default',
      adapter: 'default-craftsman',
      mode: 'one_shot',
      prompt: 'Run the default process adapter',
      workdir: '/tmp/default-process-craftsman',
      brief_path: null,
    });

    expect(spawn).toHaveBeenCalledWith(
      'default-craftsman',
      ['run', '--default'],
      expect.objectContaining({
        cwd: '/tmp/default-process-craftsman',
        detached: true,
        stdio: 'ignore',
        env: process.env,
      }),
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'pid:2468',
      payload: {
        command: 'default-craftsman',
        args: ['run', '--default'],
      },
    });
  });
});
