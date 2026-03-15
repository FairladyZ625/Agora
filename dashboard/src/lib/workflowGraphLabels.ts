export function resolveWorkflowExecutionKindLabel(
  value: string | null | undefined,
  labels: Record<string, string>,
) {
  if (!value) {
    return labels.default ?? 'stage';
  }
  return labels[value] ?? value;
}

export function resolveWorkflowGateLabel(
  value: string | null | undefined,
  labels: Record<string, string>,
) {
  if (!value) {
    return labels.none ?? 'open';
  }
  return labels[value] ?? value;
}
