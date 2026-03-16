import { randomUUID } from "node:crypto";

function clone(value) {
  return structuredClone(value);
}

function compareIsoDesc(left, right, field) {
  const leftValue = left[field] ?? "";
  const rightValue = right[field] ?? "";
  return rightValue.localeCompare(leftValue) || right.id.localeCompare(left.id);
}

function mapScanTarget(record) {
  return {
    id: record.id,
    siteKey: record.siteKey,
    environment: record.environment,
    branch: record.branch,
    baseUrl: record.baseUrl
  };
}

function mapRunRecord(record) {
  return {
    id: record.id,
    scanTargetId: record.scanTargetId,
    mode: record.mode,
    state: record.state,
    reason: record.reason ?? null,
    scanOptions: clone(record.scanOptions ?? {}),
    scannerContext: clone(record.scannerContext ?? {}),
    pagesScanned: record.pagesScanned ?? 0,
    findingsTotal: record.findingsTotal ?? 0,
    newCount: record.newCount ?? 0,
    resolvedCount: record.resolvedCount ?? 0,
    persistentCount: record.persistentCount ?? 0,
    complianceProfile: record.complianceProfile ?? null,
    startedAt: record.startedAt,
    completedAt: record.completedAt ?? null
  };
}

function mapFindingRecord(record) {
  return {
    id: record.id,
    scanTargetId: record.scanTargetId,
    fingerprint: record.fingerprint,
    ruleId: record.ruleId,
    severity: record.severity,
    status: record.status,
    ignoreExpiresAt: record.ignoreExpiresAt ?? null,
    ruleMetadata: record.ruleMetadata ?? null
  };
}

function mapInstanceRecord(record) {
  return {
    id: record.id,
    findingId: record.findingId,
    scanRunId: record.scanRunId,
    pageId: record.pageId,
    pageUrl: record.rawUrl,
    normalizedUrl: record.normalizedUrl,
    selector: record.normalizedSelector,
    snippet: record.snippet ?? "",
    failureSummary: record.failureSummary ?? null,
    detectedAt: record.detectedAt
  };
}

export class InMemoryRepository {
  constructor(initialState = {}, options = {}) {
    this.scanTargets = new Map();
    this.scanRuns = new Map();
    this.findings = new Map();
    this.findingInstances = new Map();
    this.statusEvents = new Map();
    this.ruleMetadata = new Map();
    this.options = {
      failStatusUpdateTransaction: false,
      ...options
    };

    for (const record of initialState.scanTargets ?? []) {
      this.scanTargets.set(record.id, clone(record));
    }
    for (const record of initialState.scanRuns ?? []) {
      this.scanRuns.set(record.id, clone(record));
    }
    for (const record of initialState.findings ?? []) {
      this.findings.set(record.id, clone(record));
    }
    for (const record of initialState.ruleMetadata ?? []) {
      this.ruleMetadata.set(record.ruleId, clone(record));
    }
    for (const record of initialState.findingInstances ?? []) {
      this.findingInstances.set(record.id, clone(record));
    }
    for (const record of initialState.statusEvents ?? []) {
      this.statusEvents.set(record.id, clone(record));
    }
  }

  async createScanRun({
    scanTarget,
    mode,
    reason,
    scanOptions,
    complianceProfile,
    scannerContext,
    jobScope
  }) {
    const existingTarget = Array.from(this.scanTargets.values()).find(
      (record) =>
        record.siteKey === scanTarget.site_key &&
        record.environment === scanTarget.environment &&
        record.branch === scanTarget.branch
    );

    const target = existingTarget ?? {
      id: randomUUID(),
      siteKey: scanTarget.site_key,
      environment: scanTarget.environment,
      branch: scanTarget.branch,
      baseUrl: scanTarget.base_url
    };

    target.baseUrl = scanTarget.base_url;
    this.scanTargets.set(target.id, clone(target));

    const nowIso = new Date().toISOString();
    const run = {
      id: randomUUID(),
      scanTargetId: target.id,
      mode,
      state: "queued",
      reason,
      scanOptions: clone(scanOptions),
      scannerContext: clone(scannerContext),
      pagesScanned: 0,
      findingsTotal: 0,
      newCount: 0,
      resolvedCount: 0,
      persistentCount: 0,
      complianceProfile,
      startedAt: nowIso,
      completedAt: null,
      jobScope: clone(jobScope)
    };

    this.scanRuns.set(run.id, clone(run));

    return {
      run: mapRunRecord(run),
      scanTarget: mapScanTarget(target)
    };
  }

