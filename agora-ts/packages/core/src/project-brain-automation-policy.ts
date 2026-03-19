import type { ProjectBrainDocument } from './project-brain-query-port.js';

export type ProjectBrainAutomationAudience = 'controller' | 'citizen' | 'craftsman';

export interface ProjectBrainBootstrapSelectionInput {
  audience: ProjectBrainAutomationAudience;
  citizen_id?: string | null;
  task_id?: string;
  task_title?: string;
  task_description?: string;
  allowed_citizen_ids?: string[];
  preferred_document_keys?: string[];
}

export class ProjectBrainAutomationPolicy {
  selectBootstrapDocuments(
    documents: ProjectBrainDocument[],
    input: ProjectBrainBootstrapSelectionInput,
  ): ProjectBrainDocument[] {
    const sorted = [...documents].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    const preferredKeys = new Set(input.preferred_document_keys ?? []);
    const indexDoc = sorted.find((doc) => doc.kind === 'index');
    const timelineDoc = sorted.find((doc) => doc.kind === 'timeline');
    const recaps = prioritizeDocuments(sorted.filter((doc) => doc.kind === 'recap'), preferredKeys);
    const knowledge = prioritizeDocuments(sorted.filter((doc) => isKnowledgeKind(doc.kind)), preferredKeys);
    const citizenScaffolds = prioritizeDocuments(
      filterCitizenScaffolds(sorted.filter((doc) => doc.kind === 'citizen_scaffold'), input),
      preferredKeys,
    );

    const selected: ProjectBrainDocument[] = [];
    if (indexDoc) {
      selected.push(indexDoc);
    }
    if (timelineDoc) {
      selected.push(timelineDoc);
    }

    switch (input.audience) {
      case 'controller':
        selected.push(...recaps.slice(0, 3));
        selected.push(...knowledge.slice(0, 4));
        selected.push(...citizenScaffolds.slice(0, 4));
        break;
      case 'citizen':
        selected.push(...recaps.slice(0, 2));
        selected.push(...knowledge.slice(0, 3));
        selected.push(...citizenScaffolds.slice(0, 1));
        break;
      case 'craftsman':
        selected.push(...recaps.slice(0, 1));
        selected.push(...knowledge.slice(0, 2));
        selected.push(...citizenScaffolds.slice(0, 1));
        break;
    }

    return dedupeDocuments(selected);
  }
}

function filterCitizenScaffolds(
  citizenScaffolds: ProjectBrainDocument[],
  input: ProjectBrainBootstrapSelectionInput,
) {
  const allowedCitizenIds = resolveAllowedCitizenIds(input);
  if (!allowedCitizenIds) {
    return citizenScaffolds;
  }
  const allowed = new Set(allowedCitizenIds);
  return citizenScaffolds.filter((doc) => allowed.has(doc.slug));
}

function resolveAllowedCitizenIds(input: ProjectBrainBootstrapSelectionInput) {
  if (input.citizen_id) {
    return [input.citizen_id];
  }
  if (input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0) {
    return input.allowed_citizen_ids;
  }
  if (input.audience === 'craftsman') {
    return [];
  }
  if (input.task_id) {
    return [];
  }
  return null;
}

function prioritizeDocuments(documents: ProjectBrainDocument[], preferredKeys: Set<string>) {
  return [...documents].sort((left, right) => {
    const leftPreferred = preferredKeys.has(toDocumentKey(left)) ? 1 : 0;
    const rightPreferred = preferredKeys.has(toDocumentKey(right)) ? 1 : 0;
    if (leftPreferred !== rightPreferred) {
      return rightPreferred - leftPreferred;
    }
    return (right.updated_at ?? '').localeCompare(left.updated_at ?? '');
  });
}

function toDocumentKey(document: Pick<ProjectBrainDocument, 'kind' | 'slug'>) {
  return `${document.kind}:${document.slug}`;
}

function dedupeDocuments(documents: ProjectBrainDocument[]) {
  const seen = new Set<string>();
  const deduped: ProjectBrainDocument[] = [];
  for (const doc of documents) {
    const key = `${doc.kind}:${doc.slug}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(doc);
  }
  return deduped;
}

function isKnowledgeKind(kind: ProjectBrainDocument['kind']) {
  return kind === 'decision' || kind === 'fact' || kind === 'open_question' || kind === 'reference';
}
