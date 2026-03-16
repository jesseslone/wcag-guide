import { createHash, randomUUID } from "node:crypto";

import {
  defaultScannerContext,
  findingDiffStatuses,
  findingSeverities,
  findingSeverityRank,
  findingStatuses,
  findingStatusRank
} from "./constants.js";
import {
  complianceProfiles,
  getComplianceProfile,
  getDefaultComplianceProfile
} from "./compliance-profiles.js";
import { ApiError } from "./errors.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parsePositiveInteger(value, fallback, maximum = null, fieldName = "value") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "bad_request", `${fieldName} must be a positive integer`);
  }
  if (maximum !== null && parsed > maximum) {
    throw new ApiError(400, "bad_request", `${fieldName} must be less than or equal to ${maximum}`);
  }
  return parsed;
}

function parseDateTime(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ApiError(400, "bad_request", `${fieldName} must be a valid date-time`);
  }
  return parsed.toISOString();
}

function optionalEnum(value, allowed, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw new ApiError(400, "bad_request", `${fieldName} is invalid`);
  }
  return value;
}

function requiredEnum(value, allowed, fieldName) {
  const parsed = optionalEnum(value, allowed, fieldName);
  if (!parsed) {
    throw new ApiError(400, "bad_request", `${fieldName} is required`);
  }
  return parsed;
}

