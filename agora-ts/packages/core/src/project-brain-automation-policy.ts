import type { ProjectBrainDocument } from './project-brain-query-port.js';

export type ProjectBrainAutomationAudience = 'controller' | 'citizen' | 'craftsman';

export interface ProjectBrainBootstrapSelectionInput {
  audience: ProjectBrainAutomationAudience;
  citizen_id?: string | null;
}

export class ProjectBrainAutomationPolicy {
  selectBootstrapDocuments(
    documents: ProjectBrainDocument[],
    input: ProjectBrainBootstrapSelectionInput,
  ): ProjectBrainDocument[] {
    const sorted = [...documents].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    const indexDoc = sorted.find((doc) => doc.kind === 'index');
    const timelineDoc = sorted.find((doc) => doc.kind === 'timeline');
    const recaps = sorted.filter((doc) => doc.kind === 'recap');
    const knowledge = sorted.filter((doc) => isKnowledgeKind(doc.kind));
    const citizenScaffolds = sorted.filter((doc) => doc.kind === 'citizen_scaffold');

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
        selected.push(...this.selectCitizenScaffolds(citizenScaffolds, input.citizen_id, 4));
        break;
      case 'citizen':
        selected.push(...recaps.slice(0, 2));
        selected.push(...knowledge.slice(0, 3));
        selected.push(...this.selectCitizenScaffolds(citizenScaffolds, input.citizen_id, 1));
        break;
      case 'craftsman':
        selected.push(...recaps.slice(0, 1));
        selected.push(...knowledge.slice(0, 2));
        break;
    }

    return dedupeDocuments(selected);
  }

  private selectCitizenScaffolds(
    citizenScaffolds: ProjectBrainDocument[],
    citizenId: string | null | undefined,
    limit: number,
  ) {
    if (citizenId) {
      const matched = citizenScaffolds.find((doc) => doc.slug === citizenId);
      return matched ? [matched] : [];
    }
    return citizenScaffolds.slice(0, limit);
  }
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
