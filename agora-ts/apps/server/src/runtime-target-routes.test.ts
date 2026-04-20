import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@agora-ts/core';
import { buildApp } from './app.js';

describe('runtime target routes', () => {
  it('returns 503 when runtime target service is missing', async () => {
    const app = buildApp({});

    const response = await app.inject({ method: 'GET', url: '/api/runtime-targets' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ message: 'Runtime target service is not configured' });
  });

  it('lists and updates runtime targets through the injected service', async () => {
    const runtimeTarget = {
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
    };
    const runtimeTargetService = {
      listRuntimeTargets: vi.fn(() => [runtimeTarget]),
      getRuntimeTarget: vi.fn(() => runtimeTarget),
      getOverlay: vi.fn(),
      upsertOverlay: vi.fn(),
      clearOverlay: vi.fn(() => true),
    };
    const app = buildApp({
      runtimeTargetService: runtimeTargetService as never,
    });

    const listed = await app.inject({ method: 'GET', url: '/api/runtime-targets' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ runtime_targets: [runtimeTarget] });

    const inspected = await app.inject({ method: 'GET', url: '/api/runtime-targets/cc-connect:agora-claude' });
    expect(inspected.statusCode).toBe(200);
    expect(inspected.json()).toEqual({ runtime_target: runtimeTarget });

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/runtime-targets/cc-connect:agora-claude/overlay',
      payload: {
        display_name: 'Claude Headless',
        presentation_mode: 'headless',
        tags: ['review'],
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(runtimeTargetService.upsertOverlay).toHaveBeenCalledWith('cc-connect:agora-claude', {
      display_name: 'Claude Headless',
      presentation_mode: 'headless',
      tags: ['review'],
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/runtime-targets/cc-connect:agora-claude/overlay',
    });
    expect(deleted.statusCode).toBe(200);
    expect(runtimeTargetService.clearOverlay).toHaveBeenCalledWith('cc-connect:agora-claude');
  });

  it('returns 404 when runtime target is missing', async () => {
    const runtimeTargetService = {
      listRuntimeTargets: vi.fn(() => []),
      getRuntimeTarget: vi.fn(() => {
        throw new NotFoundError('Runtime target cc-connect:missing not found');
      }),
      getOverlay: vi.fn(),
      upsertOverlay: vi.fn(),
      clearOverlay: vi.fn(),
    };
    const app = buildApp({
      runtimeTargetService: runtimeTargetService as never,
    });

    const response = await app.inject({ method: 'GET', url: '/api/runtime-targets/cc-connect:missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Runtime target cc-connect:missing not found' });
  });
});
