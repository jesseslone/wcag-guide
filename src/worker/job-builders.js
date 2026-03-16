import crypto from "node:crypto";

import { getDefaultComplianceProfile, resolveComplianceProfile } from "../shared/compliance-profiles.js";
import { getDefaultScannerContext, validateWorkerJobPayload } from "./job-schema.js";

function makeUuid() {
  return crypto.randomUUID();
}

function buildBaseJob(scanTargetId, scanRunId, scanOptions, overrides = {}) {
  const payload = {
    job_id: makeUuid(),
    idempotency_key: `${scanRunId}:${overrides.mode ?? "full"}:${crypto.randomBytes(6).toString("hex")}`,
    scan_target_id: scanTargetId,
    scan_run_id: scanRunId,
    mode: "full",
    scan_options: scanOptions,
    scanner_context: getDefaultScannerContext(),
    compliance_profile: getDefaultComplianceProfile(),
    ...overrides
  };

  payload.compliance_profile = resolveComplianceProfile(payload.compliance_profile);

  const validation = validateWorkerJobPayload(payload);
  if (!validation.valid) {
    throw new Error(`Invalid worker job payload: ${validation.errors.join("; ")}`);
  }

  return payload;
}

export function createFullScanJob({ scanTargetId, scanRunId, scanOptions, seedUrls = [], complianceProfile }) {
  return buildBaseJob(scanTargetId, scanRunId, scanOptions, {
    mode: "full",
    seed_urls: seedUrls,
    compliance_profile: complianceProfile
  });
}

export function createPathRescanJob({ scanTargetId, scanRunId, scanOptions, pathPrefix, seedUrls = [], complianceProfile }) {
  return buildBaseJob(scanTargetId, scanRunId, scanOptions, {
    mode: "path",
    path_prefix: pathPrefix,
    seed_urls: seedUrls,
    compliance_profile: complianceProfile
  });
}

export function createPageRescanJob({ scanTargetId, scanRunId, scanOptions, pageUrl, complianceProfile }) {
  return buildBaseJob(scanTargetId, scanRunId, scanOptions, {
    mode: "page",
    seed_urls: [pageUrl],
    compliance_profile: complianceProfile
  });
}
