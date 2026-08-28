import { describe, expect, it } from 'vitest';
import { InMemorySemanticSearch } from '../../src/infrastructure/memory/index.js';
import { defineSemanticSearchContract } from './semantic-search.contract.js';

defineSemanticSearchContract('InMemorySemanticSearch', () => {
  return new InMemorySemanticSearch();
});

describe('InMemorySemanticSearch extras', () => {
  it('setUnavailable surfaces SemanticSearchUnavailableError', async () => {
    const search = new InMemorySemanticSearch();
    search.setUnavailable(true);
    await expect(
      search.search('x', { text: 'q' }, [1, 0]),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SEARCH_UNAVAILABLE' });
  });
});
