import { describe, expect, it, vi } from 'vitest';
import { createCliProgram } from './index.js';

function createBuffer() {
  let value = '';
  return {
    write(chunk: string) {
      value += chunk;
    },
    get value() {
      return value;
    },
  };
}

describe('runtime-target cli', () => {
  it('lists runtime targets through the injected service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const runtimeTargetService = {
      listRuntimeTargets: vi.fn(() => [
        {
          runtime_target_ref: 'cc-connect:agora-claude',
          inventory_kind: 'runtime_target',
          runtime_provider: 'cc-connect',
          runtime_flavor: 'claude-code',
          host_framework: 'cc-connect',
          primary_model: 'sonnet',
          workspace_dir: '/repo/agora',
          presentation_mode: 'im_presented',
          presentation_provider: 'discord',
          presentation_identity_ref: '1491747877792387203',
          display_name: 'Agora Claude',
          enabled: true,
          tags: ['review'],
          allowed_projects: ['agora'],
          default_roles: ['reviewer'],
          channel_providers: ['discord'],
          discord_bot_user_ids: ['1491747877792387203'],
          inventory_sources: ['cc-connect'],
          discovered: true,
          metadata: null,
        },
      ]),
      getRuntimeTarget: vi.fn(),
      getOverlay: vi.fn(),
      upsertOverlay: vi.fn(),
      clearOverlay: vi.fn(),
    };
    const program = createCliProgram({
      runtimeTargetService: runtimeTargetService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['runtime-target', 'list', '--json'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(runtimeTargetService.listRuntimeTargets).toHaveBeenCalled();
    expect(JSON.parse(stdout.value)).toEqual({
      runtime_targets: [
        expect.objectContaining({
          runtime_target_ref: 'cc-connect:agora-claude',
          presentation_mode: 'im_presented',
          display_name: 'Agora Claude',
        }),
      ],
    });
  });

  it('upserts runtime target overlay through the injected service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const runtimeTargetService = {
      listRuntimeTargets: vi.fn(),
      getRuntimeTarget: vi.fn(() => ({
        runtime_target_ref: 'cc-connect:agora-claude',
        inventory_kind: 'runtime_target',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'claude-code',
        host_framework: 'cc-connect',
        primary_model: 'sonnet',
        workspace_dir: '/repo/agora',
        presentation_mode: 'headless',
        presentation_provider: null,
        presentation_identity_ref: null,
        display_name: 'Claude Headless',
        enabled: false,
        tags: ['review'],
        allowed_projects: ['agora'],
        default_roles: ['reviewer'],
        channel_providers: ['discord'],
        discord_bot_user_ids: ['1491747877792387203'],
        inventory_sources: ['cc-connect'],
        discovered: true,
        metadata: { source: 'manual' },
      })),
      getOverlay: vi.fn(),
      upsertOverlay: vi.fn(() => ({
        runtime_target_ref: 'cc-connect:agora-claude',
        enabled: false,
        display_name: 'Claude Headless',
        tags: ['review'],
        allowed_projects: ['agora'],
        default_roles: ['reviewer'],
        presentation_mode: 'headless',
        presentation_provider: null,
        presentation_identity_ref: null,
        metadata: { source: 'manual' },
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:01.000Z',
      })),
      clearOverlay: vi.fn(),
    };
    const program = createCliProgram({
      runtimeTargetService: runtimeTargetService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'runtime-target', 'overlay', 'set', 'cc-connect:agora-claude',
      '--display-name', 'Claude Headless',
      '--disable',
      '--presentation-mode', 'headless',
      '--tag', 'review',
      '--allow-project', 'agora',
      '--default-role', 'reviewer',
      '--metadata-json', '{"source":"manual"}',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(runtimeTargetService.upsertOverlay).toHaveBeenCalledWith('cc-connect:agora-claude', {
      display_name: 'Claude Headless',
      enabled: false,
      presentation_mode: 'headless',
      tags: ['review'],
      allowed_projects: ['agora'],
      default_roles: ['reviewer'],
      metadata: { source: 'manual' },
    });
    expect(JSON.parse(stdout.value)).toEqual({
      overlay: expect.objectContaining({
        runtime_target_ref: 'cc-connect:agora-claude',
        presentation_mode: 'headless',
      }),
      runtime_target: expect.objectContaining({
        runtime_target_ref: 'cc-connect:agora-claude',
        presentation_mode: 'headless',
      }),
    });
  });
});
