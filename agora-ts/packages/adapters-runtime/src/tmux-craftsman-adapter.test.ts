import { describe, expect, it, vi } from 'vitest';
import { CodexCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
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
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
      brief_path: null,
    });

    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', "cd /tmp/codex && codex exec 'Implement the feature'; status=$?; printf '__AGORA_EXIT__:exec-tmux-1:%s\\n' \"$status\""]);
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

  it('uses the interactive start spec for interactive mode and sends the initial prompt separately', () => {
    const exec = vi.fn((args: string[]) => {
      if (args[0] === 'has-session') return '';
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
        return ['%0|codex', '%1|claude', '%2|gemini'].join('\n');
      }
      return '';
    });
    const inner = new CodexCraftsmanAdapter();
    const adapter = new TmuxCraftsmanAdapter(inner, { exec });

    adapter.dispatchTask({
      execution_id: 'exec-tmux-continuous-1',
      task_id: 'OC-1201',
      stage_id: 'develop',
      subtask_id: 'sub-2',
      adapter: 'codex',
      mode: 'interactive',
      workdir: '/tmp/codex',
      prompt: 'Continue this plan interactively',
      brief_path: null,
    });

    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', "cd /tmp/codex && codex -a never; status=$?; printf '__AGORA_EXIT__:exec-tmux-continuous-1:%s\\n' \"$status\""]);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', 'Continue this plan interactively']);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', 'Enter']);
  });
});
