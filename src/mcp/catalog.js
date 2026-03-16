import { readFileSync } from "node:fs";

const contractSchema = JSON.parse(
  readFileSync(new URL("../../contracts/mcp-tools.schema.json", import.meta.url), "utf8")
);

const contractInstance = contractSchema.examples?.[0];
const sharedDefs = contractSchema.$defs ?? {};

if (!contractInstance) {
  throw new Error("contracts/mcp-tools.schema.json is missing an example contract instance");
}

export const protocolVersion = contractInstance.protocol_version;

export const serverInfo = Object.freeze({
  name: "wcag-guide",
  title: "WCAG-Guide MCP",
  version: "0.1.0",
  description:
    "WCAG 2.1 compliance scanner and remediation tracker. " +
    "A web dashboard is available at http://localhost:8080/dashboard for the user to review findings visually. " +
    "When relevant, share this URL with the user."
});

export const capabilities = Object.freeze({
  tools: contractInstance.capabilities.tools,
  resources: contractInstance.capabilities.resources
});

export const toolContracts = Object.freeze(
  contractInstance.tools.map((tool) => ({
    ...tool,
    inputSchema: {
      ...tool.input_schema,
      $defs: sharedDefs
    },
    outputSchema: {
      ...tool.output_schema,
      $defs: sharedDefs
    }
  }))
);

export const toolContractByName = new Map(toolContracts.map((tool) => [tool.name, tool]));

export const resourceTemplates = Object.freeze([
  {
    uriTemplate: "wcag-guide://compliance-profiles",
    name: "compliance_profiles",
    title: "Compliance Profiles",
    description: "API-backed compliance profile catalog and default profile identifier.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "wcag-guide://targets/{site_key}/{environment}/{branch}/summary",
    name: "target_summary",
    title: "Target Summary",
    description: "Compact remediation summary for one site target tuple.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "wcag-guide://scan-runs/{scan_run_id}/summary",
    name: "scan_run_summary",
    title: "Scan Run Summary",
    description: "Compact scan run summary for one queued, running, completed, or failed run.",
    mimeType: "application/json"
  },
  {
    uriTemplate:
      "wcag-guide://scan-runs/{scan_run_id}/hvt-groups?group_level={group_level}&limit={limit}",
    name: "scan_run_hvt_groups",
    title: "Scan Run HVT Groups",
    description: "Compact, run-scoped HVT grouping summary for one scan run.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "wcag-guide://findings/{finding_id}",
    name: "finding_detail",
    title: "Finding Detail",
    description: "Latest evidence and recent status history for one finding.",
    mimeType: "application/json"
  },
  {
    uriTemplate:
      "wcag-guide://queues/{site_key}/{environment}/{branch}?status={status}&severity={severity}&diff_status={diff_status}&rule_id={rule_id}&path_prefix={path_prefix}&cursor={cursor}&limit={limit}",
    name: "triage_queue",
    title: "Triage Queue",
    description: "Paginated remediation queue snapshot for one site target.",
    mimeType: "application/json"
  }
]);
