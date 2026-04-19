export function summarizeProjectDocument(content: string, fallback: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '---' && !line.startsWith('title:') && !line.startsWith('updated_at:'));
  return lines.find((line) => !line.startsWith('#')) ?? lines[0] ?? fallback;
}

export function renderWorkspaceJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function formatWorkspaceTimestamp(value: string | null | undefined) {
  return value ?? '-';
}

export function humanizeWorkspaceFallback(value: string) {
  return value
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}
