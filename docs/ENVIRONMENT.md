# Environment variables

This page lists every setting the application can read.

A **secret** must never be committed to Git. Put secrets only in `.env` (local) or your host’s secret store (production).

Copy the template:

```bash
cp .env.example .env
```

---

## How to read this page

For each variable:

- **Required?** — Must the process refuse to start without it?
- **Where?** — Local Docker, production, or both
- **Secret?** — Can it safely appear in logs or screenshots?

---

## Application

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `APP_MODE` | Yes (production start) | Both | No | Must be `production` for `npm start`. Demo mode is for tests only. | `production` |
| `PORT` | No (default `3000`) | Both | No | HTTP port the app listens on | `3000` |
| `ENABLE_VOICE` | No | Both | No | If `true`, voice stack must be wired (needs a voice provider) | `false` |
| `ENABLE_TWILIO` | No | Both | No | If `true`, Twilio webhook routes mount (needs Twilio vars) | `false` |

**If missing in production:** `APP_MODE` must be set or startup fails.

---

## PostgreSQL (clinic database)

PostgreSQL stores the real clinic data: patients, doctors, appointments, preferences, and “who is logged in → which patient”.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `DATABASE_URL` | Yes in production | Both | Yes | Connection string to Postgres | `postgresql://clinic:clinic@localhost:54329/clinic_voice_ai` |

**Where to get it:** Local = Docker Compose. Production = Railway Postgres (or any managed Postgres) connection URL.

**If missing:** Production startup fails.

---

## Redis (short chat memory)

Redis stores recent chat turns for a conversation. It is **not** patient identity and **not** the source of clinic truth.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `REDIS_URL` | Yes in production | Both | Yes* | Redis connection URL | `redis://127.0.0.1:63799` |
| `WORKING_MEMORY_TTL_SECONDS` | No (default `3600`) | Both | No | How long unused session memory lives (seconds) | `3600` |
| `WORKING_MEMORY_KEY_PREFIX` | No | Both | No | Key prefix so environments do not clash | `clinic:wm` |
| `WORKING_MEMORY_MAX_TURNS` | No (default `100`) | Both | No | Max turns kept per conversation | `100` |

\*Treat Redis URLs with passwords as secrets.

**If missing `REDIS_URL` in production:** Startup fails.

---

## Authentication (login tokens)

The app uses **JWT** (JSON Web Token): a signed string that proves “this request comes from a logged-in user.”

**JWKS** (JSON Web Key Set) is a public URL that lists the keys used to verify those tokens. Your identity provider (Auth0, Clerk, Cognito, Keycloak, etc.) publishes it.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `AUTH_ISSUER` | Yes in production | Production | No | Who issued the token (must match token `iss`) | `https://your-tenant.auth0.com/` |
| `AUTH_AUDIENCE` | Yes in production | Production | No | Who the token is for (must match token `aud`) | `clinic-voice-ai` |
| `AUTH_JWKS_URL` | Yes in production | Production | No | URL to fetch public verify keys | `https://your-tenant.auth0.com/.well-known/jwks.json` |

**Where to get them:** From your IdP dashboard (Issuer, API Audience, JWKS URL).

**If missing:** Production startup fails. Do not use demo auth in production.

Local unit tests use a fake in-memory JWT signer. They do not need a real IdP.

---

## OpenRouter (chat AI model)

OpenRouter is a service that calls large language models over HTTP.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `OPENROUTER_API_KEY` | Yes if chat model not injected | Production | Yes | API key for chat completions | `sk-or-...` |
| `OPENROUTER_MODEL` | No | Both | No | Model id | `openai/gpt-4o-mini` |
| `OPENROUTER_BASE_URL` | No | Both | No | API base URL | `https://openrouter.ai/api/v1` |
| `OPENROUTER_TIMEOUT_MS` | No | Both | No | Request timeout | `30000` |
| `OPENROUTER_HTTP_REFERER` | No | Both | No | Optional attribution header | `https://your-app.example` |
| `OPENROUTER_APP_TITLE` | No | Both | No | Optional app title header | `clinic-voice-ai` |

