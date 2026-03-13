import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxPaneRegistry } from './tmux-pane-registry.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeRegistryDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-tmux-registry-'));
  tempDirs.push(dir);
  return dir;
}

describe('tmux pane registry', () => {
  it('creates a three-pane session when missing', () => {
    const exec = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('no session');
      })
      .mockImplementation((args: string[]) => {
        if (args[0] === 'list-panes' && args.includes('#{pane_id}')) {
          return ['%7', '%8', '%9'].join('\n');
        }
        return '';
      });
    const registry = new TmuxPaneRegistry({ exec, registryDir: makeRegistryDir() });

    registry.ensureSession();

    expect(exec).toHaveBeenCalledWith(['has-session', '-t', 'agora-craftsmen']);
    expect(exec).toHaveBeenCalledWith(['new-session', '-d', '-s', 'agora-craftsmen', '-n', 'orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['split-window', '-h', '-t', 'agora-craftsmen:orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['split-window', '-v', '-t', 'agora-craftsmen:orchestrator', 'bash']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%7', '-T', 'codex']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%8', '-T', 'claude']);
    expect(exec).toHaveBeenCalledWith(['select-pane', '-t', '%9', '-T', 'gemini']);
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
    const registry = new TmuxPaneRegistry({ exec, registryDir: makeRegistryDir() });

    expect(registry.getPaneTarget('gemini')).toBe('%2');
    expect(registry.listPanes()).toEqual([
      expect.objectContaining({
        id: '%0',
        title: 'codex',
        currentCommand: 'bash',
        active: true,
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        identitySource: 'registry_default',
      }),
      expect.objectContaining({
        id: '%1',
        title: 'claude',
        currentCommand: 'bash',
        active: false,
        continuityBackend: 'claude_session_id',
        resumeCapability: 'native_resume',
        identitySource: 'registry_default',
      }),
      expect.objectContaining({
        id: '%2',
        title: 'gemini',
        currentCommand: 'bash',
        active: false,
        continuityBackend: 'gemini_session_id',
        resumeCapability: 'native_resume',
        identitySource: 'registry_default',
      }),
    ]);
  });

  it('persists continuity metadata in registry files and reloads it into pane state', () => {
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
    const registryDir = makeRegistryDir();
    const registry = new TmuxPaneRegistry({ exec, registryDir });

    registry.ensureSession();
    registry.updatePaneState('gemini', {
      sessionReference: '3d479f8c-ec0a-4b7f-9f92-123456789abc',
      identitySource: 'chat_file',
      lastRecoveryMode: 'resume_exact',
      transportSessionId: 'tmux:agora-craftsmen:gemini',
    });

    const geminiPane = registry.listPanes().find((pane) => pane.title === 'gemini');
    expect(geminiPane).toMatchObject({
      sessionReference: '3d479f8c-ec0a-4b7f-9f92-123456789abc',
      identitySource: 'chat_file',
      lastRecoveryMode: 'resume_exact',
      transportSessionId: 'tmux:agora-craftsmen:gemini',
    });

    const persisted = JSON.parse(readFileSync(join(registryDir, 'gemini.json'), 'utf8')) as Record<string, string>;
    expect(persisted.session_reference).toBe('3d479f8c-ec0a-4b7f-9f92-123456789abc');
    expect(persisted.identity_source).toBe('chat_file');
  });

  it('resolves pane target by persisted pane id when runtime title drifts', () => {
    const exec = vi.fn((args: string[]) => {
      if (args[0] === 'has-session') return '';
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}|#{pane_current_command}|#{pane_active}')) {
        return ['%0|codex|node|1', '%1|✳ Claude Code|node|0', '%2|gemini|bash|0'].join('\n');
      }
      if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
        return ['%0|codex', '%1|✳ Claude Code', '%2|gemini'].join('\n');
      }
      return '';
    });
    const registry = new TmuxPaneRegistry({ exec, registryDir: makeRegistryDir() });

    registry.updatePaneState('claude', { paneId: '%1' });

    expect(registry.getPaneTarget('claude')).toBe('%1');
    expect(registry.getPaneInfo('claude')).toMatchObject({
      id: '%1',
      title: '✳ Claude Code',
      currentCommand: 'node',
    });
  });
});