function compareStrings(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function pathFromNormalizedUrl(normalizedUrl) {
  try {
    return new URL(normalizedUrl).pathname;
  } catch {
    return normalizedUrl;
  }
}

function firstPathPrefix(normalizedUrl) {
  const path = pathFromNormalizedUrl(normalizedUrl);
  if (path === "/") {
    return "/";
  }
  const [segment] = path.split("/").filter(Boolean);
  return segment ? `/${segment}` : "/";
}

const hvtGroupLevels = ["fix_surface_cluster", "component_cluster", "section_cluster"];

function selectorElementType(selector) {
  if (!selector) {
    return "element";
  }

  const matches = selector.toLowerCase().match(/(^|[\s>+~])([a-z][a-z0-9-]*)/g) ?? [];
  const last = matches.at(-1)?.trim().split(/[\s>+~]/).at(-1);
  return last || "element";
}

function selectorSemanticCue(selector) {
  const value = String(selector ?? "").toLowerCase();
  const patterns = [
    ["navigation", /\b(nav|menu|breadcrumb|pagination)\b/],
    ["header", /\b(header|hero|masthead)\b/],
    ["footer", /\bfooter\b/],
    ["button", /\b(btn|button|cta)\b/],
    ["card", /\b(card|tile|panel)\b/],
    ["form", /\b(form|label|input|select|textarea|fieldset)\b/],
    ["table", /\b(table|grid|tbody|thead|td|th)\b/],
    ["badge", /\b(badge|tag|pill)\b/],
    ["link", /\ba\b/]
  ];

  for (const [cue, pattern] of patterns) {
    if (pattern.test(value)) {
      return cue;
    }
  }

  return selectorElementType(selector);
}

function normalizeColorToken(value) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function parseColorContrastFailureSummary(summary) {
  const value = String(summary ?? "");
  if (!value) {
    return {};
  }

  const foregroundMatch = value.match(/foreground color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
  const backgroundMatch = value.match(/background color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
  const actualRatioMatch = value.match(/contrast(?: ratio)?(?: of)?\s*([0-9]+(?:\.[0-9]+)?)(?::1)?/i);
  const requiredRatioMatch = value.match(/expected contrast ratio of\s*([0-9]+(?:\.[0-9]+)?):1/i);

  return {
    foreground: normalizeColorToken(foregroundMatch?.[1] ?? null),
    background: normalizeColorToken(backgroundMatch?.[1] ?? null),
    actualRatio: actualRatioMatch?.[1] ?? null,
    requiredRatio: requiredRatioMatch?.[1] ?? null
  };
}

function inferFixSurface(ruleId, semanticCue, affectedPages) {
  if (ruleId === "color-contrast") {
    if (["navigation", "header", "footer", "button", "card", "badge", "table", "form"].includes(semanticCue)) {
      return "shared_component";
    }
    return affectedPages > 1 ? "shared_css_token" : "content_specific";
  }

  if (["page-has-heading-one", "document-title"].includes(ruleId)) {
    return "shared_template";
  }

  if (["link-name", "button-name", "label", "image-alt"].includes(ruleId)) {
    return affectedPages > 1 ? "shared_component" : "content_specific";
  }

  return affectedPages > 1 ? "shared_component" : "unknown";
}

function fixSurfaceFirstLook({ ruleId, semanticCue, pathPrefix, contrast }) {
  const scope = pathPrefix && pathPrefix !== "/"
    ? `in the ${pathPrefix} section`
    : "across the shared site styles";

  if (ruleId === "color-contrast") {
    const colorLabel = contrast.foreground && contrast.background
      ? ` using ${contrast.foreground} on ${contrast.background}`
      : "";

    switch (semanticCue) {
      case "navigation":
        return `Check shared navigation link styles${colorLabel} ${scope}.`;
      case "header":
      case "footer":
      case "card":
      case "button":
      case "badge":
      case "table":
      case "form":
        return `Check the shared ${semanticCue} styles${colorLabel} ${scope}.`;
      default:
        return `Check the shared text/link color tokens${colorLabel} ${scope}.`;
    }
  }

  if (["page-has-heading-one", "document-title"].includes(ruleId)) {
    return "Check the page template or route-level metadata before editing individual pages.";
  }

  if (["link-name", "button-name", "label", "image-alt"].includes(ruleId)) {
    return "Check the reusable component or CMS field that renders this control before fixing pages one by one.";
  }

  return "Check for a shared template, component, or style token before making page-level fixes.";
}

function buildFixSurfaceCluster(record) {
  const pathPrefix = firstPathPrefix(record.latestInstance.normalizedUrl);
  const semanticCue = selectorSemanticCue(record.latestInstance.selector);

  if (record.finding.ruleId === "color-contrast") {
    const contrast = parseColorContrastFailureSummary(record.latestInstance.failureSummary);
    const colorSignature = contrast.foreground && contrast.background
      ? `${contrast.foreground} on ${contrast.background}`
      : contrast.requiredRatio
        ? `below ${contrast.requiredRatio}:1`
        : "contrast issue";

    return {
      pathPrefix,
      normalizedSelector: `${semanticCue} | ${colorSignature}`,
      semanticCue,
      contrast
    };
  }

  return {
    pathPrefix,
    normalizedSelector: `${semanticCue} | ${record.finding.ruleId}`,
    semanticCue,
    contrast: {}
  };
}

function normalizeScanTarget(scanTarget) {
  if (!isObject(scanTarget)) {
    throw new ApiError(400, "bad_request", "scan_target is required");
  }

  for (const fieldName of ["site_key", "environment", "branch", "base_url"]) {
    if (typeof scanTarget[fieldName] !== "string" || scanTarget[fieldName].trim() === "") {
      throw new ApiError(400, "bad_request", `scan_target.${fieldName} is required`);
    }
  }

  try {
    new URL(scanTarget.base_url);
  } catch {
    throw new ApiError(400, "bad_request", "scan_target.base_url must be a valid URI");
  }

  return {
    site_key: scanTarget.site_key,
    environment: scanTarget.environment,
    branch: scanTarget.branch,
    base_url: scanTarget.base_url
  };
}

function normalizeScanTargetIdentity(scanTarget) {
  if (!isObject(scanTarget)) {
    throw new ApiError(400, "bad_request", "scan_target is required");
  }

  for (const fieldName of ["site_key", "environment", "branch"]) {
    if (typeof scanTarget[fieldName] !== "string" || scanTarget[fieldName].trim() === "") {
      throw new ApiError(400, "bad_request", `scan_target.${fieldName} is required`);
    }
  }

  return {
    site_key: scanTarget.site_key,
    environment: scanTarget.environment,
    branch: scanTarget.branch
  };
}

function normalizeScanOptions(input, defaults) {
  if (input !== undefined && !isObject(input)) {
    throw new ApiError(400, "bad_request", "scan_options must be an object");
  }

  const normalized = {
    ...defaults,
    ...(input ?? {})
  };

  for (const key of ["max_pages", "max_depth", "concurrency", "retries"]) {
    if (!Number.isInteger(normalized[key])) {
      throw new ApiError(400, "bad_request", `${key} must be an integer`);
    }
  }

  if (normalized.max_pages < 1 || normalized.max_pages > 5000) {
    throw new ApiError(400, "bad_request", "max_pages must be between 1 and 5000");
  }
  if (normalized.max_depth < 0 || normalized.max_depth > 20) {
    throw new ApiError(400, "bad_request", "max_depth must be between 0 and 20");
  }
  if (normalized.concurrency < 1 || normalized.concurrency > 20) {
    throw new ApiError(400, "bad_request", "concurrency must be between 1 and 20");
  }
  if (normalized.retries < 0 || normalized.retries > 5) {
    throw new ApiError(400, "bad_request", "retries must be between 0 and 5");
  }

  for (const key of ["path_allowlist", "path_denylist", "query_param_allowlist"]) {
    if (!Array.isArray(normalized[key])) {
      throw new ApiError(400, "bad_request", `${key} must be an array`);
    }
  }

  return normalized;
}

function normalizeReason(reason) {
  if (reason === undefined) {
    return null;
  }
  if (typeof reason !== "string" || reason.length > 512) {
    throw new ApiError(400, "bad_request", "reason must be a string up to 512 characters");
  }
  return reason;
}

function paginate(items, page, pageSize) {
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    total: items.length
  };
}

function mapScanTarget(scanTarget) {
  return {
    site_key: scanTarget.siteKey,
    environment: scanTarget.environment,
    branch: scanTarget.branch,
    base_url: scanTarget.baseUrl
  };
}

function mapComplianceProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    version: profile.version,
    standard_target: profile.standardTarget,
    axe_tags: profile.axeTags,
    is_default: profile.isDefault
  };
}

