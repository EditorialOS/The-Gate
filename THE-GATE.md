# The Gate

## Part 1 — What It Is and Why It Matters

### The problem

Every content operation has a gap between "draft submitted" and "draft published." In that gap, someone has to read the thing, decide whether it meets the bar, and either wave it through or send it back with notes. At small scale that's a person with a checklist. At any real scale — a content team, an agency, a platform with contributors — it becomes the bottleneck nobody talks about: inconsistent feedback, slow turnarounds, reviewers who apply different standards on different days, and writers who get "this doesn't feel right" instead of actionable direction.

### What The Gate does

The Gate is an API you call with a draft and a brief. It runs the content through a structured evaluation, scores it against eight criteria, and returns a machine-readable verdict: `APPROVED`, `APPROVED_WITH_NOTES`, `REVISE`, or `BLOCKED`. Not a vibe. Not a summary. A verdict with evidence.

Every evaluation includes:
- A **scorecard** — each criterion scored 1–5 with a specific assessment and a quote from the draft as evidence
- **Strengths** — what's working and why
- **Gaps** — what's missing or weak, with specifics
- **Revision instructions** — only populated when the verdict is REVISE or BLOCKED; tells the writer exactly what to fix
- A **confidence score** — how certain the model is about the verdict

The eight criteria cover the things that actually matter: whether the draft answers the brief, whether the facts are grounded, whether the structure holds, whether the tone fits the voice guide, whether anything is missing, and whether the internal logic is consistent.

### Why this is different from "just asking ChatGPT"

The Gate enforces a fixed rubric. The model cannot freestyle. It evaluates against the same eight criteria every time, returns structured JSON every time, and is blocked from giving vague positive feedback. A score of 3 on `brief_fidelity` means the same thing whether you submit at 9am or 9pm, whether the reviewer is fresh or tired, whether the writer is a favorite or new.

It also has memory. Every evaluation is stored and retrievable. You can pull the review history for any API key, filter by verdict, audit what was approved, and track quality trends over time.

### The four modes

The Gate ships with four evaluation profiles — `content`, `strategy`, `technical`, and `communication` — each with domain-specific criteria layered on top of the universal ones. A strategy memo gets different scrutiny than a blog post. A technical runbook gets evaluated differently than a client email.

### Who this is for

Any workflow where humans are currently the quality gate: content teams publishing at volume, agencies reviewing client deliverables, platforms with contributor content, AI writing pipelines that need a safety layer before output reaches a human or a CMS.

---

## Part 2 — Technical Handoff

### Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 24 |
| Framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Replit managed) |
| AI | Anthropic claude-sonnet-4-6 via Replit AI Integrations |
| Build | esbuild (single-file bundle) |
| Language | TypeScript (strict) |
| Package manager | pnpm (workspace monorepo) |

---

### Project structure

```
artifacts/api-server/
  src/
    index.ts                   # Express app entry: registers routes, starts server
    routes/
      health.ts                # GET /api/healthz
      gate/
        index.ts               # Route aggregator: mounts run, keys, reviews
        run.ts                 # POST /api/gate (core evaluation)
        keys.ts                # POST/GET/DELETE /api/gate/keys
        reviews.ts             # GET /api/gate/reviews, GET /api/gate/reviews/:id
    middlewares/
      gate-auth.ts             # requireGateAuth (Bearer token), requireAdminSecret (X-Admin-Secret)
    lib/
      gate-prompt.ts           # Builds system + user message for LLM
      crypto.ts                # Key generation, SHA-256 hashing, prefix extraction
      rate-limit.ts            # Per-key, per-hour rate limit check (DB-counted)
      logger.ts                # pino logger

lib/db/src/schema/
  gate.ts                      # Drizzle schema: gate_api_keys, gate_reviews
  index.ts                     # Re-exports gate tables + Zod schemas derived from Drizzle

lib/integrations-anthropic-ai/
  src/client.ts                # Anthropic SDK client using Replit AI Integrations base URL

lib/api-spec/
  openapi.yaml                 # Full OpenAPI 3.1.0 spec for all Gate endpoints
  orval.config.ts              # Codegen config (generates React Query hooks + Zod validators)
```

---

### Environment variables

