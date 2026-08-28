/**
 * Platform embedding provider — provider-neutral vectors for SemanticSearch.
 *
 * kind:
 *   - 'remote' — production-capable (OpenRouter / compatible HTTP)
 *   - 'deterministic' — tests / local deterministic development only
 *
 * Production runtime MUST refuse kind === 'deterministic'.
 */

export type EmbeddingProviderKind = 'remote' | 'deterministic';

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  embed(text: string): Promise<number[]>;
  embedMany(texts: readonly string[]): Promise<number[][]>;
  dimensions(): number;
}
