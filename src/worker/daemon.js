import { existsSync } from "node:fs";
import { closePool, pool, withTransaction } from "../db.js";
import { workerPollIntervalMs } from "../config.js";
import { createHttpFetchPage, createScannerAdapter, executeScanJob } from "./index.js";
import { resolveScannerContext } from "./scanner-context.js";

const isDocker = existsSync("/.dockerenv");
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function rewriteBaseUrlForDocker(rawUrl) {
  if (!isDocker) return rawUrl;
  const parsed = new URL(rawUrl);
  if (loopbackHosts.has(parsed.hostname)) {
    parsed.hostname = "host.docker.internal";
    return parsed.toString().replace(/\/$/, "");
  }
  return rawUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNullableText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function claimJob() {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        WITH next_job AS (
          SELECT id
          FROM worker_jobs
          WHERE state = 'queued'
            AND available_at <= now()
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE worker_jobs AS jobs
        SET state = 'running',
            attempts = attempts + 1,
            updated_at = now()
        FROM next_job
        WHERE jobs.id = next_job.id
        RETURNING jobs.*
      `
    );

    if (result.rows.length === 0) {
      return null;
    }

    const job = result.rows[0];
    await client.query(
      `
        UPDATE scan_runs
        SET state = 'running',
            started_at = now()
        WHERE id = $1
      `,
      [job.payload.scan_run_id]
    );

    return job;
  });
}

async function loadScanTarget(scanTargetId) {
  const result = await pool.query("SELECT * FROM scan_targets WHERE id = $1", [scanTargetId]);
  if (result.rows.length === 0) {
    throw new Error(`scan target ${scanTargetId} not found`);
  }
  return result.rows[0];
}

async function upsertPage(client, scanTargetId, scanRunId, normalizedUrl) {
  const normalizedPath = new URL(normalizedUrl).pathname;
  const result = await client.query(
    `
      INSERT INTO pages (
        scan_target_id,
        raw_url,
        normalized_url,
        normalized_path,
        first_seen_run_id,
        last_seen_run_id
      )
      VALUES ($1, $2, $2, $3, $4, $4)
      ON CONFLICT (scan_target_id, normalized_url)
      DO UPDATE
      SET raw_url = EXCLUDED.raw_url,
          normalized_path = EXCLUDED.normalized_path,
          last_seen_run_id = EXCLUDED.last_seen_run_id,
          updated_at = now()
      RETURNING id
    `,
    [scanTargetId, normalizedUrl, normalizedPath, scanRunId]
  );

  return result.rows[0].id;
}

async function upsertFinding(client, scanTargetId, scanRunId, finding) {
  const result = await client.query(
    `
      INSERT INTO findings (
        scan_target_id,
        fingerprint,
        rule_id,
        severity,
        status,
        first_seen_run_id,
        last_seen_run_id
      )
      VALUES ($1, $2, $3, $4, 'open', $5, $5)
      ON CONFLICT (scan_target_id, fingerprint)
      DO UPDATE
      SET rule_id = EXCLUDED.rule_id,
          severity = EXCLUDED.severity,
          last_seen_run_id = EXCLUDED.last_seen_run_id,
          updated_at = now()
      RETURNING id
    `,
    [scanTargetId, finding.fingerprint, finding.rule_id, finding.severity, scanRunId]
  );

  return result.rows[0].id;
}

async function upsertRuleMetadata(client, finding) {
  const ruleHelp = normalizeNullableText(finding.rule_help);
  const ruleDescription = normalizeNullableText(finding.rule_description);
  const ruleHelpUrl = normalizeNullableText(finding.rule_help_url);
  const ruleTags = Array.isArray(finding.rule_tags) ? finding.rule_tags.filter(Boolean) : [];

  if (!ruleHelp && !ruleDescription && !ruleHelpUrl && ruleTags.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO rule_metadata (
        rule_id,
        rule_help,
        rule_description,
        rule_help_url,
        rule_tags
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (rule_id)
      DO UPDATE
      SET rule_help = COALESCE(EXCLUDED.rule_help, rule_metadata.rule_help),
          rule_description = COALESCE(EXCLUDED.rule_description, rule_metadata.rule_description),
          rule_help_url = COALESCE(EXCLUDED.rule_help_url, rule_metadata.rule_help_url),
          rule_tags = CASE
            WHEN jsonb_array_length(EXCLUDED.rule_tags) = 0 THEN rule_metadata.rule_tags
            ELSE EXCLUDED.rule_tags
          END,
          updated_at = now()
    `,
    [
      finding.rule_id,
      ruleHelp,
      ruleDescription,
      ruleHelpUrl,
      JSON.stringify(ruleTags)
    ]
  );
}

async function insertFindingInstance(client, findingId, pageId, finding) {
  await client.query(
    `
      INSERT INTO finding_instances (
        finding_id,
        scan_run_id,
        page_id,
        rule_id,
        severity,
        raw_url,
        normalized_url,
        normalized_selector,
        raw_selector,
        snippet,
        failure_summary,
        snippet_hash,
        fingerprint,
        fingerprint_version,
        normalization_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (scan_run_id, finding_id, page_id, normalized_selector)
      DO NOTHING
    `,
    [
      findingId,
      finding.scan_run_id,
      pageId,
      finding.rule_id,
      finding.severity,
      finding.normalized_url,
      finding.normalized_selector,
      finding.raw_selector,
      finding.snippet,
      normalizeNullableText(finding.failure_summary),
      finding.snippet_hash,
      finding.fingerprint,
      finding.fingerprint_version,
      finding.normalization_version
    ]
  );
}

async function getPreviousFingerprints(client, scanTargetId, scanRunId) {
  const previousRunResult = await client.query(
    `
      SELECT previous.id
      FROM scan_runs current
      JOIN scan_runs previous ON previous.scan_target_id = current.scan_target_id
      WHERE current.id = $2
        AND previous.scan_target_id = $1
        AND previous.state = 'completed'
        AND previous.id <> current.id
        AND previous.completed_at IS NOT NULL
        AND previous.completed_at < current.started_at
      ORDER BY previous.completed_at DESC, previous.created_at DESC
      LIMIT 1
    `,
    [scanTargetId, scanRunId]
  );

  if (previousRunResult.rows.length === 0) {
    return new Set();
  }

  const result = await client.query(
    `
      SELECT DISTINCT f.fingerprint
      FROM finding_instances fi
      JOIN findings f ON f.id = fi.finding_id
      WHERE fi.scan_run_id = $1
    `,
    [previousRunResult.rows[0].id]
  );

  return new Set(result.rows.map((row) => row.fingerprint));
}

async function persistResult(job, result) {
  await withTransaction(async (client) => {
    const pageIdsByUrl = new Map();
    for (const page of result.pages) {
      const pageId = await upsertPage(client, job.payload.scan_target_id, job.payload.scan_run_id, page.url);
      pageIdsByUrl.set(page.url, pageId);
    }

    const currentFingerprints = new Set();
    for (const finding of result.findings) {
      currentFingerprints.add(finding.fingerprint);
      const pageId = pageIdsByUrl.get(finding.normalized_url);
      if (!pageId) {
        continue;
      }

      await upsertRuleMetadata(client, finding);
      const findingId = await upsertFinding(
        client,
        job.payload.scan_target_id,
        job.payload.scan_run_id,
        finding
      );
      await insertFindingInstance(client, findingId, pageId, finding);
    }

    const previousFingerprints = await getPreviousFingerprints(
      client,
      job.payload.scan_target_id,
      job.payload.scan_run_id
    );

    let newCount = 0;
    let persistentCount = 0;
    for (const fingerprint of currentFingerprints) {
      if (previousFingerprints.has(fingerprint)) {
        persistentCount += 1;
      } else {
        newCount += 1;
      }
    }

    let resolvedCount = 0;
    for (const fingerprint of previousFingerprints) {
      if (!currentFingerprints.has(fingerprint)) {
        resolvedCount += 1;
      }
    }

    await client.query(
      `
        UPDATE scan_runs
        SET state = $2,
            pages_scanned = $3,
            findings_total = $4,
            new_count = $5,
            resolved_count = $6,
            persistent_count = $7,
            completed_at = now(),
            scanner_context = $8::jsonb,
            compliance_profile_id = $9,
            compliance_profile_label = $10,
            compliance_profile_version = $11
        WHERE id = $1
      `,
      [
        job.payload.scan_run_id,
        result.run.state,
        result.pages.length,
        currentFingerprints.size,
        newCount,
        resolvedCount,
        persistentCount,
        JSON.stringify(result.run.scanner_context ?? {}),
        result.run.compliance_profile?.id ?? job.payload.compliance_profile?.id ?? null,
        result.run.compliance_profile?.label ?? job.payload.compliance_profile?.label ?? null,
        result.run.compliance_profile?.version ?? job.payload.compliance_profile?.version ?? null
      ]
    );

    await client.query(
      `
        UPDATE worker_jobs
        SET state = $2,
            last_error = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [
        job.id,
        result.run.state === "completed" ? "completed" : "failed",
        result.failures.length > 0 ? JSON.stringify(result.failures) : null
      ]
    );
  });
}

async function updateRunProgress(scanRunId, summary, scannerContext) {
  await pool.query(
    `
      UPDATE scan_runs
      SET state = 'running',
          pages_scanned = $2,
          findings_total = $3,
          scanner_context = $4::jsonb
      WHERE id = $1
    `,
    [
      scanRunId,
      summary.pages_scanned,
      summary.findings_total,
      JSON.stringify(scannerContext ?? {})
    ]
  );
}

async function failJob(job, error) {
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE worker_jobs
        SET state = 'failed',
            last_error = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [job.id, error.message]
    );

    await client.query(
      `
        UPDATE scan_runs
        SET state = 'failed',
            completed_at = now(),
            scanner_context = COALESCE($2::jsonb, scanner_context)
        WHERE id = $1
      `,
      [job.payload.scan_run_id, job.payload.scanner_context ? JSON.stringify(job.payload.scanner_context) : null]
    );
  });
}

let shuttingDown = false;
const scanner = createScannerAdapter(process.env.SCANNER_ADAPTER);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    shuttingDown = true;
    if (typeof scanner.close === "function") {
      await scanner.close();
    }
    await closePool();
    process.exit(0);
  });
}

while (!shuttingDown) {
  const job = await claimJob();
  if (!job) {
    await sleep(workerPollIntervalMs);
    continue;
  }

  try {
    const target = await loadScanTarget(job.payload.scan_target_id);
    const originalUrl = new URL(target.base_url);
    const resolvedBaseUrl = rewriteBaseUrlForDocker(target.base_url);
    const resolvedHost = new URL(resolvedBaseUrl).hostname.toLowerCase();
    const payload = {
      ...job.payload,
      base_url: resolvedBaseUrl,
      allowed_domains: [originalUrl.hostname.toLowerCase(), resolvedHost].filter((v, i, a) => a.indexOf(v) === i),
      scanner_context: resolveScannerContext({
        scannerContext: job.payload.scanner_context,
        adapterKind: process.env.SCANNER_ADAPTER
      })
    };

    const result = await executeScanJob(payload, {
      fetchPage: createHttpFetchPage(payload.scanner_context?.user_agent),
      scanner,
      onProgress: async (summary) => {
        await updateRunProgress(job.payload.scan_run_id, summary, payload.scanner_context);
      },
      timeoutMs: Number.parseInt(process.env.WORKER_FETCH_TIMEOUT_MS ?? "30000", 10),
      retryDelayMs: Number.parseInt(process.env.WORKER_RETRY_DELAY_MS ?? "250", 10)
    });

    await persistResult(job, result);
  } catch (error) {
    console.error("worker daemon failed job", error);
    await failJob(job, error);
  }
}
