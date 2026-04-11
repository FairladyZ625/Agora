import { describe, expect, it } from 'vitest';
import type { GeminiSessionIdentity } from '@agora-ts/adapters-runtime';
import { createTestRuntime } from './index.js';

describe('agora-ts testing helpers', () => {
  it('creates an isolated runtime with authoring-capable services', () => {
    const runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-700',
    });

    const task = runtime.taskService.createTask({
      title: 'testing helper task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const agents = runtime.dashboardQueryService.getAgentsStatus();

    expect(task.id).toBe('OC-700');
    expect(runtime.db).toBeDefined();
    expect(agents.summary.active_tasks).toBe(1);
    expect(runtime.inboxService).toBeDefined();
    expect(runtime.templateAuthoringService).toBeDefined();
    expect(runtime.templatesDir.startsWith(runtime.dir)).toBe(true);
    expect(runtime.tmuxRuntimeService.status().panes).toHaveLength(3);

    runtime.cleanup();
  });

  it('exposes tmux runtime precedence through the shared test runtime seam', () => {
    const runtime = createTestRuntime({
      geminiSessionDiscovery: {
        resolveIdentity: (): GeminiSessionIdentity => ({
          sessionReference: 'gemini-chat-file-999',
          identitySource: 'chat_file',
          identityPath: '/tmp/gemini/chats/session-z.json',
          sessionObservedAt: '2026-03-08T12:00:00Z',
        }),
      },
    });

    runtime.tmuxRuntimeService.recordIdentity('gemini', {
      sessionReference: 'gemini-runtime-123',
      identitySource: 'runtime_gateway',
      identityPath: '/tmp/runtime/session.json',
      sessionObservedAt: '2026-03-08T13:00:00Z',
      workspaceRoot: '/tmp/agora-workspace',
    });
    runtime.tmuxRuntimeService.recordIdentity('gemini', {
      sessionReference: 'gemini-plugin-456',
      identitySource: 'plugin_event',
      sessionObservedAt: '2026-03-08T14:00:00Z',
    });

    const resumed = runtime.tmuxRuntimeService.resume('gemini', null, '/tmp/agora-workspace');
    const geminiPane = runtime.tmuxRuntimeService.status().panes.find((pane) => pane.title === 'gemini');

    expect(resumed.recoveryMode).toBe('resume_exact');
    expect(geminiPane).toMatchObject({
      sessionReference: 'gemini-runtime-123',
      identitySource: 'runtime_gateway',
      identityPath: '/tmp/runtime/session.json',
    });

    runtime.cleanup();
  });
});
