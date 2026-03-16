const queueQueryKeys = new Set([
  "status",
  "severity",
  "diff_status",
  "rule_id",
  "path_prefix",
  "cursor",
  "limit"
]);

const hvtQueryKeys = new Set([
  "group_level",
  "limit"
]);

function encodeSegment(value) {
  return encodeURIComponent(value);
}

function decodeSegment(value) {
  return decodeURIComponent(value);
}

function sortQueryEntries(entries) {
  return entries.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || String(leftValue).localeCompare(String(rightValue))
  );
}

export function buildTargetSummaryUri(scanTarget) {
  return `wcag-guide://targets/${encodeSegment(scanTarget.site_key)}/${encodeSegment(
    scanTarget.environment
  )}/${encodeSegment(scanTarget.branch)}/summary`;
}

export function buildRunSummaryUri(scanRunId) {
  return `wcag-guide://scan-runs/${encodeSegment(scanRunId)}/summary`;
}

export function buildRunHvtGroupsUri(scanRunId, filters = {}) {
  const uri = new URL(`wcag-guide://scan-runs/${encodeSegment(scanRunId)}/hvt-groups`);
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "");
  for (const [key, value] of sortQueryEntries(entries)) {
    uri.searchParams.set(key, String(value));
  }
  return uri.toString();
}

export function buildFindingUri(findingId) {
  return `wcag-guide://findings/${encodeSegment(findingId)}`;
}

export function buildComplianceProfilesUri() {
  return "wcag-guide://compliance-profiles";
}

export function buildQueueUri({ site_key, environment, branch, ...filters }) {
  const uri = new URL(
    `wcag-guide://queues/${encodeSegment(site_key)}/${encodeSegment(environment)}/${encodeSegment(branch)}`
  );

  const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== "");
  for (const [key, value] of sortQueryEntries(entries)) {
    uri.searchParams.set(key, String(value));
  }

  return uri.toString();
}

export function parseResourceUri(uri) {
  let parsed;

  try {
    parsed = new URL(uri);
  } catch {
    return {
      error: {
        code: "bad_request",
        message: "resource uri must be a valid URI"
      }
    };
  }

  if (parsed.protocol !== "wcag-guide:") {
    return {
      error: {
        code: "not_found",
        message: "resource uri must use the wcag-guide scheme"
      }
    };
  }

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);

  switch (parsed.hostname) {
    case "compliance-profiles":
      if (segments.length === 0) {
        return {
          kind: "compliance_profiles",
          params: {}
        };
      }
      break;
    case "targets":
      if (segments.length === 4 && segments[3] === "summary") {
        return {
          kind: "target_summary",
          params: {
            site_key: segments[0],
            environment: segments[1],
            branch: segments[2]
          }
        };
      }
      break;
    case "scan-runs":
      if (segments.length === 2 && segments[1] === "summary") {
        return {
          kind: "scan_run_summary",
          params: {
            scan_run_id: segments[0]
          }
        };
      }
      if (segments.length === 2 && segments[1] === "hvt-groups") {
        for (const key of parsed.searchParams.keys()) {
          if (!hvtQueryKeys.has(key)) {
            return {
              error: {
                code: "bad_request",
                message: `unsupported query parameter: ${key}`
              }
            };
          }
        }

        return {
          kind: "scan_run_hvt_groups",
          params: {
            scan_run_id: segments[0],
            group_level: parsed.searchParams.get("group_level") ?? undefined,
            limit: parsed.searchParams.get("limit") ?? undefined
          }
        };
      }
      break;
    case "findings":
      if (segments.length === 1) {
        return {
          kind: "finding_detail",
          params: {
            finding_id: segments[0]
          }
        };
      }
      break;
    case "queues": {
      if (segments.length !== 3) {
        break;
      }

      for (const key of parsed.searchParams.keys()) {
        if (!queueQueryKeys.has(key)) {
          return {
            error: {
              code: "bad_request",
              message: `unsupported query parameter: ${key}`
            }
          };
        }
      }

      return {
        kind: "triage_queue",
        params: {
          site_key: segments[0],
          environment: segments[1],
          branch: segments[2],
          status: parsed.searchParams.get("status") ?? undefined,
          severity: parsed.searchParams.get("severity") ?? undefined,
          diff_status: parsed.searchParams.get("diff_status") ?? undefined,
          rule_id: parsed.searchParams.get("rule_id") ?? undefined,
          path_prefix: parsed.searchParams.get("path_prefix") ?? undefined,
          cursor: parsed.searchParams.get("cursor") ?? undefined,
          limit: parsed.searchParams.get("limit") ?? undefined
        }
      };
    }
    default:
      break;
  }

  return {
    error: {
      code: "not_found",
      message: "resource uri is not supported"
    }
  };
}
