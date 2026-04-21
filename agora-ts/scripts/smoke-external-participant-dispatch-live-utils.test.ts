import { describe, expect, it } from 'vitest';
import {
  buildLiveSmokeProjectMetadata,
  buildLiveSmokeTaskInput,
  parseLiveSmokeTargets,
  resolveConfiguredLiveSmokeTargets,
  resolveCcConnectConfigPathsEnv,
  type ConfiguredLiveSmokeTarget,
} from './smoke-external-participant-dispatch-live-utils.js';

describe('resolveCcConnectConfigPathsEnv', () => {
  it('combines multi and single config options without duplicates', () => {
    expect(resolveCcConnectConfigPathsEnv({
      ccConnectConfig: '/tmp/a.toml',
      ccConnectConfigs: '/tmp/a.toml,/tmp/b.toml',
    })).toBe('/tmp/a.toml,/tmp/b.toml');
  });
});

describe('parseLiveSmokeTargets', () => {
  it('falls back to the legacy single-target options', () => {
    expect(parseLiveSmokeTargets({
      agentRef: 'cc-connect:agora-codex-immediate',
      project: 'agora-codex-immediate',
      role: 'developer',
      expectReply: true,
    })).toEqual([
      {
        agentRef: 'cc-connect:agora-codex-immediate',
        project: 'agora-codex-immediate',
        role: 'developer',
        expectReply: true,
      },
    ]);
  });

  it('parses a dual-target matrix and defaults missing expect_reply from the top-level flag', () => {
    expect(parseLiveSmokeTargets({
      targetsJson: JSON.stringify([
        {
          agent_ref: 'cc-connect:agora-codex-immediate',
          project: 'agora-codex-immediate',
          role: 'developer',
        },
        {
          agent_ref: 'cc-connect:agora-claude',
          project: 'agora-claude',
          role: 'reviewer',
          expect_reply: false,
        },
      ]),
      expectReply: true,
    })).toEqual([
      {
        agentRef: 'cc-connect:agora-codex-immediate',
        project: 'agora-codex-immediate',
        role: 'developer',
        expectReply: true,
      },
      {
        agentRef: 'cc-connect:agora-claude',
        project: 'agora-claude',
        role: 'reviewer',
        expectReply: false,
      },
    ]);
  });

  it('rejects duplicate target agent refs because live verifier cannot disambiguate them', () => {
    expect(() => parseLiveSmokeTargets({
      targetsJson: JSON.stringify([
        {
          agent_ref: 'cc-connect:agora-codex',
          project: 'agora-codex',
          role: 'developer',
        },
        {
          agent_ref: 'cc-connect:agora-codex',
          project: 'agora-codex',
          role: 'reviewer',
        },
      ]),
      expectReply: false,
    })).toThrow('duplicate live smoke agent_ref: cc-connect:agora-codex');
  });
});

describe('resolveConfiguredLiveSmokeTargets', () => {
  it('fails fast when a target lacks bridge wiring', () => {
    expect(() => resolveConfiguredLiveSmokeTargets([
      {
        agentRef: 'cc-connect:agora-codex',
        project: 'agora-codex',
        role: 'developer',
        expectReply: false,
      },
    ], [
      {
        configPath: '/tmp/a.toml',
        projectName: 'agora-codex',
        agentType: 'codex',
        runtimeFlavor: 'codex',
        workDir: '/repo',
        primaryModel: null,
        channelProviders: ['discord'],
        management: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9820',
          token: 'mgmt',
        },
        bridge: {
          enabled: false,
          baseUrl: null,
          token: null,
          path: '/bridge/ws',
        },
      },
    ])).toThrow('cc-connect bridge target not configured for agora-codex');
  });

  it('fails fast when two live smoke targets collapse to the same runtime flavor', () => {
    expect(() => resolveConfiguredLiveSmokeTargets([
      {
        agentRef: 'cc-connect:agora-codex',
        project: 'agora-codex',
        role: 'developer',
        expectReply: true,
      },
      {
        agentRef: 'cc-connect:agora-codex-immediate',
        project: 'agora-codex-immediate',
        role: 'reviewer',
        expectReply: true,
      },
    ], [
      buildConfiguredTarget({
        projectName: 'agora-codex',
        runtimeFlavor: 'codex',
      }),
      buildConfiguredTarget({
        projectName: 'agora-codex-immediate',
        runtimeFlavor: 'codex',
      }),
    ])).toThrow('duplicate live smoke runtime_flavor: codex');
  });
});

