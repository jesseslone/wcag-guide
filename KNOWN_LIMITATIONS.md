# Known Limitations

Current limitations of the WCAG-Guide scanner and dashboard.

## Scanner / runtime
- The default scanner adapter is `playwright-axe` (Chromium + axe-core). A lightweight `demo` adapter is available for development without browser dependencies (`SCANNER_ADAPTER=demo`).
- Authenticated or session-dependent sites are not supported.
- Sitemap-driven seeding is not implemented; crawl seeding starts from the configured base URL or explicit rescan scope.

## Accessibility findings
- Automated scans surface likely issues, not a complete accessibility judgment.
- False positives and false negatives are possible, especially on dynamic or highly scripted pages.
- Evidence capture is limited to selector, snippet, and page URL. There is no screenshot or DOM snapshot evidence bundle yet.

## Dashboard
- The dashboard is optimized for remediation workflow, not analytics or executive reporting.
- Large scans are summarized and paginated, but there is no dedicated trend-reporting or export surface yet.
- The dashboard does not include authentication, RBAC, or multi-user assignment workflow.

## MCP / agent integration
- MCP transport is `stdio` only (no HTTP/SSE yet).
- MCP is summary-first by design and will not return unbounded full-history dumps.
- MCP uses the existing workflow rules; it is not a privileged bypass layer.

## Deployment / operations
- The current setup is intended for local and development usage.
- Production deployment, secret handling, monitoring, and operational runbooks are not included.

## Planned for future releases
- SSO / RBAC
- Jira / GitHub issue synchronization
- Complex waiver workflows
- Screenshot diffing
- Cross-branch merge analytics
