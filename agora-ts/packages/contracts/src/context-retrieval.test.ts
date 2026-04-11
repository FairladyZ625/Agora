import { describe, expect, it } from 'vitest';
import {
  retrievalHealthSchema,
  retrievalPlanSchema,
  retrievalResultSchema,
} from './context-retrieval.js';

describe('context retrieval contracts', () => {
  it('accepts a task-scoped retrieval plan', () => {
    const parsed = retrievalPlanSchema.parse({
      scope: 'project_brain',
      mode: 'task_context',
      query: { text: 'runtime boundary' },
      limit: 5,
      context: {
        task_id: 'OC-200',
        project_id: 'proj-brain',
        audience: 'controller',
      },
    });

    expect(parsed).toEqual(expect.objectContaining({
      scope: 'project_brain',
      mode: 'task_context',
      limit: 5,
    }));
  });

  it('rejects blank retrieval query text', () => {
    expect(() => retrievalPlanSchema.parse({
      scope: 'project_brain',
      mode: 'task_context',
      query: { text: '   ' },
    })).toThrow();
  });

  it('accepts a normalized retrieval result and health snapshot', () => {
    expect(retrievalResultSchema.parse({
      scope: 'project_brain',
      provider: 'project_brain',
      reference_key: 'decision:runtime-boundary#chunk-1',
      project_id: 'proj-brain',
      title: 'Runtime Boundary',
      path: '/brain/decision/runtime-boundary.md',
      preview: 'Keep runtime-specific logic out of core.',
      score: 3.91,
      metadata: {
        retrieval_mode: 'hybrid',
      },
    })).toEqual(expect.objectContaining({
      provider: 'project_brain',
    }));

    expect(retrievalHealthSchema.parse({
      scope: 'project_brain',
      provider: 'project_brain',
      status: 'ready',
      message: 'ok',
    })).toEqual(expect.objectContaining({
      status: 'ready',
    }));
  });
});
