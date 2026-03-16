# MCP Resource Contract (M5)

This file defines the stable resource URI surface and response-shape expectations for the first MCP implementation.

## Transport posture
- Primary transport: `stdio`
- Resource reads are summary-first and token-efficient.
- Long collections must be paginated via opaque cursors.

## Shared response rules
- Every resource payload must include `generated_at`.
- Every target-scoped resource must echo the target tuple: `site_key`, `environment`, `branch`.
- Any list-like resource must:
- cap default item counts
- include `next_cursor` when more results exist
- return items sorted deterministically

## Resource URIs

### 1) Compliance profiles
URI:
- `wcag-guide://compliance-profiles`

Purpose:
- Compact catalog of supported compliance profiles and the current default profile identifier.

Expected payload:
- `generated_at`
- `default_profile_id`
- `items`

### 2) Target summary
URI:
- `wcag-guide://targets/{site_key}/{environment}/{branch}/summary`

Purpose:
- Compact site-target overview for agent planning and prioritization.

Expected payload:
- `generated_at`
- `scan_target`
- `latest_completed_run`
- `open_counts`
- `top_rules`
- `top_pages`
- `recent_runs` (max 5)

### 3) Scan run summary
URI:
- `wcag-guide://scan-runs/{scan_run_id}/summary`

Purpose:
- Compact run-level summary for a single queued/running/completed/failed scan.

Expected payload:
- `generated_at`
- `run`
- `run.compliance_profile`
- `top_rules`
- `top_pages`
- `hvt_summary`
- `sample_findings` (max 10)

### 4) Scan run HVT groups
URI template:
- `wcag-guide://scan-runs/{scan_run_id}/hvt-groups?group_level={group_level}&limit={limit}`

Supported query parameters:
- `group_level`
- `limit`

Supported `group_level` values:
- `fix_surface_cluster`
- `section_cluster`
- `component_cluster`

Purpose:
- Compact, run-scoped HVT grouping summary for agent triage.

Expected payload:
- `generated_at`
- `scan_run_id`
- `compliance_profile`
- `group_level`
- `total_groups`
- `items`

### 5) Finding detail
URI:
- `wcag-guide://findings/{finding_id}`

Purpose:
- Full detail for one finding, including latest evidence and recent status history.

Expected payload:
- `generated_at`
- `finding`
- `finding.rule_metadata`
- `finding.latest_instance.failure_summary`
- `status_history` (max 20)

### 6) Triage queue
URI template:
- `wcag-guide://queues/{site_key}/{environment}/{branch}?status=open&severity=serious&cursor={cursor}&limit={limit}`

Supported query parameters:
- `status`
- `severity`
- `diff_status`
- `rule_id`
- `path_prefix`
- `cursor`
- `limit`

Purpose:
- Agent-facing remediation queue for one site target.

Expected payload:
- `generated_at`
- `scan_target`
- `applied_filters`
- `items`
- `next_cursor`

Item shape:
- `finding_id`
- `rule_id`
- `severity`
- `status`
- optional `diff_status`
- `latest_instance.normalized_url`
- `latest_instance.selector_excerpt`
- `latest_instance.detected_at`

## Pagination contract
- Cursor values are opaque to clients.
- Default `limit`: `25`
- Maximum `limit`: `100`
- If `next_cursor` is absent, the collection is exhausted.
- Servers must preserve stable ordering across a paginated sequence for the same filter set.

## Freshness and staleness
- Resources are snapshots, not subscriptions, in v1.
- `generated_at` is required so agents can reason about staleness.
- `resources.subscribe` remains disabled in v1.

## Mutation boundary
- Resources are read-only.
- All mutations happen through tools, not resource writes.

## Error contract
- Unknown resource URI: structured `not_found`
- Unsupported query parameter: structured `bad_request`
- Invalid cursor: structured `invalid_cursor`

## Notes for implementation
- Resource payloads should be derived from the same application service layer used by the HTTP API.
- Resource formats should stay aligned with `contracts/mcp-tools.schema.json` output shapes where practical.
