import type { ProjectBrainEmbeddingPort } from '../project-brain-embedding-port.js';

interface EmbeddingResponse {
  data?: Array<{
    index?: number;
    embedding?: number[];
  }>;
}

export class OpenAiCompatibleProjectBrainEmbeddingAdapter implements ProjectBrainEmbeddingPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimensions: number | null;

  constructor() {
    this.apiKey = requireEnv('OPENAI_API_KEY');
    this.baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
    this.model = (process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small').trim();
    this.dimensions = parseOptionalInt(process.env.OPENAI_EMBEDDING_DIMENSION);
  }

  async embedText(text: string): Promise<number[]> {
    const data = await this.requestEmbeddings(text);
    return data[0]?.embedding ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const data = await this.requestEmbeddings(texts);
    return [...data]
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding ?? []);
  }

  private async requestEmbeddings(input: string | string[]) {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input,
        ...(this.dimensions !== null ? { dimensions: this.dimensions } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`project brain embedding request failed: ${response.status} ${detail}`.trim());
    }

    const payload = await response.json() as EmbeddingResponse;
    return payload.data ?? [];
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseOptionalInt(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}
