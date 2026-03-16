import schema from "../../contracts/worker-job.schema.json" with { type: "json" };
import { resolveComplianceProfile } from "../shared/compliance-profiles.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateScannerContext(scannerContext, errors) {
  if (scannerContext == null) {
    return;
  }

  for (const key of schema.properties.scanner_context.required) {
    if (!isNonEmptyString(scannerContext[key])) {
      errors.push(`scanner_context.${key} must be a non-empty string`);
    }
  }
}

function validateComplianceProfile(profile, errors) {
  if (profile == null) {
    return;
  }

  try {
    const resolved = resolveComplianceProfile(profile);
    if (!isNonEmptyString(resolved.id)) {
      errors.push("compliance_profile.id must be a non-empty string");
    }
    if (!isNonEmptyString(resolved.label)) {
      errors.push("compliance_profile.label must be a non-empty string");
    }
    if (!isNonEmptyString(resolved.version)) {
      errors.push("compliance_profile.version must be a non-empty string");
    }
    if (!isNonEmptyString(resolved.standard_target)) {
      errors.push("compliance_profile.standard_target must be a non-empty string");
    }
    if (!Array.isArray(resolved.axe_tags) || resolved.axe_tags.some((item) => !isNonEmptyString(item))) {
      errors.push("compliance_profile.axe_tags must be an array of non-empty strings");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function validateScanOptions(scanOptions, errors) {
  if (scanOptions == null || typeof scanOptions !== "object" || Array.isArray(scanOptions)) {
    errors.push("scan_options must be an object");
    return;
  }

  if (!isIntegerInRange(scanOptions.max_pages, 1, 5000)) {
    errors.push("scan_options.max_pages must be an integer between 1 and 5000");
  }
  if (!isIntegerInRange(scanOptions.max_depth, 0, 20)) {
    errors.push("scan_options.max_depth must be an integer between 0 and 20");
  }
  if (!isIntegerInRange(scanOptions.concurrency, 1, 20)) {
    errors.push("scan_options.concurrency must be an integer between 1 and 20");
  }
  if (!isIntegerInRange(scanOptions.retries, 0, 5)) {
    errors.push("scan_options.retries must be an integer between 0 and 5");
  }

  for (const key of ["path_allowlist", "path_denylist", "query_param_allowlist"]) {
    const value = scanOptions[key];
    if (value != null && (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item)))) {
      errors.push(`scan_options.${key} must be an array of strings`);
    }
  }
}

export function getDefaultScannerContext() {
  return {
    engine: "adapter",
    engine_version: process.env.AXE_CORE_VERSION ?? "4.11.0",
    browser: "chromium",
    browser_version: process.env.PLAYWRIGHT_VERSION ?? "1.54.2",
    viewport: "1440x900",
    user_agent: "wcag-guide/0.1.0",
    fingerprint_version: "fp-v1",
    normalization_version: "norm-v1"
  };
}

export function validateWorkerJobPayload(payload) {
  const errors = [];

  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload must be an object"] };
  }

  if (!isUuid(payload.job_id)) {
    errors.push("job_id must be a uuid");
  }
  if (!isUuid(payload.scan_target_id)) {
    errors.push("scan_target_id must be a uuid");
  }
  if (!isUuid(payload.scan_run_id)) {
    errors.push("scan_run_id must be a uuid");
  }
  if (!isNonEmptyString(payload.idempotency_key) || payload.idempotency_key.length < 8) {
    errors.push("idempotency_key must be a non-empty string with length >= 8");
  }

  if (!schema.properties.mode.enum.includes(payload.mode)) {
    errors.push("mode must be one of full, path, page");
  }

  validateScanOptions(payload.scan_options, errors);
  validateScannerContext(payload.scanner_context, errors);
  validateComplianceProfile(payload.compliance_profile, errors);

  if (payload.seed_urls != null) {
    if (!Array.isArray(payload.seed_urls) || payload.seed_urls.some((url) => !isNonEmptyString(url))) {
      errors.push("seed_urls must be an array of non-empty strings");
    }
  }

  if (payload.mode === "page") {
    if (!Array.isArray(payload.seed_urls) || payload.seed_urls.length !== 1) {
      errors.push("page mode requires exactly one seed_urls entry");
    }
  }

  if (payload.mode === "path" && !isNonEmptyString(payload.path_prefix)) {
    errors.push("path mode requires path_prefix");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
