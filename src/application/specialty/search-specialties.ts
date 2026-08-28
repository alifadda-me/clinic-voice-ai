import { asSpecialtyId, type Specialty } from '../../domain/index.js';
import type { SpecialtyRepository } from '../../ports/clinic/repositories.js';
import type { EmbeddingProvider } from '../../ports/platform/embedding-provider.js';
import type { SemanticSearch } from '../../ports/platform/semantic-search.js';
import {
  EmbeddingUnavailableError,
  SemanticSearchUnavailableError,
} from '../../ports/platform/semantic-search.js';

export const SPECIALTY_SEARCH_INDEX = 'specialties';

export type SpecialtySearchCriteria = {
  query: string;
  limit?: number;
};

export class SearchSpecialties {
  constructor(
    private readonly specialties: SpecialtyRepository,
    private readonly semanticSearch: SemanticSearch,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute(criteria: SpecialtySearchCriteria): Promise<Specialty[]> {
    let vector: number[];
    try {
      vector = await this.embeddings.embed(criteria.query);
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      throw new EmbeddingUnavailableError(
        error instanceof Error ? error.message : 'Embedding failed',
      );
    }

    let hits;
    try {
      hits = await this.semanticSearch.search(
        SPECIALTY_SEARCH_INDEX,
        {
          text: criteria.query,
          limit: criteria.limit ?? 10,
        },
        vector,
      );
    } catch (error) {
      if (error instanceof SemanticSearchUnavailableError) throw error;
      throw new SemanticSearchUnavailableError(
        error instanceof Error ? error.message : 'Semantic search failed',
      );
    }

    const results: Specialty[] = [];
    for (const hit of hits) {
      const specialty = await this.specialties.findById(asSpecialtyId(hit.id));
      if (specialty) results.push(specialty);
    }

    // Empty hits (not provider outage) → structured name fallback from SoT.
    if (results.length === 0) {
      return this.specialties.findByNameQuery(criteria.query);
    }

    return results;
  }
}
