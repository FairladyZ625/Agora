import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@agora-ts/core';
import { buildApp } from './app.js';

describe('project runtime policy routes', () => {
  it('reads and updates project runtime policy through project service', async () => {
    const runtimePolicy = {
      runtime_targets: {
        default_coding: 'cc-connect:agora-codex',
        default_review: 'cc-connect:agora-claude',
      },
      role_runtime_policy: {
        reviewer: {
          preferred_flavor: 'claude-code',
        },
      },
    };
    const projectService = {
      getProjectRuntimePolicy: vi.fn(() => runtimePolicy),
      updateProjectRuntimePolicy: vi.fn(() => runtimePolicy),
    };
    const app = buildApp({
      projectService: projectService as never,
    });

    const shown = await app.inject({ method: 'GET', url: '/api/projects/proj-agora/runtime-policy' });
    expect(shown.statusCode).toBe(200);
    expect(shown.json()).toEqual({
      project_id: 'proj-agora',
      runtime_policy: runtimePolicy,
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/projects/proj-agora/runtime-policy',
      payload: {
        runtime_targets: {
          default_coding: 'cc-connect:agora-codex',
          default_review: 'cc-connect:agora-claude',
        },
        role_runtime_policy: {
          reviewer: {
            preferred_flavor: 'claude-code',
          },
        },
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(projectService.updateProjectRuntimePolicy).toHaveBeenCalledWith('proj-agora', {
      runtime_targets: {
        default_coding: 'cc-connect:agora-codex',
        default_review: 'cc-connect:agora-claude',
      },
      role_runtime_policy: {
        reviewer: {
          preferred_flavor: 'claude-code',
        },
      },
    });
  });

  it('returns 404 when project runtime policy target project is missing', async () => {
    const projectService = {
      getProjectRuntimePolicy: vi.fn(() => {
        throw new NotFoundError('Project not found: proj-missing');
      }),
      updateProjectRuntimePolicy: vi.fn(),
    };
    const app = buildApp({
      projectService: projectService as never,
    });

    const response = await app.inject({ method: 'GET', url: '/api/projects/proj-missing/runtime-policy' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Project not found: proj-missing' });
  });
});
