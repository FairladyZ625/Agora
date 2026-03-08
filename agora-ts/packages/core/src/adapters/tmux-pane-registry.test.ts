import { describe, expect, it, vi } from 'vitest';
import { TmuxPaneRegistry } from './tmux-pane-registry.js';

describe('tmux pane registry', () => {
  it('creates a three-pane session when missing', () => {
    const exec = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('no session');
      })
      .mockImplementation(() => '');
    const registry = new TmuxPaneRegistry({ exec });

    registry.ensureSession();

    expect(exec).toHaveBeenCalledWith(['has-session', '-t', 'agora-craftsmen']);
    expect(exec).toHaveBeenCalledWith(['new-session', '-d', '-s', 'agora-craftsmen', '-n', 'orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['split-window', '-h', '-t', 'agora-craftsmen:orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['split-window', '-v', '-t', 'agora-craftsmen:orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%0', '-T', 'codex']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%1', '-T', 'claude']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%2', '-T', 'gemini']);
  });

  it('parses pane status and resolves pane target by title', () => {
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
    const registry = new TmuxPaneRegistry({ exec });

    expect(registry.getPaneTarget('gemini')).toBe('%2');
    expect(registry.listPanes()).toEqual([
      { id: '%0', title: 'codex', currentCommand: 'bash', active: true },
      { id: '%1', title: 'claude', currentCommand: 'bash', active: false },
      { id: '%2', title: 'gemini', currentCommand: 'bash', active: false },
    ]);
  });
});
