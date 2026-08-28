import type { Doctor } from '../../domain/index.js';
import { asDoctorId, asSpecialtyId } from '../../domain/index.js';
import type { DoctorRepository } from '../../ports/clinic/repositories.js';
import type { EmbeddingProvider } from '../../ports/platform/embedding-provider.js';
import type { SemanticSearch } from '../../ports/platform/semantic-search.js';
import {
  EmbeddingUnavailableError,
  SemanticSearchUnavailableError,
} from '../../ports/platform/semantic-search.js';

export const DOCTOR_SEARCH_INDEX = 'doctors';

/**
 * Clinic/application search intent — not a vector-DB filter DSL.
 * Semantic retrieval returns candidates; eligibility is applied after hydrate.
 *
 * Availability ("متاح الصبح") is NOT part of this criteria — compose with
 * GetAvailableAppointments after discovery.
 */
export type DoctorSearchCriteria = {
  query: string;
  specialtyId?: string;
  limit?: number;
};

export type SearchDoctorsResult = {
  doctors: Doctor[];
  scores: Record<string, number>;
};

export class SearchDoctors {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly semanticSearch: SemanticSearch,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute(criteria: DoctorSearchCriteria): Promise<SearchDoctorsResult> {
    const limit = criteria.limit ?? 10;

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
        DOCTOR_SEARCH_INDEX,
        {
          text: criteria.query,
          limit: criteria.specialtyId ? limit * 3 : limit,
        },
        vector,
      );
    } catch (error) {
      if (error instanceof SemanticSearchUnavailableError) throw error;
      throw new SemanticSearchUnavailableError(
        error instanceof Error ? error.message : 'Semantic search failed',
      );
    }

    const specialtyId = criteria.specialtyId
      ? asSpecialtyId(criteria.specialtyId)
      : undefined;

    const doctors: Doctor[] = [];
    const scores: Record<string, number> = {};

    for (const hit of hits) {
      if (doctors.length >= limit) break;

      const doctor = await this.doctors.findById(asDoctorId(hit.id));
      if (!doctor || !doctor.active) continue;
      if (specialtyId && !doctor.hasSpecialty(specialtyId)) continue;

      doctors.push(doctor);
      scores[doctor.id] = hit.score;
    }

    return { doctors, scores };
  }
}