function mapRuleMetadata(ruleMetadata) {
  if (!ruleMetadata) {
    return undefined;
  }

  return {
    rule_id: ruleMetadata.ruleId,
    rule_help: ruleMetadata.ruleHelp,
    rule_description: ruleMetadata.ruleDescription,
    rule_help_url: ruleMetadata.ruleHelpUrl,
    rule_tags: ruleMetadata.ruleTags ?? []
  };
}

function mapScanRun(runRecord) {
  return {
    id: runRecord.run.id,
    scan_target: mapScanTarget(runRecord.scanTarget),
    compliance_profile: mapComplianceProfile(runRecord.run.complianceProfile ?? getDefaultComplianceProfile()),
    mode: runRecord.run.mode,
    state: runRecord.run.state,
    reason: runRecord.run.reason,
    scan_options: runRecord.run.scanOptions,
    started_at: runRecord.run.startedAt,
    completed_at: runRecord.run.completedAt,
    summary: {
      pages_scanned: runRecord.run.pagesScanned,
      findings_total: runRecord.run.findingsTotal,
      new_count: runRecord.run.newCount,
      resolved_count: runRecord.run.resolvedCount,
      persistent_count: runRecord.run.persistentCount
    },
    scanner_context: {
      ...defaultScannerContext,
      ...runRecord.run.scannerContext
    }
  };
}

function mapFinding(record, diffStatus) {
  const finding = {
    id: record.finding.id,
    fingerprint: record.finding.fingerprint,
    rule_id: record.finding.ruleId,
    severity: record.finding.severity,
    status: record.finding.status,
    ignore_expires_at: record.finding.ignoreExpiresAt,
    scan_target: record.scanTarget ? mapScanTarget(record.scanTarget) : undefined,
    latest_instance: {
      id: record.latestInstance.id,
      scan_run_id: record.latestInstance.scanRunId,
      page_url: record.latestInstance.pageUrl,
      normalized_url: record.latestInstance.normalizedUrl,
      selector: record.latestInstance.selector,
      snippet: record.latestInstance.snippet ?? "",
      failure_summary: record.latestInstance.failureSummary ?? null,
      detected_at: record.latestInstance.detectedAt
    }
  };

  if (record.finding.ruleMetadata) {
    finding.rule_metadata = mapRuleMetadata(record.finding.ruleMetadata);
  }

  if (diffStatus) {
    finding.diff_status = diffStatus;
  }

  return finding;
}

