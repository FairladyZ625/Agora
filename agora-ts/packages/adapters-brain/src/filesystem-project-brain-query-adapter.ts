import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  ProjectBrainAppendInput,
  ProjectBrainDocument,
  ProjectBrainDocumentKind,
  ProjectKnowledgeKind,
  ProjectBrainQueryPort,
  ProjectBrainSearchResult,
} from '@agora-ts/core';
import { appendMarkdownBlock, extractMarkdownHeading, parseMarkdownFrontmatter, renderMarkdownFrontmatter, stripMarkdownFrontmatter } from '@agora-ts/core';
import { FilesystemProjectKnowledgeAdapter, type FilesystemProjectKnowledgeAdapterOptions } from './filesystem-project-knowledge-adapter.js';

export type FilesystemProjectBrainQueryAdapterOptions = FilesystemProjectKnowledgeAdapterOptions;

export class FilesystemProjectBrainQueryAdapter implements ProjectBrainQueryPort {
  private readonly knowledge: FilesystemProjectKnowledgeAdapter;

  constructor(private readonly options: FilesystemProjectBrainQueryAdapterOptions) {
    this.knowledge = new FilesystemProjectKnowledgeAdapter(options);
  }

  listDocuments(projectId: string, kind?: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>): ProjectBrainDocument[] {
    const docs: ProjectBrainDocument[] = [];
    if (!kind || kind === 'index') {
      const index = this.knowledge.getProjectIndex(projectId);
      if (index) {
        docs.push(index);
      }
    }
    if (!kind || kind === 'timeline') {
      const timeline = this.getTimeline(projectId);
      if (timeline) {
        docs.push(timeline);
      }
    }
    if (!kind || kind === 'recap') {
      docs.push(...this.listRecapDocuments(projectId));
    }
    if (!kind || isKnowledgeKind(kind)) {
      docs.push(...this.knowledge.listKnowledgeEntries(projectId, isKnowledgeKind(kind) ? kind : undefined));
    }
    return docs.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  getDocument(projectId: string, kind: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>, slug?: string): ProjectBrainDocument | null {
    switch (kind) {
      case 'index':
        return this.knowledge.getProjectIndex(projectId);
      case 'timeline':
        return this.getTimeline(projectId);
      case 'recap':
        return slug ? this.getRecap(projectId, slug) : null;
      default:
        return slug ? this.knowledge.getKnowledgeEntry(projectId, kind, slug) : null;
    }
  }

  queryDocuments(projectId: string, query: string, kind?: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>): ProjectBrainSearchResult[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    return this.listDocuments(projectId, kind)
      .filter((doc) => `${doc.title ?? ''}\n${doc.content}\n${doc.path}`.toLowerCase().includes(needle))
      .map((doc) => ({
        project_id: doc.project_id,
        kind: doc.kind,
        slug: doc.slug,
        title: doc.title,
        path: doc.path,
        snippet: buildSnippet(doc.content, needle),
      }));
  }

  appendDocument(input: ProjectBrainAppendInput): ProjectBrainDocument {
    if (input.kind === 'timeline') {
      return this.appendTimeline(input);
    }
    return this.appendKnowledgeDocument({
      ...input,
      kind: input.kind,
    });
  }

  private getTimeline(projectId: string): ProjectBrainDocument | null {
    const path = this.timelinePath(projectId);
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf8');
    const parsed = parseMarkdownFrontmatter(content);
    const stats = statSync(path);
    return {
      project_id: projectId,
      kind: 'timeline',
      slug: 'timeline',
      title: extractMarkdownHeading(content),
      path,
      content,
      created_at: parsed.attributes.created_at ?? stats.birthtime.toISOString(),
      updated_at: parsed.attributes.updated_at ?? stats.mtime.toISOString(),
      source_task_ids: [],
    };
  }

  private listRecapDocuments(projectId: string): ProjectBrainDocument[] {
    return this.knowledge.listProjectRecaps(projectId).map((recap) => this.getRecap(projectId, recap.task_id)).filter(Boolean) as ProjectBrainDocument[];
  }

  private getRecap(projectId: string, taskId: string): ProjectBrainDocument | null {
    const path = join(this.recapsDir(projectId), `${taskId}.md`);
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf8');
    const parsed = parseMarkdownFrontmatter(content);
    const stats = statSync(path);
    return {
      project_id: projectId,
      kind: 'recap',
      slug: taskId,
      title: extractMarkdownHeading(content),
      path,
      content,
      created_at: parsed.attributes.created_at ?? stats.birthtime.toISOString(),
      updated_at: parsed.attributes.updated_at ?? stats.mtime.toISOString(),
      source_task_ids: parsed.lists.source_task_ids ?? [],
    };
  }

  private appendTimeline(input: ProjectBrainAppendInput): ProjectBrainDocument {
    const existing = this.getTimeline(input.project_id);
    if (!existing) {
      throw new Error(`project timeline not found: ${input.project_id}`);
    }
    const body = stripMarkdownFrontmatter(existing.content);
    const updatedAt = new Date().toISOString();
    const nextBody = appendMarkdownBlock(body, input.body, input.heading);
    const next = `${renderMarkdownFrontmatter({
      doc_type: 'project_timeline',
      project_id: input.project_id,
      kind: 'timeline',
      slug: 'timeline',
      title: existing.title ?? `Timeline: ${input.project_id}`,
      created_at: existing.created_at,
      updated_at: updatedAt,
    })}${nextBody}`;
    writeFileSync(existing.path, next, 'utf8');
    return this.getTimeline(input.project_id)!;
  }

  private appendKnowledgeDocument(input: ProjectBrainAppendInput & { kind: ProjectKnowledgeKind }): ProjectBrainDocument {
    const slug = input.slug?.trim();
    if (!slug) {
      throw new Error('brain append for knowledge docs requires slug');
    }
    const existing = this.knowledge.getKnowledgeEntry(input.project_id, input.kind, slug);
    const existingParsed = existing ? parseMarkdownFrontmatter(existing.content) : null;
    const existingBody = existing ? extractKnowledgeBody(existing.content) : '';
    const nextBody = appendMarkdownBlock(existingBody, input.body, input.heading);
    return this.knowledge.upsertKnowledgeEntry({
      project_id: input.project_id,
      kind: input.kind,
      slug,
      title: existing?.title ?? input.title ?? slug,
      summary: input.summary ?? existingParsed?.attributes.summary ?? null,
      body: nextBody.trim(),
      source_task_ids: uniqueStrings([
        ...(existing?.source_task_ids ?? []),
        ...(input.source_task_ids ?? []),
      ]),
    });
  }

  private recapsDir(projectId: string) {
    return this.options.projectStateRootResolver?.(projectId)
      ? join(this.options.projectStateRootResolver(projectId)!, 'recaps')
      : resolve(this.options.brainPackRoot, 'project-index', projectId, 'recaps');
  }

  private timelinePath(projectId: string) {
    return this.options.projectStateRootResolver?.(projectId)
      ? join(this.options.projectStateRootResolver(projectId)!, 'timeline.md')
      : resolve(this.options.brainPackRoot, 'project-index', projectId, 'timeline.md');
  }
}

function isKnowledgeKind(value: ProjectBrainDocumentKind | undefined): value is ProjectKnowledgeKind {
  return value === 'decision' || value === 'fact' || value === 'open_question' || value === 'reference';
}

function extractKnowledgeBody(content: string) {
  const body = stripMarkdownFrontmatter(content).trim();
  const lines = body.split('\n');
  if (lines[0]?.startsWith('# ')) {
    lines.shift();
    while (lines[0] === '') {
      lines.shift();
    }
  }
  return lines.join('\n').trim();
}

function buildSnippet(content: string, needle: string) {
  const lower = content.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) {
    return content.slice(0, 160).replace(/\n+/g, ' ').trim();
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + needle.length + 100);
  return content.slice(start, end).replace(/\n+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
