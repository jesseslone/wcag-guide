# Local Troubleshooting

## Stack does not come up cleanly
- Run `docker compose ps` and confirm `db`, `app`, `worker`, and `demo-site` are present.
- If a prior run left stale state behind, reset with `./scripts/dev/down.sh` and then rerun `./scripts/dev/up.sh`.

## App health check does not pass
- Inspect logs with `docker compose logs app worker`.
- Confirm migrations ran successfully. The API and worker expect both `db/migrations/0001_init.sql` and `db/migrations/0002_worker_jobs.sql`.
- Verify `http://127.0.0.1:8080/healthz` returns `{"ok":true}`.

## `wguide mcp` fails before the server starts
- Run `wguide mcp --help` and confirm the expected flags and defaults.
- If you do not want Docker bootstrap side effects, use `wguide mcp --no-bootstrap` and start the stack separately with `./scripts/dev/up.sh`.
- If bootstrap is enabled and fails, inspect `docker compose ps` followed by `docker compose logs app worker db demo-site`.
- If you changed the local API port or are targeting a different app instance, pass `--app-base-url` or export `WGUIDE_APP_BASE_URL`.
- If you point `--app-base-url` at a non-default port, bootstrap still uses the standard local compose stack. In that case, either pre-start your custom app instance or use `--no-bootstrap`.

## Smoke script times out
- Check whether the worker is running: `docker compose logs worker`.
- Verify the demo target row exists:
  `docker compose exec -T db psql -U wcag_guide -d wcag_guide -c "select site_key, environment, branch, base_url from scan_targets;"`
- Verify the local target is reachable:
  `curl -fsS http://127.0.0.1:8081/`

## Database migration or seed step fails
- If host `psql` is not installed, the scripts automatically fall back to `docker compose exec`.
- If Docker is unavailable, use a local Postgres instance and export:
  `DATABASE_URL=postgres://wcag_guide:wcag_guide@127.0.0.1:5432/wcag_guide`
- Re-run:
  `./scripts/db/migrate.sh`
  `./scripts/dev/seed-demo-target.sh`

## Rebuild after dependency or Dockerfile changes
- Rebuild images explicitly:
  `docker compose build app worker demo-site`
- Then restart:
  `./scripts/dev/up.sh`

## Runtime versions
- Scanner engine/version and browser/version are pinned in `docker/Dockerfile.dev`.
- The worker persists those values in `scan_runs.scanner_context` for every run.
