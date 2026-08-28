import { describe, expect, it } from 'vitest';
import { loadEmbeddingProviderConfig } from '../../src/config/embeddings.js';
import { OpenRouterEmbeddingProvider } from '../../src/infrastructure/llm/openrouter/openrouter-embedding-provider.js';
import type { OpenRouterHttpClient } from '../../src/infrastructure/llm/openrouter/openrouter-http.js';
import { EmbeddingUnavailableError } from '../../src/ports/platform/semantic-search.js';
import {
  assertProductionEmbeddings,
} from '../../src/runtime/production-runtime.js';
import { InMemoryEmbeddingProvider } from '../../src/infrastructure/memory/index.js';
import { RemoteKindHashEmbeddingProvider } from '../helpers/remote-kind-hash-embedding.js';

function fakeHttp(
  handler: OpenRouterHttpClient['postJson'],
): OpenRouterHttpClient {
  return { postJson: handler };
}

describe('OpenRouterEmbeddingProvider', () => {
  const config = {
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/text-embedding-3-small',
    dimensions: 4,
    timeoutMs: 5_000,
  };

  it('embeds via OpenAI-compatible /embeddings', async () => {
    const http = fakeHttp(async (request) => {
      expect(request.url).toBe('https://openrouter.ai/api/v1/embeddings');
      expect(request.headers.Authorization).toBe('Bearer test-key');
      const body = request.body as { model: string; dimensions: number };
      expect(body.model).toBe(config.model);
      expect(body.dimensions).toBe(4);
      return {
        status: 200,
        bodyText: JSON.stringify({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }],
        }),
      };
    });

    const provider = new OpenRouterEmbeddingProvider(http, config);
    expect(provider.kind).toBe('remote');
    expect(provider.dimensions()).toBe(4);
    const vector = await provider.embed('cardiologist');
    expect(vector).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('embedMany preserves order by index', async () => {
    const http = fakeHttp(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        data: [
          { index: 1, embedding: [0, 1, 0, 0] },
          { index: 0, embedding: [1, 0, 0, 0] },
        ],
      }),
    }));
    const provider = new OpenRouterEmbeddingProvider(http, config);
    const vectors = await provider.embedMany(['a', 'b']);
    expect(vectors).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ]);
  });

  it('maps HTTP errors to EmbeddingUnavailableError', async () => {
    const http = fakeHttp(async () => ({
      status: 503,
      bodyText: 'upstream down',
    }));
    const provider = new OpenRouterEmbeddingProvider(http, config);
    await expect(provider.embed('x')).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('rejects dimension mismatch from provider response', async () => {
    const http = fakeHttp(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        data: [{ index: 0, embedding: [1, 2] }],
      }),
    }));
    const provider = new OpenRouterEmbeddingProvider(http, config);
    await expect(provider.embed('x')).rejects.toThrow(/dimension/i);
  });
});

describe('embedding config', () => {
  it('loads from EMBEDDING_API_KEY', () => {
    const cfg = loadEmbeddingProviderConfig({
      EMBEDDING_API_KEY: 'ek',
      EMBEDDING_DIMENSIONS: '1536',
    });
    expect(cfg.apiKey).toBe('ek');
    expect(cfg.dimensions).toBe(1536);
  });

  it('falls back to OPENROUTER_API_KEY', () => {
    const cfg = loadEmbeddingProviderConfig({
      OPENROUTER_API_KEY: 'or',
    });
    expect(cfg.apiKey).toBe('or');
  });

  it('refuses EMBEDDING_MODE=deterministic', () => {
    expect(() =>
      loadEmbeddingProviderConfig({
        EMBEDDING_API_KEY: 'ek',
        EMBEDDING_MODE: 'deterministic',
      }),
    ).toThrow(/deterministic/);
  });

  it('requires an API key', () => {
    expect(() => loadEmbeddingProviderConfig({})).toThrow(/API_KEY/);
  });
});

describe('assertProductionEmbeddings', () => {
  it('refuses deterministic providers', () => {
    expect(() =>
      assertProductionEmbeddings(new InMemoryEmbeddingProvider(32), 32),
    ).toThrow(/deterministic/);
  });

  it('refuses dimension mismatch', () => {
    expect(() =>
      assertProductionEmbeddings(new RemoteKindHashEmbeddingProvider(32), 1536),
    ).toThrow(/dimensions/);
  });

  it('accepts remote provider with matching dimensions', () => {
    expect(() =>
      assertProductionEmbeddings(new RemoteKindHashEmbeddingProvider(32), 32),
    ).not.toThrow();
  });
});