function mapStatusEvent(event) {
  return {
    id: event.id,
    previous_status: event.previousStatus,
    new_status: event.newStatus,
    note: event.note,
    ignore_expires_at: event.ignoreExpiresAt,
    changed_by: event.changedBy,
    changed_at: event.changedAt
  };
}

function createHvtGroupId({ groupLevel, ruleId, normalizedSelector, pathPrefix }) {
  const version = groupLevel === "fix_surface_cluster" ? "hvt-v2" : "hvt-v1";
  return createHash("sha256")
    .update([version, groupLevel, ruleId, normalizedSelector, pathPrefix ?? ""].join("|"))
    .digest("hex");
}

function mapHvtGroup(group) {
  return {
    group_id: group.groupId,
    group_level: group.groupLevel,
    rule_id: group.ruleId,
    normalized_selector: group.normalizedSelector,
    path_prefix: group.pathPrefix ?? null,
    highest_severity: group.highestSeverity,
    finding_count: group.findingCount,
    affected_pages: group.affectedPages,
    affected_runs: group.affectedRuns,
    sample_urls: group.sampleUrls,
    sample_selectors: group.sampleSelectors,
    representative_snippet: group.representativeSnippet ?? null,
    last_seen_at: group.lastSeenAt,
    likely_fix_surface: group.likelyFixSurface ?? null,
    suggested_first_look: group.suggestedFirstLook ?? null
  };
}

function buildHvtGroups({ runFindings, findingInstances, groupLevel }) {
  const groups = new Map();

  for (const record of runFindings) {
    const instances = findingInstances.filter((instance) => instance.findingId === record.finding.id);
    const fixSurfaceCluster = groupLevel === "fix_surface_cluster"
      ? buildFixSurfaceCluster(record)
      : null;
    const pathPrefix = groupLevel === "section_cluster"
      ? firstPathPrefix(record.latestInstance.normalizedUrl)
      : groupLevel === "fix_surface_cluster"
        ? fixSurfaceCluster.pathPrefix
        : null;
    const normalizedSelector = fixSurfaceCluster?.normalizedSelector ?? record.latestInstance.selector;
    const semanticCue = fixSurfaceCluster?.semanticCue ?? selectorSemanticCue(record.latestInstance.selector);
    const contrast = fixSurfaceCluster?.contrast ?? {};
    const key = [groupLevel, record.finding.ruleId, normalizedSelector, pathPrefix ?? ""].join("|");
    const existing = groups.get(key) ?? {
      groupId: createHvtGroupId({
        groupLevel,
        ruleId: record.finding.ruleId,
        normalizedSelector,
        pathPrefix
      }),
      groupLevel,
      ruleId: record.finding.ruleId,
      normalizedSelector,
      pathPrefix,
      highestSeverity: record.finding.severity,
      findingIds: new Set(),
      pageUrls: new Set(),
      runIds: new Set(),
      sampleUrls: [],
      sampleSelectors: [],
      representativeSnippet: null,
      lastSeenAt: record.latestInstance.detectedAt,
      semanticCue,
      contrast,
      likelyFixSurface: null,
      suggestedFirstLook: null
    };

    existing.findingIds.add(record.finding.id);

    for (const instance of instances) {
      const instancePathPrefix = firstPathPrefix(instance.normalizedUrl);
      if ((groupLevel === "section_cluster" || groupLevel === "fix_surface_cluster") && instancePathPrefix !== pathPrefix) {
        continue;
      }

      existing.pageUrls.add(instance.normalizedUrl);
      existing.runIds.add(instance.scanRunId);

      if (existing.sampleUrls.length < 5 && !existing.sampleUrls.includes(instance.pageUrl)) {
        existing.sampleUrls.push(instance.pageUrl);
      }
      if (existing.sampleSelectors.length < 5 && !existing.sampleSelectors.includes(instance.selector)) {
        existing.sampleSelectors.push(instance.selector);
      }
      if (!existing.representativeSnippet && instance.snippet) {
        existing.representativeSnippet = instance.snippet;
      }
      if (findingSeverityRank[record.finding.severity] < findingSeverityRank[existing.highestSeverity]) {
        existing.highestSeverity = record.finding.severity;
      }
      if (instance.detectedAt > existing.lastSeenAt) {
        existing.lastSeenAt = instance.detectedAt;
      }
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      findingCount: group.findingIds.size,
      affectedPages: group.pageUrls.size,
      affectedRuns: group.runIds.size,
      likelyFixSurface: inferFixSurface(group.ruleId, group.semanticCue, group.pageUrls.size),
      suggestedFirstLook: fixSurfaceFirstLook({
        ruleId: group.ruleId,
        semanticCue: group.semanticCue,
        pathPrefix: group.pathPrefix,
        contrast: group.contrast
      })
    }))
    .sort((left, right) => {
      const severityCompare = findingSeverityRank[left.highestSeverity] - findingSeverityRank[right.highestSeverity];
      if (severityCompare !== 0) {
        return severityCompare;
      }
      if (right.affectedPages !== left.affectedPages) {
        return right.affectedPages - left.affectedPages;
      }
      if (right.findingCount !== left.findingCount) {
        return right.findingCount - left.findingCount;
      }
      return compareStrings(left.groupId, right.groupId);
    });
}

