import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type {
  ProjectKnowledgeDocument,
  ProjectKnowledgeEntryInput,
  ProjectKnowledgeKind,
  ProjectKnowledgePort,
  ProjectKnowledgeProjectInput,
  ProjectKnowledgeRecapSummary,
  ProjectKnowledgeSearchResult,
  ProjectKnowledgeTaskBindingInput,
  ProjectKnowledgeTaskRecapInput,
} from '../project-knowledge-port.js';
import { extractMarkdownHeading, parseMarkdownFrontmatter, renderMarkdownFrontmatter } from './markdown-frontmatter.js';

export interface FilesystemProjectKnowledgeAdapterOptions {
  brainPackRoot: string;
}

export class FilesystemProjectKnowledgeAdapter implements ProjectKnowledgePort {
  constructor(private readonly options: FilesystemProjectKnowledgeAdapterOptions) {}

  ensureProject(input: ProjectKnowledgeProjectInput): void {
    const root = this.projectRoot(input.id);
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, 'recaps'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'decisions'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'facts'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'open-questions'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'references'), { recursive: true });
    mkdirSync(join(root, 'tasks'), { recursive: true });
    if (!existsSync(this.timelinePath(input.id))) {
      writeFileSync(this.timelinePath(input.id), renderTimelineHeader(input.id, input.name), 'utf8');
    }
    this.rewriteProjectIndex(input);
    this.appendTimeline(input.id, [
      `- ${new Date().toISOString()} | project_created | ${input.name} | status=${input.status}`,
    ]);
  }

  recordTaskBinding(input: ProjectKnowledgeTaskBindingInput): void {
    this.appendTimeline(input.project_id, [
      `- ${input.bound_at} | task_bound | ${input.task_id} | state=${input.state} | title=${input.title}`,
    ]);
    this.rewriteProjectIndexFromDisk(input.project_id);
  }

  recordTaskRecap(input: ProjectKnowledgeTaskRecapInput): void {
    this.appendTimeline(input.project_id, [
      `- ${input.completed_at} | task_recap | ${input.task_id} | state=${input.state} | completed_by=${input.completed_by}`,
    ]);
    this.rewriteProjectIndexFromDisk(input.project_id);
  }

  getProjectIndex(projectId: string): ProjectKnowledgeDocument | null {
    const path = this.indexPath(projectId);
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf8');
    const stats = statSync(path);
    const parsed = parseMarkdownFrontmatter(content);
    return {
      project_id: projectId,
      kind: 'index',
      slug: 'index',
      title: extractMarkdownHeading(content),
      path,
      content,
      created_at: parsed.attributes.created_at ?? stats.birthtime.toISOString(),
      updated_at: parsed.attributes.updated_at ?? stats.mtime.toISOString(),
      source_task_ids: [],
    };
  }

  listProjectRecaps(projectId: string): ProjectKnowledgeRecapSummary[] {
    const recapsDir = this.recapsDir(projectId);
    if (!existsSync(recapsDir)) {
      return [];
    }
    return readdirSync(recapsDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => {
        const path = join(recapsDir, name);
        const content = readFileSync(path, 'utf8');
        const parsed = parseMarkdownFrontmatter(content);
        const updatedAt = statSync(path).mtime.toISOString();
        return {
          project_id: projectId,
          task_id: basename(name, '.md'),
          path,
          title: extractMarkdownHeading(content) ?? parsed.attributes.title ?? null,
          content,
          updated_at: updatedAt,
        } satisfies ProjectKnowledgeRecapSummary;
      })
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  upsertKnowledgeEntry(input: ProjectKnowledgeEntryInput): ProjectKnowledgeDocument {
    mkdirSync(this.knowledgeDir(input.project_id, input.kind), { recursive: true });
    const now = new Date().toISOString();
    const path = this.knowledgePath(input.project_id, input.kind, input.slug);
    const existing = existsSync(path) ? this.readKnowledgeDocument(path, input.project_id, input.kind) : null;
    const next = renderKnowledgeDocument({
      project_id: input.project_id,
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body.trim(),
      source_task_ids: input.source_task_ids ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    writeFileSync(path, next, 'utf8');
    const doc = this.readKnowledgeDocument(path, input.project_id, input.kind);
    this.rewriteProjectIndexFromDisk(input.project_id);
    return doc;
  }

  listKnowledgeEntries(projectId: string, kind?: ProjectKnowledgeKind): ProjectKnowledgeDocument[] {
    const kinds = kind ? [kind] : ['decision', 'fact', 'open_question', 'reference'] satisfies ProjectKnowledgeKind[];
    return kinds.flatMap((entryKind) => {
      const dir = this.knowledgeDir(projectId, entryKind);
      if (!existsSync(dir)) {
        return [];
      }
      return readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => this.readKnowledgeDocument(join(dir, name), projectId, entryKind))
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    });
  }

  getKnowledgeEntry(projectId: string, kind: ProjectKnowledgeKind, slug: string): ProjectKnowledgeDocument | null {
    const path = this.knowledgePath(projectId, kind, slug);
    if (!existsSync(path)) {
      return null;
    }
    return this.readKnowledgeDocument(path, projectId, kind);
  }

  searchProjectKnowledge(projectId: string, query: string, kind?: ProjectKnowledgeKind | 'recap'): ProjectKnowledgeSearchResult[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }

    const docs: Array<ProjectKnowledgeDocument | ProjectKnowledgeSearchResult> = [];
    const index = this.getProjectIndex(projectId);
    if (index) {
      docs.push(index);
    }
    const timeline = this.getProjectTimeline(projectId);
    if (timeline) {
      docs.push(timeline);
    }
    if (!kind || kind === 'recap') {
      docs.push(...this.listProjectRecaps(projectId).map((recap) => ({
        project_id: projectId,
        kind: 'recap' as const,
        slug: recap.task_id,
        title: recap.title,
        path: recap.path,
        snippet: readFileSync(recap.path, 'utf8'),
      })));
    }
    if (kind === undefined) {
      docs.push(...this.listKnowledgeEntries(projectId));
    } else if (kind !== 'recap') {
      docs.push(...this.listKnowledgeEntries(projectId, kind));
    }

    return docs.flatMap((doc) => {
      const haystack = 'content' in doc ? doc.content : doc.snippet;
      const title = 'title' in doc ? doc.title : null;
      const lower = `${title ?? ''}\n${haystack}\n${doc.path}`.toLowerCase();
      if (!lower.includes(needle)) {
        return [];
      }
      return [{
        project_id: projectId,
        kind: doc.kind,
        slug: doc.slug,
        title,
        path: doc.path,
        snippet: buildSnippet(haystack, needle),
      }];
    });
  }

  private projectRoot(projectId: string) {
    return resolve(this.options.brainPackRoot, 'projects', projectId);
  }

  private indexPath(projectId: string) {
    return join(this.projectRoot(projectId), 'index.md');
  }

  private timelinePath(projectId: string) {
    return join(this.projectRoot(projectId), 'timeline.md');
  }

  private recapsDir(projectId: string) {
    return join(this.projectRoot(projectId), 'recaps');
  }

  private knowledgeDir(projectId: string, kind: ProjectKnowledgeKind) {
    return join(this.projectRoot(projectId), 'knowledge', mapKnowledgeKindToDir(kind));
  }

  private knowledgePath(projectId: string, kind: ProjectKnowledgeKind, slug: string) {
    return join(this.knowledgeDir(projectId, kind), `${slug}.md`);
  }

  private getProjectTimeline(projectId: string): ProjectKnowledgeDocument | null {
    const path = this.timelinePath(projectId);
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf8');
    const parsed = parseMarkdownFrontmatter(content);
    return {
      project_id: projectId,
      kind: 'timeline',
      slug: 'timeline',
      title: extractMarkdownHeading(content),
      path,
      content,
      created_at: parsed.attributes.created_at ?? statSync(path).birthtime.toISOString(),
      updated_at: parsed.attributes.updated_at ?? statSync(path).mtime.toISOString(),
      source_task_ids: [],
    };
  }

  private rewriteProjectIndexFromDisk(projectId: string) {
    const current = this.getProjectIndex(projectId);
    const summary = extractSummary(current?.content ?? '');
    const name = extractMarkdownHeading(current?.content ?? projectId) ?? projectId;
    this.rewriteProjectIndex({
      id: projectId,
      name,
      summary,
      status: 'active',
      owner: null,
    });
  }

  private rewriteProjectIndex(input: ProjectKnowledgeProjectInput) {
    const recaps = this.listProjectRecaps(input.id);
    const knowledge = this.listKnowledgeEntries(input.id);
    writeFileSync(this.indexPath(input.id), renderProjectIndex(input, recaps, knowledge), 'utf8');
  }

  private appendTimeline(projectId: string, lines: string[]) {
    const path = this.timelinePath(projectId);
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : renderTimelineHeader(projectId, projectId);
    const nextLines = lines.filter((line) => !existing.includes(line));
    if (nextLines.length === 0) {
      return;
    }
    const suffix = existing.endsWith('\n') ? '' : '\n';
    writeFileSync(path, `${existing}${suffix}${nextLines.join('\n')}\n`, 'utf8');
  }

  private readKnowledgeDocument(path: string, projectId: string, fallbackKind: ProjectKnowledgeKind): ProjectKnowledgeDocument {
    const raw = readFileSync(path, 'utf8');
    const parsed = parseKnowledgeDocument(raw);
    const stats = statSync(path);
    return {
      project_id: projectId,
      kind: parsed.kind ?? fallbackKind,
      slug: parsed.slug ?? basename(path, '.md'),
      title: parsed.title,
      path,
      content: raw,
      created_at: parsed.created_at ?? stats.birthtime.toISOString(),
      updated_at: parsed.updated_at ?? stats.mtime.toISOString(),
      source_task_ids: parsed.source_task_ids,
    };
  }
}

