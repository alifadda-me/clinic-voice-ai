# Store roles

PostgreSQL is the authoritative source of clinic state.

Everything else is a disposable projection or transient side-channel:

| Store | Role |
|-------|------|
| Redis | Transient working memory (session turns) |
| Qdrant | Derived semantic index (ranked candidate IDs) |
| Neo4j | Derived relationship enrichment |
| Opik | Observability only (fail-open) |
| Google Calendar | External calendar provider |

## Invariants

1. Losing Redis, Qdrant, Neo4j, or Opik must never corrupt clinic data in PostgreSQL.
2. Every derived store must be rebuildable from authoritative data (`npm run rebuild:search`, `npm run rebuild:graph`).
3. Domain and application depend on ports — never on a particular derived database.
4. Provider failure must be explicit (or a documented degraded mode). Never invent clinic truth.
5. Do not dual-write derived stores inside domain rules. Prefer explicit rebuild/orchestration.
6. Semantic search and peer-affinity return candidates only. Eligibility (active doctor, ownership, availability, booking) is applied after hydration from PostgreSQL.
