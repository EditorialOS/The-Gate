# The Gate — VPS Deployment Handoff for SAI

## What you are deploying

**The Gate** is a production Node.js/Express API that runs AI-powered editorial quality control evaluations. It accepts a draft + brief, calls Claude (Anthropic) via an LLM, and returns a structured verdict (APPROVED / APPROVED_WITH_NOTES / REVISE / BLOCKED) with a full scorecard.

The API is fully built and tested. This document covers deploying it to a Hostinger VPS that already has Docker and Traefik running.

---

## VPS details

| Field | Value |
|-------|-------|
| Provider | Hostinger |
| OS | Ubuntu 24.04 |
| Pre-installed | Docker + Traefik (reverse proxy) |
| IP | 187.124.87.148 |
| SSH | `ssh root@187.124.87.148` |
| Hostname | srv1461270.hstgr.cloud |
| CPU | 2 cores |
| RAM | 8 GB |
| Disk | 100 GB |

---

## Source code

GitHub repository: **https://github.com/EditorialOS/The-Gate**

The repo includes:
- `Dockerfile` — ready to build
- `railway.json`, `render.yaml` — ignore these
- `artifacts/api-server/` — the Express API server
- `lib/db/` — Drizzle ORM schema (PostgreSQL)
- `THE-GATE.md` — full product + technical documentation

---

## Environment variables required

The app needs exactly **4 env vars** at runtime. Get these from the owner before deploying:

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | Set up Postgres (see below) |
| `ANTHROPIC_API_KEY` | Anthropic API key | Owner provides — they need to get this from console.anthropic.com |
| `GATE_ADMIN_SECRET` | Admin secret for key management | `gate_admin_e231881d8503e4ea65aa3bc356ab1d78d1d626e8355a1667` (use this exact value) |
| `PORT` | Port the server listens on | `8080` |

---

## Step-by-step deployment

### Step 1 — SSH into the VPS

```bash
ssh root@187.124.87.148
```

---

### Step 2 — Set up PostgreSQL

The app needs a Postgres database. Two options:

**Option A: Run Postgres as a Docker container on the VPS (simplest)**

```bash
# Create a persistent volume
docker volume create gate-postgres-data

# Run Postgres
docker run -d \
  --name gate-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=gate \
  -e POSTGRES_USER=gate \
  -e POSTGRES_PASSWORD=CHOOSE_A_STRONG_PASSWORD \
  -v gate-postgres-data:/var/lib/postgresql/data \
  --network traefik \
  postgres:16-alpine

# Test it's running
docker logs gate-postgres
```

Then your `DATABASE_URL` will be:
```
postgresql://gate:CHOOSE_A_STRONG_PASSWORD@gate-postgres:5432/gate
```

**Option B: Use an external managed Postgres (Supabase, Neon, etc.)**

Get the connection string from the provider and use it as `DATABASE_URL`.

---

### Step 3 — Clone the repo

```bash
mkdir -p /opt/the-gate
cd /opt/the-gate
git clone https://github.com/EditorialOS/The-Gate.git .
```

---

### Step 4 — Create the environment file

```bash
cat > /opt/the-gate/.env << 'EOF'
DATABASE_URL=postgresql://gate:CHOOSE_A_STRONG_PASSWORD@gate-postgres:5432/gate
ANTHROPIC_API_KEY=sk-ant-OWNER_PROVIDES_THIS
GATE_ADMIN_SECRET=gate_admin_e231881d8503e4ea65aa3bc356ab1d78d1d626e8355a1667
PORT=8080
NODE_ENV=production
EOF
```

---

### Step 5 — Build the Docker image

```bash
cd /opt/the-gate
docker build -t the-gate:latest .
```

The build takes 2–4 minutes. It installs pnpm, installs all workspace dependencies, and bundles the API server into a single `dist/index.mjs` file.

---

### Step 6 — Run the DB schema migration

Before starting the server for the first time, push the database schema. This creates the `gate_api_keys` and `gate_reviews` tables.

```bash
docker run --rm \
  --network traefik \
  --env-file /opt/the-gate/.env \
  the-gate:latest \
  sh -c "npm install -g pnpm@9 && pnpm --filter @workspace/db run push"
```

You should see Drizzle confirm the tables were created with no errors.

---

### Step 7 — Start the Gate API container

**If Traefik is managing routing by Docker labels** (standard Hostinger setup):

