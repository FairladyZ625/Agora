export interface LiveSmokeTargetSpec {
  agentRef: string;
  project: string;
  role: string;
  expectReply: boolean;
}

export interface ConfiguredLiveSmokeTarget {
  configPath: string;
  projectName: string;
  agentType: string | null;
  runtimeFlavor: string | null;
  workDir: string | null;
  primaryModel: string | null;
  channelProviders: string[];
  management: {
    enabled: boolean;
    baseUrl: string | null;
    token: string | null;
  };
  bridge: {
    enabled: boolean;
    baseUrl: string | null;
    token: string | null;
    path: string;
  };
}

export interface ResolvedLiveSmokeTarget {
  spec: LiveSmokeTargetSpec;
  target: ConfiguredLiveSmokeTarget;
}

export function resolveCcConnectConfigPathsEnv(input: {
  ccConnectConfig?: string | null;
  ccConnectConfigs?: string | null;
}) {
  const parts = [
    ...splitConfigPaths(input.ccConnectConfigs),
    ...splitConfigPaths(input.ccConnectConfig),
  ];
  return Array.from(new Set(parts)).join(',');
}

export function parseLiveSmokeTargets(input: {
  targetsJson?: string | null;
  agentRef?: string | null;
  project?: string | null;
  role?: string | null;
  expectReply: boolean;
}): LiveSmokeTargetSpec[] {
  const targets = input.targetsJson
    ? parseTargetsJson(input.targetsJson, input.expectReply)
    : [buildSingleTarget(input)];

  if (targets.length === 0) {
    throw new Error('live smoke target matrix cannot be empty');
  }

  const seenAgentRefs = new Set<string>();
  for (const target of targets) {
    if (seenAgentRefs.has(target.agentRef)) {
      throw new Error(`duplicate live smoke agent_ref: ${target.agentRef}`);
    }
    seenAgentRefs.add(target.agentRef);
  }

  return targets;
}

export function resolveConfiguredLiveSmokeTargets(
  specs: LiveSmokeTargetSpec[],
  configuredTargets: ConfiguredLiveSmokeTarget[],
): ResolvedLiveSmokeTarget[] {
  const resolved = specs.map((spec) => {
    const target = configuredTargets.find((item) => item.projectName === spec.project) ?? null;
    if (!target) {
      throw new Error(`cc-connect target not configured for ${spec.project}`);
    }
    if (!target.management.enabled || !target.management.baseUrl || !target.management.token) {
      throw new Error(`cc-connect management target not configured for ${spec.project}`);
    }
    if (!target.bridge.enabled || !target.bridge.baseUrl || !target.bridge.token) {
      throw new Error(`cc-connect bridge target not configured for ${spec.project}`);
    }
    if (!target.runtimeFlavor) {
      throw new Error(`cc-connect runtime_flavor missing for ${spec.project}`);
    }
    return { spec, target };
  });

  const seenFlavors = new Set<string>();
  for (const item of resolved) {
    const runtimeFlavor = item.target.runtimeFlavor!;
    if (seenFlavors.has(runtimeFlavor)) {
      throw new Error(`duplicate live smoke runtime_flavor: ${runtimeFlavor}`);
    }
    seenFlavors.add(runtimeFlavor);
  }

  return resolved;
}

export function buildLiveSmokeProjectMetadata(configuredTargets: ResolvedLiveSmokeTarget[]) {
  return {
    runtime_targets: {
      flavors: Object.fromEntries(configuredTargets.map((item) => [
        item.target.runtimeFlavor!,
        item.spec.agentRef,
      ])),
    },
  };
}

export function buildLiveSmokeTaskInput(input: {
  taskId: string;
  projectId: string;
  goal: string;
  configuredTargets: ResolvedLiveSmokeTarget[];
}) {
  const roles = Array.from(new Set(input.configuredTargets.map((target) => target.spec.role)));
  return {
    title: `H9 entry live external dispatch ${input.taskId}`,
    type: 'custom' as const,
    creator: 'archon',
    description: input.goal,
    priority: 'normal' as const,
    project_id: input.projectId,
    team_override: {
      members: input.configuredTargets.map((target) => ({
        role: target.spec.role,
        agentId: target.spec.role,
        member_kind: 'citizen' as const,
        model_preference: target.target.runtimeFlavor!,
      })),
    },
    workflow_override: {
      type: 'custom' as const,
      stages: [
        {
          id: 'dispatch',
          mode: 'execute' as const,
          execution_kind: 'citizen_execute' as const,
          allowed_actions: ['execute'],
          roster: { include_roles: roles },
          gate: { type: 'command' as const },
        },
      ],
    },
    im_target: {
      provider: 'discord' as const,
      visibility: 'private' as const,
    },
  };
}

function buildSingleTarget(input: {
  agentRef?: string | null;
  project?: string | null;
  role?: string | null;
  expectReply: boolean;
}): LiveSmokeTargetSpec {
  return {
    agentRef: requireNonEmpty(input.agentRef, '--agent-ref'),
    project: requireNonEmpty(input.project, '--project'),
    role: normalizeRole(input.role),
    expectReply: input.expectReply,
  };
}

function parseTargetsJson(raw: string, defaultExpectReply: boolean): LiveSmokeTargetSpec[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid --targets-json: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('--targets-json must be a JSON array');
  }

  return parsed.map((item, index) => {
    const target = asRecord(item);
    if (!target) {
      throw new Error(`invalid target at index ${index}: expected object`);
    }
    const agentRef = firstString(target.agent_ref, target.agentRef);
    const project = firstString(target.project, target.project_name, target.projectName);
    const role = firstString(target.role) ?? 'developer';
    const expectReply = firstBoolean(target.expect_reply, target.expectReply) ?? defaultExpectReply;
    return {
      agentRef: requireNonEmpty(agentRef, `targets[${index}].agent_ref`),
      project: requireNonEmpty(project, `targets[${index}].project`),
      role: normalizeRole(role),
      expectReply,
    };
  });
}

function splitConfigPaths(raw?: string | null) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function requireNonEmpty(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeRole(role: string | null | undefined) {
  return requireNonEmpty(role ?? 'developer', 'role');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}
