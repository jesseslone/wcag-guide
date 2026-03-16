import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const appBaseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:8080";
const workspaceDir = fileURLToPath(new URL("../../", import.meta.url));
const target = {
  site_key: process.env.MCP_DEMO_SITE_KEY ?? "demo-site",
  environment: process.env.MCP_DEMO_ENVIRONMENT ?? "local",
  branch: process.env.MCP_DEMO_BRANCH ?? "main"
};

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollRunSummary(client, scanRunId, { timeoutMs = 90000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.callTool({
      name: "get_scan_run_summary",
      arguments: {
        scan_run_id: scanRunId
      }
    });
    const payload = result.structuredContent;

    if (payload.run.state === "completed" || payload.run.state === "failed") {
      return payload;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for scan run ${scanRunId}`);
}

async function main() {
  const transport = process.env.MCP_COMMAND
    ? new StdioClientTransport({
        command: "/bin/zsh",
        args: ["-lc", process.env.MCP_COMMAND],
        cwd: workspaceDir,
        env: {
          ...process.env,
          APP_BASE_URL: appBaseUrl
        },
        stderr: "inherit"
      })
    : new StdioClientTransport({
        command: process.execPath,
        args: ["bin/wguide.js", "mcp", "--no-bootstrap"],
        cwd: workspaceDir,
        env: {
          ...process.env,
          APP_BASE_URL: appBaseUrl
        },
        stderr: "inherit"
      });
  const client = new Client({
    name: "demo-workflow",
    version: "1.0.0"
  });

  try {
    await client.connect(transport);

    const queuedFullScan = await client.callTool({
      name: "trigger_full_scan",
      arguments: {
        ...target,
        reason: "MCP demo workflow baseline scan"
      }
    });
    const baselineRunId = queuedFullScan.structuredContent.run.id;
    const baselineSummary = await pollRunSummary(client, baselineRunId);

    const queue = await client.callTool({
      name: "list_triage_queue",
      arguments: {
        ...target,
        limit: 3
      }
    });
    const firstItem = queue.structuredContent.items[0];

    if (!firstItem) {
      console.log(
        JSON.stringify(
          {
            target,
            baseline_run_id: baselineRunId,
            baseline_state: baselineSummary.run.state,
            queue_items: 0
          },
          null,
          2
        )
      );
      return;
    }

    const findingDetail = await client.callTool({
      name: "get_finding_detail",
      arguments: {
        finding_id: firstItem.finding_id
      }
    });
    const updatedFinding = await client.callTool({
      name: "update_finding_status",
      arguments: {
        finding_id: firstItem.finding_id,
        status: "in_progress",
        note: "Picked up by MCP demo workflow."
      }
    });

    const pageRescan = await client.callTool({
      name: "trigger_page_rescan",
      arguments: {
        ...target,
        page_url: findingDetail.structuredContent.finding.latest_instance.page_url,
        reason: "Validate remediation status after agent triage."
      }
    });
    const rescanSummary = await pollRunSummary(client, pageRescan.structuredContent.run.id);

    console.log(
      JSON.stringify(
        {
          target,
          baseline_run: {
            id: baselineRunId,
            state: baselineSummary.run.state,
            findings_total: baselineSummary.run.summary.findings_total
          },
          triage_pick: {
            finding_id: firstItem.finding_id,
            rule_id: firstItem.rule_id,
            severity: firstItem.severity,
            page_url: findingDetail.structuredContent.finding.latest_instance.page_url
          },
          status_update: updatedFinding.structuredContent.latest_status_event,
          page_rescan: {
            id: pageRescan.structuredContent.run.id,
            state: rescanSummary.run.state,
            findings_total: rescanSummary.run.summary.findings_total
          }
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
