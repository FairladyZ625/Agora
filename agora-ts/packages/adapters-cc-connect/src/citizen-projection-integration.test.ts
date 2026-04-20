import { describe, expect, it } from 'vitest';
import type { CitizenDefinitionDto, CreateCitizenRequestDto, RoleDefinitionRecord } from '@agora-ts/contracts';
import { CitizenService } from '@agora-ts/core';
import { CcConnectCitizenProjectionAdapter } from './citizen-projection-adapter.js';

class InMemoryCitizenRepository {
  private readonly citizens = new Map<string, CitizenDefinitionDto>();

  insertCitizen(input: CreateCitizenRequestDto): CitizenDefinitionDto {
    const citizen: CitizenDefinitionDto = {
      citizen_id: input.citizen_id,
      project_id: input.project_id,
      role_id: input.role_id,
      display_name: input.display_name,
      persona: input.persona,
      boundaries: [...input.boundaries],
      skills_ref: [...input.skills_ref],
      channel_policies: { ...input.channel_policies },
      brain_scaffold_mode: input.brain_scaffold_mode,
      runtime_projection: {
        adapter: input.runtime_projection.adapter,
        auto_provision: input.runtime_projection.auto_provision,
        metadata: { ...input.runtime_projection.metadata },
      },
      status: 'active',
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    };
    this.citizens.set(citizen.citizen_id, citizen);
    return citizen;
  }

  getCitizen(citizenId: string): CitizenDefinitionDto | null {
    return this.citizens.get(citizenId) ?? null;
  }

  listCitizens(projectId?: string, status?: CitizenDefinitionDto['status']): CitizenDefinitionDto[] {
    return Array.from(this.citizens.values()).filter((citizen) => {
      if (projectId && citizen.project_id !== projectId) {
        return false;
      }
      if (status && citizen.status !== status) {
        return false;
      }
      return true;
    });
  }
}

describe('CcConnectCitizenProjectionAdapter integration', () => {
  it('renders a cc-connect projection preview through CitizenService without package-root imports', () => {
    const role: RoleDefinitionRecord = {
      id: 'architect',
      version: 1,
      name: 'Architect',
      member_kind: 'citizen',
      source: 'test',
      source_ref: null,
      summary: 'Design systems.',
      prompt_asset_path: 'roles/architect.md',
      default_model_preference: null,
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
      payload: {
        id: 'architect',
        name: 'Architect',
        member_kind: 'citizen',
        summary: 'Design systems.',
        prompt_asset: 'roles/architect.md',
        source: 'test',
        source_ref: null,
        default_model_preference: null,
        allowed_target_kinds: ['runtime_agent'],
        citizen_scaffold: {
          soul: 'Think in systems.',
          boundaries: ['Stay core-first.'],
          heartbeat: ['Restate objective.'],
          recap_expectations: ['Summarize next step.'],
        },
        metadata: {},
      },
    };
    const service = new CitizenService({
      repository: new InMemoryCitizenRepository() as never,
      projectService: {
        requireProject: () => ({
          id: 'proj-alpha',
          name: 'Project Alpha',
          summary: null,
          owner: null,
          status: 'active',
        }),
      } as never,
      rolePackService: {
        getRoleDefinition: () => role,
      } as never,
      projectionPorts: [new CcConnectCitizenProjectionAdapter()],
    });

    service.createCitizen({
      citizen_id: 'citizen-cc',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'CC Architect',
      persona: 'Systems thinker',
      boundaries: ['Keep provider state outside core.'],
      skills_ref: ['system-design'],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'cc-connect',
        auto_provision: false,
        metadata: {},
      },
    });

    const preview = service.previewProjection('citizen-cc');

    expect(preview.adapter).toBe('cc-connect');
    expect(preview.files).toEqual([
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/profile.json',
      }),
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/brain/03-citizen-scaffold.md',
      }),
    ]);
    expect(preview.files[1]?.content).toContain('bridge_host: `cc-connect`');
    expect(preview.files[1]?.content).toContain('Keep provider state outside core.');
    expect(preview.metadata).toEqual({
      project_id: 'proj-alpha',
      role_id: 'architect',
      auto_provision: false,
      bridge_host: 'cc-connect',
    });
  });
});
