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
  OpenAiCompatibleProjectBrainEmbeddingAdapter: class {},
  QdrantProjectBrainVectorIndexAdapter: class {},
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
}));
vi.mock('@agora-ts/adapters-discord', () => ({
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

describe('cli composition cc-connect wiring', () => {
  it('exposes cc-connect agents through the default runtime port factory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-cc-connect-'));
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

    const { createDefaultCliCompositionFactories } = await import('./composition.js');
    const factories = createDefaultCliCompositionFactories();
    const runtimePort = factories.createAgentRuntimePort({} as never);

    expect(runtimePort.resolveAgent('cc-connect:agora-codex')).toEqual({
      agent_ref: 'cc-connect:agora-codex',
      runtime_provider: 'cc-connect',
      runtime_actor_ref: 'cc-connect:agora-codex',
      agent_origin: 'user_managed',
    });
  });

  it('registers cc-connect as a citizen projection adapter in the default composition factories', async () => {
    const { createDefaultCliCompositionFactories } = await import('./composition.js');
    const factories = createDefaultCliCompositionFactories();
    const citizenService = factories.createCitizenService({ db: {} } as never, {
      projectService: {} as never,
      rolePackService: {} as never,
    });

    const projectionPorts = Reflect.get(citizenService as object, 'projectionPorts') as Map<string, unknown>;
    expect(Array.from(projectionPorts.keys()).sort()).toEqual(['cc-connect', 'openclaw']);
  });
});
