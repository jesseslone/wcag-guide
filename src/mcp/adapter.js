import { createHash } from "node:crypto";

import { ApiError } from "../app/errors.js";
import { findingSeverityRank, findingSeverities, findingStatuses } from "../app/constants.js";
import {
  buildComplianceProfilesUri,
  buildFindingUri,
  buildQueueUri,
  buildRunHvtGroupsUri,
  buildRunSummaryUri,
  buildTargetSummaryUri,
  parseResourceUri
} from "./resources.js";
import { resourceTemplates, toolContractByName, toolContracts } from "./catalog.js";

const defaultPageLimit = 25;
const maxPageLimit = 100;

const triageStatuses = new Set(["open", "in_progress"]);

export class McpError extends Error {
  constructor({ jsonRpcCode = -32000, errorCode = "internal_error", message, data = null }) {
    super(message);
    this.name = "McpError";
    this.jsonRpcCode = jsonRpcCode;
    this.errorCode = errorCode;
    this.data = data;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureObject(value, message = "arguments must be an object") {
  if (value === undefined) {
    return {};
  }
  if (!isObject(value)) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message
    });
  }
  return value;
}

function assertAllowedKeys(value, allowedKeys, context) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new McpError({
        jsonRpcCode: -32602,
        errorCode: "bad_request",
        message: `${context}.${key} is not supported`
      });
    }
  }
}

function requireString(value, fieldName, { format = null, maxLength = null } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} is required`
    });
  }
  if (maxLength !== null && value.length > maxLength) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} must be at most ${maxLength} characters`
    });
  }
  if (format === "uri") {
    try {
      new URL(value);
    } catch {
      throw new McpError({
        jsonRpcCode: -32602,
        errorCode: "bad_request",
        message: `${fieldName} must be a valid URI`
      });
    }
  }
  if (format === "date-time" && Number.isNaN(new Date(value).valueOf())) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} must be a valid date-time`
    });
  }
  if (
    format === "uuid" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} must be a UUID`
    });
  }
  return value;
}

function optionalString(value, fieldName, options = {}) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, fieldName, options);
}

