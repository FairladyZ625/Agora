import { describe, expect, it } from 'vitest';
import type { IRuntimeTargetOverlayRepository, RuntimeTargetOverlayRecord } from '@agora-ts/contracts';
import { RuntimeTargetService } from './runtime-target-service.js';
import type { RegisteredAgent } from './runtime-ports.js';

class InMemoryRuntimeTargetOverlayRepository implements IRuntimeTargetOverlayRepository {
  private readonly overlays = new Map<string, RuntimeTargetOverlayRecord>();

  upsertOverlay(input: {
    runtime_target_ref: string;
    enabled?: boolean;
    display_name?: string | null;
    tags?: string[];
    allowed_projects?: string[];
    default_roles?: string[];
    presentation_mode?: 'headless' | 'im_presented';
    presentation_provider?: string | null;
    presentation_identity_ref?: string | null;
    metadata?: Record<string, unknown> | null;
  }): RuntimeTargetOverlayRecord {
    const existing = this.overlays.get(input.runtime_target_ref);
    const now = new Date().toISOString();
    const next: RuntimeTargetOverlayRecord = {
      runtime_target_ref: input.runtime_target_ref,
      enabled: input.enabled ?? existing?.enabled ?? true,
      display_name: input.display_name ?? existing?.display_name ?? null,
      tags: input.tags ?? existing?.tags ?? [],
      allowed_projects: input.allowed_projects ?? existing?.allowed_projects ?? [],
      default_roles: input.default_roles ?? existing?.default_roles ?? [],
      presentation_mode: input.presentation_mode ?? existing?.presentation_mode ?? 'headless',
      presentation_provider: input.presentation_provider ?? existing?.presentation_provider ?? null,
      presentation_identity_ref: input.presentation_identity_ref ?? existing?.presentation_identity_ref ?? null,
      metadata: input.metadata ?? existing?.metadata ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.overlays.set(input.runtime_target_ref, next);
    return next;
  }

  getOverlay(runtimeTargetRef: string): RuntimeTargetOverlayRecord | null {
    return this.overlays.get(runtimeTargetRef) ?? null;
  }

  listOverlays(): RuntimeTargetOverlayRecord[] {
    return Array.from(this.overlays.values()).sort((left, right) => left.runtime_target_ref.localeCompare(right.runtime_target_ref));
  }

  deleteOverlay(runtimeTargetRef: string): boolean {
    return this.overlays.delete(runtimeTargetRef);
  }
}

describe('RuntimeTargetService', () => {
  const inventory = {
    listAgents: (): RegisteredAgent[] => [
      {
        id: 'cc-connect:agora-claude',
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'claude-code',
        runtime_target_ref: 'cc-connect:agora-claude',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'sonnet',
        workspace_dir: '/Users/lizeyu/Projects/Agora',
        discord_bot_user_ids: ['1491747877792387203'],
      },
      {
        id: 'openclaw:opus',
        inventory_kind: 'agent',
        host_framework: 'openclaw',
        channel_providers: ['discord'],
        inventory_sources: ['openclaw'],
        primary_model: 'opus',
        workspace_dir: null,
      },
      {
        id: 'cc-connect:agora-codex-headless',
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex-headless',
        channel_providers: [],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
      },
    ],
  };

  it('lists runtime targets and derives default presentation mode', () => {
    const service = new RuntimeTargetService({
      agentInventory: inventory,
      overlayRepository: new InMemoryRuntimeTargetOverlayRepository(),
    });

    expect(service.listRuntimeTargets()).toEqual([
      expect.objectContaining({
        runtime_target_ref: 'cc-connect:agora-claude',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'claude-code',
        presentation_mode: 'im_presented',
        presentation_provider: 'discord',
        presentation_identity_ref: '1491747877792387203',
      }),
      expect.objectContaining({
        runtime_target_ref: 'cc-connect:agora-codex-headless',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        presentation_mode: 'headless',
        presentation_provider: null,
        presentation_identity_ref: null,
      }),
    ]);
  });

  it('merges overlay metadata over discovered inventory', () => {
    const overlayRepository = new InMemoryRuntimeTargetOverlayRepository();
    overlayRepository.upsertOverlay({
      runtime_target_ref: 'cc-connect:agora-codex-headless',
      display_name: 'Codex Headless',
      presentation_mode: 'im_presented',
      presentation_provider: 'discord',
      presentation_identity_ref: 'bot-123',
      tags: ['coding'],
      allowed_projects: ['agora'],
      default_roles: ['developer'],
      metadata: { source: 'manual' },
    });
    const service = new RuntimeTargetService({
      agentInventory: inventory,
      overlayRepository,
    });

    expect(service.getRuntimeTarget('cc-connect:agora-codex-headless')).toMatchObject({
      runtime_target_ref: 'cc-connect:agora-codex-headless',
      display_name: 'Codex Headless',
      presentation_mode: 'im_presented',
      presentation_provider: 'discord',
      presentation_identity_ref: 'bot-123',
      tags: ['coding'],
      allowed_projects: ['agora'],
      default_roles: ['developer'],
      metadata: { source: 'manual' },
    });
  });

  it('upserts and clears overlays for discovered runtime targets', () => {
    const overlayRepository = new InMemoryRuntimeTargetOverlayRepository();
    const service = new RuntimeTargetService({
      agentInventory: inventory,
      overlayRepository,
    });

    const updated = service.upsertOverlay('cc-connect:agora-claude', {
      display_name: 'Agora Claude Review',
      tags: ['review'],
      presentation_mode: 'headless',
    });

    expect(updated).toMatchObject({
      runtime_target_ref: 'cc-connect:agora-claude',
      display_name: 'Agora Claude Review',
      tags: ['review'],
      presentation_mode: 'headless',
    });
    expect(service.clearOverlay('cc-connect:agora-claude')).toBe(true);
    expect(service.getOverlay('cc-connect:agora-claude')).toBeNull();
  });

  it('rejects overlay writes for unknown runtime targets', () => {
    const service = new RuntimeTargetService({
      agentInventory: inventory,
      overlayRepository: new InMemoryRuntimeTargetOverlayRepository(),
    });

    expect(() => service.upsertOverlay('cc-connect:missing', {
      display_name: 'Missing',
    })).toThrow('Runtime target cc-connect:missing not found');
  });
});
