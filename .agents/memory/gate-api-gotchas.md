---
name: Gate API build gotchas
description: Two non-obvious bugs hit when building The Gate API — YAML angle brackets and key prefix extraction.
---

## 1. YAML angle brackets break @scalar/json-magic parser

**Rule:** Any unquoted YAML string value containing `<` or `>` will cause `@scalar/json-magic`'s `normalize()` to throw inside `readFile`'s try/catch, returning `{ ok: false }` and triggering orval's "Failed to resolve input" error.

**Why:** orval uses `@scalar/json-magic` to bundle/parse the OpenAPI spec. The `readFiles` plugin's `exec` wraps `normalize(fileContents)` in a try/catch; if the YAML parser throws on angle brackets in a compact mapping context, the entire read silently returns `{ ok: false }`.

**How to apply:** Always quote any description or string field in `openapi.yaml` that contains `<` or `>`. Example: `description: "format: gate_sk_<prefix>_<secret>"` (quoted).

## 2. extractPrefixFromKey must expect 4 parts, not 3

**Rule:** The key format `gate_sk_<prefix8>_<secret32>` splits into **4** underscore segments. The extraction guard must check `parts.length !== 4`.

**Why:** `"gate_sk_abc_xyz".split("_")` → `["gate","sk","abc","xyz"]` (length 4). Off-by-one (`!== 3`) causes every valid key to be rejected as invalid format.

**How to apply:** If you ever change the key scheme prefix (e.g. add another underscore segment), update both the `generateApiKey` format string and the `extractPrefixFromKey` length check together.
