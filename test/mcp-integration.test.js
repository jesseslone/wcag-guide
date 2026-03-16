import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpError as SdkMcpError } from "@modelcontextprotocol/sdk/types.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureServerPath = fileURLToPath(new URL("../test-support/mcp-fixture-server.mjs", import.meta.url));

async function withMcp(fn, options = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixtureServerPath],
    cwd: repoRoot,
    env: {
      ...process.env,
      MCP_FIXTURE_OPTIONS: JSON.stringify(options)
    },
    stderr: "pipe"
  });
  const client = new Client({
    name: "test-client",
    version: "1.0.0"
  });
  let stderr = "";

  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  await client.connect(transport);

  try {
    await fn({
      client,
      readLogs() {
        return stderr
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
      }
    });
  } finally {
    await client.close();
  }
}

test("MCP initialize advertises frozen capabilities and tool catalog", async () => {
  await withMcp(async ({ client }) => {
    assert.equal(client.getServerVersion()?.name, "wcag-guide");
    assert.equal(client.getServerVersion()?.version, "0.1.0");
    assert.deepEqual(client.getServerCapabilities()?.tools, { listChanged: false });
    assert.deepEqual(client.getServerCapabilities()?.resources, {
      subscribe: false,
      listChanged: false
    });

    const toolsResponse = await client.listTools();
    assert.equal(toolsResponse.tools.length, 12);
    assert.deepEqual(
      toolsResponse.tools.map((tool) => tool.name),
      [
        "list_compliance_profiles",
        "list_scan_targets",
        "upsert_scan_target",
        "get_target_overview",
        "list_triage_queue",
        "get_scan_run_summary",
        "get_scan_run_hvt_groups",
        "get_finding_detail",
        "update_finding_status",
        "trigger_page_rescan",
        "trigger_path_rescan",
        "trigger_full_scan"
      ]
    );

    const templatesResponse = await client.listResourceTemplates();
    assert.equal(templatesResponse.resourceTemplates.length, 6);
    assert.equal(
      templatesResponse.resourceTemplates[0].uriTemplate,
      "wcag-guide://compliance-profiles"
    );
  });
});

test("read tools return summary-first payloads with cursor-based queue pagination", async () => {
  await withMcp(async ({ client }) => {
    const profiles = await client.callTool({
      name: "list_compliance_profiles",
      arguments: {}
    });
    assert.equal(profiles.structuredContent.default_profile_id, "title_ii_2026");
    assert.equal(profiles.structuredContent.items.length, 4);

    const targets = await client.callTool({
      name: "list_scan_targets",
      arguments: {
        limit: 1
      }
    });
    assert.equal(targets.structuredContent.items.length, 1);
    assert.ok(targets.structuredContent.next_cursor);

    const overview = await client.callTool({
      name: "get_target_overview",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main"
      }
    });

    assert.equal(overview.structuredContent.scan_target.base_url, "https://example.gov");
    assert.equal(overview.structuredContent.latest_completed_run.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(overview.structuredContent.open_counts.total, 5);
    assert.equal(overview.structuredContent.top_rules[0].rule_id, "label");

    const runSummary = await client.callTool({
      name: "get_scan_run_summary",
      arguments: {
        scan_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
      }
    });
    assert.equal(runSummary.structuredContent.run.compliance_profile.id, "enhanced_22_aa");
    assert.equal(runSummary.structuredContent.hvt_summary.group_level, "section_cluster");
    assert.ok(runSummary.structuredContent.hvt_summary.items.length > 0);

    const queuePageOne = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        limit: 2
      }
    });

    assert.equal(queuePageOne.structuredContent.items.length, 2);
    assert.ok(queuePageOne.structuredContent.next_cursor);
    assert.equal(queuePageOne.structuredContent.items[0].diff_status, "new");

    const queuePageTwo = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        limit: 2,
        cursor: queuePageOne.structuredContent.next_cursor
      }
    });

    assert.equal(queuePageTwo.structuredContent.items.length, 2);
    assert.equal(queuePageTwo.structuredContent.items[0].rule_id, "aria-required-children");
  });
});

