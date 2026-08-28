# Troubleshooting

Problems you will see often, and what to do.

---

## App will not start

| Message / symptom | Likely cause | Fix |
|-------------------|--------------|-----|
| `APP_MODE` / production config error | `APP_MODE` not `production` | Set `APP_MODE=production` |
| `REDIS_URL is required` | Missing Redis URL | Set `REDIS_URL` |
| Auth config parse error | Missing `AUTH_ISSUER` / `AUTH_AUDIENCE` / `AUTH_JWKS_URL` | Copy from IdP |
| Embedding API key required | No `EMBEDDING_API_KEY` or `OPENROUTER_API_KEY` | Set one of them |
| `EMBEDDING_MODE=deterministic` refused | Test mode left on | Remove that variable |
| Demo auth refused | Demo gateway in production path | Use JWT gateway only |

---

## `/ready` is 503

1. Run `curl -sS http://127.0.0.1:3000/ready` and read `checks`.
2. If `postgres` failed: is Docker up? Is `DATABASE_URL` correct? Did migrations run?
3. If `redis` failed: `npm run redis:up` and check `REDIS_URL`.
4. Qdrant/Neo4j failing is OK for readiness if they are marked not required — search/suggest may still fail until they are healthy.

---

## Chat returns 401

| Case | Meaning |
|------|---------|
| Invalid / expired / wrong issuer / wrong audience Bearer | Auth correctly rejected the token |
| Malformed `Authorization` header | Fix `Bearer <token>` format |

Missing Bearer is allowed for **anonymous** discovery chat. Enroll/link **require** a valid Bearer.

---

## Enroll / link fails

- **401:** not logged in or bad token.
- **Conflict:** principal already linked, or patient already linked to someone else.
- **Patient not found:** wrong `patientId` on link.

Remember: `register_patient` via the agent does **not** log you in.

---

## Search returns empty or wrong doctors

1. Did you seed doctors in Postgres?
2. Did you run `npm run rebuild:search`?
3. Do embedding dimensions match Qdrant (`EMBEDDING_DIMENSIONS`)?
4. Is the doctor `active` in Postgres? Inactive doctors must not appear after hydrate.
5. If Qdrant is down, search should fail clearly — not invent doctors.

PostgreSQL is the final truth.

---

## Booking fails

| Symptom | Check |
|---------|--------|
| Unauthenticated | User must enroll/link first for patient tools |
| Slot taken | Another booking won the race |
| Calendar error | Google Calendar credentials / fake calendar in tests |
| Claims success but no row | Bug — check Postgres `appointments` table; never trust the model alone |

---

## Cancel / reschedule of another patient

Must be denied. If it succeeds, stop shipping and fix ownership checks.

---

## Opik shows nothing

- Is `OPIK_API_KEY` set?
- Wrong project/workspace name?
- This is OK for local. Chat must still work without Opik.

---

## Twilio 403

Signature check failed. Causes:

- Wrong `TWILIO_AUTH_TOKEN`
- Webhook URL in Twilio console does not exactly match `TWILIO_VOICE_WEBHOOK_URL`
- Body params altered by a proxy

Caller ID is never patient login.

---

## Neo4j / peer affinity empty

1. Seed specialty preferences and **completed** visits in Postgres.
2. Run `npm run rebuild:graph`.
3. If Neo4j is down, suggestions must fail clearly — not invent doctors.

---

## Redis memory “lost”

Expected after TTL (`WORKING_MEMORY_TTL_SECONDS`) or Redis restart. Clinic appointments remain in Postgres.

---

## CI fails but laptop passes

1. Read the GitHub Actions log.
2. Ensure Node 20+.
3. Integration job needs service containers; unit job does not.
4. Do not require live OpenRouter/Twilio keys in PR CI.

---

## Still stuck

1. `npm test`
2. `npm run check:deps`
3. `curl /health` and `/ready`
4. Check env against [ENVIRONMENT.md](ENVIRONMENT.md)
5. Check store roles in [stores.md](stores.md)
