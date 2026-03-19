import { stripMarkdownFrontmatter } from './adapters/markdown-frontmatter.js';
import type { ProjectBrainChunk } from './project-brain-chunk.js';
import type { ProjectBrainDocument } from './project-brain-query-port.js';

interface PendingSection {
  headingPath: string[];
  lines: string[];
}

export class ProjectBrainChunkingPolicy {
  chunkDocument(document: ProjectBrainDocument): ProjectBrainChunk[] {
    const body = stripMarkdownFrontmatter(document.content).trim();
    if (!body) {
      return [];
    }

    const lines = body.split('\n');
    const sections: PendingSection[] = [];
    const headingStack: string[] = [];
    const fallbackRoot = document.title ?? `${document.kind}/${document.slug}`;
    let currentHeadingPath = [fallbackRoot];
    let currentLines: string[] = [];

    const flush = () => {
      const text = normalizeChunkText(currentLines);
      if (!text) {
        currentLines = [];
        return;
      }
      sections.push({
        headingPath: [...currentHeadingPath],
        lines: [...currentLines],
      });
      currentLines = [];
    };

    for (const rawLine of lines) {
      const heading = rawLine.match(/^(#{1,6})\s+(.*\S)\s*$/);
      if (!heading) {
        currentLines.push(rawLine);
        continue;
      }

      flush();

      const level = heading[1]?.length ?? 1;
      const title = heading[2]?.trim() ?? '';
      if (!title) {
        continue;
      }

      if (level === 1) {
        headingStack.length = 0;
        headingStack.push(title);
      } else {
        const root = headingStack[0] ?? fallbackRoot;
        headingStack.length = 1;
        headingStack[0] = root;
        headingStack[level - 1] = title;
      }

      currentHeadingPath = compactHeadings(headingStack, fallbackRoot);
    }

    flush();

    return sections.map((section, index) => {
      const text = normalizeChunkText(section.lines);
      return {
        chunk_id: `${document.project_id}:${document.kind}:${document.slug}:${index}`,
        project_id: document.project_id,
        document_kind: document.kind,
        document_slug: document.slug,
        source_path: document.path,
        title: document.title,
        heading_path: section.headingPath,
        ordinal: index,
        text,
        search_text: buildSearchText(document, section.headingPath, text),
        updated_at: document.updated_at,
      };
    });
  }
}

function compactHeadings(headings: string[], fallbackRoot: string) {
  const compact = headings.filter((heading) => heading && heading.trim().length > 0);
  if (compact.length > 0) {
    return compact;
  }
  return [fallbackRoot];
}

function normalizeChunkText(lines: string[]) {
  return lines.join('\n').trim();
}

function buildSearchText(document: ProjectBrainDocument, headingPath: string[], text: string) {
  const weightedTitle = repeatPhrase(document.title ?? document.slug, 2);
  const weightedHeading = repeatPhrase(headingPath[headingPath.length - 1] ?? '', 2);
  return [
    weightedTitle,
    document.path,
    document.kind,
    document.slug,
    weightedHeading,
    headingPath.join(' '),
    text,
  ].filter(Boolean).join(' ');
}

function repeatPhrase(value: string, times: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return Array.from({ length: times }, () => trimmed).join(' ');
}
