# Operations

Day-to-day tasks for running Clinic Voice AI.

---

## Local services

| Command | What it does |
|---------|----------------|
| `npm run services:up` | Start Postgres + Redis (enough for many tests) |
| `npm run services:up:all` | Start Postgres, Redis, Qdrant, Neo4j |
| `npm run services:down` | Stop Compose services |
| `npm run db:setup` | Start Postgres and run migrations |
| `npm run db:migrate` | Run migrations only |
| `npm run db:reset:local` | **Destructive.** Wipe local clinic tables (Docker Postgres only) |

Always prefer `db:reset:local` over a vague “reset” name. It refuses to run if `DATABASE_URL` does not look like the local Docker URL.

---

## Application process

```bash
cp .env.example .env
# fill required secrets — see ENVIRONMENT.md

npm install
npm run services:up:all
npm run db:migrate
npm start
```

Health:

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS http://127.0.0.1:3000/ready
```

Or:

```bash
APP_BASE_URL=http://127.0.0.1:3000 npm run production:check
```

---

## Rebuild derived data

After you change doctors, specialties, preferences, or completed visits:

```bash
npm run rebuild:search    # Qdrant indexes from Postgres
npm run rebuild:graph     # Neo4j affinity graph from Postgres
npm run rebuild:derived   # both
```

These are safe to re-run. They replace the disposable copies. They do **not** delete patients or appointments in Postgres.

---

## Logs

- Local: process stdout/stderr from `npm start`
- Railway: service → **Logs**
- Opik: AI turn / tool traces (if `OPIK_API_KEY` is set)

Do not log raw access tokens, API keys, or full patient chat transcripts in production.

---

## Backups

- **Postgres:** enable automatic backups on your host (Railway Postgres backups or snapshots).
- **Redis:** optional; losing Redis only loses temporary chat memory.
- **Qdrant / Neo4j:** disposable — rebuild from Postgres after restore.

---

## Webhooks

| Provider | Method | Path | Auth |
|----------|--------|------|------|
| Twilio Voice | `POST` | `/v1/twilio/voice` | Twilio signature header `X-Twilio-Signature` |

Local testing needs a public HTTPS URL (for example a tunnel). See [TESTING.md](TESTING.md) Twilio section.

---

## Local vs production

| Thing | Local | Production |
|-------|-------|------------|
| Auth | Fake JWT in tests / real IdP if you want | Real JWT + JWKS only |
| Embeddings | Hash/fake in unit tests | Real OpenRouter (or compatible) only |
| Postgres | Docker `:54329` | Managed Postgres |
| Redis | Docker `:63799` | Managed Redis |
| Qdrant | Docker or skip | Cloud or dedicated host |
| Neo4j | Docker or skip | Aura or dedicated host |
| Calendar | In-memory fake in many tests | Google service account |
| Opik | Off / noop | Optional real key (fail-open) |
| Voice | Scripted fake | Gemini (or other) when enabled |
| Twilio | Signature unit tests | Real number + HTTPS webhook |
| HTTPS | Optional | Required |
| Secrets | `.env` (gitignored) | Host secret store |

Production must **never** silently fall back to demo auth or deterministic embeddings.

---

## Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm test` | Fast automated suite |
| `npm run test:integration` | Docker Postgres/Redis (+ optional Qdrant/Neo4j) |
| `npm run test:embeddings` | Opt-in live embeddings |
| `npm run eval:live` | Opt-in live LLM eval |
| `npm run check:deps` | Architecture import rules |
| `npm run build` | Typecheck |
| `npm run production:check` | Hit `/health` and `/ready` |
| `npm run production:smoke` | Guided smoke (prints warnings; needs env) |

Full manual scenarios: [TESTING.md](TESTING.md).
