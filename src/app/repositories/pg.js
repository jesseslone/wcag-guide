import { randomUUID } from "node:crypto";

import { getComplianceProfile, getDefaultComplianceProfile } from "../compliance-profiles.js";

function mapScanTargetRow(row) {
  return {
    id: row.scan_target_id ?? row.id,
    siteKey: row.site_key,
    environment: row.environment,
    branch: row.branch,
    baseUrl: row.base_url
  };
}

function mapComplianceProfileRow(row) {
  const profileId = row.compliance_profile_id;
  const defaultProfile = getDefaultComplianceProfile();
  const resolvedProfile = getComplianceProfile(profileId) ?? defaultProfile;

  return {
    ...resolvedProfile,
    label: row.compliance_profile_label ?? resolvedProfile.label,
    version: row.compliance_profile_version ?? resolvedProfile.version
  };
}

function mapComplianceProfileForWorker(profile) {
  const resolvedProfile = profile ?? getDefaultComplianceProfile();
  return {
    id: resolvedProfile.id,
    label: resolvedProfile.label,
    version: resolvedProfile.version,
    standard_target: resolvedProfile.standardTarget,
    axe_tags: [...resolvedProfile.axeTags]
  };
}

function mapRuleMetadataRow(row) {
  if (!row.rule_help && !row.rule_description && !row.rule_help_url && !row.rule_tags) {
    return null;
  }

  return {
    ruleId: row.rule_id,
    ruleHelp: row.rule_help ?? null,
    ruleDescription: row.rule_description ?? null,
    ruleHelpUrl: row.rule_help_url ?? null,
    ruleTags: Array.isArray(row.rule_tags) ? row.rule_tags : []
  };
}

