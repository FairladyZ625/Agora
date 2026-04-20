import type {
  AgentInventorySource,
  RegisteredAgent,
} from './runtime-ports.js';
import { NotFoundError } from './errors.js';
import type {
  IRuntimeTargetOverlayRepository,
  RuntimeTargetDto,
  RuntimeTargetOverlayDto,
  UpsertRuntimeTargetOverlayRequestDto,
} from '@agora-ts/contracts';

export interface RuntimeTargetServiceOptions {
  agentInventory: AgentInventorySource;
  overlayRepository: IRuntimeTargetOverlayRepository;
}

export class RuntimeTargetService {
  constructor(private readonly options: RuntimeTargetServiceOptions) {}

  listRuntimeTargets(): RuntimeTargetDto[] {
    const overlays = new Map(
      this.options.overlayRepository
        .listOverlays()
        .map((overlay) => [overlay.runtime_target_ref, overlay] as const),
    );
    return this.options.agentInventory
      .listAgents()
      .filter(isRuntimeTarget)
      .map((agent) => buildRuntimeTarget(agent, overlays.get(agent.runtime_target_ref ?? agent.id) ?? null));
  }

  getRuntimeTarget(runtimeTargetRef: string): RuntimeTargetDto {
    const agent = this.options.agentInventory
      .listAgents()
      .find((item) => isRuntimeTarget(item) && resolveRuntimeTargetRef(item) === runtimeTargetRef);
    if (!agent) {
      throw new NotFoundError(`Runtime target ${runtimeTargetRef} not found`);
    }
    return buildRuntimeTarget(agent, this.options.overlayRepository.getOverlay(runtimeTargetRef));
  }

  getOverlay(runtimeTargetRef: string): RuntimeTargetOverlayDto | null {
    return this.options.overlayRepository.getOverlay(runtimeTargetRef);
  }

  upsertOverlay(runtimeTargetRef: string, input: UpsertRuntimeTargetOverlayRequestDto): RuntimeTargetOverlayDto {
    this.getRuntimeTarget(runtimeTargetRef);
    const payload: Parameters<IRuntimeTargetOverlayRepository['upsertOverlay']>[0] = {
      runtime_target_ref: runtimeTargetRef,
    };
    if (input.enabled !== undefined) payload.enabled = input.enabled;
    if (input.display_name !== undefined) payload.display_name = input.display_name;
    if (input.tags !== undefined) payload.tags = input.tags;
    if (input.allowed_projects !== undefined) payload.allowed_projects = input.allowed_projects;
    if (input.default_roles !== undefined) payload.default_roles = input.default_roles;
    if (input.presentation_mode !== undefined) payload.presentation_mode = input.presentation_mode;
    if (input.presentation_provider !== undefined) payload.presentation_provider = input.presentation_provider;
    if (input.presentation_identity_ref !== undefined) payload.presentation_identity_ref = input.presentation_identity_ref;
    if (input.metadata !== undefined) payload.metadata = input.metadata;
    return this.options.overlayRepository.upsertOverlay(payload);
  }

  clearOverlay(runtimeTargetRef: string): boolean {
    return this.options.overlayRepository.deleteOverlay(runtimeTargetRef);
  }
}

function isRuntimeTarget(agent: RegisteredAgent) {
  return agent.inventory_kind === 'runtime_target' && Boolean(resolveRuntimeTargetRef(agent));
}

function resolveRuntimeTargetRef(agent: RegisteredAgent) {
  return agent.runtime_target_ref ?? agent.id;
}

function buildRuntimeTarget(
  agent: RegisteredAgent,
  overlay: RuntimeTargetOverlayDto | null,
): RuntimeTargetDto {
  const runtimeTargetRef = resolveRuntimeTargetRef(agent)!;
  const defaultPresentationMode = deriveDefaultPresentationMode(agent);
  const defaultPresentationProvider = deriveDefaultPresentationProvider(agent, defaultPresentationMode);
  const defaultPresentationIdentityRef = deriveDefaultPresentationIdentityRef(agent, defaultPresentationMode);
  return {
    runtime_target_ref: runtimeTargetRef,
    inventory_kind: 'runtime_target',
    runtime_provider: agent.runtime_provider ?? agent.host_framework ?? null,
    runtime_flavor: agent.runtime_flavor ?? null,
    host_framework: agent.host_framework ?? null,
    primary_model: agent.primary_model ?? null,
    workspace_dir: agent.workspace_dir ?? null,
    channel_providers: [...agent.channel_providers].sort(),
    inventory_sources: [...agent.inventory_sources].sort(),
    discord_bot_user_ids: [...(agent.discord_bot_user_ids ?? [])].sort(),
    enabled: overlay?.enabled ?? true,
    display_name: overlay?.display_name ?? null,
    tags: [...(overlay?.tags ?? [])],
    allowed_projects: [...(overlay?.allowed_projects ?? [])],
    default_roles: [...(overlay?.default_roles ?? [])],
    presentation_mode: overlay?.presentation_mode ?? defaultPresentationMode,
    presentation_provider: overlay?.presentation_provider ?? defaultPresentationProvider,
    presentation_identity_ref: overlay?.presentation_identity_ref ?? defaultPresentationIdentityRef,
    metadata: overlay?.metadata ?? null,
    discovered: true,
  };
}

function deriveDefaultPresentationMode(agent: RegisteredAgent): RuntimeTargetDto['presentation_mode'] {
  return (agent.discord_bot_user_ids?.length ?? 0) > 0 ? 'im_presented' : 'headless';
}

function deriveDefaultPresentationProvider(
  agent: RegisteredAgent,
  presentationMode: RuntimeTargetDto['presentation_mode'],
): string | null {
  if (presentationMode !== 'im_presented') {
    return null;
  }
  return agent.channel_providers[0] ?? null;
}

function deriveDefaultPresentationIdentityRef(
  agent: RegisteredAgent,
  presentationMode: RuntimeTargetDto['presentation_mode'],
): string | null {
  if (presentationMode !== 'im_presented') {
    return null;
  }
  return agent.discord_bot_user_ids?.[0] ?? null;
}
