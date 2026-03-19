import { describe, expect, it } from 'vitest';
import { createProjectRequestSchema, listProjectsResponseSchema, projectSchema } from './project.js';

describe('project contracts', () => {
  it('parses create project payloads without requiring a caller-provided id', () => {
    expect(createProjectRequestSchema.parse({
      name: 'Alpha',
      summary: 'Thin slice',
      owner: 'archon',
    })).toMatchObject({
      name: 'Alpha',
      owner: 'archon',
    });
  });

  it('parses project records and list responses', () => {
    expect(projectSchema.parse({
      id: 'proj-alpha',
      name: 'Alpha',
      summary: null,
      status: 'active',
      owner: null,
      metadata: { tier: 'internal' },
      created_at: '2026-03-16T00:00:00.000Z',
      updated_at: '2026-03-16T00:00:00.000Z',
    }).status).toBe('active');

    expect(listProjectsResponseSchema.parse({
      projects: [{
        id: 'proj-alpha',
        name: 'Alpha',
        summary: null,
        status: 'active',
        owner: null,
        created_at: '2026-03-16T00:00:00.000Z',
        updated_at: '2026-03-16T00:00:00.000Z',
      }],
    }).projects).toHaveLength(1);
  });
});