describe('buildLiveSmokeProjectMetadata', () => {
  it('builds runtime target policy from the configured matrix', () => {
    expect(buildLiveSmokeProjectMetadata([
      buildConfiguredResolvedTarget({
        projectName: 'agora-codex-immediate',
        runtimeFlavor: 'codex',
        agentRef: 'cc-connect:agora-codex-immediate',
        role: 'developer',
      }),
      buildConfiguredResolvedTarget({
        projectName: 'agora-claude',
        runtimeFlavor: 'claude-code',
        agentRef: 'cc-connect:agora-claude',
        role: 'reviewer',
      }),
    ])).toEqual({
      runtime_targets: {
        flavors: {
          codex: 'cc-connect:agora-codex-immediate',
          'claude-code': 'cc-connect:agora-claude',
        },
      },
    });
  });
});

describe('buildLiveSmokeTaskInput', () => {
  it('builds a shared-thread placeholder task payload for the full target matrix', () => {
    const payload = buildLiveSmokeTaskInput({
      taskId: 'OC-H9-W3-1',
      projectId: 'proj-wave3',
      goal: 'dual-target smoke',
      configuredTargets: [
        buildConfiguredResolvedTarget({
          projectName: 'agora-codex-immediate',
          runtimeFlavor: 'codex',
          agentRef: 'cc-connect:agora-codex-immediate',
          role: 'developer',
        }),
        buildConfiguredResolvedTarget({
          projectName: 'agora-claude',
          runtimeFlavor: 'claude-code',
          agentRef: 'cc-connect:agora-claude',
          role: 'reviewer',
        }),
      ],
    });

    expect(payload.title).toBe('H9 entry live external dispatch OC-H9-W3-1');
    expect(payload.description).toBe('dual-target smoke');
    expect(payload.project_id).toBe('proj-wave3');
    expect(payload.team_override.members).toEqual([
      expect.objectContaining({
        role: 'developer',
        agentId: 'developer',
        model_preference: 'codex',
      }),
      expect.objectContaining({
        role: 'reviewer',
        agentId: 'reviewer',
        model_preference: 'claude-code',
      }),
    ]);
    expect(payload.workflow_override.stages).toEqual([
      expect.objectContaining({
        roster: { include_roles: ['developer', 'reviewer'] },
      }),
    ]);
    expect(payload.im_target).toEqual({
      provider: 'discord',
      visibility: 'private',
    });
  });
});

function buildConfiguredTarget(input: {
  projectName: string;
  runtimeFlavor: 'codex' | 'claude-code';
}): ConfiguredLiveSmokeTarget {
  return {
    configPath: `/tmp/${input.projectName}.toml`,
    projectName: input.projectName,
    agentType: input.runtimeFlavor,
    runtimeFlavor: input.runtimeFlavor,
    workDir: '/repo',
    primaryModel: null,
    channelProviders: ['discord'],
    management: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:9820',
      token: 'mgmt',
    },
    bridge: {
      enabled: true,
      baseUrl: 'ws://127.0.0.1:9810/bridge/ws',
      token: 'bridge',
      path: '/bridge/ws',
    },
  };
}

function buildConfiguredResolvedTarget(input: {
  projectName: string;
  runtimeFlavor: 'codex' | 'claude-code';
  agentRef: string;
  role: string;
}) {
  return {
    spec: {
      agentRef: input.agentRef,
      project: input.projectName,
      role: input.role,
      expectReply: true,
    },
    target: buildConfiguredTarget({
      projectName: input.projectName,
      runtimeFlavor: input.runtimeFlavor,
    }),
  };
}
