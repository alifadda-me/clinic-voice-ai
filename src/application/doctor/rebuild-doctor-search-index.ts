import type { Doctor } from '../../domain/index.js';
import type {
  DoctorRepository,
  SpecialtyRepository,
} from '../../ports/clinic/repositories.js';
import type { EmbeddingProvider } from '../../ports/platform/embedding-provider.js';
import type { SemanticSearch } from '../../ports/platform/semantic-search.js';
import { EmbeddingUnavailableError } from '../../ports/platform/semantic-search.js';
import { DOCTOR_SEARCH_INDEX } from './search-doctors.js';

export type RebuildDoctorSearchIndexResult = {
  indexedCount: number;
  indexId: typeof DOCTOR_SEARCH_INDEX;
};

/**
 * Rebuilds the disposable doctor search projection from authoritative repos.
 * Reads DoctorRepository + SpecialtyRepository; writes SemanticSearch only.
 * No hidden sync from doctor.save — call this explicitly.
 */
export class RebuildDoctorSearchIndex {
  constructor(
    private readonly doctors: DoctorRepository,
    private readonly specialties: SpecialtyRepository,
    private readonly semanticSearch: SemanticSearch,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute(): Promise<RebuildDoctorSearchIndexResult> {
    const [doctors, specialties] = await Promise.all([
      this.doctors.listAll(),
      this.specialties.listAll(),
    ]);

    const specialtyById = new Map(specialties.map((s) => [s.id, s] as const));

    const texts = doctors.map((doctor) =>
      doctorDocumentText(doctor, specialtyById),
    );

    let vectors: number[][];
    try {
      vectors = await this.embeddings.embedMany(texts);
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      throw new EmbeddingUnavailableError(
        error instanceof Error ? error.message : 'Embedding failed',
      );
    }

    const documents = doctors.map((doctor, i) => ({
      id: doctor.id,
      text: texts[i]!,
      vector: vectors[i],
    }));

    await this.semanticSearch.replaceIndex(DOCTOR_SEARCH_INDEX, documents);

    return {
      indexedCount: documents.length,
      indexId: DOCTOR_SEARCH_INDEX,
    };
  }
}

export function doctorDocumentText(
  doctor: Doctor,
  specialtyById: ReadonlyMap<
    string,
    { name: string; description?: string | undefined }
  >,
): string {
  const specialtyBits = doctor.specialtyIds.flatMap((id) => {
    const specialty = specialtyById.get(id);
    if (!specialty) return [];
    return [specialty.name, specialty.description];
  });
  return [doctor.fullName, doctor.bio, ...specialtyBits]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}
