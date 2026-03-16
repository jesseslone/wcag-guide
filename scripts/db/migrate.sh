#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS=()
while IFS= read -r migration; do
  MIGRATIONS+=("$migration")
done < <(find db/migrations -maxdepth 1 -type f -name '*.sql' | sort)

if [[ ${#MIGRATIONS[@]} -eq 0 ]]; then
  echo "No SQL migrations found in db/migrations"
  exit 1
fi

psql_exec_host() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "$1"
}

psql_file_host() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"
}

psql_exec_docker() {
  docker compose exec -T db psql -U "${DB_USER:-wcag_guide}" -d "${DB_NAME:-wcag_guide}" -v ON_ERROR_STOP=1 -tAc "$1"
}

psql_file_docker() {
  # MSYS_NO_PATHCONV prevents Git Bash on Windows from rewriting the
  # container-internal /workspace/ path to a Windows path like C:/Program Files/Git/...
  MSYS_NO_PATHCONV=1 docker compose exec -T db psql -U "${DB_USER:-wcag_guide}" -d "${DB_NAME:-wcag_guide}" -v ON_ERROR_STOP=1 -f "/workspace/$1"
}

ensure_schema_migrations() {
  "$1" "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());" >/dev/null
}

bootstrap_existing_migrations() {
  local exec_fn="$1"
  local has_scan_targets
  local has_worker_jobs

  has_scan_targets="$("$exec_fn" "SELECT to_regclass('public.scan_targets') IS NOT NULL;" | tr -d '[:space:]')"
  has_worker_jobs="$("$exec_fn" "SELECT to_regclass('public.worker_jobs') IS NOT NULL;" | tr -d '[:space:]')"

  if [[ "$has_scan_targets" == "t" ]]; then
    "$exec_fn" "INSERT INTO schema_migrations (filename) VALUES ('0001_init.sql') ON CONFLICT (filename) DO NOTHING;" >/dev/null
  fi
  if [[ "$has_worker_jobs" == "t" ]]; then
    "$exec_fn" "INSERT INTO schema_migrations (filename) VALUES ('0002_worker_jobs.sql') ON CONFLICT (filename) DO NOTHING;" >/dev/null
  fi
}

run_migrations() {
  local exec_fn="$1"
  local file_fn="$2"
  local label="$3"

  ensure_schema_migrations "$exec_fn"
  bootstrap_existing_migrations "$exec_fn"

  for migration in "${MIGRATIONS[@]}"; do
    local filename
    filename="$(basename "$migration")"
    local applied
    applied="$("$exec_fn" "SELECT 1 FROM schema_migrations WHERE filename = '$filename';" | tr -d '[:space:]')"
    if [[ "$applied" == "1" ]]; then
      echo "Skipping $migration ($label already applied)"
      continue
    fi

    "$file_fn" "$migration"
    "$exec_fn" "INSERT INTO schema_migrations (filename) VALUES ('$filename') ON CONFLICT (filename) DO NOTHING;" >/dev/null
    echo "Applied $migration via $label"
  done
}

run_with_host_psql() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required when using host psql"
    exit 1
  fi

  run_migrations psql_exec_host psql_file_host "host psql"
}

run_with_docker_exec() {
  run_migrations psql_exec_docker psql_file_docker "docker compose exec"
}

if command -v psql >/dev/null 2>&1; then
  run_with_host_psql
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  run_with_docker_exec
  exit 0
fi

echo "No migration method available: install psql or use docker compose."
exit 1
