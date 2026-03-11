import { describe, expect, it } from 'vitest';
import type { GeminiSessionIdentity } from '@agora-ts/core';
import { createTestRuntime } from './index.js';

function discoveryIdentity(sessionReference = 'gemini-chat-file-999'): GeminiSessionIdentity {
  return {
    sessionReference,
    identitySource: 'chat_file',
    identityPath: `/tmp/gemini/chats/${sessionReference}.json`,
    sessionObservedAt: '2026-03-08T12:00:00Z',
  };
}

describe('runtime identity precedence matrix', () => {
  it('keeps runtime_gateway above plugin_event and discovery through the shared runtime seam', () => {
    const runtime = createTestRuntime({
      geminiSessionDiscovery: {
        resolveIdentity: () => discoveryIdentity(),
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

    runtime.tmuxRuntimeService.resume('gemini', null, '/tmp/agora-workspace');
    const geminiPane = runtime.tmuxRuntimeService.status().panes.find((pane) => pane.title === 'gemini');

    expect(geminiPane).toMatchObject({
      sessionReference: 'gemini-runtime-123',
      identitySource: 'runtime_gateway',
      identitySourceRank: 80,
      lastRejectedIdentitySource: 'chat_file',
      lastRejectedSessionReference: 'gemini-chat-file-999',
    });
    expect(geminiPane?.identityConflictCount ?? 0).toBeGreaterThanOrEqual(2);

    runtime.cleanup();
  });

  it('keeps plugin_event above discovery when no runtime gateway identity exists', () => {
    const runtime = createTestRuntime({
      geminiSessionDiscovery: {
        resolveIdentity: () => discoveryIdentity('gemini-chat-file-222'),
      },
    });

    runtime.tmuxRuntimeService.recordIdentity('gemini', {
      sessionReference: 'gemini-plugin-456',
      identitySource: 'plugin_event',
      sessionObservedAt: '2026-03-08T14:00:00Z',
      workspaceRoot: '/tmp/agora-workspace',
    });

    runtime.tmuxRuntimeService.resume('gemini', null, '/tmp/agora-workspace');
    const geminiPane = runtime.tmuxRuntimeService.status().panes.find((pane) => pane.title === 'gemini');

    expect(geminiPane).toMatchObject({
      sessionReference: 'gemini-plugin-456',
      identitySource: 'plugin_event',
      identitySourceRank: 60,
      lastRejectedIdentitySource: 'chat_file',
      lastRejectedSessionReference: 'gemini-chat-file-222',
    });
    expect(geminiPane?.identityConflictCount ?? 0).toBeGreaterThanOrEqual(1);

    runtime.cleanup();
  });

  it('falls back to chat_file exact resume when no stronger source exists', () => {
    const runtime = createTestRuntime({
      geminiSessionDiscovery: {
        resolveIdentity: () => discoveryIdentity('gemini-chat-file-333'),
      },
    });

    const resumed = runtime.tmuxRuntimeService.resume('gemini', null, '/tmp/agora-workspace');
    const geminiPane = runtime.tmuxRuntimeService.status().panes.find((pane) => pane.title === 'gemini');

    expect(resumed.recoveryMode).toBe('resume_exact');
    expect(geminiPane).toMatchObject({
      sessionReference: 'gemini-chat-file-333',
      identitySource: 'chat_file',
      identitySourceRank: 40,
      identityConflictCount: 1,
      lastRejectedIdentitySource: 'chat_file',
    });

    runtime.cleanup();
  });
});
