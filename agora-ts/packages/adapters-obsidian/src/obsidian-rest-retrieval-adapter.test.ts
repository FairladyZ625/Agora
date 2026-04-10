import { describe, expect, it, vi } from 'vitest';
import type { ContextSourceBindingDto } from '@agora-ts/contracts';
import {
  ObsidianRestRetrievalAdapter,
  resolveObsidianRestSourceConfig,
} from './obsidian-rest-retrieval-adapter.js';

function makeBinding(overrides: Partial<ContextSourceBindingDto> = {}): ContextSourceBindingDto {
  return {
    source_id: 'obsidian-main',
    scope: 'workspace',
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

describe('obsidian rest retrieval adapter', () => {
  it('resolves adapter-owned config from a generic context source binding', () => {
    const config = resolveObsidianRestSourceConfig(makeBinding({
      scope: 'project',
      project_id: 'proj-1',
      metadata: {
        api_key: 'secret',
        insecure_tls: true,
        context_length: 180,
      },
    }));

    expect(config).toEqual({
      source_id: 'obsidian-main',
      scope: 'project',
      project_id: 'proj-1',
      label: 'Obsidian Main',
      base_url: 'https://127.0.0.1:27124',
      api_key: 'secret',
      insecure_tls: true,
      context_length: 180,
    });
  });

  it('reports ready health when the obsidian API is reachable and authenticated', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ authenticated: true }),
      headers: {},
    });
    const adapter = new ObsidianRestRetrievalAdapter({
      config: resolveObsidianRestSourceConfig(makeBinding()),
      transport,
    });

    const health = await adapter.checkHealth();

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://127.0.0.1:27124/',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer secret',
        }),
      }),
      { insecure_tls: true },
    );
    expect(health).toMatchObject({
      provider: 'obsidian_rest:obsidian-main',
      status: 'ready',
    });
  });

  it('reads a note over the vault endpoint and returns markdown preview', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: '# Daily Briefing\n\nLine 1\nLine 2\n',
      headers: {},
    });
    const adapter = new ObsidianRestRetrievalAdapter({
      config: resolveObsidianRestSourceConfig(makeBinding()),
      transport,
    });

    const note = await adapter.readNote('06-DASHBOARD/daily-briefing.md');

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://127.0.0.1:27124/vault/06-DASHBOARD/daily-briefing.md',
      }),
      { insecure_tls: true },
    );
    expect(note).toMatchObject({
      source_id: 'obsidian-main',
      filename: '06-DASHBOARD/daily-briefing.md',
      path: 'obsidian://obsidian-main/06-DASHBOARD/daily-briefing.md',
    });
    expect(note.preview).toContain('# Daily Briefing');
  });

  it('maps simple search responses into unified retrieval results', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify([
        {
          filename: '03-ARCHITECTURE/runtime-boundary.md',
          score: 7.2,
          matches: [
            {
              context: 'Keep runtime-specific logic out of core.',
              match: { start: 5, end: 12 },
            },
          ],
        },
      ]),
      headers: {},
    });
    const adapter = new ObsidianRestRetrievalAdapter({
      config: resolveObsidianRestSourceConfig(makeBinding()),
      transport,
    });

    const results = await adapter.retrieve({
      scope: 'context_source',
      mode: 'task_context',
      query: { text: 'runtime boundary' },
      limit: 5,
      context: {},
      metadata: {
        source_ids: ['obsidian-main'],
      },
    });

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://127.0.0.1:27124/search/simple/?query=runtime+boundary&contextLength=120',
      }),
      { insecure_tls: true },
    );
    expect(results).toEqual([
      expect.objectContaining({
        scope: 'context_source',
        provider: 'obsidian_rest:obsidian-main',
        title: 'runtime-boundary',
        path: 'obsidian://obsidian-main/03-ARCHITECTURE/runtime-boundary.md',
        preview: 'Keep runtime-specific logic out of core.',
        score: 7.2,
      }),
    ]);
  });
});