function renderProjectIndex(
  input: ProjectKnowledgeProjectInput,
  recaps: ProjectKnowledgeRecapSummary[],
  knowledge: ProjectKnowledgeDocument[],
) {
  const decisions = knowledge.filter((doc) => doc.kind === 'decision');
  const facts = knowledge.filter((doc) => doc.kind === 'fact');
  const openQuestions = knowledge.filter((doc) => doc.kind === 'open_question');
  const references = knowledge.filter((doc) => doc.kind === 'reference');
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_index',
      project_id: input.id,
      kind: 'index',
      slug: 'index',
      title: input.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    `# ${input.name}`,
    '',
    `- Project ID: ${input.id}`,
    `- Status: ${input.status}`,
    `- Owner: ${input.owner ?? '-'}`,
    `- Summary: ${input.summary ?? '-'}`,
    '',
    '## Docs',
    '',
    '- [[timeline.md]]',
    '- [[recaps/]]',
    '- [[knowledge/decisions/]]',
    '- [[knowledge/facts/]]',
    '- [[knowledge/open-questions/]]',
    '- [[knowledge/references/]]',
    '',
    '## Recent Recaps',
    '',
    ...(recaps.length > 0
      ? recaps.slice(0, 10).map((recap) => `- [[recaps/${recap.task_id}.md]]${recap.title ? ` | ${recap.title}` : ''}`)
      : ['- None yet']),
    '',
    '## Knowledge',
    '',
    `- Decisions: ${decisions.length}`,
    `- Facts: ${facts.length}`,
    `- Open Questions: ${openQuestions.length}`,
    `- References: ${references.length}`,
    '',
    ...(knowledge.length > 0
      ? [
          '### Recent Knowledge',
          '',
          ...knowledge.slice(0, 10).map((doc) => `- [[knowledge/${mapKnowledgeKindToDir(doc.kind as ProjectKnowledgeKind)}/${doc.slug}.md]]${doc.title ? ` | ${doc.title}` : ''}`),
          '',
        ]
      : []),
    '',
  ].join('\n');
}

