# Compliance Profiles Contract

Version: `cp-v1`

This artifact defines the compliance profiles that scanner, API, UI, and MCP work must share.

## Purpose
- Turn legal/standards targets into explicit scan presets.
- Keep scan tagging and reporting semantics stable across agents.
- Avoid ad hoc profile definitions in worker/UI code.

## Required Profiles

### 1. `title_ii_2026`
- Default: `true`
- Purpose: Title II April 24, 2026 baseline
- Standard target: `WCAG 2.1 AA`
- Required axe tag set:
  - `wcag2a`
  - `wcag2aa`
  - `wcag21a`
  - `wcag21aa`
- Optional overlays:
  - `best-practice` disabled by default

### 2. `enhanced_22_aa`
- Purpose: forward-looking baseline
- Standard target: `WCAG 2.2 AA`
- Required axe tag set:
  - all `title_ii_2026` tags
  - `wcag22aa`
- Note:
  - If the pinned axe version exposes a `wcag22a` tag, include it as additive profile data.
  - This is an implementation-time compatibility check, not a contract-breaking requirement.

### 3. `advisory_best_practice`
- Purpose: engineering-quality overlay
- Standard target: baseline WCAG profile plus advisory findings
- Required axe tag set:
  - all `title_ii_2026` tags
  - `best-practice`
- Rule:
  - Findings from advisory-only tags must be distinguishable from baseline compliance findings.

### 4. `aaa_selective`
- Purpose: optional stretch checks
- Standard target: selective AAA checks only
- Rule:
  - Must be opt-in.
  - Must not be described as a required whole-site compliance target.

## Persistence Contract
- Every `scan_run` must persist:
  - `compliance_profile_id`
  - `compliance_profile_label`
  - `compliance_profile_version`
- Any derived finding/group summary must echo the profile used to generate it.

## UI/MCP Contract
- UI and MCP must present the profile label used for the run.
- `title_ii_2026` must be the default profile for new scans unless the user explicitly chooses another.

## Change Rules
- New profiles are additive.
- Existing profile IDs and tag sets are frozen after M6 contract freeze unless a version bump is introduced.