test("tool errors return isError without schema-invalid structured content", async () => {
  await withMcp(async ({ client }) => {
    const result = await client.callTool({
      name: "get_target_overview",
      arguments: {
        site_key: "missing-site",
        environment: "prod",
        branch: "main"
      }
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.match(result.content[0].text, /not_found/);
  });
});

test("finding detail and HVT group tools expose enriched run-scoped metadata", async () => {
  await withMcp(async ({ client }) => {
    const findingDetail = await client.callTool({
      name: "get_finding_detail",
      arguments: {
        finding_id: "44444444-4444-4444-8444-444444444441"
      }
    });

    assert.equal(findingDetail.structuredContent.finding.rule_metadata.rule_id, "color-contrast");
    assert.equal(
      findingDetail.structuredContent.finding.latest_instance.failure_summary,
      "Contrast remains below 4.5:1 for normal text."
    );

    const hvtGroups = await client.callTool({
      name: "get_scan_run_hvt_groups",
      arguments: {
        scan_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        group_level: "section_cluster",
        limit: 3
      }
    });

    assert.equal(hvtGroups.structuredContent.scan_run_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(hvtGroups.structuredContent.compliance_profile.id, "enhanced_22_aa");
    assert.equal(hvtGroups.structuredContent.group_level, "section_cluster");
    assert.equal(hvtGroups.structuredContent.items.length, 3);
    assert.equal(hvtGroups.structuredContent.items[0].group_level, "section_cluster");
    assert.equal(hvtGroups.structuredContent.items[0].representative_rule_id.length > 0, true);
  });
});

test("MCP HVT tool supports fix-surface clustering", async () => {
  await withMcp(async ({ client }) => {
    const hvtGroups = await client.callTool({
      name: "get_scan_run_hvt_groups",
      arguments: {
        scan_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        group_level: "fix_surface_cluster",
        limit: 3
      }
    });

    assert.equal(hvtGroups.structuredContent.group_level, "fix_surface_cluster");
    assert.ok(hvtGroups.structuredContent.items.length > 0);
    assert.equal(typeof hvtGroups.structuredContent.items[0].likely_fix_surface, "string");
    assert.equal(typeof hvtGroups.structuredContent.items[0].suggested_first_look, "string");
  });
});

test("overview and triage queue choose the latest completed run by completed_at when runs overlap", async () => {
  await withMcp(async ({ client }) => {
    const overview = await client.callTool({
      name: "get_target_overview",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main"
      }
    });

    assert.equal(
      overview.structuredContent.latest_completed_run.id,
      "99999999-9999-4999-8999-999999999992"
    );

    const queue = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        limit: 5
      }
    });

    assert.equal(queue.structuredContent.applied_filters.scan_run_id, "99999999-9999-4999-8999-999999999992");
    assert.equal(queue.structuredContent.items[0].finding_id, "99999999-9999-4999-8999-999999999991");
    assert.equal(queue.structuredContent.items[0].diff_status, "new");
  }, {
    repositoryOptions: {
      state: {
        scanRuns: [
          {
            id: "99999999-9999-4999-8999-999999999991",
            scanTargetId: "11111111-1111-4111-8111-111111111111",
            mode: "page",
            state: "completed",
            reason: "Started later, finished earlier",
            scanOptions: {
              max_pages: 10,
              max_depth: 1,
              concurrency: 1,
              retries: 0,
              path_allowlist: [],
              path_denylist: [],
              query_param_allowlist: []
            },
            scannerContext: {
              engine: "axe-core",
              engine_version: "4.10.0",
              browser: "chromium",
              browser_version: "134.0.0",
              viewport: "1440x900",
              user_agent: "fixture-agent",
              fingerprint_version: "fp-v1",
              normalization_version: "norm-v1"
            },
            pagesScanned: 1,
            findingsTotal: 1,
            newCount: 1,
            resolvedCount: 0,
            persistentCount: 0,
            startedAt: "2026-03-11T10:10:00.000Z",
            completedAt: "2026-03-11T10:11:00.000Z"
          },
          {
            id: "99999999-9999-4999-8999-999999999992",
            scanTargetId: "11111111-1111-4111-8111-111111111111",
            mode: "page",
            state: "completed",
            reason: "Started earlier, finished later",
            scanOptions: {
              max_pages: 10,
              max_depth: 1,
              concurrency: 1,
              retries: 0,
              path_allowlist: [],
              path_denylist: [],
              query_param_allowlist: []
            },
            scannerContext: {
              engine: "axe-core",
              engine_version: "4.10.0",
              browser: "chromium",
              browser_version: "134.0.0",
              viewport: "1440x900",
              user_agent: "fixture-agent",
              fingerprint_version: "fp-v1",
              normalization_version: "norm-v1"
            },
            pagesScanned: 1,
            findingsTotal: 1,
            newCount: 1,
            resolvedCount: 0,
            persistentCount: 0,
            startedAt: "2026-03-11T10:09:00.000Z",
            completedAt: "2026-03-11T10:20:00.000Z"
          }
        ],
        findings: [
          {
            id: "99999999-9999-4999-8999-999999999990",
            scanTargetId: "11111111-1111-4111-8111-111111111111",
            fingerprint: "fp-overlap-early-finish",
            ruleId: "landmark-one-main",
            severity: "moderate",
            status: "open",
            ignoreExpiresAt: null
          },
          {
            id: "99999999-9999-4999-8999-999999999991",
            scanTargetId: "11111111-1111-4111-8111-111111111111",
            fingerprint: "fp-overlap-late-finish",
            ruleId: "region",
            severity: "critical",
            status: "open",
            ignoreExpiresAt: null
          }
        ],
        findingInstances: [
          {
            id: "99999999-9999-4999-8999-999999999993",
            findingId: "99999999-9999-4999-8999-999999999990",
            scanRunId: "99999999-9999-4999-8999-999999999991",
            pageId: "page-overlap-1",
            rawUrl: "https://example.gov/overlap/early",
            normalizedUrl: "https://example.gov/overlap/early",
            normalizedSelector: "main",
            snippet: "Earlier completed overlap run",
            detectedAt: "2026-03-11T10:10:30.000Z"
          },
          {
            id: "99999999-9999-4999-8999-999999999994",
            findingId: "99999999-9999-4999-8999-999999999991",
            scanRunId: "99999999-9999-4999-8999-999999999992",
            pageId: "page-overlap-2",
            rawUrl: "https://example.gov/overlap/late",
            normalizedUrl: "https://example.gov/overlap/late",
            normalizedSelector: "section",
            snippet: "Later completed overlap run",
            detectedAt: "2026-03-11T10:19:30.000Z"
          }
        ]
      }
    }
  });
});