  async listScanTargets({ siteKey, environment, branch } = {}) {
    return Array.from(this.scanTargets.values())
      .filter((target) => (siteKey ? target.siteKey === siteKey : true))
      .filter((target) => (environment ? target.environment === environment : true))
      .filter((target) => (branch ? target.branch === branch : true))
      .map(mapScanTarget);
  }

  async upsertScanTarget(scanTarget) {
    const existingTarget = Array.from(this.scanTargets.values()).find(
      (record) =>
        record.siteKey === scanTarget.site_key &&
        record.environment === scanTarget.environment &&
        record.branch === scanTarget.branch
    );

    const target = existingTarget ?? {
      id: randomUUID(),
      siteKey: scanTarget.site_key,
      environment: scanTarget.environment,
      branch: scanTarget.branch,
      baseUrl: scanTarget.base_url
    };

    target.baseUrl = scanTarget.base_url;
    this.scanTargets.set(target.id, clone(target));
    return mapScanTarget(target);
  }

  async listScanRuns({ siteKey, environment, branch } = {}) {
    return Array.from(this.scanRuns.values())
      .map((record) => {
        const scanTarget = this.scanTargets.get(record.scanTargetId);
        return {
          run: mapRunRecord(record),
          scanTarget: scanTarget ? mapScanTarget(scanTarget) : null
        };
      })
      .filter(({ scanTarget }) => scanTarget !== null)
      .filter(({ scanTarget }) => (siteKey ? scanTarget.siteKey === siteKey : true))
      .filter(({ scanTarget }) => (environment ? scanTarget.environment === environment : true))
      .filter(({ scanTarget }) => (branch ? scanTarget.branch === branch : true));
  }

  async getScanTarget({ siteKey, environment, branch }) {
    const record = Array.from(this.scanTargets.values()).find(
      (candidate) =>
        candidate.siteKey === siteKey &&
        candidate.environment === environment &&
        candidate.branch === branch
    );

    return record ? mapScanTarget(record) : null;
  }

  async getScanRun(scanRunId) {
    const record = this.scanRuns.get(scanRunId);
    if (!record) {
      return null;
    }

    const scanTarget = this.scanTargets.get(record.scanTargetId);
    if (!scanTarget) {
      return null;
    }

    return {
      run: mapRunRecord(record),
      scanTarget: mapScanTarget(scanTarget)
    };
  }

  async deleteScanRun(scanRunId) {
    const existed = this.scanRuns.delete(scanRunId);
    if (!existed) {
      return false;
    }

    for (const [instanceId, instance] of this.findingInstances.entries()) {
      if (instance.scanRunId === scanRunId) {
        this.findingInstances.delete(instanceId);
      }
    }

    for (const [findingId, finding] of this.findings.entries()) {
      const stillReferenced = Array.from(this.findingInstances.values()).some(
        (instance) => instance.findingId === findingId
      );
      if (!stillReferenced) {
        this.findings.delete(findingId);
      }
    }

    return true;
  }

  async getPreviousCompletedRun(scanRun) {
    const previous = Array.from(this.scanRuns.values())
      .filter(
        (candidate) =>
          candidate.scanTargetId === scanRun.scanTargetId &&
          candidate.id !== scanRun.id &&
          candidate.state === "completed" &&
          candidate.completedAt &&
          candidate.completedAt < scanRun.startedAt
      )
      .sort((left, right) => compareIsoDesc(left, right, "completedAt"))[0];

    if (!previous) {
      return null;
    }

    const scanTarget = this.scanTargets.get(previous.scanTargetId);
    return {
      run: mapRunRecord(previous),
      scanTarget: mapScanTarget(scanTarget)
    };
  }

  async listRunFindings(scanRunId) {
    const run = this.scanRuns.get(scanRunId);
    if (!run) {
      return [];
    }

    const scanTarget = this.scanTargets.get(run.scanTargetId);
    const instances = Array.from(this.findingInstances.values()).filter((record) => record.scanRunId === scanRunId);
    const findingIds = new Set(instances.map((record) => record.findingId));

    return Array.from(findingIds).map((findingId) => {
      const finding = this.findings.get(findingId);
      const ruleMetadata = this.ruleMetadata.get(finding.ruleId) ?? null;
      const latestInstance = instances
        .filter((record) => record.findingId === findingId)
        .sort((left, right) => compareIsoDesc(left, right, "detectedAt"))[0];

      return {
        finding: mapFindingRecord({ ...finding, ruleMetadata }),
        latestInstance: mapInstanceRecord(latestInstance),
        scanTarget: mapScanTarget(scanTarget)
      };
    });
  }

