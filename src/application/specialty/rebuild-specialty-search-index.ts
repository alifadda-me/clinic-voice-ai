import type { Specialty } from '../../domain/index.js';
import type { SpecialtyRepository } from '../../ports/clinic/repositories.js';
import type { EmbeddingProvider } from '../../ports/platform/embedding-provider.js';
import type { SemanticSearch } from '../../ports/platform/semantic-search.js';
import { EmbeddingUnavailableError } from '../../ports/platform/semantic-search.js';
import { SPECIALTY_SEARCH_INDEX } from '../specialty/search-specialties.js';

export type RebuildSpecialtySearchIndexResult = {
  indexedCount: number;
  indexId: typeof SPECIALTY_SEARCH_INDEX;
};

/**
 * Rebuilds the disposable specialty search projection from SpecialtyRepository.
 * Writes through SemanticSearch only — never mutates clinic SoT.
 */
export class RebuildSpecialtySearchIndex {
  constructor(
    private readonly specialties: SpecialtyRepository,
    private readonly semanticSearch: SemanticSearch,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute(): Promise<RebuildSpecialtySearchIndexResult> {
    const specialties = await this.specialties.listAll();
    const texts = specialties.map(specialtyDocumentText);

    let vectors: number[][];
    try {
      vectors = await this.embeddings.embedMany(texts);
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      throw new EmbeddingUnavailableError(
        error instanceof Error ? error.message : 'Embedding failed',
      );
    }

    const documents = specialties.map((specialty, i) => ({
      id: specialty.id,
      text: texts[i]!,
      vector: vectors[i],
    }));

    await this.semanticSearch.replaceIndex(SPECIALTY_SEARCH_INDEX, documents);

    return {
      indexedCount: documents.length,
      indexId: SPECIALTY_SEARCH_INDEX,
    };
  }
}

export function specialtyDocumentText(specialty: Specialty): string {
  return [specialty.name, specialty.description]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}
