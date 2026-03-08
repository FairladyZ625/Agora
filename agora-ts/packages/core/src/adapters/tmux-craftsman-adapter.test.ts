import { describe, expect, it, vi } from 'vitest';
import { CodexCraftsmanAdapter } from './codex-adapter.js';
import { TmuxCraftsmanAdapter } from './tmux-craftsman-adapter.js';

describe('tmux craftsman adapter', () => {
  it('sends the inner adapter command into the matching tmux pane', () => {
    const exec = vi.fn((args: string[]) => {
      if (args[0] === 'has-session') return '';
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
        return ['%0|codex', '%1|claude', '%2|gemini'].join('\n');
      }
      return '';
    });
    const inner = new CodexCraftsmanAdapter();
    const adapter = new TmuxCraftsmanAdapter(inner, { exec });

    const result = adapter.dispatchTask({
      execution_id: 'exec-tmux-1',
      task_id: 'OC-1200',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
      brief_path: null,
    });

    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', "cd /tmp/codex && codex exec 'Implement the feature'"]);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', 'Enter']);
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'tmux:agora-craftsmen:codex',
      payload: {
        command: 'codex',
        args: ['exec', 'Implement the feature'],
        tmux: true,
        pane: '%0',
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
      },
    });
  });
});
