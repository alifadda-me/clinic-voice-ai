# Deployment (Railway)

This guide deploys Clinic Voice AI so other people can use it on the internet.

**Railway** is a hosting platform. You create a project, add services (app, Postgres, Redis), set secrets, and Railway builds and runs your code.

We do **not** claim a live Railway deploy was completed in this pass unless you run the steps yourself with your own accounts.

---

## What runs where

| Piece | Recommended place | Why |
|-------|-------------------|-----|
| Application (`npm start`) | Railway service | Your HTTP API |
| PostgreSQL | Railway Postgres plugin | Clinic source of truth |
| Redis | Railway Redis plugin | Short chat memory |
| Qdrant | [Qdrant Cloud](https://cloud.qdrant.io) or a separate VM | Vector search helper; not always ideal inside one Railway container |
| Neo4j | [AuraDB](https://neo4j.com/cloud/aura/) or a separate VM | Graph helper; heavy for a tiny app container |
| OpenRouter / Embeddings | External SaaS | Needs API keys |
| Google Calendar | Google Cloud | Service account |
| Opik | Comet Opik cloud | Optional tracing |
| Gemini Live | Google AI | Optional voice |
| Twilio | Twilio | Optional phone calls |

You can start with **App + Postgres + Redis** on Railway, then add Qdrant/Neo4j when you need semantic search and peer suggestions.

---

## Before you start

1. A GitHub repository with this code.
2. A Railway account.
3. An identity provider that can issue JWT access tokens (Auth0, Clerk, Cognito, Keycloak, …).
4. An OpenRouter API key (chat + embeddings).
5. Optional: Google Calendar, Opik, Gemini, Twilio, Qdrant Cloud, Neo4j Aura.

---

## Step 1 — Create a Railway project

1. Open [railway.app](https://railway.app) and sign in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo** and select this repository.
4. Railway creates a service for the app.

---

## Step 2 — Add PostgreSQL

1. In the project, click **New** → **Database** → **PostgreSQL**.
2. Open the Postgres service → **Variables**.
3. Copy the connection URL (often `DATABASE_URL` or `DATABASE_PRIVATE_URL`).
4. On the **app** service, add variable `DATABASE_URL` with that value.

Prefer the **private** network URL when both services are on Railway.

---

## Step 3 — Add Redis

1. **New** → **Database** → **Redis**.
2. Copy the Redis URL.
3. On the app service, set `REDIS_URL`.

---

## Step 4 — Set application variables

On the **app** service → **Variables**, set at least:

```text
APP_MODE=production
PORT=3000
DATABASE_URL=<from Postgres>
REDIS_URL=<from Redis>

AUTH_ISSUER=https://YOUR_IDP/
AUTH_AUDIENCE=clinic-voice-ai
AUTH_JWKS_URL=https://YOUR_IDP/.well-known/jwks.json

OPENROUTER_API_KEY=<secret>
EMBEDDING_API_KEY=<same or dedicated>
EMBEDDING_MODEL=openai/text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

QDRANT_URL=<qdrant cloud https url>
# QDRANT_API_KEY= if required

NEO4J_URI=<aura bolt url>
NEO4J_USER=neo4j
NEO4J_PASSWORD=<secret>
```

Optional:

```text
OPIK_API_KEY=
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL=
GOOGLE_CALENDAR_PRIVATE_KEY=
ENABLE_TWILIO=false
ENABLE_VOICE=false
```

See [ENVIRONMENT.md](ENVIRONMENT.md) for every variable.

**Never** set `EMBEDDING_MODE=deterministic` in production.
**Never** use demo auth in production.

---

## Step 5 — Build and start command

In the app service **Settings**:

- **Build command:** `npm ci`
- **Start command:** `npm start`
- **Watch paths:** leave default or `/`

Node version: **20+** (set in Railway or use an `engines` field already in `package.json`).

---

## Step 6 — Public domain and HTTPS

1. App service → **Settings** → **Networking** → **Generate Domain**.
2. Railway gives you `https://something.up.railway.app`.
3. HTTPS is handled by Railway. Use this base URL for Twilio webhooks later.

Custom domain (optional):

1. Add custom domain in Railway.
2. Create the DNS records Railway shows.
3. Wait until the certificate is ready.

---

## Step 7 — Health and readiness

Railway can ping your app to know it is alive.

| Check | URL | Meaning |
|-------|-----|---------|
| Liveness | `GET /health` | Process is up |
| Readiness | `GET /ready` | Postgres + Redis OK (required). Qdrant/Neo4j reported but optional |

In Railway health check settings, point to `/health` (or `/ready` if you want deploy to wait for DB).

Verify:

```bash
curl -sS https://YOUR_DOMAIN/health
curl -sS https://YOUR_DOMAIN/ready
```

Or from the repo (after setting `APP_BASE_URL`):

```bash
npm run production:check
```

---

## Step 8 — Database migrations

Migrations create/update tables.

After the first deploy (with `DATABASE_URL` set):

```bash
# From your laptop with production DATABASE_URL in the environment:
DATABASE_URL='postgresql://...' npm run db:migrate
```

Or add a one-off Railway **Release Command**:

```text
npm run db:migrate
```

Run migrations **before** sending user traffic.

---

## Step 8b — Seed demo clinic data

After migrations, load doctors and specialties for discovery demos:

```bash
# Railway (uses linked DATABASE_URL on the app service)
railway run npm run db:seed

# Seed + rebuild Qdrant/Neo4j search (needs full production env vars)
railway run npm run db:seed:full
```

This inserts **31 doctors** across **11 specialties** (Cardiology, Dermatology, Pediatrics, …) with stable ids — safe to re-run (upserts by id). Use `--if-empty` or `SEED_IF_EMPTY=true` to skip when data already exists.

**Important:** `search_doctors` in chat uses **Qdrant**, not Postgres alone. Always run `npm run rebuild:derived` after seeding (included in `db:seed:full`).

---

## Step 9 — Rebuild search and graph

After you seed doctors/specialties (and preferences/completed visits for affinity):

```bash
# Production env loaded (or exported):
npm run rebuild:search
npm run rebuild:graph
# or
npm run rebuild:derived
```

These talk to Qdrant and Neo4j using your production env. They do **not** change PostgreSQL clinic rules.

---

## Step 10 — Identity provider

1. Create an API / resource with audience matching `AUTH_AUDIENCE`.
2. Copy Issuer and JWKS URL into Railway.
3. Your frontend or test client must send:

```http
Authorization: Bearer <access_token>
```

---

## Step 11 — Twilio (optional)

1. Buy or use a Twilio phone number.
2. Voice webhook: `POST https://YOUR_DOMAIN/v1/twilio/voice`
3. Set `ENABLE_TWILIO=true` and Twilio env vars (see [ENVIRONMENT.md](ENVIRONMENT.md)).
4. Media stream needs a public `wss://` URL. Railway HTTP domains are HTTPS; WebSocket media may need a separate realtime host. If you have not set up media streaming yet, keep `ENABLE_TWILIO=false` until that path is ready.
5. Remember: the caller’s phone number is **not** automatic login.

Details: [twilio-phone-auth.md](twilio-phone-auth.md) and [TESTING.md](TESTING.md) (Twilio section).

---

## Step 12 — Opik / OpenRouter / Gemini

1. Create Opik project → put `OPIK_API_KEY` on Railway.
2. Put `OPENROUTER_API_KEY` (and embedding settings) on Railway.
3. For voice, put `GEMINI_API_KEY` and set `ENABLE_VOICE=true` only when the voice provider is wired.

Verify Opik traces after a chat turn. If Opik is wrong or down, chat must still work.

---

## Step 13 — Smoke test after deploy

**Warning:** Booking tests create real rows. Use a dedicated test patient and a non-production calendar if possible.

```bash
export APP_BASE_URL=https://YOUR_DOMAIN
npm run production:check
```

Then follow the “Production smoke” section in [TESTING.md](TESTING.md).

---

## GitHub → Railway deploy

### Option A — Railway’s GitHub integration (simplest)

1. In Railway, connect the GitHub repo.
2. Enable auto-deploy on `main` (or your release branch).
3. Push to that branch → Railway builds and deploys.
4. Roll back: Railway dashboard → Deployments → redeploy a previous deployment.

### Option B — GitHub Actions (recommended with this repo)

File: `.github/workflows/deploy.yml`

Runs **after CI succeeds** on `main` (and manual **Run workflow**):

1. Deploy with Railway CLI (`railway up`)
2. Migrations run on Railway via `railway.toml` `releaseCommand` (`npm run db:migrate`) — not `railway run` in CI (CLI container has no Node)
3. Optional `ops` job: `db:seed` if `SEED_ON_DEPLOY=true`, `rebuild:derived` if `REBUILD_DERIVED_ON_DEPLOY=true`
4. Hit `/health` and `/ready` if `APP_BASE_URL` is set

**Turn off double deploy:** In Railway, disable auto-deploy on the app service if GitHub Actions deploys for you (Settings → disable GitHub auto-deploy, keep the repo connected only for builds if needed).

#### Required GitHub secrets

| Secret | Where to get it |
|--------|-----------------|
| `RAILWAY_SERVICE_ID` | App service → Settings → copy **Service ID** |
| `APP_BASE_URL` | Public URL, e.g. `https://your-app.up.railway.app` (no trailing slash) |

**Railway auth — use ONE of these paths** (wrong token type → `Unauthorized` on `railway up`):

| Path | Secrets | Where to create the token |
|------|---------|---------------------------|
| **A — recommended** | `RAILWAY_TOKEN` | Railway **project** → **Settings** → **Tokens** → Create token for **production** environment |
| **B — account token** | `RAILWAY_API_TOKEN` + `RAILWAY_PROJECT_ID` | [railway.com/account/tokens](https://railway.com/account/tokens) + Project ID from project → Settings |

Do **not** put an account token in `RAILWAY_TOKEN`. Account tokens must use `RAILWAY_API_TOKEN` (the CLI uses different auth headers internally).

Set secrets on GitHub **Environment → production** (the deploy workflow uses `environment: production`).

Optional: `RAILWAY_ENVIRONMENT` = Railway environment name (default `production` if unset).

#### Optional GitHub secrets

| Secret | When |
|--------|------|
| `RAILWAY_PROJECT_ID` | Required for path B (`RAILWAY_API_TOKEN`) |
| `RAILWAY_ENVIRONMENT` | Railway environment name (default `production`) |
| `SEED_ON_DEPLOY` | Set to `true` to run `npm run db:seed -- --if-empty` after deploy (needs Node on CI runner — see deploy workflow `ops` job) |
| `REBUILD_DERIVED_ON_DEPLOY` | Set to `true` after Qdrant, Neo4j, and embedding vars exist on Railway |

#### Railway variables (set once in Railway UI — not in GitHub)

Railway **cannot** create your IdP or OpenRouter account. You still set these on the **app service** in Railway:

- Reference Postgres: `${{Postgres.DATABASE_URL}}` or copy private URL → `DATABASE_URL`
- Reference Redis: `${{Redis.REDIS_URL}}` → `REDIS_URL`
- `APP_MODE=production`, `AUTH_*`, `OPENROUTER_API_KEY`, `EMBEDDING_*`, etc.

See [ENVIRONMENT.md](ENVIRONMENT.md).

It runs after **CI** succeeds on `main` (or via manual **Run workflow**) and needs a valid Railway token. **Do not** put the token in the repo.

---

## Rollback

1. Railway → service → **Deployments**.
2. Open a known-good deployment → **Redeploy**.
3. If a bad migration ran, restore Postgres from a backup first (Railway volume/backup tooling).

---

## Checklist before calling it “live”

- [ ] `/health` returns OK
- [ ] `/ready` shows Postgres + Redis OK
- [ ] Migrations applied
- [ ] Auth rejects bad tokens and accepts good ones
- [ ] Anonymous doctor search works (or fails clearly if Qdrant/embeddings down)
- [ ] Enroll + book with a **test** patient only
- [ ] Opik optional; outage does not break booking
- [ ] Twilio off until webhook + media URLs are correct
- [ ] No deterministic embeddings
- [ ] No demo auth