function compareRuns(left, right, sortBy, sortOrder) {
  const direction = sortOrder === "asc" ? 1 : -1;
  let compare;

  switch (sortBy) {
    case "completed_at":
      compare = compareStrings(left.run.completedAt, right.run.completedAt);
      break;
    case "started_at":
    default:
      compare = compareStrings(left.run.startedAt, right.run.startedAt);
      break;
  }

  if (compare === 0) {
    compare = compareStrings(left.run.id, right.run.id);
  }

  return compare * direction;
}

function compareScanTargets(left, right) {
  return (
    compareStrings(left.site_key, right.site_key) ||
    compareStrings(left.environment, right.environment) ||
    compareStrings(left.branch, right.branch) ||
    compareStrings(left.base_url, right.base_url)
  );
}

function compareFindings(left, right, sortBy, sortOrder) {
  const direction = sortOrder === "asc" ? 1 : -1;
  let compare;

  switch (sortBy) {
    case "rule_id":
      compare = compareStrings(left.rule_id, right.rule_id);
      break;
    case "status":
      compare = findingStatusRank[left.status] - findingStatusRank[right.status];
      break;
    case "started_at":
    case "completed_at":
      compare = compareStrings(left.latest_instance.detected_at, right.latest_instance.detected_at);
      break;
    case "severity":
    default:
      compare = findingSeverityRank[left.severity] - findingSeverityRank[right.severity];
      break;
  }

  if (compare === 0) {
    compare = compareStrings(left.id, right.id);
  }

  return compare * direction;
}

function ensureFindingMatchesFilters(finding, query) {
  const status = optionalEnum(query.status, findingStatuses, "status");
  const severity = optionalEnum(query.severity, findingSeverities, "severity");

  if (status && finding.status !== status) {
    return false;
  }
  if (severity && finding.severity !== severity) {
    return false;
  }
  if (query.rule_id && finding.rule_id !== query.rule_id) {
    return false;
  }
  if (query.path_prefix) {
    const path = pathFromNormalizedUrl(finding.latest_instance.normalized_url);
    if (!path.startsWith(query.path_prefix)) {
      return false;
    }
  }
  return true;
}

