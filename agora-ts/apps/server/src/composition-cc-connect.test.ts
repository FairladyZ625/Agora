import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@agora-ts/adapters-brain', () => ({
  FilesystemSkillCatalogAdapter: class {},
  FilesystemProjectBrainQueryAdapter: class {},
  FilesystemProjectKnowledgeAdapter: class {},
  FilesystemTaskBrainWorkspaceAdapter: class {},
}));
vi.mock('@agora-ts/adapters-craftsman', () => ({
  ClaudeCraftsmanAdapter: class {},
  CodexCraftsmanAdapter: class {},
  GeminiCraftsmanAdapter: class {},
}));
vi.mock('@agora-ts/adapters-host', () => ({
  OsHostResourcePort: class {},
}));
vi.mock('@agora-ts/adapters-runtime', () => ({
  AcpCraftsmanInputPort: class {},
  AcpCraftsmanProbePort: class {},
  AcpCraftsmanTailPort: class {},
  AcpRuntimeRecoveryPort: class {},
  createDefaultCraftsmanAdapters: () => ({}),
  DirectAcpxRuntimePort: class {},
  TmuxCraftsmanInputPort: class {},
  TmuxCraftsmanProbePort: class {},
  TmuxCraftsmanTailPort: class {},
  TmuxRuntimeRecoveryPort: class {},
  TmuxRuntimeService: class {},
}));
vi.mock('@agora-ts/adapters-openclaw', () => ({
  loadOpenClawDiscordAccountTokens: () => ({}),
  OpenClawAgentRegistry: class {
    listAgents() {
      return [];
    }
  },
  OpenClawCitizenProjectionAdapter: class {
    adapter = 'openclaw';
  },
  OpenClawLogPresenceSource: class {
    listPresence() {
      return [];
    }
    listHistory() {
      return [];
    }
    listSignals() {
      return [];
    }
  },
}));
vi.mock('@agora-ts/adapters-discord', () => ({
  DiscordGatewayPresenceService: class {},
  DiscordIMMessagingAdapter: class {},
  DiscordIMProvisioningAdapter: class {},
}));

const tempDirs: string[] = [];
const originalCcConnectConfigPaths = process.env.AGORA_CC_CONNECT_CONFIG_PATHS;

afterEach(() => {
  vi.resetModules();
  if (originalCcConnectConfigPaths === undefined) {
    delete process.env.AGORA_CC_CONNECT_CONFIG_PATHS;
  } else {
    process.env.AGORA_CC_CONNECT_CONFIG_PATHS = originalCcConnectConfigPaths;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('server composition cc-connect wiring', () => {
  it('includes cc-connect projects in the default agent registry factory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-cc-connect-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'cc-connect.toml');
    process.env.AGORA_CC_CONNECT_CONFIG_PATHS = configPath;
    writeFileSync(configPath, `
[management]
enabled = true
port = 9820
token = "secret"

[[projects]]
name = "agora-codex"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/repo/agora"
model = "gpt-5.4"

[[projects.platforms]]
type = "discord"
`);

    const { createDefaultServerCompositionFactories } = await import('./composition.js');
    const factories = createDefaultServerCompositionFactories();
    const registry = factories.createAgentRegistry({} as never);

    expect(registry.listAgents()).toEqual([
      {
        id: 'cc-connect:agora-codex',
        host_framework: 'cc-connect',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
        agent_origin: 'user_managed',
      },
    ]);
  });

  it('keeps default citizen projection factories scoped to mainline adapters', async () => {
    const { createDefaultServerCompositionFactories } = await import('./composition.js');
    const factories = createDefaultServerCompositionFactories();
    const citizenService = factories.createCitizenService({ db: {} } as never, {
      projectService: {} as never,
      rolePackService: {} as never,
    });

    const projectionPorts = Reflect.get(citizenService as object, 'projectionPorts') as Map<string, unknown>;
    expect(Array.from(projectionPorts.keys()).sort()).toEqual(['openclaw']);
  });
});
