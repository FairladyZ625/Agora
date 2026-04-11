import { describe, expect, it, vi } from 'vitest';
import type { ContextSourceBindingDto } from '@agora-ts/contracts';
import { ObsidianContextSourceRetrievalAdapter } from './obsidian-context-source-retrieval-adapter.js';

function makeBinding(overrides: Partial<ContextSourceBindingDto> = {}): ContextSourceBindingDto {
  return {
    source_id: 'obsidian-main',
    scope: 'project',
    project_id: 'proj-obsidian',
    kind: 'obsidian_rest',
    label: 'Obsidian Main',
    location: 'https://127.0.0.1:27124',
    access: 'read_only',
    enabled: true,
    metadata: {
      api_key: 'secret',
      insecure_tls: true,
    },
    ...overrides,
  };
}

describe('obsidian context source retrieval adapter', () => {
  it('retrieves through matching project-scoped obsidian bindings', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify([
        {
          filename: '03-ARCHITECTURE/runtime-boundary.md',
          score: 7.2,
          matches: [{ context: 'Keep runtime-specific logic out of core.' }],
        },
      ]),
      headers: {},
    });
    const adapter = new ObsidianContextSourceRetrievalAdapter({
      listProjectBindings: () => [makeBinding()],
      transport,
    });

    const results = await adapter.retrieve({
      scope: 'context_source',
      mode: 'project_context',
      query: { text: 'runtime boundary' },
      limit: 5,
      context: { project_id: 'proj-obsidian' },
      metadata: {
        source_ids: ['obsidian-main'],
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        provider: 'obsidian_rest:obsidian-main',
        path: 'obsidian://obsidian-main/03-ARCHITECTURE/runtime-boundary.md',
      }),
    ]);
  });

  it('aggregates health across matching obsidian bindings', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ authenticated: true }),
      headers: {},
    });
    const adapter = new ObsidianContextSourceRetrievalAdapter({
      listProjectBindings: () => [makeBinding()],
      transport,
    });

    const health = await adapter.checkHealth({
      scope: 'context_source',
      mode: 'project_context',
      query: { text: 'runtime boundary' },
      context: { project_id: 'proj-obsidian' },
      metadata: {
        source_ids: ['obsidian-main'],
      },
    });

    expect(health).toMatchObject({
      provider: 'obsidian_context_source',
      status: 'ready',
      metadata: {
        source_ids: ['obsidian-main'],
      },
    });
  });

  it('supports project_context scope as an alias for project-bound obsidian retrieval', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify([
        {
          filename: '03-ARCHITECTURE/runtime-boundary.md',
          score: 7.2,
          matches: [{ context: 'Keep runtime-specific logic out of core.' }],
        },
      ]),
      headers: {},
    });
    const adapter = new ObsidianContextSourceRetrievalAdapter({
      listProjectBindings: () => [makeBinding()],
      transport,
    });

    const plan = {
      scope: 'project_context',
      mode: 'lookup',
      query: { text: 'runtime boundary' },
      context: { project_id: 'proj-obsidian' },
    } as const;
    const results = await adapter.retrieve(plan);

    expect(adapter.supports(plan)).toBe(true);
    expect(results[0]).toMatchObject({
      provider: 'obsidian_rest:obsidian-main',
      project_id: 'proj-obsidian',
    });
  });
});
