#!/usr/bin/env bash
set -euo pipefail

docker compose build app worker demo-site
docker compose up -d db demo-site

for _ in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U wcag_guide -d wcag_guide >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

./scripts/db/migrate.sh
./scripts/dev/seed-demo-target.sh
docker compose up -d app worker

until node -e "fetch('http://127.0.0.1:8080/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
  sleep 1
done

echo "Local stack is ready."
echo "API: http://127.0.0.1:8080"
echo "Demo target: http://127.0.0.1:8081"
echo "Smoke test: ./scripts/smoke/full-lifecycle.sh"
