import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn,
}));

import { CodexCraftsmanAdapter } from './codex-adapter.js';
import { WatchedProcessCraftsmanAdapter } from './watched-process-craftsman-adapter.js';
import { existsSync } from 'node:fs';

function createSpawnResult(pid = 5678) {
  return {
    pid,
    unref: vi.fn(),
  };
}

describe('watched process craftsman adapter', () => {
  it('uses the default child-process transport when no spawn override is provided', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    spawn.mockReturnValue(createSpawnResult(1357));
    const inner = new CodexCraftsmanAdapter({ spawn: vi.fn() });
    const adapter = new WatchedProcessCraftsmanAdapter(inner, {
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
    });

    const result = adapter.dispatchTask({
      execution_id: 'exec-watch-default',
      task_id: 'OC-1099',
      stage_id: 'develop',
      subtask_id: 'sub-default',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Use the default watcher transport',
      brief_path: null,
    });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining('process-callback-runner.js'),
        expect.stringContaining('"executionId":"exec-watch-default"'),
      ],
      expect.objectContaining({
        cwd: '/tmp/codex',
        detached: true,
        stdio: 'ignore',
      }),
    );
    expect(result).toMatchObject({
      session_id: 'watcher:1357',
      payload: {
        watcher: true,
        transport: 'process-callback-runner',
      },
    });
  });

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
      mode: 'one_shot',
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
      payload: {
        command: 'codex',
        args: ['exec', 'Implement the feature'],
        watcher: true,
        runtime_mode: 'watched',
        transport: 'process-callback-runner',
      },
    });
  });

  it('falls back to the tsx source runner when the built watcher entrypoint is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const spawn = vi.fn(() => createSpawnResult(6789));
    const inner = new CodexCraftsmanAdapter({ spawn: vi.fn() });
    const adapter = new WatchedProcessCraftsmanAdapter(inner, {
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
      spawn,
    });

    const result = adapter.dispatchTask({
      execution_id: 'exec-watch-2',
      task_id: 'OC-1101',
      stage_id: 'develop',
      subtask_id: 'sub-2',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the source fallback',
      brief_path: null,
    });

    expect(spawn).toHaveBeenCalledWith(
      'tsx',
      [
        expect.stringContaining('process-callback-runner.ts'),
        expect.stringContaining('"executionId":"exec-watch-2"'),
      ],
      expect.objectContaining({
        cwd: '/tmp/codex',
      }),
    );
    expect(result).toMatchObject({
      session_id: 'watcher:6789',
      payload: {
        watcher: true,
        transport: 'process-callback-runner',
      },
    });
  });

  it('uses the built js watcher entrypoint when it is available', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const spawn = vi.fn(() => createSpawnResult(2468));
    const inner = new CodexCraftsmanAdapter({ spawn: vi.fn() });
    const adapter = new WatchedProcessCraftsmanAdapter(inner, {
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
      spawn,
    });

    adapter.dispatchTask({
      execution_id: 'exec-watch-3',
      task_id: 'OC-1102',
      stage_id: 'develop',
      subtask_id: 'sub-3',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Use the built watcher',
      brief_path: null,
    });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining('process-callback-runner.js'),
        expect.stringContaining('"executionId":"exec-watch-3"'),
      ],
      expect.objectContaining({
        cwd: '/tmp/codex',
      }),
    );
  });

  it('rejects blank prompts and watcher startup failures', () => {
    const inner = new CodexCraftsmanAdapter({ spawn: vi.fn() });
    const spawn = vi.fn(() => createSpawnResult(0));
    const adapter = new WatchedProcessCraftsmanAdapter(inner, {
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
      spawn,
      resolveRunner: () => ({
        command: 'node',
        args: ['/tmp/process-callback-runner.js'],
      }),
    });

    expect(() => adapter.dispatchTask({
      execution_id: 'exec-watch-4',
      task_id: 'OC-1103',
      stage_id: 'develop',
      subtask_id: 'sub-4',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: '   ',
      brief_path: null,
    })).toThrow(/requires a prompt/i);

    expect(() => adapter.dispatchTask({
      execution_id: 'exec-watch-5',
      task_id: 'OC-1104',
      stage_id: 'develop',
      subtask_id: 'sub-5',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Start the watcher',
      brief_path: null,
    })).toThrow(/failed to start watcher/i);
  });
});