test("resources expose URI-addressed snapshots and structured read errors", async () => {
  await withMcp(async ({ client }) => {
    const profilesResource = await client.readResource({
      uri: "wcag-guide://compliance-profiles"
    });
    const profilesPayload = JSON.parse(profilesResource.contents[0].text);
    assert.equal(profilesPayload.default_profile_id, "title_ii_2026");

    const targetSummary = await client.readResource({
      uri: "wcag-guide://targets/example-gov/prod/main/summary"
    });
    const targetPayload = JSON.parse(targetSummary.contents[0].text);
    assert.equal(targetPayload.scan_target.site_key, "example-gov");

    const queueResource = await client.readResource({
      uri: "wcag-guide://queues/example-gov/prod/main?status=open&severity=serious&limit=1"
    });
    const queuePayload = JSON.parse(queueResource.contents[0].text);
    assert.equal(queuePayload.items.length, 1);
    assert.equal(queuePayload.items[0].severity, "serious");

    const hvtResource = await client.readResource({
      uri: "wcag-guide://scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/hvt-groups?group_level=section_cluster&limit=2"
    });
    const hvtPayload = JSON.parse(hvtResource.contents[0].text);
    assert.equal(hvtPayload.scan_run_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(hvtPayload.items.length, 2);

    await assert.rejects(
      () =>
        client.readResource({
          uri: "wcag-guide://queues/example-gov/prod/main?cursor=not-a-real-cursor"
        }),
      (error) => error instanceof SdkMcpError && error.data?.code === "invalid_cursor"
    );

    await assert.rejects(
      () =>
        client.readResource({
          uri: "wcag-guide://queues/example-gov/prod/main?unsupported=yes"
        }),
      (error) => error instanceof SdkMcpError && error.data?.code === "bad_request"
    );
  });
});

test("triage queue cursor is rejected when filters change", async () => {
  await withMcp(async ({ client }) => {
    const queuePage = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        limit: 1
      }
    });

    const invalidReuse = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        severity: "serious",
        limit: 1,
        cursor: queuePage.structuredContent.next_cursor
      }
    });

    assert.equal(invalidReuse.isError, true);
    assert.equal(invalidReuse.structuredContent, undefined);
    assert.match(invalidReuse.content[0].text, /invalid_cursor/);
  });
});