export class BackendService {
  constructor({ repository, scanOptionsDefaults, scannerContext, now = () => new Date() }) {
    this.repository = repository;
    this.scanOptionsDefaults = scanOptionsDefaults;
    this.scannerContext = {
      ...defaultScannerContext,
      ...scannerContext
    };
    this.now = now;
  }

  async listComplianceProfiles() {
    return {
      default_profile_id: getDefaultComplianceProfile().id,
      items: complianceProfiles.map(mapComplianceProfile)
    };
  }

  async listScanTargets(query) {
    const page = parsePositiveInteger(query.page, 1, null, "page");
    const pageSize = parsePositiveInteger(query.page_size, 50, 200, "page_size");
    const targets = await this.listAllScanTargets(query);
    const paged = paginate(targets, page, pageSize);

    return {
      items: paged.items,
      page,
      page_size: pageSize,
      total: paged.total
    };
  }

  async listAllScanTargets(query = {}) {
    const targets = await this.repository.listScanTargets({
      siteKey: query.site_key,
      environment: query.environment,
      branch: query.branch
    });

    return targets.map(mapScanTarget).sort(compareScanTargets);
  }

  async upsertScanTarget(body) {
    if (!isObject(body)) {
      throw new ApiError(400, "bad_request", "request body must be a JSON object");
    }

    const target = await this.repository.upsertScanTarget(normalizeScanTarget(body.scan_target ?? body));
    return {
      scan_target: mapScanTarget(target)
    };
  }

  async createScanRun(body, mode) {
    if (!isObject(body)) {
      throw new ApiError(400, "bad_request", "request body must be a JSON object");
    }

    if (mode === "page") {
      if (typeof body.page_url !== "string" || body.page_url.length === 0) {
        throw new ApiError(400, "bad_request", "page_url is required");
      }
      try {
        new URL(body.page_url);
      } catch {
        throw new ApiError(400, "bad_request", "page_url must be a valid URI");
      }
    }

    if (mode === "path" && (typeof body.path_prefix !== "string" || body.path_prefix.length === 0)) {
      throw new ApiError(400, "bad_request", "path_prefix is required");
    }

    const complianceProfile = getComplianceProfile(body.compliance_profile_id);
    if (!complianceProfile) {
      throw new ApiError(400, "bad_request", "compliance_profile_id is invalid");
    }
    const scanTarget = normalizeScanTarget(body.scan_target);

    const result = await this.repository.createScanRun({
      scanTarget,
      mode,
      reason: normalizeReason(body.reason),
      scanOptions: normalizeScanOptions(body.scan_options, this.scanOptionsDefaults),
      complianceProfile,
      scannerContext: this.scannerContext,
      jobScope: {
        seedUrls: Array.isArray(body.seed_urls) ? body.seed_urls : mode === "page" ? [body.page_url] : [],
        pageUrl: body.page_url ?? null,
        pathPrefix: body.path_prefix ?? null
      }
    });

    return {
      run: mapScanRun(result)
    };
  }

  async listScanRuns(query) {
    const page = parsePositiveInteger(query.page, 1, null, "page");
    const pageSize = parsePositiveInteger(query.page_size, 50, 200, "page_size");
    const ordered = await this.listAllScanRuns(query);
    const paged = paginate(ordered, page, pageSize);

    return {
      items: paged.items,
      page,
      page_size: pageSize,
      total: paged.total
    };
  }

  async listAllScanRuns(query = {}) {
    const sortBy = query.sort_by ?? "started_at";
    const sortOrder = query.sort_order === "asc" ? "asc" : "desc";
    const runs = await this.repository.listScanRuns({
      siteKey: query.site_key,
      environment: query.environment,
      branch: query.branch
    });

    return runs.sort((left, right) => compareRuns(left, right, sortBy, sortOrder)).map(mapScanRun);
  }

  async getScanRun(scanRunId) {
    if (!isUuid(scanRunId)) {
      throw new ApiError(400, "bad_request", "scanRunId must be a UUID");
    }

    const run = await this.repository.getScanRun(scanRunId);
    if (!run) {
      throw new ApiError(404, "not_found", "scan run not found");
    }

    return {
      run: mapScanRun(run)
    };
  }