| Variable | Where set | Description |
|----------|-----------|-------------|
| `GATE_ADMIN_SECRET` | Replit shared env | Required for all key management endpoints. Set once at provisioning time. Value: `gate_admin_e231881d8503e4ea65aa3bc356ab1d78d1d626e8355a1667` |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Replit shared env | Auto-set by Replit AI Integrations |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Replit shared env | Auto-set by Replit AI Integrations |
| `DATABASE_URL` | Replit shared env | Auto-set by Replit managed Postgres |
| `PORT` | Runtime | Set by Replit per-artifact; server binds to this |

---

### Database schema

#### `gate_api_keys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `prefix` | varchar(20) | Unique. First 8 hex chars of the key, used for lookup |
| `key_hash` | varchar(64) | SHA-256 of the full key. Never stored raw |
| `name` | varchar(100) | Human label |
| `rate_limit_per_hour` | integer | Default 100 |
| `created_at` | timestamp | Auto |
| `revoked_at` | timestamp | Null = active. Set on DELETE |

#### `gate_reviews`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `api_key_prefix` | varchar(20) | FK reference to the key that ran this review |
| `draft_hash` | varchar(16) | First 16 hex chars of SHA-256(draft). For dedup/audit |
| `verdict` | varchar(30) | One of: APPROVED, APPROVED_WITH_NOTES, REVISE, BLOCKED |
| `confidence` | numeric(4,3) | 0.000–1.000 |
| `scorecard` | jsonb | Map of criterion name → `{pass, score, assessment, evidence}` |
| `strengths` | text[] | Array of strength statements |
| `gaps` | text[] | Array of gap statements |
| `revision_instructions` | text | Null unless verdict is REVISE or BLOCKED |
| `missing_context` | text | Null unless the model flagged missing info |
| `metadata` | jsonb | `{mode, weighted_score, has_voice_guide}` |
| `created_at` | timestamp | Auto |

---

### API reference

Base URL: `/api`

#### Authentication

**Bearer token** (gate runs, review history):
```
Authorization: Bearer gate_sk_<prefix8>_<secret32>
```

**Admin secret** (key management):
```
X-Admin-Secret: <GATE_ADMIN_SECRET value>
```

---

#### `GET /api/healthz`

No auth. Returns `{"status":"ok"}`.

---

#### `POST /api/gate`

Run a gate evaluation.

**Request body:**
```json
{
  "draft": "string (required, 1–50000 chars)",
  "brief": "string (required, 1–5000 chars)",
  "voice_guide": "string (optional, max 10000 chars)",
  "mode": "content | strategy | technical | communication (default: content)"
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "verdict": "APPROVED | APPROVED_WITH_NOTES | REVISE | BLOCKED",
  "confidence": 0.0–1.0,
  "weighted_score": 1.0–5.0,
  "criteria_results": {
    "<criterion_name>": {
      "pass": true,
      "score": 1–5,
      "assessment": "string",
      "evidence": "verbatim quote or N/A"
    }
  },
  "strengths": ["string"],
  "gaps": ["string"],
  "revision_instructions": "string | null",
  "missing_context": "string | null",
  "meta": {
    "mode": "content",
    "draft_hash": "2c4aa1189a66941f",
    "has_voice_guide": false,
    "rate_limit": {
      "used": 1,
      "limit": 50,
      "reset_at": "ISO 8601"
    }
  }
}
```

**Error responses:** 400 (validation), 401 (bad/missing key), 429 (rate limit), 500 (DB), 502 (LLM unavailable or bad JSON)

---

#### `POST /api/gate/keys`

Create an API key.

**Request body:**
```json
{
  "name": "string (required)",
  "rate_limit_per_hour": 1–1000 (default: 100)
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "key": "gate_sk_<prefix>_<secret>",
  "prefix": "string",
  "name": "string",
  "rate_limit_per_hour": 100,
  "created_at": "ISO 8601",
  "note": "Store this key securely. It will not be shown again."
}
```

> The full key is returned **once**. Only the hash is stored. It cannot be recovered.

---

#### `GET /api/gate/keys`

List all keys (active and revoked).

**Response 200:** Array of key records (no `key` field — never returned again after creation).

---

#### `DELETE /api/gate/keys/:prefix`

Revoke a key. Sets `revoked_at`, permanently blocks the key from authenticating.

**Response 200:** `{"prefix":"...","status":"revoked","revoked_at":"ISO 8601"}`

**Error 409** if already revoked.

---

#### `GET /api/gate/reviews`

List reviews for the authenticated key. Paginated.

**Query params:** `limit` (1–100, default 20), `offset` (default 0), `verdict` (filter)

**Response 200:** `{data: [...], pagination: {limit, offset, count}}`

---

#### `GET /api/gate/reviews/:id`

