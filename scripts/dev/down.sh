#!/usr/bin/env bash
set -euo pipefail

# Stop the stack. Scan data persists across restarts by default.
# Use --purge to also remove the database volume.
if [ "${1:-}" = "--purge" ]; then
  docker compose down --volumes --remove-orphans
else
  docker compose down --remove-orphans
fi
