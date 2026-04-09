import { describe, expect, it, vi } from 'vitest';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanCommandSpec } from './process-craftsman-adapter.js';

class TestProcessCraftsmanAdapter extends ProcessCraftsmanAdapter {
  constructor(options: ConstructorParameters<typeof ProcessCraftsmanAdapter>[1] = {}) {
    super('test-craftsman', options);
  }

  createInteractiveStartSpec(): ProcessCraftsmanCommandSpec {
    return {
      command: 'test-craftsman',
      args: ['interactive', 'start'],
    };
  }

  createInteractiveResumeSpec(sessionReference: string | null): InteractiveResumeCommand {
    return {
      recoveryMode: 'resume_latest',
      spec: {
        command: 'test-craftsman',
        args: ['interactive', 'resume', sessionReference ?? 'latest'],
      },
    };
  }

  protected buildCommand(): ProcessCraftsmanCommandSpec {
    return {
      command: 'test-craftsman',
      args: ['run', '--fast'],
      env: {
        TEST_FLAG: 'on',
      },
    };
  }
}

describe('process craftsman adapter base', () => {
  it('dispatches detached work with merged env and exposes command specs', () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ pid: 4321, unref }));
    const adapter = new TestProcessCraftsmanAdapter({
      spawn,
      env: {
        BASE_FLAG: 'base',
      },
    });

    expect(adapter.createCommandSpec({} as never)).toEqual({
      command: 'test-craftsman',
      args: ['run', '--fast'],
      env: {
        TEST_FLAG: 'on',
      },
    });
    expect(adapter.createInteractiveStartSpec()).toEqual({
      command: 'test-craftsman',
      args: ['interactive', 'start'],
    });
    expect(adapter.createInteractiveResumeSpec(null)).toEqual({
      recoveryMode: 'resume_latest',
      spec: {
        command: 'test-craftsman',
        args: ['interactive', 'resume', 'latest'],
      },
    });

    const result = adapter.dispatchTask({
      execution_id: 'exec-process-1',
      task_id: 'OC-1',
      stage_id: 'implement',
      subtask_id: 'sub-1',
      adapter: 'test-craftsman',
      mode: 'one_shot',
      prompt: 'Implement the feature',
      workdir: '/tmp/process-craftsman',
      brief_path: null,
    });

    expect(spawn).toHaveBeenCalledWith(
      'test-craftsman',
      ['run', '--fast'],
      expect.objectContaining({
        cwd: '/tmp/process-craftsman',
        detached: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          BASE_FLAG: 'base',
          TEST_FLAG: 'on',
        }),
      }),
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'pid:4321',
      payload: {
        command: 'test-craftsman',
        args: ['run', '--fast'],
      },
    });
  });

  it('rejects blank prompts and failed child startup', () => {
    const adapter = new TestProcessCraftsmanAdapter({
      spawn: vi.fn(() => ({ pid: 0, unref: vi.fn() })),
    });

    expect(() => adapter.dispatchTask({
      execution_id: 'exec-process-2',
      task_id: 'OC-2',
      stage_id: 'implement',
      subtask_id: 'sub-2',
      adapter: 'test-craftsman',
      mode: 'one_shot',
      prompt: '   ',
      workdir: '/tmp/process-craftsman',
      brief_path: null,
    })).toThrow(/requires a prompt/i);

    expect(() => adapter.dispatchTask({
      execution_id: 'exec-process-3',
      task_id: 'OC-3',
      stage_id: 'implement',
      subtask_id: 'sub-3',
      adapter: 'test-craftsman',
      mode: 'one_shot',
      prompt: 'Do the work',
      workdir: '/tmp/process-craftsman',
      brief_path: null,
    })).toThrow(/failed to start process/i);
  });
});
