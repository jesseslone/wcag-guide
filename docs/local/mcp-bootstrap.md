# MCP Bootstrap

## Standard command paths
- Installed CLI:
  - `npm install -g wcag-guide`
  - `wguide mcp`
- Zero-install CLI: `npx wcag-guide mcp`

Both commands start the MCP server over stdio and keep human-readable logs on stderr so JSON-RPC stdout stays clean for MCP clients.

## Defaults
- `APP_BASE_URL` / `WGUIDE_APP_BASE_URL`: `http://127.0.0.1:8080`
- Derived health check: `http://127.0.0.1:8080/healthz`
- `WGUIDE_WAIT_SECONDS`: `90`
- Bootstrap mode: `auto`

## Bootstrap behavior
- `auto`: check `GET {app_base_url}/healthz`; if it is healthy, start MCP immediately. If not, run `./scripts/dev/up.sh`, then wait for health.
- `always`: run `./scripts/dev/up.sh` even if the stack already looks healthy, then wait for health again.
- `never`: do not run Docker bootstrap. If the health check fails, the CLI exits with a clear error.

The bootstrap command is intentionally explicit. It reuses the checked-in local stack script instead of hiding Docker logic inside the MCP server.
The same app base URL is used for both readiness checks and HTTP requests from the MCP server, so those targets cannot drift apart.

## Waiting and health checks
- Health is defined by an HTTP 200 from `GET /healthz`.
- After bootstrap, the CLI waits up to `WGUIDE_WAIT_SECONDS` or `--wait-seconds`.
- The current implementation polls once per second.
- Bootstrap script output is forwarded to stderr so failures stay visible to the caller.

## Failure reporting
- Missing bootstrap script: immediate error before MCP startup.
- Bootstrap script non-zero exit: surfaced with the exit code or signal.
- Health timeout after bootstrap: explicit timeout error with suggested `docker compose ps` and `docker compose logs ...` follow-up.
- Invalid CLI flags: immediate usage error before any Docker or DB work begins.

## Common overrides
- Disable bootstrap:
  - `wguide mcp --no-bootstrap`
- Force bootstrap:
  - `wguide mcp --bootstrap=always`
- Point to a different app instance:
  - `wguide mcp --app-base-url http://127.0.0.1:18080`
- Increase the wait budget:
  - `wguide mcp --wait-seconds 180`
