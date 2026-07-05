# PRD — The Gate v1.0

  **Status:** Shipped · v1.0.0 · [Changelog](CHANGELOG.md) · [Architecture](https://github.com/EditorialOS/editorial-os/blob/main/ARCHITECTURE.md)
  **Owner:** Roger Gurbani

  ---

  ## Problem

  Every content operation has a gap between "draft submitted" and "draft published." Someone has to decide whether the draft meets the bar. At scale — a content team, an agency, a platform with contributors, an AI writing pipeline — that decision becomes the bottleneck: standards drift between reviewers and between days, turnaround is slow, and feedback arrives as "this doesn't feel right" instead of "here's what to fix."

  LLM-based review makes this worse by default. Ask the same model to review the same draft twice and you get different answers. Unconstrained model judgment is a mood ring, not a quality gate.

  ## Users

  - **Content teams and agencies** that need a consistent quality bar across writers and reviewers
  - **AI writing pipelines** that need a programmatic pass/fail step before output reaches a human or a CMS
  - **Platform operators** who need auditable review history across contributors

  ## What v1 does

  - Accepts a draft, a brief, and an optional voice guide via `POST /api/gate`
  - Evaluates against a **fixed eight-criterion rubric** — the model cannot substitute its own judgment for the rubric
  - Returns structured JSON: verdict (`APPROVED` / `APPROVED_WITH_NOTES` / `REVISE` / `BLOCKED`), 1–5 criterion scores, evidence quotes from the draft, weighted confidence score
  - Populates **specific revision instructions** on `REVISE` and `BLOCKED` — actionable, not vibes
  - Applies one of four mode overlays (`content`, `strategy`, `technical`, `communication`) on top of the universal criteria
  - Stores every evaluation in PostgreSQL: auditable by key, verdict, and date
  - Provisioning, revocation, and rate limiting of API keys; keys stored as SHA-256 hashes only

  ## What v1 explicitly does NOT do

  - **Does not rewrite the draft.** The Gate judges; it does not produce. Revision instructions tell a writer or agent what to fix — the fixing happens upstream.
  - **Does not accept custom rubrics.** The eight criteria are fixed by design in v1; consistency is the product. Configurable rubrics are a considered v2 direction, not a v1 gap.
  - **Does not fact-check against the open web.** `factual_grounding` scores claims against the provided brief and source material only.
  - **No async processing.** Evaluations are synchronous request/response. Webhooks are on the roadmap.
  - **No UI.** API-first. Any dashboard is a client of the API.

  ## Success criteria

  - Deterministic contract: identical rubric, criteria, and output schema on every run — verified across repeated evaluations of the same draft <!-- ⚠️ RAJ: if you've measured verdict consistency across N repeat runs, put the number here. "Verdict agreement of X% across 20 repeat runs" is the strongest line in this document. -->
  - 100% of `REVISE`/`BLOCKED` responses include populated revision instructions
  - Every evaluation retrievable from review history by UUID
  - A new consumer can go from API key to first verdict using only the README and OpenAPI spec <!-- ⚠️ RAJ: have one person actually do this and note the time. -->

  ## v1.1 roadmap

  - Webhook support: async evaluation with callback on completion
  - Verdict-history analytics: pass-rate trends per key over time

  ## Decision log

  - **Fixed rubric over configurable rubric** — consistency is the differentiator; configurability reintroduces the drift the product exists to remove
  - **Evidence quotes required per criterion** — a score without evidence is not auditable
  - **SHA-256 key hashing** — database compromise must not expose active keys
  