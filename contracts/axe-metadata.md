# Axe Metadata Enrichment Contract

Version: `axe-meta-v1`

This artifact defines the rule metadata that must be preserved from axe results and exposed downstream.

## Required Persisted Rule Metadata
- `rule_id`
- `rule_help`
- `rule_description`
- `rule_help_url`
- `rule_tags`

## Required Persisted Instance Metadata
- `failure_summary`

## Semantics
- Rule metadata is shared across instances of the same `rule_id`.
- `failure_summary` is instance-specific and should remain attached to the finding occurrence evidence.
- Empty strings should be normalized to `NULL`/missing values rather than stored as noisy placeholders.

## API Exposure
- Finding detail responses must expose:
  - `rule_metadata`
  - `latest_instance.failure_summary`
- Run findings list responses may expose compact summary metadata additively, but must not become unbounded.

## UI Exposure
- Finding detail view must render:
  - rule summary/description
  - help URL when present
  - local remediation guidance
  - failure summary when present

## MCP Exposure
- `get_finding_detail` must include compact rule metadata and failure summary.
- Queue/list tools should expose only compact metadata unless explicitly expanded.

## Backfill Rules
- Historical findings scanned before this contract may not have full metadata.
- Downstream consumers must handle missing metadata gracefully and may fall back to local rule-guidance text.

## Change Rules
- New metadata fields are additive.
- Existing field meanings are frozen after M6 contract freeze.
