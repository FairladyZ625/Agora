import { describe, expect, it, vi } from 'vitest';
import { CodexCraftsmanAdapter } from './adapters/codex-adapter.js';
import { TmuxRuntimeService } from './tmux-runtime-service.js';

describe('tmux runtime service', () => {
  it('provides session lifecycle, pane inspection, and raw send helpers', () => {
    const exec = vi.fn((args: string[]) => {
      if (args[0] === 'has-session') return '';
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}|#{pane_current_command}|#{pane_active}')) {
        return ['%0|codex|bash|1', '%1|claude|bash|0', '%2|gemini|bash|0'].join('\n');
      }
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
        return ['%0|codex', '%1|claude', '%2|gemini'].join('\n');
      }
      if (args[0] === 'capture-pane') {
        return 'last output';
      }
      return '';
    });
    const service = new TmuxRuntimeService({
      exec,
      adapters: {
        codex: new CodexCraftsmanAdapter(),
      },
    });

    expect(service.up().panes).toHaveLength(3);
    expect(service.status().panes[0]?.title).toBe('codex');
    expect(service.status().panes[0]).toMatchObject({
      continuityBackend: 'codex_session_file',
      resumeCapability: 'native_resume',
      identitySource: 'registry_default',
      sessionReference: null,
    });
    expect(service.doctor()).toEqual({
      session: 'agora-craftsmen',
      panes: [
        expect.objectContaining({
          agent: 'codex',
          pane: '%0',
          command: 'bash',
          active: true,
          ready: true,
          continuityBackend: 'codex_session_file',
          resumeCapability: 'native_resume',
          identitySource: 'registry_default',
        }),
        expect.objectContaining({
          agent: 'claude',
          pane: '%1',
          command: 'bash',
          active: false,
          ready: true,
          continuityBackend: 'claude_session_id',
          resumeCapability: 'native_resume',
          identitySource: 'registry_default',
        }),
        expect.objectContaining({
          agent: 'gemini',
          pane: '%2',
          command: 'bash',
          active: false,
          ready: true,
          continuityBackend: 'gemini_session_id',
          resumeCapability: 'native_resume',
          identitySource: 'registry_default',
        }),
      ],
    });

    service.send('codex', 'echo hello');
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', 'echo hello']);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', 'Enter']);

    expect(service.tail('codex', 80)).toBe('last output');
    expect(exec).toHaveBeenCalledWith(['capture-pane', '-p', '-S', '-80', '-t', '%0']);

    service.down();
    expect(exec).toHaveBeenCalledWith(['kill-session', '-t', 'agora-craftsmen']);
  });

  it('dispatches a task prompt into the matching tmux pane through the adapter map', () => {
    const exec = vi.fn((args: string[]) => {
      if (args[0] === 'has-session') return '';
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}|#{pane_current_command}|#{pane_active}')) {
        return ['%0|codex|bash|1', '%1|claude|bash|0', '%2|gemini|bash|0'].join('\n');
      }
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
        return ['%0|codex', '%1|claude', '%2|gemini'].join('\n');
      }
      return '';
    });
    const service = new TmuxRuntimeService({
      exec,
      adapters: {
        codex: new CodexCraftsmanAdapter(),
      },
    });

    const result = service.task('codex', {
      execution_id: 'exec-tmux-svc-1',
      task_id: 'OC-1300',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
      prompt: 'Implement via tmux',
      brief_path: null,
    });

    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', "cd /tmp/codex && codex exec 'Implement via tmux'"]);
    expect(result.session_id).toBe('tmux:agora-craftsmen:codex');
    expect(service.status().panes.find((pane) => pane.title === 'codex')).toMatchObject({
      transportSessionId: 'tmux:agora-craftsmen:codex',
      lastRecoveryMode: 'fresh_start',
    });
  });
});
