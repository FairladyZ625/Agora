import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type {
  ProjectKnowledgeDocument,
  ProjectKnowledgePort,
  ProjectKnowledgeProjectInput,
  ProjectKnowledgeRecapSummary,
  ProjectKnowledgeTaskBindingInput,
  ProjectKnowledgeTaskRecapInput,
} from '../project-knowledge-port.js';

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
    return {
      project_id: projectId,
      path,
      content: readFileSync(path, 'utf8'),
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
        const titleLine = content.split('\n').find((line) => line.startsWith('- 标题: ') || line.startsWith('- Title: ')) ?? null;
        const updatedAt = statSync(path).mtime.toISOString();
        return {
          project_id: projectId,
          task_id: basename(name, '.md'),
          path,
          title: titleLine ? titleLine.replace(/^- (标题|Title): /, '') : null,
          updated_at: updatedAt,
        } satisfies ProjectKnowledgeRecapSummary;
      })
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
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

  private rewriteProjectIndexFromDisk(projectId: string) {
    const current = this.getProjectIndex(projectId);
    const summary = extractSummary(current?.content ?? '');
    const name = extractHeading(current?.content ?? projectId) ?? projectId;
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
    writeFileSync(this.indexPath(input.id), renderProjectIndex(input, recaps), 'utf8');
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
}

function renderProjectIndex(
  input: ProjectKnowledgeProjectInput,
  recaps: ProjectKnowledgeRecapSummary[],
) {
  return [
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
  ].join('\n');
}

function renderTimelineHeader(projectId: string, projectName: string) {
  return [
    `# Timeline: ${projectName}`,
    '',
    `- Project ID: ${projectId}`,
    '',
    '## Events',
    '',
  ].join('\n');
}

function extractHeading(content: string) {
  const heading = content.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^# /, '') : null;
}

function extractSummary(content: string) {
  const summary = content.split('\n').find((line) => line.startsWith('- Summary: '));
  return summary ? summary.replace(/^- Summary: /, '') : null;
}
