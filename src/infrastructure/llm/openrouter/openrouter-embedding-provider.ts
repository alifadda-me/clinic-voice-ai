import type { EmbeddingProvider } from '../../../ports/platform/embedding-provider.js';
import { EmbeddingUnavailableError } from '../../../ports/platform/semantic-search.js';
import type { EmbeddingProviderConfig } from '../../../config/embeddings.js';
import type { OpenRouterHttpClient } from './openrouter-http.js';
import { createFetchOpenRouterHttpClient } from './openrouter-http.js';

/**
 * OpenAI-compatible embeddings via OpenRouter (or any compatible /v1/embeddings).
 * Provider types stay in this adapter — application only sees EmbeddingProvider.
 */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'remote' as const;

  constructor(
    private readonly http: OpenRouterHttpClient,
    private readonly config: EmbeddingProviderConfig,
  ) {}

  static fromConfig(
    config: EmbeddingProviderConfig,
    http: OpenRouterHttpClient = createFetchOpenRouterHttpClient(),
  ): OpenRouterEmbeddingProvider {
    return new OpenRouterEmbeddingProvider(http, config);
  }

  dimensions(): number {
    return this.config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text]);
    return vector!;
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.config.httpReferer) {
      headers['HTTP-Referer'] = this.config.httpReferer;
    }
    if (this.config.appTitle) {
      headers['X-Title'] = this.config.appTitle;
    }

    let response;
    try {
      response = await this.http.postJson({
        url: `${this.config.baseUrl}/embeddings`,
        headers,
        body: {
          model: this.config.model,
          input: texts.length === 1 ? texts[0] : [...texts],
          dimensions: this.config.dimensions,
        },
        timeoutMs: this.config.timeoutMs,
      });
    } catch (error) {
      throw new EmbeddingUnavailableError(
        error instanceof Error ? error.message : 'Embedding request failed',
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new EmbeddingUnavailableError(
        `Embedding provider returned HTTP ${response.status}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.bodyText) as unknown;
    } catch {
      throw new EmbeddingUnavailableError(
        'Embedding provider returned non-JSON body',
      );
    }

    const vectors = extractEmbeddingVectors(parsed, texts.length);
    for (const vector of vectors) {
      if (vector.length !== this.config.dimensions) {
        throw new EmbeddingUnavailableError(
          `Embedding dimension mismatch: got ${vector.length}, configured ${this.config.dimensions}`,
        );
      }
    }
    return vectors;
  }
}

function extractEmbeddingVectors(
  body: unknown,
  expectedCount: number,
): number[][] {
  if (!body || typeof body !== 'object') {
    throw new EmbeddingUnavailableError('Invalid embedding response shape');
  }
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length !== expectedCount) {
    throw new EmbeddingUnavailableError(
      `Expected ${expectedCount} embedding(s), got ${Array.isArray(data) ? data.length : 0}`,
    );
  }

  const indexed = data.map((item, fallbackIndex) => {
    if (!item || typeof item !== 'object') {
      throw new EmbeddingUnavailableError('Invalid embedding item');
    }
    const embedding = (item as { embedding?: unknown; index?: unknown })
      .embedding;
    const index =
      typeof (item as { index?: unknown }).index === 'number'
        ? ((item as { index: number }).index)
        : fallbackIndex;
    if (!Array.isArray(embedding) || embedding.some((n) => typeof n !== 'number')) {
      throw new EmbeddingUnavailableError('Embedding vector missing or invalid');
    }
    return { index, vector: embedding as number[] };
  });

  indexed.sort((a, b) => a.index - b.index);
  return indexed.map((row) => row.vector);
}
