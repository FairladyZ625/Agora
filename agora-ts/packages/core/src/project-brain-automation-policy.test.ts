import { describe, expect, it } from 'vitest';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';

function doc(kind: ProjectBrainDocument['kind'], slug: string, updatedAt: string, title?: string): ProjectBrainDocument {
  return {
    project_id: 'proj-policy',
    kind,
    slug,
    title: title ?? slug,
    path: `/brain/${kind}/${slug}.md`,
    content: `${kind}:${slug}`,
    created_at: updatedAt,
    updated_at: updatedAt,
    source_task_ids: kind === 'recap' ? [slug] : [],
  };
}

describe('project brain automation policy', () => {
  it('keeps controller bootstrap broad and craftsman bootstrap narrow', () => {
    const policy = new ProjectBrainAutomationPolicy();
    const documents = [
      doc('index', 'index', '2026-03-16T09:00:00.000Z', 'Index'),
      doc('timeline', 'timeline', '2026-03-16T09:00:00.000Z', 'Timeline'),
      doc('recap', 'OC-201', '2026-03-16T08:00:00.000Z', 'Recap'),
      doc('fact', 'core-first', '2026-03-16T07:00:00.000Z', 'Fact'),
      doc('decision', 'runtime-boundary', '2026-03-16T06:00:00.000Z', 'Decision'),
      doc('citizen_scaffold', 'citizen-alpha', '2026-03-16T05:00:00.000Z', 'Citizen'),
    ];

    const controller = policy.selectBootstrapDocuments(documents, {
      audience: 'controller',
    });
    const craftsman = policy.selectBootstrapDocuments(documents, {
      audience: 'craftsman',
    });

    expect(controller).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index' }),
        expect.objectContaining({ kind: 'timeline' }),
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );
    expect(craftsman).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index' }),
        expect.objectContaining({ kind: 'timeline' }),
      ]),
    );
    expect(craftsman.some((item) => item.kind === 'citizen_scaffold')).toBe(false);
  });
});
