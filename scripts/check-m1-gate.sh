#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Running contract/shared module tests"
npm test

docker compose down -v >/dev/null 2>&1 || true

echo "[2/3] Starting db service"
docker compose up -d db >/dev/null

cleanup() {
  docker compose down -v >/dev/null || true
}
trap cleanup EXIT

for i in {1..20}; do
  if docker compose exec -T db pg_isready -U wcag_guide -d wcag_guide >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[3/3] Applying migration"
./scripts/db/migrate.sh >/dev/null

echo "M1 gate check: PASS"
