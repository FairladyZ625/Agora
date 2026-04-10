import { describe, expect, it } from 'vitest';
import { attentionRoutingPlanSchema } from './attention-routing.js';

describe('attention routing contracts', () => {
  it('accepts an ordered attention routing plan', () => {
    const parsed = attentionRoutingPlanSchema.parse({
      scope: 'project_brain',
      mode: 'bootstrap',
      project_id: 'proj-brain',
      task_id: 'OC-200',
      audience: 'craftsman',
      summary: 'Start from the project map, then focus on task-matched references.',
      routes: [
        {
          reference_key: 'index:index',
          kind: 'project_map',
          ordinal: 1,
          rationale: 'Start here for project structure and canonical entrypoints.',
        },
        {
          reference_key: 'decision:runtime-boundary',
          kind: 'focus',
          ordinal: 2,
          rationale: 'Matched the current task query in project brain retrieval.',
          score: 4.2,
        },
      ],
    });

    expect(parsed.routes[0]?.kind).toBe('project_map');
    expect(parsed.routes[1]?.reference_key).toBe('decision:runtime-boundary');
  });
});