  async deleteScanRun(scanRunId) {
    if (!isUuid(scanRunId)) {
      throw new ApiError(400, "bad_request", "scanRunId must be a UUID");
    }

    const run = await this.repository.getScanRun(scanRunId);
    if (!run) {
      throw new ApiError(404, "not_found", "scan run not found");
    }

    if (run.run.state === "queued" || run.run.state === "running") {
      throw new ApiError(409, "conflict", "active scan runs cannot be deleted");
    }

    await this.repository.deleteScanRun(scanRunId);
  }

  async getScanTarget(scanTarget) {
    const normalized = normalizeScanTargetIdentity(scanTarget);
    const result = await this.repository.getScanTarget({
      siteKey: normalized.site_key,
      environment: normalized.environment,
      branch: normalized.branch
    });

    if (!result) {
      throw new ApiError(404, "not_found", "scan target not found");
    }

    return {
      scan_target: mapScanTarget(result)
    };
  }

  async listRunFindings(scanRunId, query) {
    const page = parsePositiveInteger(query.page, 1, null, "page");
    const pageSize = parsePositiveInteger(query.page_size, 50, 200, "page_size");
    const items = await this.listAllRunFindings(scanRunId, query);
    const paged = paginate(items, page, pageSize);

    return {
      items: paged.items,
      page,
      page_size: pageSize,
      total: paged.total
    };
  }

  async listRunHvtGroups(scanRunId, query) {
    if (!isUuid(scanRunId)) {
      throw new ApiError(400, "bad_request", "scanRunId must be a UUID");
    }

    const run = await this.repository.getScanRun(scanRunId);
    if (!run) {
      throw new ApiError(404, "not_found", "scan run not found");
    }

    const page = parsePositiveInteger(query.page, 1, null, "page");
    const pageSize = parsePositiveInteger(query.page_size, 50, 200, "page_size");
    const groupLevel = optionalEnum(
      query.group_level,
      hvtGroupLevels,
      "group_level"
    ) ?? "section_cluster";

    const runFindings = await this.repository.listRunFindings(scanRunId);
    const findingInstances = (await this.repository.listFindingInstancesByFindingIds(
      runFindings.map((record) => record.finding.id)
    )).filter((instance) => instance.scanRunId === scanRunId);
    const groups = buildHvtGroups({
      runFindings,
      findingInstances,
      groupLevel
    });
    const paged = paginate(groups, page, pageSize);

    return {
      scan_run_id: scanRunId,
      compliance_profile: mapComplianceProfile(run.run.complianceProfile ?? getDefaultComplianceProfile()),
      group_level: groupLevel,
      items: paged.items.map(mapHvtGroup),
      page,
      page_size: pageSize,
      total: paged.total
    };
  }

  async listAllRunFindings(scanRunId, query = {}) {
    if (!isUuid(scanRunId)) {
      throw new ApiError(400, "bad_request", "scanRunId must be a UUID");
    }

    const run = await this.repository.getScanRun(scanRunId);
    if (!run) {
      throw new ApiError(404, "not_found", "scan run not found");
    }

    await this.repository.expireIgnoredFindings(this.now().toISOString());

    const sortBy = query.sort_by ?? "severity";
    const sortOrder = query.sort_order === "asc" ? "asc" : "desc";
    const diffStatus = optionalEnum(query.diff_status, findingDiffStatuses, "diff_status");

    const currentFindings = await this.repository.listRunFindings(scanRunId);
    const previousRun = await this.repository.getPreviousCompletedRun(run.run);
    const previousFindings = previousRun
      ? await this.repository.listRunFindings(previousRun.run.id)
      : [];

    const currentById = new Map(currentFindings.map((record) => [record.finding.id, record]));
    const previousById = new Map(previousFindings.map((record) => [record.finding.id, record]));
    const findingIds = new Set([...currentById.keys(), ...previousById.keys()]);

    const items = [];
    for (const findingId of findingIds) {
      const currentRecord = currentById.get(findingId);
      const previousRecord = previousById.get(findingId);
      const resolvedDiffStatus = currentRecord && previousRecord
        ? "persistent"
        : currentRecord
          ? "new"
          : "resolved";
      const selectedRecord = currentRecord ?? previousRecord;
      const mapped = mapFinding(selectedRecord, resolvedDiffStatus);

      if (diffStatus && mapped.diff_status !== diffStatus) {
        continue;
      }
      if (!ensureFindingMatchesFilters(mapped, query)) {
        continue;
      }

      items.push(mapped);
    }

    return items.sort((left, right) => compareFindings(left, right, sortBy, sortOrder));
  }