function renderTimelineHeader(projectId: string, projectName: string) {
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_timeline',
      project_id: projectId,
      kind: 'timeline',
      slug: 'timeline',
      title: `Timeline: ${projectName}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    `# Timeline: ${projectName}`,
    '',
    `- Project ID: ${projectId}`,
    '',
    '## Events',
    '',
  ].join('\n');
}

function extractSummary(content: string) {
  const summary = content.split('\n').find((line) => line.startsWith('- Summary: '));
  return summary ? summary.replace(/^- Summary: /, '') : null;
}

function mapKnowledgeKindToDir(kind: ProjectKnowledgeKind) {
  switch (kind) {
    case 'decision':
      return 'decisions';
    case 'fact':
      return 'facts';
    case 'open_question':
      return 'open-questions';
    case 'reference':
      return 'references';
  }
}

function renderKnowledgeDocument(input: {
  project_id: string;
  kind: ProjectKnowledgeKind;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  source_task_ids: string[];
  created_at: string;
  updated_at: string;
}) {
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_knowledge',
      project_id: input.project_id,
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      summary: input.summary ?? '',
      created_at: input.created_at,
      updated_at: input.updated_at,
      source_task_ids: input.source_task_ids,
    }),
    `# ${input.title}`,
    '',
    ...(input.summary ? [input.summary, ''] : []),
    input.body,
    '',
  ].join('\n');
}

function parseKnowledgeDocument(content: string): {
  kind: ProjectKnowledgeKind | null;
  slug: string | null;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_task_ids: string[];
} {
  const parsed = parseMarkdownFrontmatter(content);
  if (Object.keys(parsed.attributes).length === 0 && Object.keys(parsed.lists).length === 0) {
    return {
      kind: null,
      slug: null,
      title: extractMarkdownHeading(content),
      created_at: null,
      updated_at: null,
      source_task_ids: [],
    };
  }
  const kind = parsed.attributes.kind;
  return {
    kind: kind === 'decision' || kind === 'fact' || kind === 'open_question' || kind === 'reference' ? kind : null,
    slug: parsed.attributes.slug ?? null,
    title: parsed.attributes.title ?? extractMarkdownHeading(content),
    created_at: parsed.attributes.created_at ?? null,
    updated_at: parsed.attributes.updated_at ?? null,
    source_task_ids: parsed.lists.source_task_ids ?? [],
  };
}

function buildSnippet(content: string, needle: string) {
  const lower = content.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) {
    return content.slice(0, 160);
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + needle.length + 100);
  return content.slice(start, end).replace(/\n+/g, ' ').trim();
}
