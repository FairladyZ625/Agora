import { describe, expect, it } from 'vitest';
import {
  citizenDefinitionSchema,
  citizenProjectionPreviewSchema,
  createCitizenRequestSchema,
  listCitizensResponseSchema,
} from './citizen.js';

describe('citizen contracts', () => {
  it('parses create citizen payloads', () => {
    expect(createCitizenRequestSchema.parse({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: 'thinks in systems',
      boundaries: ['stay core-first'],
      skills_ref: ['system-design'],
      runtime_projection: {
        adapter: 'openclaw',
      },
    })).toMatchObject({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
      },
    });
  });

  it('parses citizen records and projection previews', () => {
    expect(citizenDefinitionSchema.parse({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: null,
      boundaries: [],
      skills_ref: [],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: {},
      },
      status: 'active',
      created_at: '2026-03-16T00:00:00.000Z',
      updated_at: '2026-03-16T00:00:00.000Z',
    }).status).toBe('active');

    expect(listCitizensResponseSchema.parse({
      citizens: [{
        citizen_id: 'citizen-alpha',
        project_id: 'proj-alpha',
        role_id: 'architect',
        display_name: 'Alpha Architect',
        persona: null,
        boundaries: [],
        skills_ref: [],
        channel_policies: {},
        brain_scaffold_mode: 'role_default',
        runtime_projection: {
          adapter: 'openclaw',
          auto_provision: false,
          metadata: {},
        },
        status: 'active',
        created_at: '2026-03-16T00:00:00.000Z',
        updated_at: '2026-03-16T00:00:00.000Z',
      }],
    }).citizens).toHaveLength(1);

    expect(citizenProjectionPreviewSchema.parse({
      citizen_id: 'citizen-alpha',
      adapter: 'openclaw',
      summary: 'preview',
      files: [{
        path: 'citizens/citizen-alpha/profile.json',
        content: '{}',
      }],
      metadata: {},
    }).adapter).toBe('openclaw');
  });
});
