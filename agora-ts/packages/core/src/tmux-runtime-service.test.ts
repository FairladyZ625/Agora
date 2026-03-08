import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeCraftsmanAdapter } from './adapters/claude-adapter.js';
import { CodexCraftsmanAdapter } from './adapters/codex-adapter.js';
import { GeminiCraftsmanAdapter } from './adapters/gemini-adapter.js';
import type { GeminiSessionIdentity } from './adapters/gemini-session-discovery.js';
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
      registryDir: createRegistryDir(),
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
      registryDir: createRegistryDir(),
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

  it('routes resume commands with cli-specific recovery strategy', () => {
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
      registryDir: createRegistryDir(),
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    });

    service.up();
    service.resume('codex', 'codex-session-123');
    service.resume('claude', 'claude-session-123');
    service.resume('gemini', null);

    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%0', '-l', '--', 'codex resume -a never codex-session-123']);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%1', '-l', '--', 'claude --resume claude-session-123 --dangerously-skip-permissions --model claude-sonnet-4-6']);
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%2', '-l', '--', 'gemini --resume latest --approval-mode yolo']);

    expect(service.status().panes.find((pane) => pane.title === 'codex')).toMatchObject({
      lastRecoveryMode: 'resume_exact',
      sessionReference: 'codex-session-123',
    });
    expect(service.status().panes.find((pane) => pane.title === 'claude')).toMatchObject({
      lastRecoveryMode: 'resume_exact',
      sessionReference: 'claude-session-123',
    });
    expect(service.status().panes.find((pane) => pane.title === 'gemini')).toMatchObject({
      lastRecoveryMode: 'resume_latest',
      sessionReference: null,
    });
  });

  it('refreshes gemini exact identity before resume when chat-file discovery finds a UUID', () => {
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
    const resolveIdentity = vi.fn(
      (): GeminiSessionIdentity => ({
        sessionReference: 'gemini-session-exact-123',
        identitySource: 'chat_file',
        identityPath: '/tmp/gemini/chats/session-a.json',
        sessionObservedAt: '2026-03-08T12:00:00Z',
      }),
    );
    const service = new TmuxRuntimeService({
      exec,
      registryDir: createRegistryDir(),
      geminiSessionDiscovery: { resolveIdentity },
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    });

    service.up();
    service.resume('gemini', null, '/tmp/agora-workspace');

    expect(resolveIdentity).toHaveBeenCalledWith({ workspaceRoot: '/tmp/agora-workspace' });
    expect(exec).toHaveBeenCalledWith(['send-keys', '-t', '%2', '-l', '--', 'gemini --resume gemini-session-exact-123 --approval-mode yolo']);
    expect(service.status().panes.find((pane) => pane.title === 'gemini')).toMatchObject({
      sessionReference: 'gemini-session-exact-123',
      identitySource: 'chat_file',
      lastRecoveryMode: 'resume_exact',
    });
  });

  it('records runtime identity updates for later status and doctor reads', () => {
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
      registryDir: createRegistryDir(),
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    });

    const updated = service.recordIdentity('codex', {
      sessionReference: 'codex-session-456',
      identitySource: 'hook_event',
      workspaceRoot: '/tmp/codex',
    });

    expect(updated).toMatchObject({
      sessionReference: 'codex-session-456',
      identitySource: 'hook_event',
      workspaceRoot: '/tmp/codex',
    });
    expect(service.status().panes.find((pane) => pane.title === 'codex')).toMatchObject({
      sessionReference: 'codex-session-456',
      identitySource: 'hook_event',
      workspaceRoot: '/tmp/codex',
    });
  });
});

function createRegistryDir() {
  return mkdtempSync(join(tmpdir(), 'agora-ts-tmux-runtime-'));
}