Get a single review. Only the key that created it can retrieve it.

**Response 404** if not found or belongs to a different key.

---

### Key format

```
gate_sk_<prefix8hex>_<secret32hex>
```

- `prefix` = first 8 hex chars (4 random bytes), used for DB lookup
- `secret` = 32 hex chars (16 random bytes), concatenated with prefix for hash comparison
- Full key is split on `_` into exactly 4 segments: `["gate", "sk", "<prefix>", "<secret>"]`
- Auth flow: extract prefix → lookup row → `SHA256(submitted_key) === stored key_hash`

---

### Rate limiting

Counted in Postgres, not Redis. On each gate run:

1. Count rows in `gate_reviews` where `api_key_prefix = ?` and `created_at >= window_start`
2. Window = current timestamp minus 1 hour
3. If count >= limit → 429 with `rate_limit` block in response body
4. Window reset time = oldest review in current window + 1 hour

No background jobs. Pure DB read on each request.

---

### Gate evaluation modes and criteria

#### Universal criteria (all modes)

| Criterion | What it checks |
|-----------|---------------|
| `context_grounding` | No invented facts, statistics, or sources not derivable from the brief |
| `brief_fidelity` | Answers what was asked — format, audience, scope, length |
| `completeness` | No placeholders, no [TBD], no trailing-off sections |
| `internal_consistency` | No contradictions in claims, tone, or structure within the draft |
| `specificity` | Concrete, not generic. Evidence-backed claims, not vague assertions |

#### Mode-specific criteria

| Mode | Additional criteria |
|------|---------------------|
| `content` | `voice_compliance`, `structural_quality`, `factual_integrity` |
| `strategy` | `strategic_alignment`, `actionability`, `audience_calibration` |
| `technical` | `technical_accuracy`, `reproducibility`, `safety_completeness` |
| `communication` | `tone_appropriateness`, `clarity`, `call_to_action` |

---

### Verdict thresholds

The model determines verdict via weighted scoring:

| Verdict | Meaning |
|---------|---------|
| `APPROVED` | Meets the bar. Publish or pass forward. |
| `APPROVED_WITH_NOTES` | Passes but has documented weaknesses. Reviewers should read the gaps. |
| `REVISE` | Fails one or more criteria. `revision_instructions` is populated. Send back to writer. |
| `BLOCKED` | Hard failure. Do not publish. May indicate fabrication, severe brief mismatch, or fundamental structural problems. |

---

### LLM prompt architecture

The prompt is constructed in `lib/gate-prompt.ts` and split into two parts:

**System prompt** (`buildGateSystemPrompt(mode)`)
- Role definition: editorial QA analyst
- Full rubric for all universal criteria + mode-specific criteria
- Explicit scoring scales and evidence requirements
- Output format contract: must return valid JSON, no prose outside JSON, specific field names enforced
- Prohibited behaviours: no vague feedback, no unjustified passing scores, no invented context

**User message** (`buildGateUserMessage(draft, brief, voiceGuide)`)
- The brief (what was requested)
- The voice guide (if provided; otherwise signals to score voice as neutral)
- The draft to evaluate

The model is told: if it cannot determine a verdict with the information given, it must populate `missing_context` and return `REVISE`, not guess.

---

### Codegen

The OpenAPI spec (`lib/api-spec/openapi.yaml`) drives two generated outputs via orval:

- `lib/api-client-react/src/generated/` — React Query hooks for frontend consumption
- `lib/api-zod/src/generated/` — Zod validators for request/response shapes

To regenerate after spec changes:
```bash
pnpm --filter @workspace/api-spec run codegen
```

**Known gotcha:** Any unquoted string in the YAML containing `<` or `>` will silently break the `@scalar/json-magic` YAML parser (used internally by orval), causing codegen to fail with "Failed to resolve input." Always quote such strings.

---

### Running locally

```bash
# Install dependencies
pnpm install

# Push DB schema (first time or after schema changes)
pnpm --filter @workspace/db run push

# Run the API server in dev mode
pnpm --filter @workspace/api-server run dev
```

Server starts on `$PORT` (default 8080 in dev).

---

### Deployment

The API server is configured as a Replit artifact (`artifacts/api-server`). The Replit deployment workflow:
1. Runs `pnpm run build` (esbuild bundles to `dist/index.mjs`)
2. Runs `pnpm run start` (`node --enable-source-maps ./dist/index.mjs`)

No Docker, no containerization. The build output is a single bundled `.mjs` file with source maps.
