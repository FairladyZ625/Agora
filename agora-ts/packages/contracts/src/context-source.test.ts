import { describe, expect, it } from 'vitest';
import { contextSourceBindingSchema } from './context-source.js';

describe('context source contracts', () => {
  it('accepts a project-scoped context source binding', () => {
    const parsed = contextSourceBindingSchema.parse({
      source_id: 'docs-architecture',
      scope: 'project',
      project_id: 'proj-brain',
      kind: 'docs_repo',
      label: 'Architecture Docs',
      location: '/repo/docs/architecture',
      access: 'read_only',
      enabled: true,
    });

    expect(parsed).toEqual(expect.objectContaining({
      source_id: 'docs-architecture',
      scope: 'project',
      kind: 'docs_repo',
    }));
  });

  it('rejects blank source ids and locations', () => {
    expect(() => contextSourceBindingSchema.parse({
      source_id: '   ',
      scope: 'project',
      kind: 'local_path',
      label: 'Brain',
      location: '   ',
    })).toThrow();
  });
});