  async listFindings({ siteKey, environment, branch } = {}) {
    return Array.from(this.findings.values())
      .map((record) => {
        const scanTarget = this.scanTargets.get(record.scanTargetId);
        const ruleMetadata = this.ruleMetadata.get(record.ruleId) ?? null;
        const latestInstance = Array.from(this.findingInstances.values())
          .filter((instance) => instance.findingId === record.id)
          .sort((left, right) => compareIsoDesc(left, right, "detectedAt"))[0];

        return {
          finding: mapFindingRecord({ ...record, ruleMetadata }),
          latestInstance: latestInstance ? mapInstanceRecord(latestInstance) : null,
          scanTarget: scanTarget ? mapScanTarget(scanTarget) : null
        };
      })
      .filter(({ latestInstance, scanTarget }) => latestInstance !== null && scanTarget !== null)
      .filter(({ scanTarget }) => (siteKey ? scanTarget.siteKey === siteKey : true))
      .filter(({ scanTarget }) => (environment ? scanTarget.environment === environment : true))
      .filter(({ scanTarget }) => (branch ? scanTarget.branch === branch : true));
  }

  async getFinding(findingId) {
    const finding = this.findings.get(findingId);
    if (!finding) {
      return null;
    }

    const scanTarget = this.scanTargets.get(finding.scanTargetId);
    const ruleMetadata = this.ruleMetadata.get(finding.ruleId) ?? null;
    const latestInstance = Array.from(this.findingInstances.values())
      .filter((instance) => instance.findingId === findingId)
      .sort((left, right) => compareIsoDesc(left, right, "detectedAt"))[0];

    return {
      finding: mapFindingRecord({ ...finding, ruleMetadata }),
      latestInstance: latestInstance ? mapInstanceRecord(latestInstance) : null,
      scanTarget: scanTarget ? mapScanTarget(scanTarget) : null
    };
  }

  async listFindingInstancesByFindingIds(findingIds) {
    const idSet = new Set(findingIds);
    return Array.from(this.findingInstances.values())
      .filter((instance) => idSet.has(instance.findingId))
      .map(mapInstanceRecord);
  }

  async applyFindingStatusUpdate({
    id,
    findingId,
    previousStatus,
    status,
    note,
    ignoreExpiresAt,
    changedBy,
    changedAt
  }) {
    const finding = this.findings.get(findingId);
    if (!finding) {
      return null;
    }

    const findingsSnapshot = new Map(this.findings);
    const statusEventsSnapshot = new Map(this.statusEvents);

    const updated = {
      ...finding,
      status,
      ignoreExpiresAt
    };

    try {
      this.findings.set(findingId, clone(updated));

      if (this.options.failStatusUpdateTransaction) {
        throw new Error("simulated status event failure");
      }

      this.statusEvents.set(id, {
        id,
        findingId,
        previousStatus,
        newStatus: status,
        note,
        ignoreExpiresAt,
        changedBy,
        changedAt
      });

      return this.getFinding(findingId);
    } catch (error) {
      this.findings = findingsSnapshot;
      this.statusEvents = statusEventsSnapshot;
      throw error;
    }
  }

  async expireIgnoredFindings(nowIso) {
    const expiredFindings = Array.from(this.findings.values()).filter(
      (finding) =>
        finding.status === "ignored" &&
        finding.ignoreExpiresAt &&
        finding.ignoreExpiresAt <= nowIso
    );

    for (const finding of expiredFindings) {
      finding.status = "open";
      finding.ignoreExpiresAt = null;
      this.findings.set(finding.id, clone(finding));
      this.statusEvents.set(randomUUID(), {
        id: randomUUID(),
        findingId: finding.id,
        previousStatus: "ignored",
        newStatus: "open",
        note: "Ignore expired automatically.",
        ignoreExpiresAt: null,
        changedBy: "system",
        changedAt: nowIso
      });
    }

    return expiredFindings.length;
  }

  async createStatusEvent(event) {
    this.statusEvents.set(event.id, clone(event));
  }

  async listStatusEvents(findingId) {
    return Array.from(this.statusEvents.values())
      .filter((event) => event.findingId === findingId)
      .sort((left, right) => compareIsoDesc(left, right, "changedAt"))
      .map(clone);
  }
}
