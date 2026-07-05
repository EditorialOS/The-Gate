# Changelog

  All notable changes to The Gate are documented here.
  Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

  ## [Unreleased]

  ### Planned
  - Webhook support for async evaluation with callback on completion

  ## [1.0.0] — 2026-07-05

  ### Added
  - `POST /api/gate` — core evaluation endpoint: draft + brief + optional voice guide
  - Four evaluation modes: `content`, `strategy`, `technical`, `communication`
  - Fixed eight-criterion rubric with 1–5 scoring and evidence quotes from the draft
  - Machine-readable verdicts: `APPROVED`, `APPROVED_WITH_NOTES`, `REVISE`, `BLOCKED`
  - Weighted confidence score on every evaluation
  - Revision instructions populated when the verdict is `REVISE` or `BLOCKED`
  - API key management: create, list, revoke — keys stored as SHA-256 hashes, raw key returned once on creation
  - Per-key rate limiting (100 requests/hour default)
  - PostgreSQL review history store with UUID identifiers; list-by-key and retrieve-by-ID endpoints
  - Full OpenAPI 3.1.0 specification
  - Orval codegen: React Query hooks + Zod validators generated from the spec
  - Dockerfile and deploy configs for Railway, Render, Replit, and VPS

  [Unreleased]: https://github.com/EditorialOS/The-Gate/compare/v1.0.0...HEAD
  [1.0.0]: https://github.com/EditorialOS/The-Gate/releases/tag/v1.0.0
  