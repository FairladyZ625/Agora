import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CcConnectInspectionService } from './cc-connect-inspection-service.js';

const tempPaths: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('CcConnectInspectionService', () => {
  it('detects binary, config, and management api status', async () => {
    const configDir = makeTempDir('agora-cc-connect-config-');
    const configPath = join(configDir, 'config.toml');
    writeFileSync(configPath, `
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`, 'utf8');

    const service = new CcConnectInspectionService({
      resolveCommand: vi.fn().mockReturnValue('/usr/local/bin/cc-connect'),
      execFile: vi.fn().mockResolvedValue({
        stdout: 'cc-connect v1.2.2-beta.5\ncommit: abc123\n',
        stderr: '',
      }),
      fetchJson: vi.fn().mockResolvedValue({
        status: 200,
        json: {
          ok: true,
          data: {
            version: 'v1.2.2-beta.5',
            projects_count: 3,
            bridge_adapters: [
              { platform: 'discord', project: 'proj-a', capabilities: ['text'] },
              { platform: 'telegram', project: 'proj-b', capabilities: ['text', 'files'] },
            ],
            connected_platforms: ['discord', 'telegram'],
          },
        },
      }),
    });

    const result = await service.inspect({
      command: 'cc-connect',
      configPath,
    });

    expect(result.binary.found).toBe(true);
    expect(result.binary.resolvedPath).toBe('/usr/local/bin/cc-connect');
    expect(result.binary.version).toBe('v1.2.2-beta.5');
    expect(result.config.exists).toBe(true);
    expect(result.config.management.enabled).toBe(true);
    expect(result.config.management.port).toBe(9820);
    expect(result.config.management.tokenPresent).toBe(true);
    expect(result.management.url).toBe('http://127.0.0.1:9820');
    expect(result.management.reachable).toBe(true);
    expect(result.management.version).toBe('v1.2.2-beta.5');
    expect(result.management.projectsCount).toBe(3);
    expect(result.management.bridgeAdapterCount).toBe(2);
    expect(result.management.connectedPlatforms).toEqual(['discord', 'telegram']);
  });

  it('reports management as unavailable when config is missing', async () => {
    const service = new CcConnectInspectionService({
      resolveCommand: vi.fn().mockReturnValue(null),
      execFile: vi.fn(),
      fetchJson: vi.fn(),
    });

    const result = await service.inspect({
      command: 'cc-connect',
      configPath: join(makeTempDir('agora-cc-connect-missing-'), 'missing.toml'),
    });

    expect(result.binary.found).toBe(false);
    expect(result.config.exists).toBe(false);
    expect(result.management.reachable).toBe(false);
    expect(result.management.reason).toBe('management_not_configured');
  });
});
