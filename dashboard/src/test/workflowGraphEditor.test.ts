import { describe, expect, it } from 'vitest';
import { resolveGraphConnectionCandidate } from '@/lib/workflowGraphEditor';

const graph = {
  nodes: [
    { id: 'discuss' },
    { id: 'develop' },
    { id: 'review' },
  ],
};

describe('workflow graph editor helpers', () => {
  it('rejects incomplete or invalid connections', () => {
    expect(resolveGraphConnectionCandidate(graph, { source: null, target: 'develop' })).toBeNull();
    expect(resolveGraphConnectionCandidate(graph, { source: 'discuss', target: null })).toBeNull();
    expect(resolveGraphConnectionCandidate(graph, { source: 'missing', target: 'develop' })).toBeNull();
    expect(resolveGraphConnectionCandidate(graph, { source: 'develop', target: 'develop' })).toBeNull();
  });

  it('classifies forward connections as advance edges', () => {
    expect(resolveGraphConnectionCandidate(graph, { source: 'discuss', target: 'review' })).toEqual({
      source: 'discuss',
      target: 'review',
      kind: 'advance',
    });
  });

  it('classifies backward connections as reject edges', () => {
    expect(resolveGraphConnectionCandidate(graph, { source: 'review', target: 'develop' })).toEqual({
      source: 'review',
      target: 'develop',
      kind: 'reject',
    });
  });
});
