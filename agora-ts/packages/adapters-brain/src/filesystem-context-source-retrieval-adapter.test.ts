import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemContextSourceRetrievalAdapter } from './filesystem-context-source-retrieval-adapter.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-context-source-fs-'));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('filesystem context source retrieval adapter', () => {
  it('retrieves matching files from project-scoped local_path/docs_repo bindings', async () => {
    const root = makeTempDir();
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'runtime-boundary.md'),
      '# Runtime Boundary\n\nKeep runtime-specific logic out of core.\n',
      'utf8',
    );
    writeFileSync(
      join(root, 'docs', 'unrelated.md'),
      '# Something Else\n\nNo matching content here.\n',
      'utf8',
    );

    const adapter = new FilesystemContextSourceRetrievalAdapter({
      listProjectBindings: (projectId) => (
        projectId === 'proj-fs'
          ? [{
              source_id: 'docs-architecture',
              scope: 'project',
              project_id: 'proj-fs',
              kind: 'docs_repo',
              label: 'Architecture Docs',
              location: join(root, 'docs'),
              access: 'read_only',
              enabled: true,
            }]
          : []
      ),
    });

    const results = await adapter.retrieve({
      scope: 'context_source',
      mode: 'project_context',
      query: { text: 'runtime boundary' },
      limit: 5,
      context: { project_id: 'proj-fs' },
    });

    expect(results).toEqual([
      expect.objectContaining({
        provider: 'filesystem_context_source',
        project_id: 'proj-fs',
        title: 'runtime-boundary',
        path: join(root, 'docs', 'runtime-boundary.md'),
      }),
    ]);
  });

  it('filters filesystem retrieval to explicit source ids and reports health', async () => {
    const root = makeTempDir();
    writeFileSync(
      join(root, 'notes.md'),
      'Context harness platform reference-first delivery.\n',
      'utf8',
    );

    const adapter = new FilesystemContextSourceRetrievalAdapter({
      listProjectBindings: () => [{
        source_id: 'local-brain',
        scope: 'project',
        project_id: 'proj-fs',
        kind: 'local_path',
        label: 'Local Brain',
        location: root,
        access: 'read_only',
        enabled: true,
      }],
    });

    const filtered = await adapter.retrieve({
      scope: 'context_source',
      mode: 'project_context',
      query: { text: 'reference-first' },
      limit: 5,
      context: { project_id: 'proj-fs' },
      metadata: {
        source_ids: ['another-source'],
      },
    });
    const health = await adapter.checkHealth({
      scope: 'context_source',
      mode: 'project_context',
      query: { text: 'reference-first' },
      context: { project_id: 'proj-fs' },
      metadata: {
        source_ids: ['local-brain'],
      },
    });

    expect(filtered).toEqual([]);
    expect(health).toMatchObject({
      provider: 'filesystem_context_source',
      status: 'ready',
    });
  });
});
