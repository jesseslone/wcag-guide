# Changelog

## 0.1.0 — 2026-03-15

Initial public release.

### Added
- WCAG 2.1 AA compliance scanning powered by axe-core
- Self-hosted web dashboard for scan results, remediation tracking, and triage
- Compliance profiles (Title II 2026 default)
- High-value target (HVT) grouping for prioritized remediation
- Finding status workflow: open, in_progress, resolved, ignored (with expiration)
- Full-site, path-prefix, and single-page rescan modes
- MCP server for AI agent integration (`wguide mcp` / `npx wcag-guide mcp`)
- MCP tools: target management, scan triggers, finding lookup, status updates
- MCP resources: target summaries, scan run summaries, finding detail, triage queues
- Docker Compose local stack with PostgreSQL, app server, and worker
- Demo site for testing and development
