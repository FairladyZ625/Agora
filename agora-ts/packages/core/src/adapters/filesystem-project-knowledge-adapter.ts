import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
import { ensureCanonicalProjectRoot } from '../project-state-root.js';
import { extractMarkdownHeading, parseMarkdownFrontmatter, renderMarkdownFrontmatter } from './markdown-frontmatter.js';

export interface FilesystemProjectKnowledgeAdapterOptions {
  brainPackRoot: string;
  projectStateRootResolver?: ((projectId: string) => string | null) | undefined;
}

export class FilesystemProjectKnowledgeAdapter implements ProjectKnowledgePort {
  constructor(private readonly options: FilesystemProjectKnowledgeAdapterOptions) {}

  ensureProject(input: ProjectKnowledgeProjectInput): void {
    const root = this.projectRoot(input.id);
    ensureCanonicalProjectRoot(root);
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, 'recaps'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'decisions'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'facts'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'open-questions'), { recursive: true });
    mkdirSync(join(root, 'knowledge', 'references'), { recursive: true });
    mkdirSync(join(root, 'tasks'), { recursive: true });
    mkdirSync(this.activeTasksDir(input.id), { recursive: true });
    mkdirSync(this.archivedTasksDir(input.id), { recursive: true });
    this.ensureProjectStateMirror(input.id);
    if (!existsSync(this.timelinePath(input.id))) {
      writeFileSync(this.timelinePath(input.id), renderTimelineHeader(input.id, input.name), 'utf8');
    }
    this.rewriteProjectIndex(input);
    this.appendTimeline(input.id, [
      `- ${new Date().toISOString()} | project_created | ${input.name} | status=${input.status}`,
    ]);
  }

  recordTaskBinding(input: ProjectKnowledgeTaskBindingInput): void {
    writeFileSync(
      this.activeTaskProjectionPath(input.project_id, input.task_id),
      renderTaskProjection({
        project_id: input.project_id,
        task_id: input.task_id,
        title: input.title,
        state: input.state,
        projection: 'active',
        workspace_path: input.workspace_path,
        recorded_at: input.bound_at,
      }),
      'utf8',
    );
    if (existsSync(this.archivedTaskProjectionPath(input.project_id, input.task_id))) {
      rmSync(this.archivedTaskProjectionPath(input.project_id, input.task_id), { force: true });
    }
    this.writeProjectStateTaskMirror({
      project_id: input.project_id,
      task_id: input.task_id,
      title: input.title,
      state: input.state,
      projection: 'active',
      workspace_path: input.workspace_path,
      recorded_at: input.bound_at,
    });
    this.appendTimeline(input.project_id, [
      `- ${input.bound_at} | task_bound | ${input.task_id} | state=${input.state} | title=${input.title} | doc=[[tasks/active/${input.task_id}.md]]`,
    ]);
    this.rewriteProjectIndexFromDisk(input.project_id);
  }

  recordTaskRecap(input: ProjectKnowledgeTaskRecapInput): void {
    if (existsSync(this.activeTaskProjectionPath(input.project_id, input.task_id))) {
      rmSync(this.activeTaskProjectionPath(input.project_id, input.task_id), { force: true });
    }
    writeFileSync(
      this.archivedTaskProjectionPath(input.project_id, input.task_id),
      renderTaskProjection({
        project_id: input.project_id,
        task_id: input.task_id,
        title: input.title,
        state: input.state,
        projection: 'archive',
        workspace_path: input.workspace_path,
        recorded_at: input.completed_at,
        current_stage: input.current_stage,
        controller_ref: input.controller_ref,
        completed_by: input.completed_by,
        summary_lines: input.summary_lines,
      }),
      'utf8',
    );
    this.writeProjectStateTaskMirror({
      project_id: input.project_id,
      task_id: input.task_id,
      title: input.title,
      state: input.state,
      projection: 'archive',
      workspace_path: input.workspace_path,
      recorded_at: input.completed_at,
      current_stage: input.current_stage,
      controller_ref: input.controller_ref,
      completed_by: input.completed_by,
      summary_lines: input.summary_lines,
    });
    this.appendTimeline(input.project_id, [
      `- ${input.completed_at} | task_recap | ${input.task_id} | state=${input.state} | completed_by=${input.completed_by} | doc=[[tasks/archive/${input.task_id}.md]]`,
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
    return this.resolveProjectStateRoot(projectId) ?? resolve(this.options.brainPackRoot, 'project-index', projectId);
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

  private activeTasksDir(projectId: string) {
    return join(this.projectRoot(projectId), 'tasks', 'active');
  }

  private archivedTasksDir(projectId: string) {
    return join(this.projectRoot(projectId), 'tasks', 'archive');
  }

  private activeTaskProjectionPath(projectId: string, taskId: string) {
    return join(this.activeTasksDir(projectId), `${taskId}.md`);
  }

  private archivedTaskProjectionPath(projectId: string, taskId: string) {
    return join(this.archivedTasksDir(projectId), `${taskId}.md`);
  }

  private resolveProjectStateRoot(projectId: string) {
    return this.options.projectStateRootResolver?.(projectId) ?? null;
  }

  private projectStateTasksDir(projectId: string) {
    const root = this.resolveProjectStateRoot(projectId);
    return root ? join(root, 'tasks') : null;
  }

  private projectStateActiveTasksDir(projectId: string) {
    const tasksDir = this.projectStateTasksDir(projectId);
    return tasksDir ? join(tasksDir, 'active') : null;
  }

  private projectStateArchiveDir(projectId: string) {
    const root = this.resolveProjectStateRoot(projectId);
    return root ? join(root, 'archive') : null;
  }

  private projectStateTasksIndexPath(projectId: string) {
    const tasksDir = this.projectStateTasksDir(projectId);
    return tasksDir ? join(tasksDir, 'index.md') : null;
  }

  private projectStateArchiveIndexPath(projectId: string) {
    const archiveDir = this.projectStateArchiveDir(projectId);
    return archiveDir ? join(archiveDir, 'index.md') : null;
  }

  private projectStateActiveTaskPath(projectId: string, taskId: string) {
    const dir = this.projectStateActiveTasksDir(projectId);
    return dir ? join(dir, `${taskId}.md`) : null;
  }

  private projectStateArchiveTaskPath(projectId: string, taskId: string) {
    const dir = this.projectStateArchiveDir(projectId);
    return dir ? join(dir, `${taskId}.md`) : null;
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
    const activeTasks = this.listTaskProjections(input.id, 'active');
    const archivedTasks = this.listTaskProjections(input.id, 'archive');
    writeFileSync(this.indexPath(input.id), renderProjectIndex(input, recaps, knowledge, activeTasks, archivedTasks), 'utf8');
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

  private ensureProjectStateMirror(projectId: string) {
    if (this.projectRoot(projectId) === this.resolveProjectStateRoot(projectId)) {
      return;
    }
    const tasksDir = this.projectStateTasksDir(projectId);
    const activeTasksDir = this.projectStateActiveTasksDir(projectId);
    const archiveDir = this.projectStateArchiveDir(projectId);
    if (!tasksDir || !activeTasksDir || !archiveDir) {
      return;
    }
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(activeTasksDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });
    this.rewriteProjectStateMirrorIndexes(projectId);
  }

  private writeProjectStateTaskMirror(input: {
    project_id: string;
    task_id: string;
    title: string;
    state: string;
    projection: 'active' | 'archive';
    workspace_path: string | null;
    recorded_at: string;
    current_stage?: string | null;
    controller_ref?: string | null;
    completed_by?: string | null;
    summary_lines?: string[];
  }) {
    if (this.projectRoot(input.project_id) === this.resolveProjectStateRoot(input.project_id)) {
      return;
    }
    this.ensureProjectStateMirror(input.project_id);
    const activePath = this.projectStateActiveTaskPath(input.project_id, input.task_id);
    const archivePath = this.projectStateArchiveTaskPath(input.project_id, input.task_id);
    if (!activePath || !archivePath) {
      return;
    }
    const brainPackProjectionPath = input.projection === 'active'
      ? this.activeTaskProjectionPath(input.project_id, input.task_id)
      : this.archivedTaskProjectionPath(input.project_id, input.task_id);
    if (input.projection === 'active') {
      writeFileSync(activePath, renderProjectStateTaskMirror({
        ...input,
        brain_pack_projection_path: brainPackProjectionPath,
      }), 'utf8');
      if (existsSync(archivePath)) {
        rmSync(archivePath, { force: true });
      }
    } else {
      if (existsSync(activePath)) {
        rmSync(activePath, { force: true });
      }
      writeFileSync(archivePath, renderProjectStateTaskMirror({
        ...input,
        brain_pack_projection_path: brainPackProjectionPath,
      }), 'utf8');
    }
    this.rewriteProjectStateMirrorIndexes(input.project_id);
  }

  private rewriteProjectStateMirrorIndexes(projectId: string) {
    if (this.projectRoot(projectId) === this.resolveProjectStateRoot(projectId)) {
      return;
    }
    const tasksIndexPath = this.projectStateTasksIndexPath(projectId);
    const archiveIndexPath = this.projectStateArchiveIndexPath(projectId);
    if (!tasksIndexPath || !archiveIndexPath) {
      return;
    }
    const activeMirrors = this.listProjectStateTaskMirrors(projectId, 'active');
    const archiveMirrors = this.listProjectStateTaskMirrors(projectId, 'archive');
    writeFileSync(tasksIndexPath, renderProjectStateTasksIndex(projectId, activeMirrors), 'utf8');
    writeFileSync(archiveIndexPath, renderProjectStateArchiveIndex(projectId, archiveMirrors), 'utf8');
  }

  private listTaskProjections(projectId: string, projection: 'active' | 'archive') {
    const dir = projection === 'active' ? this.activeTasksDir(projectId) : this.archivedTasksDir(projectId);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => {
        const path = join(dir, name);
        const content = readFileSync(path, 'utf8');
        const parsed = parseMarkdownFrontmatter(content);
        const updatedAt = statSync(path).mtime.toISOString();
        return {
          task_id: parsed.attributes.task_id ?? basename(name, '.md'),
          title: parsed.attributes.title ?? extractMarkdownHeading(content) ?? basename(name, '.md'),
          state: parsed.attributes.state ?? null,
          path,
          updated_at: updatedAt,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  private listProjectStateTaskMirrors(projectId: string, projection: 'active' | 'archive') {
    if (this.projectRoot(projectId) === this.resolveProjectStateRoot(projectId)) {
      return [];
    }
    const dir = projection === 'active' ? this.projectStateActiveTasksDir(projectId) : this.projectStateArchiveDir(projectId);
    if (!dir || !existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md') && name !== 'index.md')
      .map((name) => {
        const path = join(dir, name);
        const content = readFileSync(path, 'utf8');
        const parsed = parseMarkdownFrontmatter(content);
        const updatedAt = statSync(path).mtime.toISOString();
        return {
          task_id: parsed.attributes.task_id ?? basename(name, '.md'),
          title: parsed.attributes.title ?? extractMarkdownHeading(content) ?? basename(name, '.md'),
          state: parsed.attributes.state ?? null,
          path,
          updated_at: updatedAt,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

function renderProjectIndex(
  input: ProjectKnowledgeProjectInput,
  recaps: ProjectKnowledgeRecapSummary[],
  knowledge: ProjectKnowledgeDocument[],
  activeTasks: Array<{ task_id: string; title: string | null; state: string | null; path: string; updated_at: string }>,
  archivedTasks: Array<{ task_id: string; title: string | null; state: string | null; path: string; updated_at: string }>,
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
    '- [[tasks/active/]]',
    '- [[tasks/archive/]]',
    '- [[knowledge/decisions/]]',
    '- [[knowledge/facts/]]',
    '- [[knowledge/open-questions/]]',
    '- [[knowledge/references/]]',
    '',
    '## Tasks',
    '',
    `- Active Tasks: ${activeTasks.length}`,
    `- Archived Tasks: ${archivedTasks.length}`,
    '',
    '### Active Tasks',
    '',
    ...(activeTasks.length > 0
      ? activeTasks.slice(0, 10).map((task) => `- [[tasks/active/${task.task_id}.md]]${task.title ? ` | ${task.title}` : ''}${task.state ? ` | state=${task.state}` : ''}`)
      : ['- None yet']),
    '',
    '### Archived Tasks',
    '',
    ...(archivedTasks.length > 0
      ? archivedTasks.slice(0, 10).map((task) => `- [[tasks/archive/${task.task_id}.md]]${task.title ? ` | ${task.title}` : ''}${task.state ? ` | state=${task.state}` : ''}`)
      : ['- None yet']),
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

function renderTaskProjection(input: {
  project_id: string;
  task_id: string;
  title: string;
  state: string;
  projection: 'active' | 'archive';
  workspace_path: string | null;
  recorded_at: string;
  current_stage?: string | null;
  controller_ref?: string | null;
  completed_by?: string | null;
  summary_lines?: string[];
}) {
  const taskRootLink = `[[../${input.task_id}/]]`;
  const currentLink = `[[../${input.task_id}/00-current.md]]`;
  const closeRecapLink = `[[../${input.task_id}/07-outputs/task-close-recap.md]]`;
  const harvestDraftLink = `[[../${input.task_id}/07-outputs/project-harvest-draft.md]]`;
  const projectRecapLink = `[[../../recaps/${input.task_id}.md]]`;
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_task_projection',
      project_id: input.project_id,
      task_id: input.task_id,
      projection: input.projection,
      title: input.title,
      state: input.state,
      workspace_path: input.workspace_path ?? '',
      recorded_at: input.recorded_at,
      current_stage: input.current_stage ?? '',
      controller_ref: input.controller_ref ?? '',
      completed_by: input.completed_by ?? '',
    }),
    `# ${input.title}`,
    '',
    `- Task ID: ${input.task_id}`,
    `- Projection: ${input.projection}`,
    `- State: ${input.state}`,
    `- Project: ${input.project_id}`,
    ...(input.current_stage ? [`- Current Stage: ${input.current_stage}`] : []),
    ...(input.controller_ref ? [`- Controller: ${input.controller_ref}`] : []),
    ...(input.completed_by ? [`- Completed By: ${input.completed_by}`] : []),
    `- Recorded At: ${input.recorded_at}`,
    ...(input.workspace_path ? [`- Workspace Path: ${input.workspace_path}`] : []),
    '',
    '## Navigation',
    '',
    `- Task Workspace: ${taskRootLink}`,
    `- Current State: ${currentLink}`,
    ...(input.projection === 'archive' ? [`- Project Recap: ${projectRecapLink}`] : []),
    ...(input.projection === 'archive' && input.workspace_path ? [`- Task Close Recap: ${closeRecapLink}`] : []),
    ...(input.projection === 'archive' && input.workspace_path ? [`- Harvest Draft: ${harvestDraftLink}`] : []),
    '',
    ...(input.projection === 'archive' && input.summary_lines && input.summary_lines.length > 0
      ? [
          '## Summary',
          '',
          ...input.summary_lines.map((line) => `- ${line}`),
          '',
        ]
      : []),
  ].join('\n');
}

function renderProjectStateTaskMirror(input: {
  project_id: string;
  task_id: string;
  title: string;
  state: string;
  projection: 'active' | 'archive';
  workspace_path: string | null;
  recorded_at: string;
  brain_pack_projection_path: string;
  current_stage?: string | null;
  controller_ref?: string | null;
  completed_by?: string | null;
  summary_lines?: string[];
}) {
  const localIndexLink = input.projection === 'active' ? '[[../index.md]]' : '[[index.md]]';
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_state_task_projection',
      project_id: input.project_id,
      task_id: input.task_id,
      projection: input.projection,
      title: input.title,
      state: input.state,
      workspace_path: input.workspace_path ?? '',
      brain_pack_projection_path: input.brain_pack_projection_path,
      recorded_at: input.recorded_at,
      current_stage: input.current_stage ?? '',
      controller_ref: input.controller_ref ?? '',
      completed_by: input.completed_by ?? '',
    }),
    `# ${input.title}`,
    '',
    `- Task ID: ${input.task_id}`,
    `- Projection: ${input.projection}`,
    `- State: ${input.state}`,
    `- Project: ${input.project_id}`,
    ...(input.current_stage ? [`- Current Stage: ${input.current_stage}`] : []),
    ...(input.controller_ref ? [`- Controller: ${input.controller_ref}`] : []),
    ...(input.completed_by ? [`- Completed By: ${input.completed_by}`] : []),
    `- Recorded At: ${input.recorded_at}`,
    '',
    '## Navigation',
    '',
    `- Local Index: ${localIndexLink}`,
    `- Brain Pack Projection Path: \`${input.brain_pack_projection_path}\``,
    ...(input.workspace_path ? [`- Runtime Workspace Path: \`${input.workspace_path}\``] : []),
    '',
    ...(input.projection === 'archive' && input.summary_lines && input.summary_lines.length > 0
      ? [
          '## Summary',
          '',
          ...input.summary_lines.map((line) => `- ${line}`),
          '',
        ]
      : []),
  ].join('\n');
}

function renderProjectStateTasksIndex(
  projectId: string,
  activeMirrors: Array<{ task_id: string; title: string | null; state: string | null; path: string; updated_at: string }>,
) {
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_state_active_tasks_index',
      project_id: projectId,
      slug: 'tasks-index',
      title: `Active Task Mirrors: ${projectId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    `# Active Task Mirrors: ${projectId}`,
    '',
    `- Project ID: ${projectId}`,
    `- Active Task Mirrors: ${activeMirrors.length}`,
    '',
    ...(activeMirrors.length > 0
      ? activeMirrors.map((task) => `- [[active/${task.task_id}.md]]${task.title ? ` | ${task.title}` : ''}${task.state ? ` | state=${task.state}` : ''}`)
      : ['- None yet']),
    '',
  ].join('\n');
}

function renderProjectStateArchiveIndex(
  projectId: string,
  archiveMirrors: Array<{ task_id: string; title: string | null; state: string | null; path: string; updated_at: string }>,
) {
  return [
    renderMarkdownFrontmatter({
      doc_type: 'project_state_archive_tasks_index',
      project_id: projectId,
      slug: 'archive-index',
      title: `Archived Task Mirrors: ${projectId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    `# Archived Task Mirrors: ${projectId}`,
    '',
    `- Project ID: ${projectId}`,
    `- Archived Task Mirrors: ${archiveMirrors.length}`,
    '',
    ...(archiveMirrors.length > 0
      ? archiveMirrors.map((task) => `- [[${task.task_id}.md]]${task.title ? ` | ${task.title}` : ''}${task.state ? ` | state=${task.state}` : ''}`)
      : ['- None yet']),
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
