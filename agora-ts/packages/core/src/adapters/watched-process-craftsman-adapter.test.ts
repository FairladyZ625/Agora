import { describe, expect, it, vi } from 'vitest';
import { CodexCraftsmanAdapter } from './codex-adapter.js';
import { WatchedProcessCraftsmanAdapter } from './watched-process-craftsman-adapter.js';

function createSpawnResult(pid = 5678) {
  return {
    pid,
    unref: vi.fn(),
  };
}

describe('watched process craftsman adapter', () => {
  it('spawns the callback runner with command spec and callback config', () => {
    const spawn = vi.fn(() => createSpawnResult());
    const inner = new CodexCraftsmanAdapter({ spawn: vi.fn() });
    const adapter = new WatchedProcessCraftsmanAdapter(inner, {
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
      apiToken: 'secret-token',
      spawn,
      resolveRunner: () => ({
        command: 'node',
        args: ['/tmp/process-callback-runner.js'],
      }),
    });

    const result = adapter.dispatchTask({
      execution_id: 'exec-watch-1',
      task_id: 'OC-1100',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
      brief_path: '/tmp/brief.md',
    });

    expect(spawn).toHaveBeenCalledWith(
      'node',
      [
        '/tmp/process-callback-runner.js',
        expect.stringContaining('"executionId":"exec-watch-1"'),
      ],
      expect.objectContaining({
        cwd: '/tmp/codex',
        detached: true,
        stdio: 'ignore',
      }),
    );
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'watcher:5678',
    });
  });
});