function optionalEnum(value, fieldName, allowedValues) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (!allowedValues.includes(value)) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} is invalid`
    });
  }
  return value;
}

function optionalInteger(value, fieldName, { minimum, maximum, fallback = undefined } = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "bad_request",
      message: `${fieldName} must be an integer between ${minimum} and ${maximum}`
    });
  }
  return parsed;
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function hashCursorScope(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function decodeCursor(cursor, expectedScope) {
  if (!cursor) {
    return { offset: 0 };
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0 ||
      typeof parsed.scope !== "string" ||
      parsed.scope !== expectedScope
    ) {
      throw new Error("invalid offset");
    }
    return parsed;
  } catch {
    throw new McpError({
      jsonRpcCode: -32602,
      errorCode: "invalid_cursor",
      message: "cursor is invalid"
    });
  }
}

function paginateByCursor(items, cursor, { limit = defaultPageLimit, scope, identity = (item) => item } = {}) {
  const resolvedScope = hashCursorScope(
    JSON.stringify({
      scope,
      identities: items.map(identity)
    })
  );
  const { offset } = decodeCursor(cursor, resolvedScope);
  const sliced = items.slice(offset, offset + limit);
  const nextCursor = offset + sliced.length < items.length
    ? encodeCursor({ offset: offset + sliced.length, scope: resolvedScope })
    : undefined;

  return {
    items: sliced,
    nextCursor
  };
}

function compareSeverity(left, right) {
  return findingSeverityRank[left] - findingSeverityRank[right];
}

function buildCounts(findings) {
  const bySeverity = Object.fromEntries(findingSeverities.map((severity) => [severity, 0]));
  const byStatus = Object.fromEntries(findingStatuses.map((status) => [status, 0]));

  let total = 0;
  for (const finding of findings) {
    byStatus[finding.status] += 1;
    if (triageStatuses.has(finding.status)) {
      bySeverity[finding.severity] += 1;
      total += 1;
    }
  }

  return {
    total,
    by_severity: bySeverity,
    by_status: byStatus
  };
}

function buildTopRules(findings) {
  const grouped = new Map();

  for (const finding of findings) {
    const current = grouped.get(finding.rule_id) ?? {
      rule_id: finding.rule_id,
      finding_count: 0,
      highest_severity: finding.severity
    };
    current.finding_count += 1;
    if (compareSeverity(finding.severity, current.highest_severity) < 0) {
      current.highest_severity = finding.severity;
    }
    grouped.set(finding.rule_id, current);
  }

  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        right.finding_count - left.finding_count ||
        compareSeverity(left.highest_severity, right.highest_severity) ||
        left.rule_id.localeCompare(right.rule_id)
    )
    .slice(0, 10);
}

function buildTopPages(findings) {
  const grouped = new Map();

  for (const finding of findings) {
    const current = grouped.get(finding.latest_instance.normalized_url) ?? {
      normalized_url: finding.latest_instance.normalized_url,
      finding_count: 0,
      highest_severity: finding.severity
    };
    current.finding_count += 1;
    if (compareSeverity(finding.severity, current.highest_severity) < 0) {
      current.highest_severity = finding.severity;
    }
    grouped.set(finding.latest_instance.normalized_url, current);
  }

  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        right.finding_count - left.finding_count ||
        compareSeverity(left.highest_severity, right.highest_severity) ||
        left.normalized_url.localeCompare(right.normalized_url)
    )
    .slice(0, 10);
}

function selectorExcerpt(selector) {
  if (selector.length <= 240) {
    return selector;
  }
  return `${selector.slice(0, 237)}...`;
}

function mapTriageItem(finding) {
  const item = {
    finding_id: finding.id,
    rule_id: finding.rule_id,
    severity: finding.severity,
    status: finding.status,
    latest_instance: {
      normalized_url: finding.latest_instance.normalized_url,
      selector_excerpt: selectorExcerpt(finding.latest_instance.selector),
      detected_at: finding.latest_instance.detected_at
    }
  };

  if (finding.diff_status) {
    item.diff_status = finding.diff_status;
  }

  return item;
}

function mapFindingDetail(finding) {
  const detail = {
    id: finding.id,
    rule_id: finding.rule_id,
    severity: finding.severity,
    status: finding.status,
    ignore_expires_at: finding.ignore_expires_at,
    scan_target: finding.scan_target,
    latest_instance: finding.latest_instance
  };

  if (finding.rule_metadata) {
    detail.rule_metadata = finding.rule_metadata;
  }

  return detail;
}

function mapStatusEvent(event) {
  return {
    id: event.id,
    previous_status: event.previous_status,
    new_status: event.new_status,
    note: event.note,
    ignore_expires_at: event.ignore_expires_at ?? null,
    changed_by: event.changed_by,
    changed_at: event.changed_at
  };
}

function mapComplianceProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    version: profile.version,
    standard_target: profile.standard_target,
    axe_tags: profile.axe_tags,
    is_default: profile.is_default
  };
}

function mapHvtGroupSummaryItem(group) {
  return {
    group_id: group.group_id,
    group_level: group.group_level,
    highest_severity: group.highest_severity,
    finding_count: group.finding_count,
    affected_pages: group.affected_pages,
    representative_rule_id: group.rule_id,
    representative_url: group.sample_urls?.[0] ?? null,
    path_prefix: group.path_prefix ?? null,
    likely_fix_surface: group.likely_fix_surface ?? null,
    suggested_first_look: group.suggested_first_look ?? null
  };
}

function buildHvtSummary(groupsPayload, groupLevel, limit = 5) {
  return {
    group_level: groupLevel,
    total_groups: groupsPayload.total,
    items: groupsPayload.items.slice(0, limit).map(mapHvtGroupSummaryItem)
  };
}

function latestCompletedRun(runs) {
  return runs
    .filter((run) => run.state === "completed" && run.completed_at)
    .sort(
      (left, right) =>
        String(right.completed_at).localeCompare(String(left.completed_at)) ||
        String(right.started_at ?? "").localeCompare(String(left.started_at ?? "")) ||
        String(right.id).localeCompare(String(left.id))
    )[0];
}

function buildJsonContent(payload, uri = undefined) {
  return {
    ...(uri ? { uri } : {}),
    mimeType: "application/json",
    text: JSON.stringify(payload, null, 2)
  };
}

function toStructuredError(error) {
  if (error instanceof McpError) {
    return {
      code: error.errorCode,
      message: error.message
    };
  }
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  return {
    code: "internal_error",
    message: error.message
  };
}

function normalizeScanTargetIdentity(args) {
  const value = ensureObject(args);

  return {
    site_key: requireString(value.site_key, "site_key"),
    environment: requireString(value.environment, "environment"),
    branch: requireString(value.branch, "branch")
  };
}

function normalizeScanTargetListArgs(args) {
  const value = ensureObject(args);
  assertAllowedKeys(
    value,
    new Set(["site_key", "environment", "branch", "cursor", "limit"]),
    "arguments"
  );

  return {
    site_key: optionalString(value.site_key, "site_key"),
    environment: optionalString(value.environment, "environment"),
    branch: optionalString(value.branch, "branch"),
    cursor: optionalString(value.cursor, "cursor"),
    limit: optionalInteger(value.limit, "limit", {
      minimum: 1,
      maximum: maxPageLimit,
      fallback: defaultPageLimit
    })
  };
}

function normalizeScanTargetUpsertArgs(args) {
  const value = ensureObject(args);
  assertAllowedKeys(
    value,
    new Set(["site_key", "environment", "branch", "base_url"]),
    "arguments"
  );

  return {
    site_key: requireString(value.site_key, "site_key"),
    environment: requireString(value.environment, "environment"),
    branch: requireString(value.branch, "branch"),
    base_url: requireString(value.base_url, "base_url", { format: "uri" })
  };
}

function normalizeQueueArgs(args) {
  const value = ensureObject(args);
  assertAllowedKeys(
    value,
    new Set([
      "site_key",
      "environment",
      "branch",
      "severity",
      "status",
      "diff_status",
      "rule_id",
      "path_prefix",
      "cursor",
      "limit"
    ]),
    "arguments"
  );

  return {
    ...normalizeScanTargetIdentity(value),
    severity: optionalEnum(value.severity, "severity", findingSeverities),
    status: optionalEnum(value.status, "status", findingStatuses),
    diff_status: optionalEnum(value.diff_status, "diff_status", ["new", "persistent", "resolved"]),
    rule_id: optionalString(value.rule_id, "rule_id"),
    path_prefix: optionalString(value.path_prefix, "path_prefix"),
    cursor: optionalString(value.cursor, "cursor"),
    limit: optionalInteger(value.limit, "limit", {
      minimum: 1,
      maximum: maxPageLimit,
      fallback: defaultPageLimit
    })
  };
}

function normalizeComplianceProfileArgs(args) {
  const value = ensureObject(args);
  assertAllowedKeys(value, new Set([]), "arguments");
  return {};
}

function normalizeHvtGroupArgs(args) {
  const value = ensureObject(args);
  assertAllowedKeys(value, new Set(["scan_run_id", "group_level", "limit"]), "arguments");

  return {
    scan_run_id: requireString(value.scan_run_id, "scan_run_id", { format: "uuid" }),
    group_level: optionalEnum(value.group_level, "group_level", ["fix_surface_cluster", "component_cluster", "section_cluster"]) ?? "section_cluster",
    limit: optionalInteger(value.limit, "limit", {
      minimum: 1,
      maximum: 50,
      fallback: 10
    })
  };
}

function normalizeScanOptions(value) {
  const input = ensureObject(value, "scan_options must be an object");
  assertAllowedKeys(
    input,
    new Set(["max_pages", "max_depth", "concurrency", "retries"]),
    "scan_options"
  );

  return {
    max_pages: optionalInteger(input.max_pages, "scan_options.max_pages", { minimum: 1, maximum: 5000 }),
    max_depth: optionalInteger(input.max_depth, "scan_options.max_depth", { minimum: 0, maximum: 20 }),
    concurrency: optionalInteger(input.concurrency, "scan_options.concurrency", { minimum: 1, maximum: 20 }),
    retries: optionalInteger(input.retries, "scan_options.retries", { minimum: 0, maximum: 5 })
  };
}

function compactScanOptions(scanOptions) {
  return {
    max_pages: scanOptions.max_pages,
    max_depth: scanOptions.max_depth,
    concurrency: scanOptions.concurrency,
    retries: scanOptions.retries
  };
}

function compactRunSummary(run) {
  return {
    ...run,
    scan_options: compactScanOptions(run.scan_options)
  };
}

function buildToolListPage(cursor) {
  return paginateByCursor(
    toolContracts.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: tool.read_only,
        destructiveHint: !tool.read_only,
        idempotentHint: tool.read_only,
        openWorldHint: false
      }
    })),
    cursor,
    {
      limit: 50,
      scope: "tools/list",
      identity: (tool) => tool.name
    }
  );
}

export class SiteUaMcpAdapter {
  constructor({ service, now = () => new Date(), dashboardUrl = "http://localhost:8080/dashboard" }) {
    this.service = service;
    this.now = now;
    this.dashboardUrl = dashboardUrl;
  }

  generatedAt() {
    return this.now().toISOString();
  }

  async listTools(cursor) {
    const { items, nextCursor } = buildToolListPage(cursor);
    return {
      tools: items,
      ...(nextCursor ? { nextCursor } : {})
    };
  }

  async listResourceTemplates(cursor) {
    const { items, nextCursor } = paginateByCursor(resourceTemplates, cursor, {
      limit: 50,
      scope: "resources/templates/list",
      identity: (resourceTemplate) => resourceTemplate.uriTemplate
    });
    return {
      resourceTemplates: items,
      ...(nextCursor ? { nextCursor } : {})
    };
  }

  async listResources(cursor) {
    const runs = await this.service.listAllScanRuns({ sort_by: "started_at", sort_order: "desc" });
    const resources = [];
    const seenTargets = new Set();
    const seenFindings = new Set();

    resources.push({
      uri: buildComplianceProfilesUri(),
      name: "compliance-profiles",
      title: "Compliance Profiles",
      description: "Compliance profile catalog snapshot.",
      mimeType: "application/json"
    });

    for (const run of runs.slice(0, 10)) {
      const targetKey = JSON.stringify(run.scan_target);
      if (!seenTargets.has(targetKey)) {
        seenTargets.add(targetKey);
        resources.push({
          uri: buildTargetSummaryUri(run.scan_target),
          name: `target-summary-${run.scan_target.site_key}-${run.scan_target.environment}-${run.scan_target.branch}`,
          title: "Target Summary",
          description: `Summary snapshot for ${run.scan_target.site_key}/${run.scan_target.environment}/${run.scan_target.branch}`,
          mimeType: "application/json"
        });
      }

      resources.push({
        uri: buildRunSummaryUri(run.id),
        name: `scan-run-summary-${run.id}`,
        title: "Scan Run Summary",
        description: `Run summary for ${run.id}`,
        mimeType: "application/json"
      });

      resources.push({
        uri: buildRunHvtGroupsUri(run.id, {
          group_level: "section_cluster",
          limit: 10
        }),
        name: `scan-run-hvt-groups-${run.id}`,
        title: "Scan Run HVT Groups",
        description: `HVT grouping summary for ${run.id}`,
        mimeType: "application/json"
      });

      const findings = await this.service.listAllRunFindings(run.id, {
        sort_by: "severity",
        sort_order: "asc"
      });
      for (const finding of findings.slice(0, 3)) {
        if (seenFindings.has(finding.id)) {
          continue;
        }
        seenFindings.add(finding.id);
        resources.push({
          uri: buildFindingUri(finding.id),
          name: `finding-${finding.id}`,
          title: "Finding Detail",
          description: `${finding.rule_id} on ${finding.latest_instance.normalized_url}`,
          mimeType: "application/json"
        });
      }
    }

    const { items, nextCursor } = paginateByCursor(resources, cursor, {
      limit: 25,
      scope: "resources/list",
      identity: (resource) => resource.uri
    });
    return {
      resources: items,
      ...(nextCursor ? { nextCursor } : {})
    };
  }

  async callTool(name, args) {
    const contract = toolContractByName.get(name);
    if (!contract) {
      throw new McpError({
        jsonRpcCode: -32602,
        errorCode: "bad_request",
        message: `unknown tool: ${name}`
      });
    }

    switch (name) {
      case "list_compliance_profiles":
        return this.listComplianceProfiles(args);
      case "list_scan_targets":
        return this.listScanTargets(args);
      case "upsert_scan_target":
        return this.upsertScanTarget(args);
      case "get_target_overview":
        return this.getTargetOverview(args);
      case "list_triage_queue":
        return this.listTriageQueue(args);
      case "get_scan_run_summary":
        return this.getScanRunSummary(args);
      case "get_scan_run_hvt_groups":
        return this.getScanRunHvtGroups(args);
      case "get_finding_detail":
        return this.getFindingDetail(args);
      case "update_finding_status":
        return this.updateFindingStatus(args);
      case "trigger_page_rescan":
        return this.triggerPageRescan(args);
      case "trigger_path_rescan":
        return this.triggerPathRescan(args);
      case "trigger_full_scan":
        return this.triggerFullScan(args);
      default:
        throw new McpError({
          jsonRpcCode: -32601,
          errorCode: "not_found",
          message: `tool handler missing for ${name}`
        });
    }
  }

  async getTargetOverview(args) {
    const targetIdentity = normalizeScanTargetIdentity(args);
    const [{ scan_target: scanTarget }, runs, findings] = await Promise.all([
      this.service.getScanTarget(targetIdentity),
      this.service.listAllScanRuns(targetIdentity),
      this.service.listAllFindings(targetIdentity)
    ]);
    const triageFindings = findings.filter((finding) => triageStatuses.has(finding.status));
    const latestRun = latestCompletedRun(runs);

    return {
      generated_at: this.generatedAt(),
      dashboard_url: this.dashboardUrl,
      scan_target: scanTarget,
      ...(latestRun ? { latest_completed_run: compactRunSummary(latestRun) } : {}),
      open_counts: buildCounts(findings),
      top_rules: buildTopRules(triageFindings),
      top_pages: buildTopPages(triageFindings),
      recent_runs: runs.slice(0, 5).map(compactRunSummary)
    };
  }

  async listComplianceProfiles(args) {
    normalizeComplianceProfileArgs(args);
    const profiles = await this.service.listComplianceProfiles();

    return {
      generated_at: this.generatedAt(),
      default_profile_id: profiles.default_profile_id,
      items: profiles.items.map(mapComplianceProfile)
    };
  }

  async listScanTargets(args) {
    const filters = normalizeScanTargetListArgs(args);
    const targets = await this.service.listAllScanTargets(filters);
    const scope = JSON.stringify({
      kind: "scan_targets",
      site_key: filters.site_key ?? null,
      environment: filters.environment ?? null,
      branch: filters.branch ?? null
    });
    const { items, nextCursor } = paginateByCursor(targets, filters.cursor, {
      limit: filters.limit,
      scope,
      identity: (target) =>
        JSON.stringify([
          target.site_key,
          target.environment,
          target.branch,
          target.base_url
        ])
    });

    return {
      generated_at: this.generatedAt(),
      applied_filters: {
        site_key: filters.site_key,
        environment: filters.environment,
        branch: filters.branch,
        limit: filters.limit
      },
      items,
      ...(nextCursor ? { next_cursor: nextCursor } : {})
    };
  }

  async upsertScanTarget(args) {
    const scanTarget = normalizeScanTargetUpsertArgs(args);
    const payload = await this.service.upsertScanTarget({
      scan_target: scanTarget
    });

    return {
      generated_at: this.generatedAt(),
      scan_target: payload.scan_target
    };
  }

  async listTriageQueue(args) {
    const filters = normalizeQueueArgs(args);
    const { scan_target: scanTarget } = await this.service.getScanTarget(filters);
    const runs = await this.service.listAllScanRuns(filters);
    const activeRun = latestCompletedRun(runs) ?? runs[0];
    const findings = activeRun
      ? await this.service.listAllRunFindings(activeRun.id, {
        severity: filters.severity,
        status: filters.status,
        diff_status: filters.diff_status,
        rule_id: filters.rule_id,
        path_prefix: filters.path_prefix,
        sort_by: "severity",
        sort_order: "asc"
      })
      : [];
    const scope = JSON.stringify({
      kind: "triage_queue",
      site_key: filters.site_key,
      environment: filters.environment,
      branch: filters.branch,
      severity: filters.severity ?? null,
      status: filters.status ?? null,
      diff_status: filters.diff_status ?? null,
      rule_id: filters.rule_id ?? null,
      path_prefix: filters.path_prefix ?? null,
      scan_run_id: activeRun?.id ?? null
    });
    const { items, nextCursor } = paginateByCursor(
      findings.map(mapTriageItem),
      filters.cursor,
      {
        limit: filters.limit,
        scope,
        identity: (item) => item.finding_id
      }
    );

    return {
      generated_at: this.generatedAt(),
      scan_target: scanTarget,
      applied_filters: {
        site_key: filters.site_key,
        environment: filters.environment,
        branch: filters.branch,
        severity: filters.severity,
        status: filters.status,
        diff_status: filters.diff_status,
        rule_id: filters.rule_id,
        path_prefix: filters.path_prefix,
        limit: filters.limit,
        scan_run_id: activeRun?.id ?? null
      },
      items,
      ...(nextCursor ? { next_cursor: nextCursor } : {})
    };
  }

  async getScanRunSummary(args) {
    const value = ensureObject(args);
    assertAllowedKeys(value, new Set(["scan_run_id"]), "arguments");
    const scanRunId = requireString(value.scan_run_id, "scan_run_id", { format: "uuid" });
    const groupLevel = "section_cluster";
    const [{ run }, findings, hvtGroups] = await Promise.all([
      this.service.getScanRun(scanRunId),
      this.service.listAllRunFindings(scanRunId, {
        sort_by: "severity",
        sort_order: "asc"
      }),
      this.service.listRunHvtGroups(scanRunId, {
        group_level: groupLevel,
        page: 1,
        page_size: 5
      })
    ]);

    return {
      generated_at: this.generatedAt(),
      dashboard_url: this.dashboardUrl,
      run: compactRunSummary(run),
      top_rules: buildTopRules(findings),
      top_pages: buildTopPages(findings),
      hvt_summary: buildHvtSummary(hvtGroups, groupLevel, 5),
      sample_findings: findings.slice(0, 10).map(mapTriageItem)
    };
  }

  async getScanRunHvtGroups(args) {
    const filters = normalizeHvtGroupArgs(args);
    const payload = await this.service.listRunHvtGroups(filters.scan_run_id, {
      group_level: filters.group_level,
      page: 1,
      page_size: filters.limit
    });

    return {
      generated_at: this.generatedAt(),
      scan_run_id: payload.scan_run_id,
      compliance_profile: mapComplianceProfile(payload.compliance_profile),
      group_level: payload.group_level,
      total_groups: payload.total,
      items: payload.items.map(mapHvtGroupSummaryItem)
    };
  }

  async getFindingDetail(args) {
    const value = ensureObject(args);
    assertAllowedKeys(value, new Set(["finding_id"]), "arguments");
    const findingId = requireString(value.finding_id, "finding_id", { format: "uuid" });
    const detail = await this.service.getFinding(findingId);

    return {
      generated_at: this.generatedAt(),
      finding: mapFindingDetail(detail.finding),
      status_history: detail.status_history.slice(0, 20).map(mapStatusEvent)
    };
  }

  async updateFindingStatus(args) {
    const value = ensureObject(args);
    assertAllowedKeys(value, new Set(["finding_id", "status", "note", "ignore_expires_at"]), "arguments");
    const findingId = requireString(value.finding_id, "finding_id", { format: "uuid" });
    const status = optionalEnum(value.status, "status", findingStatuses);
    if (!status) {
      throw new McpError({
        jsonRpcCode: -32602,
        errorCode: "bad_request",
        message: "status is required"
      });
    }

    const note = optionalString(value.note, "note", { maxLength: 2000 });
    const ignoreExpiresAt = optionalString(value.ignore_expires_at, "ignore_expires_at", {
      format: "date-time"
    });
    const updated = await this.service.updateFindingStatus(
      findingId,
      {
        status,
        ...(note !== undefined ? { note } : {}),
        ...(ignoreExpiresAt !== undefined ? { ignore_expires_at: ignoreExpiresAt } : {})
      },
      { changedBy: "mcp" }
    );

    return {
      generated_at: this.generatedAt(),
      finding: mapFindingDetail(updated.finding),
      latest_status_event: mapStatusEvent(updated.status_history[0])
    };
  }

  async triggerPageRescan(args) {
    const value = ensureObject(args);
    assertAllowedKeys(
      value,
      new Set(["site_key", "environment", "branch", "page_url", "reason", "compliance_profile_id"]),
      "arguments"
    );
    const targetIdentity = normalizeScanTargetIdentity(value);
    const pageUrl = requireString(value.page_url, "page_url", { format: "uri" });
    const reason = requireString(value.reason, "reason", { maxLength: 512 });
    const complianceProfileId = optionalString(value.compliance_profile_id, "compliance_profile_id");
    const { scan_target: scanTarget } = await this.service.getScanTarget(targetIdentity);
    const created = await this.service.createScanRun(
      {
        scan_target: scanTarget,
        page_url: pageUrl,
        reason,
        ...(complianceProfileId !== undefined ? { compliance_profile_id: complianceProfileId } : {})
      },
      "page"
    );

    return {
      generated_at: this.generatedAt(),
      dashboard_url: this.dashboardUrl,
      run: {
        ...compactRunSummary(created.run)
      }
    };
  }

  async triggerPathRescan(args) {
    const value = ensureObject(args);
    assertAllowedKeys(
      value,
      new Set(["site_key", "environment", "branch", "path_prefix", "reason", "compliance_profile_id"]),
      "arguments"
    );
    const targetIdentity = normalizeScanTargetIdentity(value);
    const pathPrefix = requireString(value.path_prefix, "path_prefix");
    const reason = requireString(value.reason, "reason", { maxLength: 512 });
    const complianceProfileId = optionalString(value.compliance_profile_id, "compliance_profile_id");
    const { scan_target: scanTarget } = await this.service.getScanTarget(targetIdentity);
    const created = await this.service.createScanRun(
      {
        scan_target: scanTarget,
        path_prefix: pathPrefix,
        reason,
        ...(complianceProfileId !== undefined ? { compliance_profile_id: complianceProfileId } : {})
      },
      "path"
    );

    return {
      generated_at: this.generatedAt(),
      dashboard_url: this.dashboardUrl,
      run: {
        ...compactRunSummary(created.run)
      }
    };
  }

  async triggerFullScan(args) {
    const value = ensureObject(args);
    assertAllowedKeys(
      value,
      new Set([
        "site_key",
        "environment",
        "branch",
        "base_url",
        "reason",
        "scan_options",
        "compliance_profile_id"
      ]),
      "arguments"
    );
    const targetIdentity = normalizeScanTargetIdentity(value);
    const baseUrl = optionalString(value.base_url, "base_url", { format: "uri" });
    const reason = requireString(value.reason, "reason", { maxLength: 512 });
    const complianceProfileId = optionalString(value.compliance_profile_id, "compliance_profile_id");
    const scanOptions = value.scan_options === undefined
      ? undefined
      : Object.fromEntries(
        Object.entries(normalizeScanOptions(value.scan_options)).filter(([, candidate]) => candidate !== undefined)
      );
    const { scan_target: scanTarget } = baseUrl === undefined
      ? await this.service.getScanTarget(targetIdentity)
      : await this.service.upsertScanTarget({
        scan_target: {
          ...targetIdentity,
          base_url: baseUrl
        }
      });
    const created = await this.service.createScanRun(
      {
        scan_target: scanTarget,
        reason,
        ...(complianceProfileId !== undefined ? { compliance_profile_id: complianceProfileId } : {}),
        ...(scanOptions ? { scan_options: scanOptions } : {})
      },
      "full"
    );

    return {
      generated_at: this.generatedAt(),
      dashboard_url: this.dashboardUrl,
      run: {
        ...compactRunSummary(created.run)
      }
    };
  }

  async readResource(uri) {
    const parsed = parseResourceUri(uri);
    if (parsed.error) {
      throw new McpError({
        jsonRpcCode: -32602,
        errorCode: parsed.error.code,
        message: parsed.error.message
      });
    }

    let payload;
    switch (parsed.kind) {
      case "compliance_profiles":
        payload = await this.listComplianceProfiles(parsed.params);
        break;
      case "target_summary":
        payload = await this.getTargetOverview(parsed.params);
        break;
      case "scan_run_summary":
        payload = await this.getScanRunSummary(parsed.params);
        break;
      case "scan_run_hvt_groups":
        payload = await this.getScanRunHvtGroups(parsed.params);
        break;
      case "finding_detail":
        payload = await this.getFindingDetail(parsed.params);
        break;
      case "triage_queue":
        payload = await this.listTriageQueue(parsed.params);
        break;
      default:
        throw new McpError({
          jsonRpcCode: -32602,
          errorCode: "not_found",
          message: "resource uri is not supported"
        });
    }

    return {
      contents: [buildJsonContent(payload, uri)]
    };
  }

  toolResult(name, payload) {
    return {
      structuredContent: payload,
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }
      ],
      _meta: {
        toolName: name
      }
    };
  }

  toolErrorResult(name, error) {
    const details = toStructuredError(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: details }, null, 2)
        }
      ],
      _meta: {
        toolName: name
      }
    };
  }
}

export function normalizeJsonRpcError(error) {
  if (error instanceof McpError) {
    return {
      code: error.jsonRpcCode,
      message: error.message,
      data: {
        code: error.errorCode,
        ...(error.data ?? {})
      }
    };
  }

  if (error instanceof ApiError) {
    return {
      code: -32000,
      message: error.message,
      data: {
        code: error.code
      }
    };
  }

  return {
    code: -32603,
    message: error.message ?? "Internal error",
    data: {
      code: "internal_error"
    }
  };
}

export function buildResourceLinksPayload({ scanTarget, run, findingId, filters = {} }) {
  return {
    target_summary_uri: buildTargetSummaryUri(scanTarget),
    ...(run ? { run_summary_uri: buildRunSummaryUri(run.id) } : {}),
    ...(findingId ? { finding_uri: buildFindingUri(findingId) } : {}),
    queue_uri: buildQueueUri({
      site_key: scanTarget.site_key,
      environment: scanTarget.environment,
      branch: scanTarget.branch,
      ...filters
    })
  };
}