  async listFindings(query) {
    const page = parsePositiveInteger(query.page, 1, null, "page");
    const pageSize = parsePositiveInteger(query.page_size, 50, 200, "page_size");
    const mapped = await this.listAllFindings(query);
    const paged = paginate(mapped, page, pageSize);

    return {
      items: paged.items,
      page,
      page_size: pageSize,
      total: paged.total
    };
  }

  async listAllFindings(query = {}) {
    await this.repository.expireIgnoredFindings(this.now().toISOString());

    const sortBy = query.sort_by ?? "severity";
    const sortOrder = query.sort_order === "asc" ? "asc" : "desc";

    const findings = await this.repository.listFindings({
      siteKey: query.site_key,
      environment: query.environment,
      branch: query.branch
    });

    const mapped = findings
      .map((record) => mapFinding(record))
      .filter((finding) => ensureFindingMatchesFilters(finding, query))
      .sort((left, right) => compareFindings(left, right, sortBy, sortOrder));

    return mapped;
  }

  async getFinding(findingId) {
    if (!isUuid(findingId)) {
      throw new ApiError(400, "bad_request", "findingId must be a UUID");
    }

    await this.repository.expireIgnoredFindings(this.now().toISOString());

    const finding = await this.repository.getFinding(findingId);
    if (!finding) {
      throw new ApiError(404, "not_found", "finding not found");
    }

    const statusEvents = await this.repository.listStatusEvents(findingId);

    return {
      finding: mapFinding(finding),
      status_history: statusEvents.map(mapStatusEvent)
    };
  }

  async updateFindingStatus(findingId, body, options = {}) {
    if (!isUuid(findingId)) {
      throw new ApiError(400, "bad_request", "findingId must be a UUID");
    }
    if (!isObject(body)) {
      throw new ApiError(400, "bad_request", "request body must be a JSON object");
    }

    await this.repository.expireIgnoredFindings(this.now().toISOString());

    const existing = await this.repository.getFinding(findingId);
    if (!existing) {
      throw new ApiError(404, "not_found", "finding not found");
    }

    const status = requiredEnum(body.status, findingStatuses, "status");
    const note = body.note ?? null;
    if (note !== null && (typeof note !== "string" || note.length > 4000)) {
      throw new ApiError(400, "bad_request", "note must be a string up to 4000 characters");
    }

    const ignoreExpiresAt = parseDateTime(body.ignore_expires_at, "ignore_expires_at");
    if (status === "ignored") {
      if (!note || note.trim() === "") {
        throw new ApiError(400, "bad_request", "ignored status requires note");
      }
      if (!ignoreExpiresAt) {
        throw new ApiError(400, "bad_request", "ignored status requires ignore_expires_at");
      }
      if (ignoreExpiresAt <= this.now().toISOString()) {
        throw new ApiError(400, "bad_request", "ignore_expires_at must be in the future");
      }
    }

    const updated = await this.repository.applyFindingStatusUpdate({
      id: randomUUID(),
      findingId,
      previousStatus: existing.finding.status,
      status,
      note,
      ignoreExpiresAt: status === "ignored" ? ignoreExpiresAt : null,
      changedBy: options.changedBy ?? "api",
      changedAt: this.now().toISOString()
    });

    return {
      finding: mapFinding(updated),
      status_history: (await this.repository.listStatusEvents(findingId)).map(mapStatusEvent)
    };
  }
}
