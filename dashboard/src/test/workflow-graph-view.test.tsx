import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkflowGraphView } from '@/components/features/WorkflowGraphView';

describe('workflow graph view', () => {
  it('falls back to inferred layout, skips broken edges, and highlights the current node', () => {
    const { container } = render(
      <WorkflowGraphView
        testId="workflow-graph"
        currentNodeId="review"
        nodes={[
          { id: 'draft', label: 'Draft', kindLabel: 'discuss', gateLabel: null, isEntry: false },
          { id: 'review', label: 'Review', kindLabel: null, gateLabel: 'approval', isEntry: false },
          { id: 'handoff', label: 'Handoff', kindLabel: 'execute', gateLabel: 'open', isEntry: false },
          { id: 'revise', label: 'Revise', kindLabel: 'execute', gateLabel: 'command', isEntry: false },
        ]}
        edges={[
          { id: 'draft-review', from: 'draft', to: 'review', kind: 'advance' },
          { id: 'handoff-review', from: 'handoff', to: 'review', kind: 'advance' },
          { id: 'review-revise', from: 'review', to: 'revise', kind: 'advance' },
          { id: 'review-draft', from: 'review', to: 'draft', kind: 'reject' },
          { id: 'ghost-draft', from: 'ghost', to: 'draft', kind: 'advance' },
        ]}
      />,
    );

    const graph = screen.getByTestId('workflow-graph');
    expect(graph).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Revise')).toBeInTheDocument();

    const currentNode = screen.getByText('Review').closest('.workflow-graph-view__node');
    expect(currentNode).toHaveClass('workflow-graph-view__node--current');

    const renderedPaths = Array.from(container.querySelectorAll('.template-graph-overlay__path'));
    expect(renderedPaths).toHaveLength(4);
  });
});
