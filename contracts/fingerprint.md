# Finding Fingerprint Specification

Version: `fp-v1`

Purpose:
- Map scanner findings to stable logical issues across runs.

## Input fields
- `rule_id` (scanner rule identifier)
- `normalized_url` (from `norm-v1`)
- `dom_selector` (from scanner finding)
- `html_snippet` (from scanner finding)

## Derived fields
1. `normalized_page_template`
- Start from normalized path.
- Replace numeric path segments with `{int}`.
- Replace UUID-like segments with `{uuid}`.
- Preserve static segments.

2. `normalized_selector`
- Strip volatile CSS classes matching patterns:
- framework runtime hashes (`css-*`, `jsx-*`, long hash-like tokens)
- ephemeral IDs with long random suffixes
- Keep structural selector chain and semantic attributes where available.

3. `snippet_hash`
- Normalize snippet whitespace.
- Truncate to first 256 chars.
- SHA-256 hash of normalized snippet.

## Fingerprint composition
`fingerprint = sha256(rule_id + "|" + normalized_page_template + "|" + normalized_selector + "|" + snippet_hash)`

## Persistence requirements
- Persist each component and final fingerprint.
- Persist `fingerprint_version` with each finding instance.

## Determinism tests (required)
- Same static DOM scanned twice must generate identical fingerprint.
- Selector volatility fixture must resolve to same normalized selector between runs.

## Contract-change policy
Any change after M1 requires:
- version bump (`fp-v2`),
- dual-write period or backfill plan,
- documented blast radius,
- coordinator sign-off.
