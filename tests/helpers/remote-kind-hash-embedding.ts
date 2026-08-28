import type { EmbeddingProvider } from '../../src/ports/platform/embedding-provider.js';
import { EmbeddingUnavailableError } from '../../src/ports/platform/semantic-search.js';

/**
 * Hash embedding with kind 'remote' for production-runtime tests that must
 * not use live embedding credentials and must not use kind 'deterministic'.
 * Not for APP_MODE=production process startup from env.
 */
export class RemoteKindHashEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'remote' as const;

  private unavailable = false;

  constructor(private readonly dims = 32) {}

  setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    if (this.unavailable) {
      throw new EmbeddingUnavailableError(
        'RemoteKindHashEmbeddingProvider is marked unavailable',
      );
    }
    const vector = new Array<number>(this.dims).fill(0);
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length; i += 1) {
      const idx = normalized.charCodeAt(i) % this.dims;
      vector[idx] = (vector[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  async embedMany(texts: readonly string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
