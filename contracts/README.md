# Contract Artifacts

Machine-readable specifications that define the stable interfaces of WCAG-Guide.

| File | Description |
|------|-------------|
| `openapi.yaml` | REST API contract (v1) |
| `worker-job.schema.json` | Worker job payload schema (v1) |
| `mcp-tools.schema.json` | MCP tool input/output contract (v1) |
| `mcp-resources.md` | MCP resource URI and pagination contract (v1) |
| `url-normalization.md` | Canonical URL rules (`norm-v1`) |
| `fingerprint.md` | Finding identity/deduplication rules (`fp-v1`) |
| `compliance-profiles.md` | Scan profile definitions (`cp-v1`) |
| `axe-metadata.md` | Persisted axe rule/instance metadata contract (`axe-meta-v1`) |
| `hvt-grouping.md` | High-value target grouping contract (`hvt-v1`) |

These contracts are versioned. Additive changes are backwards-compatible; breaking changes require a major version bump.
