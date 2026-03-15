export function resolveGraphConnectionCandidate(
  graph: { nodes: Array<{ id: string }> },
  connection: { source?: string | null; target?: string | null },
) {
  if (!connection.source || !connection.target) {
    return null;
  }

  const source = connection.source;
  const target = connection.target;
  const sourceIndex = graph.nodes.findIndex((node) => node.id === source);
  const targetIndex = graph.nodes.findIndex((node) => node.id === target);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return null;
  }

  return {
    source,
    target,
    kind: targetIndex > sourceIndex ? 'advance' : 'reject',
  } as const;
}
