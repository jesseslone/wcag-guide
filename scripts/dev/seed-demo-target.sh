#!/usr/bin/env bash
set -euo pipefail

sql="
INSERT INTO scan_targets (site_key, environment, branch, base_url, crawl_config)
VALUES (
  'demo-site',
  'local',
  'main',
  'http://demo-site:8081',
  '{\"max_pages\":25,\"max_depth\":3,\"concurrency\":2,\"retries\":1,\"path_allowlist\":[],\"path_denylist\":[],\"query_param_allowlist\":[]}'::jsonb
)
ON CONFLICT (site_key, environment, branch)
DO UPDATE
SET base_url = EXCLUDED.base_url,
    crawl_config = EXCLUDED.crawl_config,
    updated_at = now();
"

if command -v psql >/dev/null 2>&1; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required when using host psql"
    exit 1
  fi

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$sql"
  echo "Seeded demo scan target via host psql"
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  docker compose exec -T db psql -U "${DB_USER:-wcag_guide}" -d "${DB_NAME:-wcag_guide}" -v ON_ERROR_STOP=1 -c "$sql"
  echo "Seeded demo scan target via docker compose exec"
  exit 0
fi

echo "No seed method available: install psql or use docker compose."
exit 1