function mapRunRow(row) {
  return {
    id: row.id,
    scanTargetId: row.scan_target_id,
    mode: row.mode,
    state: row.state,
    reason: row.reason ?? null,
    scanOptions: row.scan_options ?? {},
    scannerContext: row.scanner_context ?? {},
    pagesScanned: row.pages_scanned,
    findingsTotal: row.findings_total,
    newCount: row.new_count,
    resolvedCount: row.resolved_count,
    persistentCount: row.persistent_count,
    complianceProfile: mapComplianceProfileRow(row),
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function mapFindingRow(row) {
  return {
    id: row.finding_id ?? row.id,
    scanTargetId: row.scan_target_id,
    fingerprint: row.fingerprint,
    ruleId: row.rule_id,
    severity: row.severity,
    status: row.status,
    ignoreExpiresAt: row.ignore_expires_at,
    ruleMetadata: mapRuleMetadataRow(row)
  };
}

function mapInstanceRow(row) {
  return {
    id: row.instance_id,
    findingId: row.finding_id ?? row.id,
    scanRunId: row.instance_scan_run_id,
    pageUrl: row.page_url,
    normalizedUrl: row.normalized_url,
    selector: row.selector,
    snippet: row.snippet ?? "",
    failureSummary: row.failure_summary ?? null,
    detectedAt: row.detected_at
  };
}

async function getFindingWithExecutor(executor, findingId) {
  const result = await executor.query(
    `
      SELECT
        f.id AS finding_id,
        f.scan_target_id,
        f.fingerprint,
        f.rule_id,
        f.severity,
        f.status,
        f.ignore_expires_at,
        rm.rule_help,
        rm.rule_description,
        rm.rule_help_url,
        rm.rule_tags,
        st.site_key,
        st.environment,
        st.branch,
        st.base_url,
        fi.id AS instance_id,
        fi.scan_run_id AS instance_scan_run_id,
        fi.raw_url AS page_url,
        fi.normalized_url,
        fi.normalized_selector AS selector,
        fi.snippet,
        fi.failure_summary,
        fi.detected_at
      FROM findings f
      JOIN scan_targets st ON st.id = f.scan_target_id
      LEFT JOIN rule_metadata rm ON rm.rule_id = f.rule_id
      LEFT JOIN LATERAL (
        SELECT fi.*
        FROM finding_instances fi
        WHERE fi.finding_id = f.id
        ORDER BY fi.detected_at DESC, fi.created_at DESC
        LIMIT 1
      ) fi ON TRUE
      WHERE f.id = $1
    `,
    [findingId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    finding: mapFindingRow(result.rows[0]),
    latestInstance: result.rows[0].instance_id ? mapInstanceRow(result.rows[0]) : null,
    scanTarget: mapScanTargetRow(result.rows[0])
  };
}

export class PgRepository {
  constructor({ pool, withTransaction }) {
    this.pool = pool;
    this.withTransaction = withTransaction;
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
    return this.withTransaction(async (client) => {
      const targetResult = await client.query(
        `
          INSERT INTO scan_targets (site_key, environment, branch, base_url, crawl_config)
          VALUES ($1, $2, $3, $4, $5::jsonb)
          ON CONFLICT (site_key, environment, branch)
          DO UPDATE
          SET base_url = EXCLUDED.base_url,
              crawl_config = EXCLUDED.crawl_config,
              updated_at = now()
          RETURNING *
        `,
        [
          scanTarget.site_key,
          scanTarget.environment,
          scanTarget.branch,
          scanTarget.base_url,
          JSON.stringify(scanOptions)
        ]
      );

      const scanTargetRow = targetResult.rows[0];
      const runResult = await client.query(
        `
          INSERT INTO scan_runs (
            scan_target_id,
            mode,
            state,
            reason,
            scan_options,
            scanner_context,
            compliance_profile_id,
            compliance_profile_label,
            compliance_profile_version
          )
          VALUES ($1, $2, 'queued', $3, $4::jsonb, $5::jsonb, $6, $7, $8)
          RETURNING *
        `,
        [
          scanTargetRow.id,
          mode,
          reason,
          JSON.stringify(scanOptions),
          JSON.stringify(scannerContext),
          complianceProfile.id,
          complianceProfile.label,
          complianceProfile.version
        ]
      );

      const runRow = runResult.rows[0];
      const scopeKey = jobScope.pageUrl ?? jobScope.pathPrefix ?? "full";
      const payload = {
        job_id: randomUUID(),
        idempotency_key: `${runRow.id}:${mode}:${scopeKey}`,
        scan_target_id: scanTargetRow.id,
        scan_run_id: runRow.id,
        mode,
        seed_urls: jobScope.seedUrls,
        path_prefix: jobScope.pathPrefix,
        scan_options: scanOptions,
        scanner_context: scannerContext,
        compliance_profile: mapComplianceProfileForWorker(complianceProfile)
      };

      await client.query(
        `
          INSERT INTO worker_jobs (id, scan_run_id, scan_target_id, state, payload, idempotency_key)
          VALUES ($1, $2, $3, 'queued', $4::jsonb, $5)
        `,
        [
          payload.job_id,
          runRow.id,
          scanTargetRow.id,
          JSON.stringify(payload),
          payload.idempotency_key
        ]
      );

      return {
        run: mapRunRow(runRow),
        scanTarget: mapScanTargetRow(scanTargetRow)
      };
    });
  }

  async listScanTargets({ siteKey, environment, branch } = {}) {
    const values = [];
    const conditions = [];

    if (siteKey) {
      values.push(siteKey);
      conditions.push(`site_key = $${values.length}`);
    }
    if (environment) {
      values.push(environment);
      conditions.push(`environment = $${values.length}`);
    }
    if (branch) {
      values.push(branch);
      conditions.push(`branch = $${values.length}`);
    }

    const result = await this.pool.query(
      `
        SELECT *
        FROM scan_targets
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      `,
      values
    );

    return result.rows.map(mapScanTargetRow);
  }

  async upsertScanTarget(scanTarget) {
    const result = await this.pool.query(
      `
        INSERT INTO scan_targets (site_key, environment, branch, base_url, crawl_config)
        VALUES ($1, $2, $3, $4, '{}'::jsonb)
        ON CONFLICT (site_key, environment, branch)
        DO UPDATE
        SET base_url = EXCLUDED.base_url,
            updated_at = now()
        RETURNING *
      `,
      [scanTarget.site_key, scanTarget.environment, scanTarget.branch, scanTarget.base_url]
    );

    return mapScanTargetRow(result.rows[0]);
  }

  async listScanRuns({ siteKey, environment, branch } = {}) {
    const values = [];
    const conditions = [];

    if (siteKey) {
      values.push(siteKey);
      conditions.push(`st.site_key = $${values.length}`);
    }
    if (environment) {
      values.push(environment);
      conditions.push(`st.environment = $${values.length}`);
    }
    if (branch) {
      values.push(branch);
      conditions.push(`st.branch = $${values.length}`);
    }

    const result = await this.pool.query(
      `
        SELECT
          sr.*,
          st.id AS scan_target_id,
          st.site_key,
          st.environment,
          st.branch,
          st.base_url
        FROM scan_runs sr
        JOIN scan_targets st ON st.id = sr.scan_target_id
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      `,
      values
    );

    return result.rows.map((row) => ({
      run: mapRunRow(row),
      scanTarget: mapScanTargetRow(row)
    }));
  }

  async getScanTarget({ siteKey, environment, branch }) {
    const result = await this.pool.query(
      `
        SELECT *
        FROM scan_targets
        WHERE site_key = $1
          AND environment = $2
          AND branch = $3
      `,
      [siteKey, environment, branch]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapScanTargetRow(result.rows[0]);
  }

  async getScanRun(scanRunId) {
    const result = await this.pool.query(
      `
        SELECT
          sr.*,
          st.id AS scan_target_id,
          st.site_key,
          st.environment,
          st.branch,
          st.base_url
        FROM scan_runs sr
        JOIN scan_targets st ON st.id = sr.scan_target_id
        WHERE sr.id = $1
      `,
      [scanRunId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      run: mapRunRow(result.rows[0]),
      scanTarget: mapScanTargetRow(result.rows[0])
    };
  }

  async deleteScanRun(scanRunId) {
    return this.withTransaction(async (client) => {
      const deleted = await client.query(
        `
          DELETE FROM scan_runs
          WHERE id = $1
          RETURNING id
        `,
        [scanRunId]
      );

      if (deleted.rows.length === 0) {
        return false;
      }

      await client.query(
        `
          DELETE FROM findings f
          WHERE NOT EXISTS (
            SELECT 1
            FROM finding_instances fi
            WHERE fi.finding_id = f.id
          )
        `
      );

      await client.query(
        `
          DELETE FROM pages p
          WHERE NOT EXISTS (
            SELECT 1
            FROM finding_instances fi
            WHERE fi.page_id = p.id
          )
        `
      );

      return true;
    });
  }

  async getPreviousCompletedRun(scanRun) {
    const result = await this.pool.query(
      `
        SELECT
          sr.*,
          st.id AS scan_target_id,
          st.site_key,
          st.environment,
          st.branch,
          st.base_url
        FROM scan_runs sr
        JOIN scan_targets st ON st.id = sr.scan_target_id
        WHERE sr.scan_target_id = $1
          AND sr.state = 'completed'
          AND sr.completed_at IS NOT NULL
          AND sr.completed_at < $2
        ORDER BY sr.completed_at DESC
        LIMIT 1
      `,
      [scanRun.scanTargetId, scanRun.startedAt]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      run: mapRunRow(result.rows[0]),
      scanTarget: mapScanTargetRow(result.rows[0])
    };
  }

  async listRunFindings(scanRunId) {
    const result = await this.pool.query(
      `
        SELECT
          f.id AS finding_id,
          f.scan_target_id,
          f.fingerprint,
          f.rule_id,
          f.severity,
          f.status,
          f.ignore_expires_at,
          rm.rule_help,
          rm.rule_description,
          rm.rule_help_url,
          rm.rule_tags,
          st.site_key,
          st.environment,
          st.branch,
          st.base_url,
          fi.id AS instance_id,
          fi.scan_run_id AS instance_scan_run_id,
          fi.raw_url AS page_url,
          fi.normalized_url,
          fi.normalized_selector AS selector,
          fi.snippet,
          fi.failure_summary,
          fi.detected_at
        FROM findings f
        JOIN scan_targets st ON st.id = f.scan_target_id
        LEFT JOIN rule_metadata rm ON rm.rule_id = f.rule_id
        JOIN LATERAL (
          SELECT fi.*
          FROM finding_instances fi
          WHERE fi.finding_id = f.id
            AND fi.scan_run_id = $1
          ORDER BY fi.detected_at DESC, fi.created_at DESC
          LIMIT 1
        ) fi ON TRUE
      `,
      [scanRunId]
    );

    return result.rows.map((row) => ({
      finding: mapFindingRow(row),
      latestInstance: mapInstanceRow(row),
      scanTarget: mapScanTargetRow(row)
    }));
  }

  async listFindings({ siteKey, environment, branch } = {}) {
    const values = [];
    const conditions = [];

    if (siteKey) {
      values.push(siteKey);
      conditions.push(`st.site_key = $${values.length}`);
    }
    if (environment) {
      values.push(environment);
      conditions.push(`st.environment = $${values.length}`);
    }
    if (branch) {
      values.push(branch);
      conditions.push(`st.branch = $${values.length}`);
    }

    const result = await this.pool.query(
      `
        SELECT
          f.id AS finding_id,
          f.scan_target_id,
          f.fingerprint,
          f.rule_id,
          f.severity,
          f.status,
          f.ignore_expires_at,
          rm.rule_help,
          rm.rule_description,
          rm.rule_help_url,
          rm.rule_tags,
          st.site_key,
          st.environment,
          st.branch,
          st.base_url,
          fi.id AS instance_id,
          fi.scan_run_id AS instance_scan_run_id,
          fi.raw_url AS page_url,
          fi.normalized_url,
          fi.normalized_selector AS selector,
          fi.snippet,
          fi.failure_summary,
          fi.detected_at
        FROM findings f
        JOIN scan_targets st ON st.id = f.scan_target_id
        LEFT JOIN rule_metadata rm ON rm.rule_id = f.rule_id
        JOIN LATERAL (
          SELECT fi.*
          FROM finding_instances fi
          WHERE fi.finding_id = f.id
          ORDER BY fi.detected_at DESC, fi.created_at DESC
          LIMIT 1
        ) fi ON TRUE
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      `,
      values
    );

    return result.rows.map((row) => ({
      finding: mapFindingRow(row),
      latestInstance: mapInstanceRow(row),
      scanTarget: mapScanTargetRow(row)
    }));
  }

  async getFinding(findingId) {
    return getFindingWithExecutor(this.pool, findingId);
  }

  async listFindingInstancesByFindingIds(findingIds) {
    if (findingIds.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `
        SELECT
          fi.id AS instance_id,
          fi.finding_id,
          fi.scan_run_id AS instance_scan_run_id,
          fi.page_id,
          fi.raw_url AS page_url,
          fi.normalized_url,
          fi.normalized_selector AS selector,
          fi.snippet,
          fi.failure_summary,
          fi.detected_at
        FROM finding_instances fi
        WHERE fi.finding_id = ANY($1::uuid[])
        ORDER BY fi.detected_at DESC, fi.id DESC
      `,
      [findingIds]
    );

    return result.rows.map((row) => ({
      ...mapInstanceRow(row),
      pageId: row.page_id
    }));
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
    return this.withTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE findings
          SET status = $2,
              ignore_expires_at = $3,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [findingId, status, ignoreExpiresAt]
      );

      if (result.rows.length === 0) {
        return null;
      }

      await client.query(
        `
          INSERT INTO status_events (
            id,
            finding_id,
            previous_status,
            new_status,
            note,
            ignore_expires_at,
            changed_by,
            changed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [id, findingId, previousStatus, status, note, ignoreExpiresAt, changedBy, changedAt]
      );

      return getFindingWithExecutor(client, findingId);
    });
  }

  async expireIgnoredFindings(nowIso) {
    return this.withTransaction(async (client) => {
      const expired = await client.query(
        `
          SELECT id
          FROM findings
          WHERE status = 'ignored'
            AND ignore_expires_at IS NOT NULL
            AND ignore_expires_at <= $1
          FOR UPDATE
        `,
        [nowIso]
      );

      if (expired.rows.length === 0) {
        return 0;
      }

      const findingIds = expired.rows.map((row) => row.id);
      await client.query(
        `
          UPDATE findings
          SET status = 'open',
              ignore_expires_at = NULL,
              updated_at = now()
          WHERE id = ANY($1::uuid[])
        `,
        [findingIds]
      );

      await client.query(
        `
          INSERT INTO status_events (
            id,
            finding_id,
            previous_status,
            new_status,
            note,
            ignore_expires_at,
            changed_by,
            changed_at
          )
          SELECT
            gen_random_uuid(),
            finding_id,
            'ignored',
            'open',
            'Ignore expired automatically.',
            NULL,
            'system',
            $2
          FROM unnest($1::uuid[]) AS finding_id
        `,
        [findingIds, nowIso]
      );

      return findingIds.length;
    });
  }

  async createStatusEvent(event) {
    await this.pool.query(
      `
        INSERT INTO status_events (
          id,
          finding_id,
          previous_status,
          new_status,
          note,
          ignore_expires_at,
          changed_by,
          changed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        event.id,
        event.findingId,
        event.previousStatus,
        event.newStatus,
        event.note,
        event.ignoreExpiresAt,
        event.changedBy,
        event.changedAt
      ]
    );
  }

  async listStatusEvents(findingId) {
    const result = await this.pool.query(
      `
        SELECT
          id,
          previous_status,
          new_status,
          note,
          ignore_expires_at,
          changed_by,
          changed_at
        FROM status_events
        WHERE finding_id = $1
        ORDER BY changed_at DESC, id DESC
      `,
      [findingId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      note: row.note,
      ignoreExpiresAt: row.ignore_expires_at,
      changedBy: row.changed_by,
      changedAt: row.changed_at
    }));
  }
}