test("target management and mutation tools preserve validation, audit trail, and async run handles", async () => {
  await withMcp(async ({ client, readLogs }) => {
    const createdTarget = await client.callTool({
      name: "upsert_scan_target",
      arguments: {
        site_key: "example-org",
        environment: "adhoc",
        branch: "live",
        base_url: "https://example.org"
      }
    });
    assert.equal(createdTarget.structuredContent.scan_target.base_url, "https://example.org");

    const listedTarget = await client.callTool({
      name: "list_scan_targets",
      arguments: {
        site_key: "example-org",
        limit: 5
      }
    });
    assert.equal(listedTarget.structuredContent.items.length, 1);
    assert.equal(listedTarget.structuredContent.items[0].branch, "live");

    const invalidUpdate = await client.callTool({
      name: "update_finding_status",
      arguments: {
        finding_id: "44444444-4444-4444-8444-444444444443",
        status: "ignored"
      }
    });
    assert.equal(invalidUpdate.isError, true);
    assert.equal(invalidUpdate.structuredContent, undefined);
    assert.match(invalidUpdate.content[0].text, /bad_request/);

    const validUpdate = await client.callTool({
      name: "update_finding_status",
      arguments: {
        finding_id: "44444444-4444-4444-8444-444444444443",
        status: "in_progress",
        note: "Investigating form remediation."
      }
    });
    assert.equal(validUpdate.structuredContent.finding.status, "in_progress");
    assert.equal(validUpdate.structuredContent.latest_status_event.changed_by, "mcp");

    const updatedFinding = await client.callTool({
      name: "get_finding_detail",
      arguments: {
        finding_id: "44444444-4444-4444-8444-444444444443"
      }
    });
    assert.equal(updatedFinding.structuredContent.status_history[0].changed_by, "mcp");

    const pageRescan = await client.callTool({
      name: "trigger_page_rescan",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        page_url: "https://example.gov/forms/contact",
        reason: "Verify remediation after form changes.",
        compliance_profile_id: "advisory_best_practice"
      }
    });
    assert.equal(pageRescan.structuredContent.run.mode, "page");
    assert.equal(pageRescan.structuredContent.run.state, "queued");
    assert.equal(pageRescan.structuredContent.run.compliance_profile.id, "advisory_best_practice");

    const pathRescan = await client.callTool({
      name: "trigger_path_rescan",
      arguments: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        path_prefix: "/forms",
        reason: "Verify shared forms section."
      }
    });
    assert.equal(pathRescan.structuredContent.run.mode, "path");
    assert.equal(pathRescan.structuredContent.run.state, "queued");

    const fullScan = await client.callTool({
      name: "trigger_full_scan",
      arguments: {
        site_key: "example-org",
        environment: "adhoc",
        branch: "live",
        base_url: "https://example.org",
        reason: "Initial baseline",
        compliance_profile_id: "enhanced_22_aa",
        scan_options: {
          max_pages: 50,
          max_depth: 4,
          concurrency: 3,
          retries: 2
        }
      }
    });
    assert.equal(fullScan.structuredContent.run.mode, "full");
    assert.equal(fullScan.structuredContent.run.scan_options.max_pages, 50);
    assert.equal(fullScan.structuredContent.run.compliance_profile.id, "enhanced_22_aa");
    assert.equal(fullScan.structuredContent.run.scan_target.base_url, "https://example.org");

    const auditLog = readLogs().find((entry) => entry.event === "tool_call" && entry.tool === "trigger_page_rescan");
    assert.equal(auditLog.outcome, "ok");
  });
});
