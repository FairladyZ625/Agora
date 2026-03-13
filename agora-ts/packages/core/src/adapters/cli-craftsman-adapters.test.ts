import { describe, expect, it, vi } from 'vitest';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  GeminiCraftsmanAdapter,
} from './index.js';

function createSpawnResult(pid = 4321) {
  return {
    pid,
    unref: vi.fn(),
  };
}

describe('real craftsman adapters', () => {
  it('builds and spawns codex commands with workdir and prompt', () => {
    const spawn = vi.fn(() => createSpawnResult());
    const adapter = new CodexCraftsmanAdapter({ spawn });

    const result = adapter.dispatchTask({
      execution_id: 'exec-codex-1',
      task_id: 'OC-1000',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the backend change',
      brief_path: '/tmp/brief.md',
    });

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      ['exec', 'Implement the backend change'],
      expect.objectContaining({
        cwd: '/tmp/codex',
        detached: true,
        stdio: 'ignore',
      }),
    );
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'pid:4321',
      payload: expect.objectContaining({
        command: 'codex',
        args: ['exec', 'Implement the backend change'],
      }),
    });
  });

  it('builds claude and gemini commands with their native flags', () => {
    const spawn = vi.fn(() => createSpawnResult(9876));
    const claude = new ClaudeCraftsmanAdapter({ spawn });
    const gemini = new GeminiCraftsmanAdapter({ spawn });

    claude.dispatchTask({
      execution_id: 'exec-claude-1',
      task_id: 'OC-1001',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'claude',
      mode: 'one_shot',
      workdir: '/tmp/claude',
      prompt: 'Review the implementation',
      brief_path: null,
    });
    gemini.dispatchTask({
      execution_id: 'exec-gemini-1',
      task_id: 'OC-1002',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'gemini',
      mode: 'one_shot',
      workdir: '/tmp/gemini',
      prompt: 'Summarize the changes',
      brief_path: null,
    });

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'claude',
      ['--dangerously-skip-permissions', '-p', 'Review the implementation'],
      expect.objectContaining({ cwd: '/tmp/claude' }),
    );
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'gemini',
      ['-p', 'Summarize the changes'],
      expect.objectContaining({ cwd: '/tmp/gemini' }),
    );
  });

  it('builds interactive start and resume commands with per-cli recovery semantics', () => {
    const codex = new CodexCraftsmanAdapter();
    const claude = new ClaudeCraftsmanAdapter();
    const gemini = new GeminiCraftsmanAdapter();

    expect(codex.createInteractiveStartSpec()).toEqual({
      command: 'codex',
      args: ['-a', 'never'],
    });
    expect(codex.createInteractiveResumeSpec('codex-session-123')).toEqual({
      recoveryMode: 'resume_exact',
      spec: {
        command: 'codex',
        args: ['resume', '-a', 'never', 'codex-session-123'],
      },
    });
    expect(codex.createInteractiveResumeSpec(null)).toEqual({
      recoveryMode: 'resume_last',
      spec: {
        command: 'codex',
        args: ['resume', '-a', 'never', '--last'],
      },
    });

    expect(claude.createInteractiveStartSpec()).toEqual({
      command: 'claude',
      args: ['--dangerously-skip-permissions', '--model', 'claude-sonnet-4-6'],
    });
    expect(claude.createInteractiveResumeSpec('claude-session-123')).toEqual({
      recoveryMode: 'resume_exact',
      spec: {
        command: 'claude',
        args: ['--resume', 'claude-session-123', '--dangerously-skip-permissions', '--model', 'claude-sonnet-4-6'],
      },
    });

    expect(gemini.createInteractiveStartSpec()).toEqual({
      command: 'gemini',
      args: ['--approval-mode', 'yolo'],
    });
    expect(gemini.createInteractiveResumeSpec('gemini-session-123')).toEqual({
      recoveryMode: 'resume_exact',
      spec: {
        command: 'gemini',
        args: ['--resume', 'gemini-session-123', '--approval-mode', 'yolo'],
      },
    });
    expect(gemini.createInteractiveResumeSpec(null)).toEqual({
      recoveryMode: 'resume_latest',
      spec: {
        command: 'gemini',
        args: ['--resume', 'latest', '--approval-mode', 'yolo'],
      },
    });
  });

  it('fails fast when prompt is missing or spawn has no pid', () => {
    const noPidSpawn = vi.fn(() => createSpawnResult(0));
    const codex = new CodexCraftsmanAdapter({ spawn: noPidSpawn });

    expect(() => codex.dispatchTask({
      execution_id: 'exec-codex-2',
      task_id: 'OC-1003',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: null,
      brief_path: null,
    })).toThrow('requires a prompt');

    expect(() => codex.dispatchTask({
      execution_id: 'exec-codex-3',
      task_id: 'OC-1004',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Run it',
      brief_path: null,
    })).toThrow('failed to start process');
  });
});
