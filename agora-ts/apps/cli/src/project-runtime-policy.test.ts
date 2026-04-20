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

describe('project runtime policy cli', () => {
  it('shows project runtime policy through the injected project service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectService = {
      getProjectRuntimePolicy: vi.fn(() => ({
        runtime_targets: {
          default_coding: 'cc-connect:agora-codex',
          default_review: 'cc-connect:agora-claude',
        },
        role_runtime_policy: {
          reviewer: {
            preferred_flavor: 'claude-code',
          },
        },
      })),
    };
    const program = createCliProgram({
      projectService: projectService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['projects', 'runtime-policy', 'show', 'proj-agora', '--json'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectService.getProjectRuntimePolicy).toHaveBeenCalledWith('proj-agora');
    expect(JSON.parse(stdout.value)).toEqual({
      project_id: 'proj-agora',
      runtime_policy: {
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
  });

  it('updates project runtime policy through the injected project service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectService = {
      updateProjectRuntimePolicy: vi.fn(() => ({
        runtime_targets: {
          default_coding: 'cc-connect:agora-codex',
          default_review: 'cc-connect:agora-claude',
          flavors: {
            'claude-code': 'cc-connect:agora-claude',
          },
        },
        role_runtime_policy: {
          reviewer: {
            preferred_flavor: 'claude-code',
          },
        },
      })),
    };
    const program = createCliProgram({
      projectService: projectService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'runtime-policy', 'set', 'proj-agora',
      '--default-coding', 'cc-connect:agora-codex',
      '--default-review', 'cc-connect:agora-claude',
      '--flavor', 'claude-code=cc-connect:agora-claude',
      '--role-flavor', 'reviewer=claude-code',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectService.updateProjectRuntimePolicy).toHaveBeenCalledWith('proj-agora', {
      runtime_targets: {
        default_coding: 'cc-connect:agora-codex',
        default_review: 'cc-connect:agora-claude',
        flavors: {
          'claude-code': 'cc-connect:agora-claude',
        },
      },
      role_runtime_policy: {
        reviewer: {
          preferred_flavor: 'claude-code',
        },
      },
    });
    expect(JSON.parse(stdout.value)).toEqual({
      project_id: 'proj-agora',
      runtime_policy: {
        runtime_targets: {
          default_coding: 'cc-connect:agora-codex',
          default_review: 'cc-connect:agora-claude',
          flavors: {
            'claude-code': 'cc-connect:agora-claude',
          },
        },
        role_runtime_policy: {
          reviewer: {
            preferred_flavor: 'claude-code',
          },
        },
      },
    });
  });
});
