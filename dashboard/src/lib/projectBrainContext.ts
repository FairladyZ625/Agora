export type ProjectBrainSourceKind = 'knowledge' | 'recap' | 'citizen';

export type ProjectBrainSourceContext = {
  kind: ProjectBrainSourceKind;
  projectId: string;
  title: string;
  sourceRef: string;
  sourceTaskIds: string[];
  snippet: string;
};

export type ProjectBrainDraftLabels = {
  sourceContextTitle: string;
  sourceKindLabel: string;
  sourceTitleLabel: string;
  sourceRefLabel: string;
  sourceTaskIdsLabel: string;
  sourceSnippetLabel: string;
  sourceKindLabels: Record<ProjectBrainSourceKind, string>;
};

function normalizeSnippet(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '---' && !line.startsWith('title:') && !line.startsWith('updated_at:'))
    .find((line) => !line.startsWith('#'))
    ?? '';
}

export function buildProjectBrainSourceContextHref(context: ProjectBrainSourceContext) {
  const params = new URLSearchParams();
  params.set('project', context.projectId);
  params.set('source_kind', context.kind);
  params.set('source_title', context.title);
  params.set('source_ref', context.sourceRef);
  if (context.sourceTaskIds.length > 0) {
    params.set('source_task_ids', context.sourceTaskIds.join(','));
  }
  if (context.snippet) {
    params.set('source_snippet', context.snippet);
  }
  return `/tasks/new?${params.toString()}`;
}

export function parseProjectBrainSourceContext(search: string): ProjectBrainSourceContext | null {
  const params = new URLSearchParams(search);
  const kind = params.get('source_kind');
  const projectId = params.get('project');
  const title = params.get('source_title');
  const sourceRef = params.get('source_ref');
  if (!projectId || !title || !sourceRef || (kind !== 'knowledge' && kind !== 'recap' && kind !== 'citizen')) {
    return null;
  }
  const sourceTaskIds = (params.get('source_task_ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return {
    kind,
    projectId,
    title,
    sourceRef,
    sourceTaskIds,
    snippet: params.get('source_snippet')?.trim() ?? '',
  };
}

export function buildProjectBrainDraftPreamble(
  context: ProjectBrainSourceContext,
  labels: ProjectBrainDraftLabels,
) {
  const lines = [
    `[${labels.sourceContextTitle}]`,
    `${labels.sourceKindLabel}: ${labels.sourceKindLabels[context.kind]}`,
    `${labels.sourceTitleLabel}: ${context.title}`,
  ];
  if (context.sourceTaskIds.length > 0) {
    lines.push(`${labels.sourceTaskIdsLabel}: ${context.sourceTaskIds.join(', ')}`);
  }
  lines.push(`${labels.sourceRefLabel}: ${context.sourceRef}`);
  const snippet = normalizeSnippet(context.snippet);
  if (snippet) {
    lines.push(`${labels.sourceSnippetLabel}: ${snippet}`);
  }
  return `${lines.join('\n')}\n\n`;
}

export function summarizeProjectBrainContent(content: string, fallbackTitle: string) {
  return normalizeSnippet(content) || fallbackTitle;
}
