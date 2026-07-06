# The Gate

> **Deployment layer:** [The-Gate-VPS](https://github.com/EditorialOS/The-Gate-VPS) runs this engine in production as a multi-tenant MCP server, exposing evaluation as agent-callable tools.

  **Docs:** [PRD](PRD.md) · [Changelog](CHANGELOG.md)

  An editorial quality gate API. Submit a draft and a brief; receive a machine-readable verdict with a scored rubric, evidence quotes, and specific revision instructions. Fixed eight-criterion evaluation — the model cannot freestyle.

  ---

  ## Verdicts

  Every evaluation returns one of four outcomes:

  | Verdict | Meaning |
  |---|---|
  | `APPROVED` | Meets the bar. Publish or pass forward. |
  | `APPROVED_WITH_NOTES` | Passes with documented weaknesses — review the gaps before publishing. |
  | `REVISE` | Fails one or more criteria. `revision_instructions` is populated. Send back to the writer. |
  | `BLOCKED` | Hard failure. Do not publish. Fabrication, severe brief mismatch, or fundamental structural problem. |

  ---

  ## Evaluation structure

  Every response includes:

  - **Scorecard** — each criterion scored 1–5 with an assessment and a verbatim quote from the draft as evidence
  - **Strengths** — what's working and why
  - **Gaps** — what's missing or weak, with specifics
  - **Revision instructions** — populated only on `REVISE` / `BLOCKED`; tells the writer exactly what to fix
  - **Confidence score** — how certain the model is about the verdict

  ### Universal criteria (all modes)

  | Criterion | What it checks |
  |---|---|
  | `context_grounding` | No invented facts or sources not in the brief |
  | `brief_fidelity` | Answers what was asked — format, audience, scope, length |
  | `completeness` | No placeholders, no [TBD], no trailing sections |
  | `internal_consistency` | No contradictions in claims, tone, or structure |
  | `specificity` | Concrete and evidence-backed, not generic |

  ### Modes

  Apply domain-specific criteria on top of the universal five:

  | Mode | Additional criteria |
  |---|---|
  | `content` | `voice_compliance`, `structural_quality`, `factual_integrity` |
  | `strategy` | `strategic_alignment`, `actionability`, `audience_calibration` |
  | `technical` | `technical_accuracy`, `reproducibility`, `safety_completeness` |
  | `communication` | `tone_appropriateness`, `clarity`, `call_to_action` |

  ---

  ## API

  Base URL: `/api`

  ### Authentication

  **Gate evaluations and review history** — Bearer token:
  ```
  Authorization: Bearer gate_sk_<prefix>_<secret>
  ```

  **Key management** — Admin secret header:
  ```
  X-Admin-Secret: <GATE_ADMIN_SECRET>
  ```

  ### Core endpoints

  ```
  POST /api/gate                  Run an evaluation
  GET  /api/gate/reviews          List reviews for the authenticated key
  GET  /api/gate/reviews/:id      Get a single review by UUID

  POST   /api/gate/keys           Create an API key
  GET    /api/gate/keys           List all keys
  DELETE /api/gate/keys/:prefix   Revoke a key

  GET  /api/healthz               Health check (no auth)
  ```

  ### Request — `POST /api/gate`

  ```json
  {
    "draft": "string (required, 1–50000 chars)",
    "brief": "string (required, 1–5000 chars)",
    "voice_guide": "string (optional, max 10000 chars)",
    "mode": "content | strategy | technical | communication (default: content)"
  }
  ```

  ### Response

  ```json
  {
    "id": "uuid",
    "verdict": "APPROVED | APPROVED_WITH_NOTES | REVISE | BLOCKED",
    "confidence": 0.0,
    "weighted_score": 1.0,
    "criteria_results": {
      "<criterion>": {
        "pass": true,
        "score": 1,
        "assessment": "string",
        "evidence": "verbatim quote from the draft"
      }
    },
    "strengths": ["string"],
    "gaps": ["string"],
    "revision_instructions": "string | null",
    "missing_context": "string | null",
    "meta": {
      "mode": "content",
      "draft_hash": "string",
      "has_voice_guide": false,
      "rate_limit": { "used": 1, "limit": 100, "reset_at": "ISO 8601" }
    }
  }
  ```

  Full OpenAPI 3.1.0 spec: [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml)

  ---

  ## Stack

  | Layer | Technology |
  |---|---|
  | Runtime | Node.js 24 |
  | Framework | Express 5 |
  | ORM | Drizzle ORM |
  | Database | PostgreSQL |
  | AI | Anthropic claude-sonnet via AI Integrations |
  | Build | esbuild (single-file bundle) |
  | Language | TypeScript (strict) |

  ---

  ## Running locally

  ```bash
  pnpm install
  pnpm --filter @workspace/db run push     # push DB schema on first run
  pnpm --filter @workspace/api-server run dev
  ```

  Server starts on `$PORT` (default 8080 in dev).

  ### Environment variables

  | Variable | Description |
  |---|---|
  | `GATE_ADMIN_SECRET` | Required for all key management endpoints |
  | `ANTHROPIC_API_KEY` | Anthropic API key |
  | `DATABASE_URL` | PostgreSQL connection string |
  | `PORT` | Server port |

  ---

  ## Self-hosting

  The API is plain Node.js/Express with no platform-specific runtime dependencies. Deploy configs for Railway, Render, and VPS are included (`railway.json`, `render.yaml`, `DEPLOY-VPS.md`). Build output is a single bundled `.mjs` file.

  ```bash
  pnpm run build   # bundles to dist/index.mjs
  pnpm run start   # node --enable-source-maps ./dist/index.mjs
  ```

  ---

  **Contact:** [signalstudio.io](https://signalstudio.io) · editorial.operating.system@gmail.com
  