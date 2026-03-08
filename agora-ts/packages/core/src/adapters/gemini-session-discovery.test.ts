import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GeminiSessionDiscovery } from './gemini-session-discovery.js';

describe('gemini session discovery', () => {
  it('resolves exact session id from project chat files', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'agora-ts-gemini-home-'));
    const workspaceRoot = join(homeDir, 'workspace', 'agora');
    const projectDir = join(homeDir, '.gemini', 'tmp', 'project-1');
    const chatsDir = join(projectDir, 'chats');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(chatsDir, { recursive: true });
    writeFileSync(join(projectDir, '.project_root'), workspaceRoot, 'utf8');
    writeFileSync(join(chatsDir, 'session-a.json'), JSON.stringify({ sessionId: 'gemini-session-exact-123' }), 'utf8');

    const discovery = new GeminiSessionDiscovery({ homeDir });
    expect(discovery.resolveIdentity({ workspaceRoot })).toEqual({
      identityPath: join(chatsDir, 'session-a.json'),
      identitySource: 'chat_file',
      sessionReference: 'gemini-session-exact-123',
      sessionObservedAt: expect.any(String),
    });
  });

  it('falls back to latest when session file exists without session id', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'agora-ts-gemini-home-'));
    const workspaceRoot = join(homeDir, 'workspace', 'agora');
    const projectDir = join(homeDir, '.gemini', 'tmp', 'project-2');
    const chatsDir = join(projectDir, 'chats');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(chatsDir, { recursive: true });
    writeFileSync(join(projectDir, '.project_root'), workspaceRoot, 'utf8');
    writeFileSync(join(chatsDir, 'session-a.json'), JSON.stringify({ conversation: {} }), 'utf8');

    const discovery = new GeminiSessionDiscovery({ homeDir });
    expect(discovery.resolveIdentity({ workspaceRoot })).toEqual({
      identityPath: join(chatsDir, 'session-a.json'),
      identitySource: 'latest_fallback',
      sessionReference: 'latest',
      sessionObservedAt: expect.any(String),
    });
  });
});
