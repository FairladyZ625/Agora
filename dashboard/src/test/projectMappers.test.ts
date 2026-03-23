import { describe, expect, it } from 'vitest';
import {
  mapProjectDto,
  mapProjectNomosStateDto,
  mapProjectTaskSummaryDto,
  mapProjectTodoSummaryDto,
  mapProjectWorkbenchDto,
} from '@/lib/projectMappers';
import type { ApiProjectDto, ApiProjectWorkbenchDto, ApiTaskDto, ApiTodoDto } from '@/types/api';

describe('project mappers', () => {
  it('maps project summaries and reads nomos metadata when present', () => {
    const dto = {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Alpha summary',
      owner: 'archon',
      status: 'active',
      metadata: {
        repo_path: '/tmp/proj-alpha',
        agora: {
          nomos: {
            id: 'agora/default',
          },
        },
      },
      created_at: '2026-03-23T00:00:00.000Z',
      updated_at: '2026-03-23T01:00:00.000Z',
    } as ApiProjectDto;

    expect(mapProjectDto(dto)).toEqual({
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Alpha summary',
      owner: 'archon',
      status: 'active',
      nomosId: 'agora/default',
      repoPath: '/tmp/proj-alpha',
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T01:00:00.000Z',
    });
  });

  it('falls back when project metadata is malformed or absent', () => {
    const dto = {
      id: 'proj-beta',
      name: 'Project Beta',
      summary: 'Beta summary',
      owner: 'archon',
      status: 'active',
      metadata: {
        repo_path: 42,
        agora: 'invalid',
      },
      created_at: '2026-03-23T00:00:00.000Z',
      updated_at: '2026-03-23T01:00:00.000Z',
    } as unknown as ApiProjectDto;

    expect(mapProjectDto(dto)).toMatchObject({
      nomosId: null,
      repoPath: null,
    });
  });

  it('maps project nomos state, task summaries, and todo summaries', () => {
    expect(mapProjectNomosStateDto({
      nomos_id: 'agora/default',
      activation_status: 'active_builtin',
      project_state_root: '/tmp/state',
      profile_path: '/tmp/state/profile.toml',
      profile_installed: true,
      repo_path: '/tmp/repo',
      repo_shim_installed: false,
      bootstrap_prompts_dir: '/tmp/state/prompts',
      lifecycle_modules: ['bootstrap', 'closeout'],
      draft_root: '/tmp/state/nomos/project-nomos',
      draft_profile_path: '/tmp/state/nomos/project-nomos/profile.toml',
      draft_profile_installed: true,
      active_root: '/tmp/state',
      active_profile_path: '/tmp/state/profile.toml',
      active_profile_installed: true,
    })).toEqual({
      nomosId: 'agora/default',
      activationStatus: 'active_builtin',
      projectStateRoot: '/tmp/state',
      profilePath: '/tmp/state/profile.toml',
      profileInstalled: true,
      repoPath: '/tmp/repo',
      repoShimInstalled: false,
      bootstrapPromptsDir: '/tmp/state/prompts',
      lifecycleModules: ['bootstrap', 'closeout'],
      draftRoot: '/tmp/state/nomos/project-nomos',
      draftProfilePath: '/tmp/state/nomos/project-nomos/profile.toml',
      draftProfileInstalled: true,
      activeRoot: '/tmp/state',
      activeProfilePath: '/tmp/state/profile.toml',
      activeProfileInstalled: true,
    });

    const task = {
      id: 'OC-123',
      title: 'Implement project mapper tests',
      state: 'active',
      project_id: 'proj-alpha',
    } as ApiTaskDto;
    expect(mapProjectTaskSummaryDto(task)).toEqual({
      id: 'OC-123',
      title: 'Implement project mapper tests',
      state: 'active',
      projectId: 'proj-alpha',
    });

    const todo = {
      id: 1,
      text: 'Review workbench mapping',
      status: 'open',
      project_id: 'proj-alpha',
      due: null,
      created_at: '2026-03-23T00:00:00.000Z',
      completed_at: null,
      tags: [],
      promoted_to: null,
    } as ApiTodoDto;
    expect(mapProjectTodoSummaryDto(todo)).toEqual({
      id: 1,
      text: 'Review workbench mapping',
      status: 'open',
      projectId: 'proj-alpha',
    });
  });

  it('maps project workbench docs, recaps, knowledge, and citizens', () => {
    const dto = {
      project: {
        id: 'proj-alpha',
        name: 'Project Alpha',
        summary: 'Alpha summary',
        owner: 'archon',
        status: 'active',
        metadata: {
          repo_path: '/tmp/proj-alpha',
          agora: {
            nomos: {
              id: 'agora/default',
            },
          },
        },
        created_at: '2026-03-23T00:00:00.000Z',
        updated_at: '2026-03-23T01:00:00.000Z',
      },
      index: {
        title: 'Project Index',
        path: 'docs/index.md',
        content: '# Index',
        updated_at: '2026-03-23T02:00:00.000Z',
      },
      timeline: {
        title: 'Project Timeline',
        path: 'docs/timeline.md',
        content: '# Timeline',
        source_task_ids: ['OC-123'],
        updated_at: '2026-03-23T03:00:00.000Z',
      },
      recaps: [{
        task_id: 'OC-123',
        title: 'Task recap',
        path: 'docs/recaps/OC-123.md',
        content: 'done',
        updated_at: '2026-03-23T04:00:00.000Z',
      }],
      knowledge: [{
        kind: 'knowledge',
        slug: 'system-map',
        title: 'System Map',
        path: 'docs/knowledge/system-map.md',
        content: 'map',
        source_task_ids: ['OC-123'],
        updated_at: '2026-03-23T05:00:00.000Z',
      }],
      citizens: [{
        citizen_id: 'citizen-1',
        role_id: 'architect',
        display_name: 'Architect',
        status: 'active',
        persona: 'Lead architect',
        boundaries: ['core only'],
        skills_ref: ['skill://architecture'],
        channel_policies: ['dashboard'],
        brain_scaffold_mode: 'full',
        runtime_projection: {
          adapter: 'openclaw',
          metadata: { provider: 'codex' },
        },
      }],
    } as unknown as ApiProjectWorkbenchDto;

    expect(mapProjectWorkbenchDto(dto)).toEqual({
      project: {
        id: 'proj-alpha',
        name: 'Project Alpha',
        summary: 'Alpha summary',
        owner: 'archon',
        status: 'active',
        nomosId: 'agora/default',
        repoPath: '/tmp/proj-alpha',
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T01:00:00.000Z',
      },
      nomos: null,
      index: {
        kind: 'index',
        slug: 'index',
        title: 'Project Index',
        path: 'docs/index.md',
        content: '# Index',
        updatedAt: '2026-03-23T02:00:00.000Z',
      },
      timeline: {
        kind: 'timeline',
        slug: 'timeline',
        title: 'Project Timeline',
        path: 'docs/timeline.md',
        content: '# Timeline',
        sourceTaskIds: ['OC-123'],
        updatedAt: '2026-03-23T03:00:00.000Z',
      },
      recaps: [{
        taskId: 'OC-123',
        title: 'Task recap',
        summaryPath: 'docs/recaps/OC-123.md',
        content: 'done',
        updatedAt: '2026-03-23T04:00:00.000Z',
      }],
      knowledge: [{
        kind: 'knowledge',
        slug: 'system-map',
        title: 'System Map',
        path: 'docs/knowledge/system-map.md',
        content: 'map',
        sourceTaskIds: ['OC-123'],
        updatedAt: '2026-03-23T05:00:00.000Z',
      }],
      citizens: [{
        citizenId: 'citizen-1',
        roleId: 'architect',
        displayName: 'Architect',
        status: 'active',
        persona: 'Lead architect',
        boundaries: ['core only'],
        skillsRef: ['skill://architecture'],
        channelPolicies: ['dashboard'],
        brainScaffoldMode: 'full',
        runtimeAdapter: 'openclaw',
        runtimeMetadata: { provider: 'codex' },
      }],
      tasks: [],
      todos: [],
    });
  });

  it('keeps nullable workbench docs as null', () => {
    const dto = {
      project: {
        id: 'proj-null',
        name: 'Project Null',
        summary: 'No docs yet',
        owner: 'archon',
        status: 'active',
        metadata: null,
        created_at: '2026-03-23T00:00:00.000Z',
        updated_at: '2026-03-23T01:00:00.000Z',
      },
      index: null,
      timeline: null,
      recaps: [],
      knowledge: [],
      citizens: [],
    } as unknown as ApiProjectWorkbenchDto;

    expect(mapProjectWorkbenchDto(dto)).toMatchObject({
      index: null,
      timeline: null,
      recaps: [],
      knowledge: [],
      citizens: [],
    });
  });
});
