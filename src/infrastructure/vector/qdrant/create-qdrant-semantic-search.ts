import { loadQdrantSemanticSearchConfig } from '../../../config/qdrant.js';
import type { SemanticSearch } from '../../../ports/platform/semantic-search.js';
import { createSdkQdrantOperations } from './sdk-qdrant-operations.js';
import { QdrantSemanticSearch } from './qdrant-semantic-search.js';

/**
 * Env → config → QdrantSemanticSearch.
 * Does not couple to any EmbeddingProvider vendor.
 */
export function createQdrantSemanticSearch(
  env: NodeJS.ProcessEnv = process.env,
): SemanticSearch {
  const config = loadQdrantSemanticSearchConfig(env);
  const ops = createSdkQdrantOperations(config);
  return new QdrantSemanticSearch(ops, config);
}
