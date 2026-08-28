# Clinic Voice AI

A conversational assistant for clinic appointments.

People can chat (or use voice/phone when enabled) to find doctors, check availability, book, cancel, and reschedule — in Egyptian Arabic or English.

## What you need

- Node.js 20 or newer
- Docker (for local Postgres, Redis, and optional Qdrant/Neo4j)

## Quick start (local)

```bash
cp .env.example .env
# Edit .env — see docs/ENVIRONMENT.md

npm install
npm run services:up          # Postgres + Redis
npm run db:migrate
npm test
npm run build
```

Full local stack (adds search + graph helpers):

```bash
npm run services:up:all
npm run db:seed              # 31 demo doctors + 11 specialties
npm run rebuild:derived      # index doctors in Qdrant for search
# or: npm run db:seed:full
```

Start the HTTP server (production mode settings in `.env`):

```bash
npm start
curl -sS http://127.0.0.1:3000/health
curl -sS http://127.0.0.1:3000/ready
```

## How the pieces fit

```text
Chat / Voice / Phone
  → login check (JWT)
  → trusted patient context
  → AI agent + tools
  → clinic rules
  → PostgreSQL (real clinic data)
     + helpers: Redis, Qdrant, Neo4j, Calendar, Opik
```

| Store | Simple role |
|-------|-------------|
| PostgreSQL | Source of truth for patients, doctors, appointments |
| Redis | Short-lived chat memory (not identity) |
| Qdrant | Meaning-based search helper (rebuildable) |
| Neo4j | Relationship suggestions helper (rebuildable) |
| Opik | Optional AI traces (if down, app still works) |

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/TEST_SCENARIOS.md](docs/TEST_SCENARIOS.md) | **Scenario playbook** — smoke → booking → security (curl + Arabic examples) |
| [docs/TESTING.md](docs/TESTING.md) | How to test everything (setup, automation, deep detail) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy on Railway |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Day-to-day commands |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
| [docs/stores.md](docs/stores.md) | Which database owns what |
| [docs/twilio-phone-auth.md](docs/twilio-phone-auth.md) | Why Caller ID is not login |

## Common commands

```bash
npm test                     # automated unit/contract tests
npm run test:integration     # needs Docker Postgres + Redis
npm run check:deps           # architecture boundaries
npm run production:check     # /health + /ready against APP_BASE_URL
npm run production:smoke     # guided post-deploy checklist
npm run db:reset:local       # wipe LOCAL Docker DB only (needs confirm)
```

## CI / CD

- **Pull requests:** `.github/workflows/ci.yml` — build, unit tests, dependency check, Postgres+Redis integration
- **Production deploy:** `.github/workflows/deploy.yml` — Railway deploy, migrate, health check (on push to `main`)

Set GitHub secrets before first deploy: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`, `APP_BASE_URL`. See [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Safety rules (short)

- Conversation IDs are not login.
- Twilio Caller ID is not patient identity.
- The AI cannot pick a `patientId` to bypass ownership.
- Production refuses demo auth and fake/deterministic embeddings.

## License

Private unless you add a `LICENSE` file.
