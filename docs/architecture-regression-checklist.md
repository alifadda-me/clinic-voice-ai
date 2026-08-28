# Architecture regression checklist

Fail the PR if any item is violated.

## Never allow

- [ ] Drizzle / SQL types in `src/domain` or `src/application`
- [ ] Qdrant / vector filter DSL in domain or application
- [ ] Treating Redis / Qdrant / Neo4j as co-equal sources of clinic truth
- [ ] Qdrant SDK outside `src/infrastructure/vector/qdrant/`
- [ ] neo4j-driver outside `src/infrastructure/graph/neo4j/`
- [ ] Silent PostgreSQL→Qdrant dual-write on entity save
- [ ] Silent PostgreSQL→Neo4j dual-write on book/cancel/prefs (rebuild is explicit)
- [ ] Reporting successful search-index rebuild after partial write
- [ ] Google Calendar / `googleapis` types in domain or application
- [ ] Gemini / LangChain / LangGraph types in domain or application
- [ ] Provider-specific memory APIs (Redis, Cypher, Opik SDK) outside infrastructure
- [ ] Business rules enforced only in prompts
- [ ] Business rules implemented inside agent tools (tools must call use cases)
- [ ] Agent importing infrastructure or repositories
- [ ] LLM-supplied patientId trusted for session-bound operations
- [ ] OpenRouter/OpenAI types leaking into agent/domain/application
- [ ] Treating session/conversation ID possession as patient authentication
- [ ] Using DemoAuthGateway as the production default / silent fallback
- [ ] `register_patient` (or any tool) establishing authenticated authority
- [ ] WorkingMemory metadata treated as trusted identity
- [ ] Star-exporting Drizzle schema from infrastructure barrels into runtime
- [ ] Global infrastructure singletons imported by domain/application
- [ ] `process.env` reads in domain or application
- [ ] Framework types (Express Request, WebSocket) in domain or application
- [ ] Domain importing application, ports, or infrastructure
- [ ] Application importing infrastructure adapters
- [ ] Application or agent importing `src/runtime`

## Always require

- [ ] Appointment lifecycle transitions enforced in domain code
- [ ] Ownership/authorization enforced in application (not agent)
- [ ] Calendar writes via atomic `reserveSlot` / `rescheduleReservation`
- [ ] Appointment creates via `createIfNoConflict` (concurrency contract)
- [ ] PostgreSQL exclusion constraints for scheduled overlaps
- [ ] Semantic retrieval separated from business eligibility
- [ ] PatientContext assembled from durable repos only (no Redis/Neo4j/Qdrant DTOs)
- [ ] Preferences authoritative in PreferenceRepository — not Neo4j
- [ ] Derived stores disposable and rebuildable; loss never corrupts Postgres
- [ ] SemanticSearch returns candidates only; eligibility stays in application/domain
- [ ] No MemoryManager god object spanning PG/Redis/Neo4j/Qdrant
- [ ] Clock used for "now" in scheduling use cases
- [ ] Provider exceptions translated at adapter boundaries
- [ ] Peer-affinity suggestions hydrate from DoctorRepository and filter active doctors
- [ ] Production runtime refuses demo auth and deterministic embeddings

## Production runtime

- [ ] `createProductionRuntime` / `createProductionHttpApp` refuse demo AuthGateway
- [ ] `APP_MODE=production` requires `DATABASE_URL`, `REDIS_URL`, `AUTH_*`, embedding credentials
- [ ] Health `/health` and `/ready` (Postgres + Redis required)
- [ ] HTTP / Voice / Twilio share AuthGateway → TrustedExecutionContext → same use cases
- [ ] Conversation ID never authenticates; Twilio Caller ID never becomes patientId
- [ ] Cross-patient cancel/reschedule denied in application
- [ ] Booking succeeds when Qdrant/Neo4j/Opik are unavailable
- [ ] Calendar reserve failure never leaves a silent successful appointment

## Verify locally

```bash
npm test
npm run build
npm run check:deps
# docker compose up -d postgres redis && npm run test:integration
# LIVE_EMBEDDINGS=1 npm run test:embeddings   # opt-in
# npm run eval:live                           # opt-in live LLM eval
```

See also [docs/stores.md](stores.md) and [docs/twilio-phone-auth.md](twilio-phone-auth.md).
