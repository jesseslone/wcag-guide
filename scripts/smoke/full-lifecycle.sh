#!/usr/bin/env bash
set -euo pipefail

api_url="${API_URL:-http://127.0.0.1:8080}"
profile_id="${COMPLIANCE_PROFILE_ID:-enhanced_22_aa}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

node -e "fetch('${api_url}/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

create_payload='{
  "scan_target": {
    "site_key": "demo-site",
    "environment": "local",
    "branch": "main",
    "base_url": "http://demo-site:8081"
  },
  "compliance_profile_id": "'"${profile_id}"'",
  "scan_options": {
    "max_pages": 10,
    "max_depth": 2,
    "concurrency": 2,
    "retries": 1,
    "path_allowlist": [],
    "path_denylist": []
  },
  "reason": "local smoke"
}'

curl -fsS -X POST "${api_url}/scan-runs" \
  -H "content-type: application/json" \
  -d "$create_payload" > "${tmp_dir}/create.json"

run_id="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.run.id);" "${tmp_dir}/create.json")"

if [[ -z "$run_id" ]]; then
  echo "Failed to create scan run"
  exit 1
fi

for _ in $(seq 1 30); do
  curl -fsS "${api_url}/scan-runs/${run_id}" > "${tmp_dir}/run.json"
  state="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.run.state);" "${tmp_dir}/run.json")"
  if [[ "$state" == "completed" ]]; then
    break
  fi
  if [[ "$state" == "failed" ]]; then
    echo "Scan run failed"
    cat "${tmp_dir}/run.json"
    exit 1
  fi
  sleep 1
done

final_state="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.run.state);" "${tmp_dir}/run.json")"
if [[ "$final_state" != "completed" ]]; then
  echo "Timed out waiting for scan completion"
  cat "${tmp_dir}/run.json"
  exit 1
fi

run_profile_id="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.run.compliance_profile?.id ?? '');" "${tmp_dir}/run.json")"
if [[ "$run_profile_id" != "$profile_id" ]]; then
  echo "Run detail did not persist the requested compliance profile"
  cat "${tmp_dir}/run.json"
  exit 1
fi

curl -fsS "${api_url}/scan-runs/${run_id}/findings?page=1&page_size=20" > "${tmp_dir}/findings.json"
finding_total="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(body.total));" "${tmp_dir}/findings.json")"
finding_id="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.items[0]?.id ?? '');" "${tmp_dir}/findings.json")"

if [[ "$finding_total" == "0" || -z "$finding_id" ]]; then
  echo "Smoke scan returned no findings"
  cat "${tmp_dir}/findings.json"
  exit 1
fi

curl -fsS "${api_url}/scan-runs/${run_id}/hvt-groups?group_level=section_cluster&page=1&page_size=20" > "${tmp_dir}/hvt-groups.json"
hvt_summary="$(
  node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if(body.scan_run_id !== process.argv[2]) throw new Error("scan_run_id mismatch"); if(body.compliance_profile?.id !== process.argv[3]) throw new Error("compliance profile mismatch"); if(!Array.isArray(body.items) || body.items.length === 0) throw new Error("missing HVT groups"); if(!body.items.every((group)=>group.affected_runs === 1)) throw new Error("HVT response is not run-scoped"); const repeated = body.items.find((group)=>group.rule_id === "link-name" && group.path_prefix === "/policies" && group.finding_count >= 2); if(!repeated) throw new Error("expected repeated policies link-name group missing"); process.stdout.write(JSON.stringify({ total: body.total, repeated_group: repeated }, null, 2));' \
    "${tmp_dir}/hvt-groups.json" \
    "${run_id}" \
    "${profile_id}"
)"

patch_payload='{
  "status": "in_progress",
  "note": "validated by smoke script"
}'

curl -fsS -X PATCH "${api_url}/findings/${finding_id}/status" \
  -H "content-type: application/json" \
  -d "$patch_payload" > "${tmp_dir}/status.json"

updated_status="$(node -e "const fs=require('fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(body.finding.status);" "${tmp_dir}/status.json")"
if [[ "$updated_status" != "in_progress" ]]; then
  echo "Finding status update did not persist"
  cat "${tmp_dir}/status.json"
  exit 1
fi

echo "Smoke succeeded."
echo "Run: ${run_id}"
echo "Compliance profile: ${run_profile_id}"
echo "Findings in run: ${finding_total}"
echo "HVT summary: ${hvt_summary}"
echo "Updated finding: ${finding_id} -> ${updated_status}"