**Where to get the key:** [openrouter.ai](https://openrouter.ai) account → API keys.

---

## Embeddings (numbers used for semantic search)

An **embedding** turns text into a list of numbers (a **vector**) so similar meanings are close together.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `EMBEDDING_API_KEY` | Yes in production* | Production | Yes | Key for `/embeddings` API | same as OpenRouter key often |
| `EMBEDDING_MODEL` | No | Both | No | Embedding model id | `openai/text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | No (default `1536`) | Both | No | Vector length; must match Qdrant collections | `1536` |
| `EMBEDDING_BASE_URL` | No | Both | No | Usually OpenRouter OpenAI-compatible URL | `https://openrouter.ai/api/v1` |
| `EMBEDDING_TIMEOUT_MS` | No | Both | No | Timeout | `30000` |
| `EMBEDDING_HTTP_REFERER` | No | Both | No | Optional header | — |
| `EMBEDDING_APP_TITLE` | No | Both | No | Optional header | — |
| `EMBEDDING_MODE` | Must NOT be `deterministic` in production | Local tests only | No | Production refuses deterministic/test embeddings | leave unset |

\*Or set `OPENROUTER_API_KEY` as a fallback when `EMBEDDING_API_KEY` is empty.

**If missing in production:** Startup fails. Never silently use test hash embeddings.

Opt-in live embedding tests: `LIVE_EMBEDDINGS=1 npm run test:embeddings`

---

## Qdrant (search helper)

Qdrant stores vectors for doctor/specialty search. It is **not** the source of truth. PostgreSQL still owns real doctor rows.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `QDRANT_URL` | Recommended | Both | No* | Qdrant HTTP URL | `http://127.0.0.1:63339` |
| `QDRANT_API_KEY` | If your cloud requires it | Cloud | Yes | API key | — |
| `QDRANT_COLLECTION_PREFIX` | No | Both | No | Prefix for collection/alias names | `clinic_` |
| `QDRANT_TIMEOUT_MS` | No | Both | No | Timeout | `15000` |

\*Cloud URLs with keys are secrets.

Rebuild after seeding doctors: `npm run rebuild:search`

Opt-in real Qdrant in integration: `REAL_QDRANT=1`

---

## Neo4j (relationship helper)

Neo4j stores a rebuildable graph for suggestions like peer affinity. It is **not** clinic truth.

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `NEO4J_URI` | Recommended | Both | No | Bolt URL | `bolt://127.0.0.1:17687` |
| `NEO4J_USER` | Yes with Neo4j | Both | No | Username | `neo4j` |
| `NEO4J_PASSWORD` | Yes with Neo4j | Both | Yes | Password | local compose uses `clinic-voice-ai` |
| `NEO4J_DATABASE` | No | Both | No | Database name | `neo4j` |

Rebuild: `npm run rebuild:graph`

**Railway Neo4j auth errors** (`The client is unauthorized due to authentication failure`):

1. On the **Neo4j** service → Variables → copy `NEO4J_URI` (must be `bolt://…:7687`, not `http://7474`), user, and password.
2. On the **app** service, set `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (reference Neo4j vars or paste the same values).
3. Redeploy or restart app, then: `npm run rebuild:graph`

Doctor search does **not** need Neo4j — only `rebuild:search` / Qdrant.

---

## Google Calendar

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL` | For real calendar | Production | No | Service account email | `...@....iam.gserviceaccount.com` |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | For real calendar | Production | Yes | PEM private key (escape newlines as `\n` in env) | — |
| `GOOGLE_CALENDAR_ID` | No (default `primary`) | Both | No | Calendar id | `primary` |
| `GOOGLE_CALENDAR_TIMEZONE` | No | Both | No | Clinic timezone | `Africa/Cairo` |

Local tests often inject a fake calendar. Production needs a real service account with calendar access.

---

## Opik (AI tracing)

Opik records AI/tool timing and token usage so you can debug. If Opik is down, the app must still work (**fail-open**).

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `OPIK_API_KEY` | No | Production | Yes | Enables Opik; without it the app uses a no-op tracer | — |
| `OPIK_URL_OVERRIDE` | No | Both | No | Opik API base | `https://www.comet.com/opik/api` |
| `OPIK_PROJECT_NAME` | No | Both | No | Project name in Opik UI | `clinic-voice-ai` |
| `OPIK_WORKSPACE` | No | Both | No | Workspace name if required | — |

---

## Gemini Live (voice)

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `GEMINI_API_KEY` | For real Gemini voice | Production voice | Yes | Google AI key | — |
| `GEMINI_LIVE_MODEL` | No | Both | No | Live voice model id | `gemini-2.5-flash-preview-native-audio-dialog` |

If unset, do not pretend Gemini is connected. Tests use scripted/fake voice providers.

---

## Twilio (phone calls)

A **webhook** is an HTTP URL Twilio calls when something happens (for example an inbound call).

| Name | Required? | Where | Secret? | What it does | Example |
|------|-----------|-------|---------|--------------|---------|
| `TWILIO_AUTH_TOKEN` | If Twilio enabled | Production | Yes | Verifies Twilio request signatures | from Twilio console |
| `TWILIO_VOICE_WEBHOOK_URL` | If Twilio enabled | Production | No | Public HTTPS URL Twilio POSTs to | `https://your.app/v1/twilio/voice` |
| `TWILIO_MEDIA_STREAM_WS_URL` | If Twilio enabled | Production | No | Public `wss://` URL for media stream | `wss://your.app/v1/twilio/media` |

Caller ID (`From`) is **never** treated as patient login.

---

## Quick local defaults (Docker Compose)

| Service | Host port |
|---------|-----------|
| Postgres | `54329` |
| Redis | `63799` |
| Qdrant | `63339` |
| Neo4j Bolt | `17687` |
| Neo4j Browser | `17474` |
| App | `3000` |
