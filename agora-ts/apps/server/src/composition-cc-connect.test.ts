import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgoraDatabase,
  ParticipantBindingRepository,
  RuntimeTargetOverlayRepository,
  runMigrations,
  RuntimeSessionBindingRepository,
  TaskContextBindingRepository,
} from '@agora-ts/db';
import {
  RuntimeThreadMessageRouter,
  StubIMProvisioningPort,
  TaskContextBindingService,
  TaskParticipationService,
  type RuntimeThreadMessageInput,
} from '@agora-ts/core';

vi.mock('@agora-ts/adapters-brain', () => ({
  FilesystemSkillCatalogAdapter: class {
    listSkills() {
      return [];
    }
  },
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
  DiscordIMProvisioningAdapter: class {
    constructor(readonly options: unknown) {}
  },
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
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
        discord_bot_user_ids: [],
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

  it('creates a default cc-connect bridge runtime service when bridge config and IM provisioning are available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-cc-connect-bridge-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'cc-connect.toml');
    process.env.AGORA_CC_CONNECT_CONFIG_PATHS = configPath;
    writeFileSync(configPath, `
[management]
enabled = true
port = 9820
token = "secret"

[bridge]
enabled = true
port = 9810
token = "bridge-secret"
path = "/bridge/ws"

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
    const service = factories.createCcConnectBridgeRuntimeService?.({} as never, {
      imProvisioningPort: { publishMessages: vi.fn(async () => undefined) } as never,
      taskConversationService: { ingest: vi.fn() } as never,
      taskContextBindingService: {
        getBindingById: vi.fn(() => null),
        getActiveBinding: vi.fn(() => null),
      } as never,
      taskParticipationService: {
        getParticipantById: vi.fn(() => null),
        getRuntimeSessionByParticipant: vi.fn(() => null),
        bindRuntimeSession: vi.fn(() => null),
      } as never,
      liveSessionStore: { upsert: vi.fn() } as never,
    });

    expect(service).toBeDefined();
    expect(service?.runtime_provider).toBe('cc-connect');
  });

  it('passes cc-connect Discord participant user ids into the default Discord provisioning factory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-cc-connect-provisioning-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'cc-connect.toml');
    process.env.AGORA_CC_CONNECT_CONFIG_PATHS = configPath;
    writeFileSync(configPath, `
[[projects]]
name = "agora-codex"

[projects.agent]
type = "codex"

[[projects.platforms]]
type = "discord"

[projects.platforms.options]
token = "MTQ5MTc4MTM0NDY2NDIyNzk0Mg.fake.fake"
`);

    const { createDefaultServerCompositionFactories } = await import('./composition.js');
    const factories = createDefaultServerCompositionFactories();
    const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
    runMigrations(db);
    const provisioningPort = factories.createIMProvisioningPort({
      db,
      config: {
        im: {
          provider: 'discord',
          discord: {
            bot_token: 'main-token',
            default_channel_id: 'chan-default',
          },
        },
      },
    } as never);

    expect(Reflect.get(provisioningPort as object, 'options')).toMatchObject({
      participantUserIds: {
        'cc-connect:agora-codex': '1491781344664227942',
      },
    });
    db.close();
  });

  it('respects runtime target presentation overlays when resolving cc-connect Discord participant user ids', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-cc-connect-presentation-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'cc-connect.toml');
    const dbPath = join(dir, 'agora.db');
    process.env.AGORA_CC_CONNECT_CONFIG_PATHS = configPath;
    writeFileSync(configPath, `
[[projects]]
name = "agora-codex"

[projects.agent]
type = "codex"

[[projects.platforms]]
type = "discord"

[projects.platforms.options]
token = "MTQ5MTc4MTM0NDY2NDIyNzk0Mg.fake.fake"

[[projects]]
name = "agora-claude"

[projects.agent]
type = "claude"

[[projects.platforms]]
type = "discord"

[projects.platforms.options]
token = "MTQ5MTc0Nzg3Nzc5MjM4NzIwMw.fake.fake"
`);

    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);
    const overlays = new RuntimeTargetOverlayRepository(db);
    overlays.upsertOverlay({
      runtime_target_ref: 'cc-connect:agora-codex',
      presentation_mode: 'headless',
    });
    overlays.upsertOverlay({
      runtime_target_ref: 'cc-connect:agora-claude',
      presentation_mode: 'im_presented',
      presentation_provider: 'discord',
      presentation_identity_ref: '149999999999999999',
    });

    const { createDefaultServerCompositionFactories } = await import('./composition.js');
    const factories = createDefaultServerCompositionFactories();
    const provisioningPort = factories.createIMProvisioningPort({
      db,
      config: {
        im: {
          provider: 'discord',
          discord: {
            bot_token: 'main-token',
            default_channel_id: 'chan-default',
          },
        },
      },
    } as never);

    expect(Reflect.get(provisioningPort as object, 'options')).toMatchObject({
      participantUserIds: {
        'cc-connect:agora-claude': '149999999999999999',
      },
    });
    db.close();
  });

  it('passes the runtime thread message router into the default task service factory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-cc-connect-router-'));
    tempDirs.push(dir);
    const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
    runMigrations(db);
    const { createDefaultServerCompositionFactories } = await import('./composition.js');
    const factories = createDefaultServerCompositionFactories();
    const agentRef = 'cc-connect:agora-codex';
    const imProvisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-composition-router',
    });
    const routed: RuntimeThreadMessageInput[] = [];
    const runtimeThreadMessageRouter = new RuntimeThreadMessageRouter([{
      runtime_provider: 'cc-connect',
      sendInboundMessage: async (input) => {
        routed.push(input);
      },
    }]);
    const agentRuntimePort = {
      resolveAgent(ref: string) {
        return {
          agent_ref: ref,
          runtime_provider: ref === agentRef ? 'cc-connect' as const : null,
          runtime_actor_ref: ref,
        };
      },
    };
    const taskContextBindingService = new TaskContextBindingService({
      repository: new TaskContextBindingRepository(db),
    });
    const taskParticipationService = new TaskParticipationService({
      participantRepository: new ParticipantBindingRepository(db),
      runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
      taskBindingRepository: new TaskContextBindingRepository(db),
      participantIdGenerator: () => 'participant-composition-router',
      agentRuntimePort,
    });
    const service = factories.createTaskService({
      db,
      templatesDir: join(process.cwd(), 'templates'),
      config: {
        permissions: { archonUsers: ['archon'], allowAgents: {} },
        scheduler: {
          task_probe_controller_after_sec: 300,
          task_probe_roster_after_sec: 600,
          task_probe_inbox_after_sec: 900,
        },
        craftsmen: {
          max_concurrent_per_agent: null,
          host_memory_warning_utilization_limit: null,
          host_memory_utilization_limit: null,
          host_swap_warning_utilization_limit: null,
          host_swap_utilization_limit: null,
          host_load_per_cpu_warning_limit: null,
          host_load_per_cpu_limit: null,
        },
      },
    } as never, {
      craftsmanDispatcher: {} as never,
      legacyRuntimeService: { status: () => ({ panes: [] }) } as never,
      imProvisioningPort,
      messagingPort: {} as never,
      taskBrainBindingService: undefined as never,
      taskBrainWorkspacePort: undefined as never,
      taskContextBindingService,
      taskParticipationService,
      humanAccountService: { getIdentityByUsername: () => null } as never,
      contextMaterializationService: undefined as never,
      projectService: { getProjectImSpace: () => null } as never,
      agentRuntimePort,
      runtimeThreadMessageRouter,
      runtimeRecoveryPort: undefined as never,
      craftsmanInputPort: undefined as never,
      craftsmanExecutionProbePort: undefined as never,
      craftsmanExecutionTailPort: undefined as never,
      liveSessionStore: undefined as never,
    });

    service.createTask({
      title: 'Composition Router Task',
      type: 'coding',
      creator: 'archon',
      description: 'route external role brief through server composition',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'developer', agentId: agentRef, member_kind: 'citizen', model_preference: 'cc-connect' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'dispatch',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            roster: { include_roles: ['developer'] },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: [agentRef],
      },
    });

    await service.drainBackgroundOperations();

    expect(routed).toEqual([
      expect.objectContaining({
        task_id: expect.any(String),
        provider: 'discord',
        thread_ref: 'discord-thread-composition-router',
        agent_ref: agentRef,
        body: expect.stringContaining('route external role brief through server composition'),
      }),
    ]);
  });
});