```bash
docker run -d \
  --name the-gate \
  --restart unless-stopped \
  --network traefik \
  --env-file /opt/the-gate/.env \
  -l "traefik.enable=true" \
  -l "traefik.http.routers.the-gate.rule=Host(\`api.YOURDOMAIN.com\`)" \
  -l "traefik.http.routers.the-gate.entrypoints=websecure" \
  -l "traefik.http.routers.the-gate.tls.certresolver=letsencrypt" \
  -l "traefik.http.services.the-gate.loadbalancer.server.port=8080" \
  the-gate:latest
```

Replace `api.YOURDOMAIN.com` with whatever subdomain the owner wants (e.g. `api.editorialos.com` or `gate.editorialos.com`).

**If you want to expose it on a raw port without Traefik for now:**

```bash
docker run -d \
  --name the-gate \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file /opt/the-gate/.env \
  the-gate:latest
```

Then the API is reachable at `http://187.124.87.148:8080`.

---

### Step 8 — Verify it's running

```bash
# Check the container is up
docker ps | grep the-gate

# Check logs
docker logs the-gate

# Health check
curl http://localhost:8080/api/healthz
# Expected: {"status":"ok"}
```

If the health check passes, the API is live.

---

### Step 9 — Test a full gate evaluation

```bash
# First create an API key
curl -X POST http://localhost:8080/api/gate/keys \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: gate_admin_e231881d8503e4ea65aa3bc356ab1d78d1d626e8355a1667" \
  -d '{"name":"test","rate_limit_per_hour":100}'

# Use the returned key to run an evaluation
curl -X POST http://localhost:8080/api/gate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gate_sk_XXXXX_YYYYY" \
  -d '{
    "draft": "This is a test draft to verify the AI evaluation pipeline is working end to end.",
    "brief": "Write a short sentence confirming the system works.",
    "mode": "content"
  }'
```

A successful response will include `verdict`, `criteria_results`, `strengths`, and `gaps`.

---

## Database schema reference

Two tables are created by the migration:

**`gate_api_keys`** — stores hashed API keys (never raw keys)
- `id`, `prefix`, `key_hash`, `name`, `rate_limit_per_hour`, `created_at`, `revoked_at`

**`gate_reviews`** — stores every evaluation result
- `id`, `api_key_prefix`, `draft_hash`, `verdict`, `confidence`, `scorecard`, `strengths`, `gaps`, `revision_instructions`, `missing_context`, `metadata`, `created_at`

---

## Updating the deployment

When the owner pushes new code to GitHub:

```bash
cd /opt/the-gate
git pull origin main
docker build -t the-gate:latest .
docker stop the-gate && docker rm the-gate
# Re-run Step 7 docker run command
```

No migration needed unless the DB schema changed (check `lib/db/src/schema/gate.ts` for changes).

---

## Full API reference (quick summary)

Base path: `/api`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/healthz` | None | Health check |
| POST | `/api/gate` | Bearer token | Run evaluation |
| POST | `/api/gate/keys` | X-Admin-Secret | Create API key |
| GET | `/api/gate/keys` | X-Admin-Secret | List all keys |
| DELETE | `/api/gate/keys/:prefix` | X-Admin-Secret | Revoke a key |
| GET | `/api/gate/reviews` | Bearer token | List reviews |
| GET | `/api/gate/reviews/:id` | Bearer token | Get single review |

Bearer token format: `gate_sk_<prefix8>_<secret32>`

Admin secret: `gate_admin_e231881d8503e4ea65aa3bc356ab1d78d1d626e8355a1667`

For the full OpenAPI spec, see `lib/api-spec/openapi.yaml` in the repo.

---

## Firewall note

If the VPS firewall (Hostinger panel → Security → Firewall rules) is active, make sure port 80 and 443 are open for Traefik to handle TLS. If running on raw port 8080 without Traefik, open port 8080.

---

## What the owner needs to provide before SAI starts

1. **Anthropic API key** — from [console.anthropic.com](https://console.anthropic.com). Must have access to `claude-sonnet-4-6` (Claude 4 Sonnet). This is the only external cost — Anthropic charges per token.
2. **Domain/subdomain** — what URL the API should be reachable at (e.g. `api.editorialos.com`)
3. **DNS A record** — point the chosen subdomain at `187.124.87.148` before starting Traefik routing

Everything else (code, Dockerfile, schema, admin secret) is ready to go.
