# High-Value Target Grouping Contract

Version: `hvt-v2`

This artifact defines the first-pass grouping model for high-value remediation targets.

## Goal
- Collapse repeated page-level findings into actionable shared root-cause candidates.

## Required Group Levels

### Level 1: Component Cluster
Grouping key:
- `rule_id`
- `normalized_selector`

Purpose:
- Catch repeated component failures rendered across many pages.

### Level 2: Section Cluster
Grouping key:
- Level 1 key
- normalized path template / path prefix

Purpose:
- Distinguish “shared across site” from “shared within one section”.

### Level 3: Fix Surface Cluster
Grouping key:
- `rule_id`
- rule-specific remediation signature
- path prefix

Purpose:
- Collapse repeated findings by likely shared fix surface instead of exact DOM selector identity.
- For `color-contrast`, prefer grouping by semantic target plus repeated color pair so one CSS or component fix surfaces as one actionable cluster.

## Required Group Metrics
- `group_id`
- `rule_id`
- `highest_severity`
- `finding_count`
- `affected_pages`
- `affected_runs`
- `sample_urls` (capped)
- `sample_selectors` (capped)
- `representative_snippet` (optional)
- `last_seen_at`
- `likely_fix_surface` (optional)
- `suggested_first_look` (optional)

## Required Presentation Semantics
- HVT groups are derived views over findings, not a replacement identity for findings.
- HVT groups must preserve drill-down to the underlying findings/pages.
- Group ordering should prioritize:
  - severity
  - affected pages
  - finding count

- `fix_surface_cluster` should be the preferred presentation level when the goal is remediation efficiency rather than DOM-level auditing.

## Non-Goals
- Automatic source-code ownership mapping
- ML-based clustering

## API/MCP Rules
- HVT grouping endpoints/tools must be summary-first.
- Sample URLs/selectors must be capped for token efficiency and UI readability.

## Change Rules
- New grouping levels are additive.
- `group_id` generation logic must be versioned if grouping keys change.
