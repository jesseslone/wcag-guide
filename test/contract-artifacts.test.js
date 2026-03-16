import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workerSchemaPath = new URL("../contracts/worker-job.schema.json", import.meta.url);
const openApiPath = new URL("../contracts/openapi.yaml", import.meta.url);
const mcpToolsPath = new URL("../contracts/mcp-tools.schema.json", import.meta.url);
const mcpResourcesPath = new URL("../contracts/mcp-resources.md", import.meta.url);

test("worker payload contract includes required idempotency fields", () => {
  const schema = JSON.parse(fs.readFileSync(workerSchemaPath, "utf8"));

  assert.ok(schema.required.includes("idempotency_key"));
  assert.ok(schema.required.includes("scan_target_id"));
  assert.ok(schema.required.includes("scan_run_id"));
  assert.ok(schema.properties.compliance_profile);
  assert.deepEqual(
    schema.properties.compliance_profile.required,
    ["id", "label", "version", "standard_target", "axe_tags"]
  );

  const modeEnum = schema.properties.mode.enum;
  assert.deepEqual(modeEnum, ["full", "path", "page"]);
});

test("OpenAPI contract includes required scan and finding endpoints", () => {
  const openApi = fs.readFileSync(openApiPath, "utf8");

  assert.ok(openApi.includes("/scan-runs:"));
  assert.ok(openApi.includes("/scan-targets:"));
  assert.ok(openApi.includes("/scan-runs/rescan-page:"));
  assert.ok(openApi.includes("/scan-runs/rescan-path:"));
  assert.ok(openApi.includes("/scan-runs/{scanRunId}/findings:"));
  assert.ok(openApi.includes("/scan-runs/{scanRunId}/hvt-groups:"));
  assert.ok(openApi.includes("/compliance-profiles:"));
  assert.ok(openApi.includes("/findings/{findingId}:"));
  assert.ok(openApi.includes("/findings/{findingId}/status:"));
  assert.ok(openApi.includes("enum: [open, in_progress, resolved, ignored]"));
  assert.ok(openApi.includes("name: diff_status"));
  assert.ok(openApi.includes("name: group_level"));
  assert.ok(openApi.includes("enum: [fix_surface_cluster, component_cluster, section_cluster]"));
  assert.ok(openApi.includes("enum: [new, resolved, persistent]"));
  assert.ok(openApi.includes("ComplianceProfilesResponse:"));
  assert.ok(openApi.includes("ScanTargetResponse:"));
  assert.ok(openApi.includes("PaginatedScanTargetsResponse:"));
  assert.ok(openApi.includes("RuleMetadata:"));
  assert.ok(openApi.includes("HvtGroupsResponse:"));
});

test("MCP contract includes required tools and resource URIs", () => {
  const mcpTools = JSON.parse(fs.readFileSync(mcpToolsPath, "utf8"));
  const mcpResources = fs.readFileSync(mcpResourcesPath, "utf8");
  const toolNames = mcpTools.examples[0].tools.map((tool) => tool.name);
  const fullScanTool = mcpTools.examples[0].tools.find((tool) => tool.name === "trigger_full_scan");

  assert.equal(mcpTools.contract_version ?? mcpTools.examples[0].contract_version, "mcp-v1");
  assert.deepEqual(mcpTools.examples[0].capabilities.tools, { listChanged: false });
  assert.deepEqual(mcpTools.examples[0].capabilities.resources, {
    subscribe: false,
    listChanged: false
  });

  assert.ok(toolNames.includes("get_target_overview"));
  assert.ok(toolNames.includes("list_compliance_profiles"));
  assert.ok(toolNames.includes("list_scan_targets"));
  assert.ok(toolNames.includes("list_triage_queue"));
  assert.ok(toolNames.includes("get_scan_run_summary"));
  assert.ok(toolNames.includes("get_scan_run_hvt_groups"));
  assert.ok(toolNames.includes("get_finding_detail"));
  assert.ok(toolNames.includes("upsert_scan_target"));
  assert.ok(toolNames.includes("update_finding_status"));
  assert.ok(toolNames.includes("trigger_page_rescan"));
  assert.ok(toolNames.includes("trigger_path_rescan"));
  assert.ok(toolNames.includes("trigger_full_scan"));
  assert.ok(fullScanTool.input_schema.properties.base_url);

  assert.ok(mcpResources.includes("wcag-guide://compliance-profiles"));
  assert.ok(mcpResources.includes("wcag-guide://targets/{site_key}/{environment}/{branch}/summary"));
  assert.ok(mcpResources.includes("wcag-guide://scan-runs/{scan_run_id}/summary"));
  assert.ok(mcpResources.includes("wcag-guide://scan-runs/{scan_run_id}/hvt-groups?group_level={group_level}&limit={limit}"));
  assert.ok(mcpResources.includes("fix_surface_cluster"));
  assert.ok(mcpResources.includes("wcag-guide://findings/{finding_id}"));
  assert.ok(mcpResources.includes("wcag-guide://queues/{site_key}/{environment}/{branch}?status=open&severity=serious"));
  assert.ok(mcpResources.includes("Default `limit`: `25`"));
  assert.ok(mcpResources.includes("Maximum `limit`: `100`"));
});
