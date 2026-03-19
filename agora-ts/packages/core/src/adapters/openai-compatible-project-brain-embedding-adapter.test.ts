import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProjectBrainEmbeddingAdapter } from './openai-compatible-project-brain-embedding-adapter.js';

describe('openai-compatible project brain embedding adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://embeddings.example.com/v1';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-v4';
    delete process.env.OPENAI_EMBEDDING_DIMENSION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('embeds a single text through an OpenAI-compatible endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiCompatibleProjectBrainEmbeddingAdapter();
    const result = await adapter.embedText('hybrid retrieval');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://embeddings.example.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"model":"text-embedding-v4"');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"input":"hybrid retrieval"');
  });

  it('embeds a batch of texts and passes optional dimensions', async () => {
    process.env.OPENAI_EMBEDDING_DIMENSION = '1024';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0.4, 0.5] },
          { index: 0, embedding: [0.1, 0.2] },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiCompatibleProjectBrainEmbeddingAdapter();
    const result = await adapter.embedBatch(['alpha', 'beta']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"dimensions":1024');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"input":["alpha","beta"]');
  });

  it('maps provider failures into descriptive embedding errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiCompatibleProjectBrainEmbeddingAdapter();

    await expect(adapter.embedText('hybrid retrieval')).rejects.toThrow(
      'project brain embedding request failed: 429 rate limited',
    );
  });
});
