# URL Normalization Specification

Version: `norm-v1`

Purpose:
- Ensure crawl dedupe and finding history comparisons are deterministic across runs.

## Input
- Raw URL discovered by crawler or submitted by API (`page_url`, `base_url`, links).

## Algorithm (norm-v1)
1. Parse URL with RFC-compliant parser.
2. Lowercase scheme and hostname.
3. Remove default port (`:80` for `http`, `:443` for `https`).
4. Collapse duplicate slashes in path.
5. Normalize trailing slash:
- Keep `/` for origin root.
- Remove trailing slash for non-root path.
6. Remove fragment (`#...`).
7. Query normalization:
- Drop known tracking params (`utm_*`, `gclid`, `fbclid`, `mc_cid`, `mc_eid`).
- Keep only allowlisted params from scan target config.
- Sort remaining query params by key then value.
8. Reject URL if:
- Scheme is not `http` or `https`.
- Host is outside target domain allowlist.
- Path matches explicit denylist.
9. Return canonical URL string.

## Shared-module requirement
- The same implementation must be imported by:
- crawler enqueue logic
- API request normalization for rescans
- diff/report query paths

No duplicate logic in each service.

## Data persistence requirement
- Persist both `raw_url` and `normalized_url`.
- Persist `normalization_version` with each finding instance.

## Contract-change policy
Any change after M1 requires:
- v2 spec (`norm-v2`),
- explicit migration strategy for historical comparability,
- coordinator sign-off.
