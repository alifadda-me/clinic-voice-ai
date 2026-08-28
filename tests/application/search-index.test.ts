import { beforeEach, describe, expect, it } from 'vitest';
import { asDoctorId } from '../../src/domain/index.js';
import {
  DOCTOR_SEARCH_INDEX,
  SPECIALTY_SEARCH_INDEX,
} from '../../src/application/index.js';
import {
  EmbeddingUnavailableError,
  SemanticSearchUnavailableError,
} from '../../src/ports/platform/semantic-search.js';
import { createTestWorld, type TestWorld } from '../helpers/test-world.js';

describe('Search index rebuild + discovery (InMemory)', () => {
  let world: TestWorld;
  let seed: Awaited<ReturnType<TestWorld['seed']>>;

  beforeEach(async () => {
    world = createTestWorld();
    seed = await world.seed();
  });

  describe('RebuildDoctorSearchIndex', () => {
    it('rebuilds doctor documents from authoritative repositories', async () => {
      await world.semanticSearch.clearIndex(DOCTOR_SEARCH_INDEX);
      expect(world.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX)).toEqual(
        [],
      );

      const result = await world.useCases.rebuildDoctorSearchIndex.execute();
      expect(result.indexId).toBe(DOCTOR_SEARCH_INDEX);
      expect(result.indexedCount).toBe(3);
      expect(world.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX).sort()).toEqual(
        [seed.drOmar.id, seed.drSara.id, seed.inactive.id].sort(),
      );
    });

    it('is idempotent across repeated rebuilds', async () => {
      const first = await world.useCases.rebuildDoctorSearchIndex.execute();
      const second = await world.useCases.rebuildDoctorSearchIndex.execute();
      expect(second).toEqual(first);
      expect(world.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX)).toHaveLength(
        3,
      );
    });

    it('indexes empty when there are no doctors', async () => {
      const empty = createTestWorld();
      const result = await empty.useCases.rebuildDoctorSearchIndex.execute();
      expect(result.indexedCount).toBe(0);
      expect(empty.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX)).toEqual(
        [],
      );
    });

    it('removes stale index entries that are no longer in PostgreSQL/repos', async () => {
      await world.semanticSearch.index(DOCTOR_SEARCH_INDEX, [
        {
          id: 'ghost_doctor',
          text: 'ghost cardiology heart',
          vector: await world.embeddings.embed('ghost cardiology heart'),
        },
      ]);
      expect(
        world.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX),
      ).toContain('ghost_doctor');

      await world.useCases.rebuildDoctorSearchIndex.execute();
      expect(
        world.semanticSearch.listDocumentIds(DOCTOR_SEARCH_INDEX),
      ).not.toContain('ghost_doctor');
    });
  });

  describe('RebuildSpecialtySearchIndex', () => {
    it('rebuilds specialty documents from authoritative repositories', async () => {
      await world.semanticSearch.clearIndex(SPECIALTY_SEARCH_INDEX);
      const result = await world.useCases.rebuildSpecialtySearchIndex.execute();
      expect(result.indexId).toBe(SPECIALTY_SEARCH_INDEX);
      expect(result.indexedCount).toBe(2);
      expect(
        world.semanticSearch.listDocumentIds(SPECIALTY_SEARCH_INDEX).sort(),
      ).toEqual([seed.cardiology.id, seed.dermatology.id].sort());
    });

    it('is idempotent across repeated rebuilds', async () => {
      const first = await world.useCases.rebuildSpecialtySearchIndex.execute();
      const second = await world.useCases.rebuildSpecialtySearchIndex.execute();
      expect(second).toEqual(first);
    });

    it('indexes empty when there are no specialties', async () => {
      const empty = createTestWorld();
      const result = await empty.useCases.rebuildSpecialtySearchIndex.execute();
      expect(result.indexedCount).toBe(0);
    });
  });

  describe('search hydration from SoT', () => {
    it('skips semantic hits that no longer exist in doctor repository', async () => {
      await world.semanticSearch.replaceIndex(DOCTOR_SEARCH_INDEX, [
        {
          id: 'missing_doc',
          text: 'heart cardiologist cardiology',
          vector: await world.embeddings.embed('heart cardiologist cardiology'),
        },
      ]);

      const result = await world.useCases.searchDoctors.execute({
        query: 'heart cardiologist',
      });
      expect(result.doctors).toEqual([]);
    });

    it('clearing the index does not mutate clinic doctor records', async () => {
      await world.semanticSearch.clearIndex(DOCTOR_SEARCH_INDEX);
      const doctor = await world.doctors.findById(asDoctorId(seed.drSara.id));
      expect(doctor?.fullName).toBe('Dr Sara Hassan');

      const result = await world.useCases.searchDoctors.execute({
        query: 'cardiologist',
      });
      expect(result.doctors).toEqual([]);
    });
  });

  describe('unavailable providers', () => {
    it('surfaces SemanticSearchUnavailableError from SearchDoctors', async () => {
      world.semanticSearch.setUnavailable(true);
      await expect(
        world.useCases.searchDoctors.execute({ query: 'cardiology' }),
      ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
    });

    it('surfaces SemanticSearchUnavailableError from SearchSpecialties', async () => {
      world.semanticSearch.setUnavailable(true);
      await expect(
        world.useCases.searchSpecialties.execute({ query: 'skin' }),
      ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
    });

    it('surfaces EmbeddingUnavailableError when embeddings fail', async () => {
      world.embeddings.setUnavailable(true);
      await expect(
        world.useCases.searchDoctors.execute({ query: 'cardiology' }),
      ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    });

    it('surfaces EmbeddingUnavailableError from rebuild', async () => {
      world.embeddings.setUnavailable(true);
      await expect(
        world.useCases.rebuildDoctorSearchIndex.execute(),
      ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    });

    it('surfaces SemanticSearchUnavailableError from rebuild', async () => {
      world.semanticSearch.setUnavailable(true);
      await expect(
        world.useCases.rebuildSpecialtySearchIndex.execute(),
      ).rejects.toBeInstanceOf(SemanticSearchUnavailableError);
    });
  });
});
