import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface GeminiSessionIdentity {
  sessionReference: string;
  identitySource: 'chat_file' | 'latest_fallback';
  identityPath: string;
  sessionObservedAt: string;
}

export interface GeminiSessionDiscoveryOptions {
  homeDir?: string;
}

export interface GeminiSessionDiscoveryInput {
  workspaceRoot: string;
}

export class GeminiSessionDiscovery {
  private readonly homeDir: string;

  constructor(options: GeminiSessionDiscoveryOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
  }

  resolveIdentity(input: GeminiSessionDiscoveryInput): GeminiSessionIdentity | null {
    const sessionFile = this.detectLatestSessionFile(input.workspaceRoot);
    if (!sessionFile) {
      return null;
    }
    const sessionReference = readGeminiSessionId(sessionFile) ?? 'latest';
    return {
      sessionReference,
      identitySource: sessionReference === 'latest' ? 'latest_fallback' : 'chat_file',
      identityPath: sessionFile,
      sessionObservedAt: new Date(statSync(sessionFile).mtimeMs).toISOString(),
    };
  }

  private detectLatestSessionFile(workspaceRoot: string) {
    const projectDir = this.findProjectDir(workspaceRoot);
    if (!projectDir) {
      return null;
    }
    const chatsDir = join(projectDir, 'chats');
    if (!existsSync(chatsDir)) {
      return null;
    }
    const files = readdirSync(chatsDir)
      .filter((entry) => entry.startsWith('session-') && entry.endsWith('.json'))
      .map((entry) => join(chatsDir, entry))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
    return files[0] ?? null;
  }

  private findProjectDir(workspaceRoot: string) {
    const tmpRoot = join(this.homeDir, '.gemini', 'tmp');
    if (!existsSync(tmpRoot)) {
      return null;
    }
    const resolvedWorkspace = resolve(workspaceRoot);
    let bestMatch: string | null = null;
    let bestLength = -1;
    for (const entry of readdirSync(tmpRoot)) {
      const projectDir = join(tmpRoot, entry);
      const marker = join(projectDir, '.project_root');
      if (!existsSync(marker)) {
        continue;
      }
      const markerRoot = readFileSync(marker, 'utf8').trim();
      if (!markerRoot) {
        continue;
      }
      const resolvedMarkerRoot = resolve(markerRoot);
      if (!isSameOrParent(resolvedWorkspace, resolvedMarkerRoot)) {
        continue;
      }
      if (resolvedMarkerRoot.length > bestLength) {
        bestMatch = projectDir;
        bestLength = resolvedMarkerRoot.length;
      }
    }
    return bestMatch;
  }
}

function readGeminiSessionId(sessionFile: string) {
  try {
    const payload = JSON.parse(readFileSync(sessionFile, 'utf8')) as Record<string, unknown>;
    const direct = typeof payload.sessionId === 'string' ? payload.sessionId : typeof payload.session_id === 'string' ? payload.session_id : null;
    return direct && direct.length > 0 ? direct : null;
  } catch {
    return null;
  }
}

function isSameOrParent(target: string, candidateRoot: string) {
  return target === candidateRoot || target.startsWith(`${candidateRoot}/`);
}
