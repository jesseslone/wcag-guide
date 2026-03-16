import { buildFindingFingerprint } from "../shared/fingerprint.js";
import { resolveComplianceProfile } from "../shared/compliance-profiles.js";
import { normalizeUrl } from "../shared/url-normalization.js";
import { validateWorkerJobPayload } from "./job-schema.js";
import { extractLinksFromHtml } from "./link-extractor.js";
import { createNoopScannerAdapter } from "./scanner-adapters.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const nonHtmlExtensions = new Set([
  ".7z",
  ".avi",
  ".bmp",
  ".csv",
  ".doc",
  ".docx",
  ".epub",
  ".gif",
  ".gz",
  ".jpeg",
  ".jpg",
  ".json",
  ".mov",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".odp",
  ".ods",
  ".odt",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rar",
  ".rtf",
  ".svg",
  ".tar",
  ".tgz",
  ".tif",
  ".tiff",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".xls",
  ".xlsx",
  ".xml",
  ".zip"
]);

function getPathExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf(".");
    const lastSlash = pathname.lastIndexOf("/");
    if (lastDot <= lastSlash) {
      return "";
    }
    return pathname.slice(lastDot).toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyHtmlUrl(url) {
  const extension = getPathExtension(url);
  return extension === "" || !nonHtmlExtensions.has(extension);
}

function isHtmlLikeContentType(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return true;
  }

  const normalized = value.toLowerCase();
  return normalized.includes("text/html")
    || normalized.includes("application/xhtml+xml");
}

function normalizeJobOptions(job) {
  return {
    baseUrl: job.base_url,
    allowedDomains: job.allowed_domains ?? [],
    pathAllowlist: job.scan_options.path_allowlist ?? [],
    pathDenylist: job.scan_options.path_denylist ?? [],
    queryParamAllowlist: job.scan_options.query_param_allowlist ?? []
  };
}

function createRunSummary() {
  return {
    pages_scanned: 0,
    findings_total: 0,
    new_count: 0,
    resolved_count: 0,
    persistent_count: 0
  };
}

function mapRawFinding({ rawFinding, pageUrl, normalizationOptions, scanRunId }) {
  const ruleId = rawFinding.ruleId ?? rawFinding.rule_id;
  const severity = rawFinding.severity ?? "moderate";
  const selector = rawFinding.selector ?? rawFinding.target ?? "";
  const snippet = rawFinding.snippet ?? rawFinding.html ?? "";
  const fingerprintResult = buildFindingFingerprint({
    ruleId,
    pageUrl,
    domSelector: selector,
    htmlSnippet: snippet,
    normalizationOptions
  });

  return {
    rule_id: ruleId,
    severity,
    fingerprint: fingerprintResult.fingerprint,
    fingerprint_version: fingerprintResult.fingerprintVersion,
    normalization_version: fingerprintResult.normalizationVersion,
    raw_selector: selector,
    normalized_selector: fingerprintResult.components.normalizedSelector,
    snippet,
    failure_summary: rawFinding.failure_summary ?? rawFinding.summary ?? "",
    rule_help: rawFinding.rule_help ?? "",
    rule_description: rawFinding.rule_description ?? "",
    rule_help_url: rawFinding.rule_help_url ?? "",
    rule_tags: Array.isArray(rawFinding.rule_tags) ? [...rawFinding.rule_tags] : [],
    snippet_hash: fingerprintResult.components.snippetHash,
    normalized_url: fingerprintResult.components.normalizedUrl,
    scan_run_id: scanRunId
  };
}

async function fetchPageWithRetry(url, { fetchPage, retries, timeoutMs, retryDelayMs }) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Timeout fetching ${url}`)), timeoutMs);

    try {
      const page = await fetchPage(url, { signal: controller.signal });
      clearTimeout(timeout);
      return page;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError;
}

function shouldVisitNormalizedUrl(normalizedUrl, { seenUrls, enqueuedUrls, maxPages }) {
  if (seenUrls.has(normalizedUrl) || enqueuedUrls.has(normalizedUrl)) {
    return false;
  }
  return seenUrls.size + enqueuedUrls.size < maxPages;
}

function buildSeedList(job) {
  if (Array.isArray(job.seed_urls) && job.seed_urls.length > 0) {
    return job.seed_urls;
  }

  if (job.base_url) {
    return [job.base_url];
  }

  return [];
}

function enqueueUrl(queue, normalizedCandidate, depth, state, maxPages) {
  if (!isLikelyHtmlUrl(normalizedCandidate.normalizedUrl)) {
    return false;
  }
  if (!shouldVisitNormalizedUrl(normalizedCandidate.normalizedUrl, { ...state, maxPages })) {
    return false;
  }
  state.enqueuedUrls.add(normalizedCandidate.normalizedUrl);
  queue.push({
    rawUrl: normalizedCandidate.normalizedUrl,
    normalizedUrl: normalizedCandidate.normalizedUrl,
    depth
  });
  return true;
}

function extractChildCandidates(html, pageUrl, normalizationOptions) {
  const rawLinks = extractLinksFromHtml(html);
  const candidates = [];

  for (const link of rawLinks) {
    const normalized = normalizeUrl(link, {
      ...normalizationOptions,
      baseUrl: pageUrl
    });
    if (normalized.ok) {
      candidates.push(normalized);
    }
  }

  return candidates;
}

export async function executeScanJob(job, dependencies = {}) {
  const validation = validateWorkerJobPayload(job);
  if (!validation.valid) {
    throw new Error(`Invalid worker job payload: ${validation.errors.join("; ")}`);
  }

  const fetchPage = dependencies.fetchPage;
  if (typeof fetchPage !== "function") {
    throw new Error("executeScanJob requires dependencies.fetchPage");
  }

  const scanner = dependencies.scanner ?? createNoopScannerAdapter();
  const timeoutMs = dependencies.timeoutMs ?? 5000;
  const retryDelayMs = dependencies.retryDelayMs ?? 10;
  const onProgress = typeof dependencies.onProgress === "function" ? dependencies.onProgress : null;
  const normalizationOptions = normalizeJobOptions(job);
  const complianceProfile = resolveComplianceProfile(job.compliance_profile);
  const queue = [];
  const state = {
    seenUrls: new Set(),
    enqueuedUrls: new Set()
  };
  const visitedPages = [];
  const findings = [];
  const failures = [];
  const summary = createRunSummary();
  const discoveredLinks = new Set();

  for (const seedUrl of buildSeedList(job)) {
    const normalized = normalizeUrl(seedUrl, normalizationOptions);
    if (normalized.ok) {
      enqueueUrl(queue, normalized, 0, state, job.scan_options.max_pages);
    }
  }

  while (queue.length > 0 && summary.pages_scanned < job.scan_options.max_pages) {
    const batch = queue.splice(0, job.scan_options.concurrency);
    const results = await Promise.all(
      batch.map(async (queueItem) => {
        state.enqueuedUrls.delete(queueItem.normalizedUrl);
        if (state.seenUrls.has(queueItem.normalizedUrl)) {
          return null;
        }

        state.seenUrls.add(queueItem.normalizedUrl);

        try {
          const page = await fetchPageWithRetry(queueItem.rawUrl, {
            fetchPage,
            retries: job.scan_options.retries,
            timeoutMs,
            retryDelayMs
          });
          return { queueItem, page };
        } catch (error) {
          failures.push({
            url: queueItem.normalizedUrl,
            depth: queueItem.depth,
            error: error instanceof Error ? error.message : String(error)
          });
          return null;
        }
      })
    );

    let progressed = false;
    for (const result of results) {
      if (result == null) {
        continue;
      }

      const { queueItem, page } = result;
      if (!isLikelyHtmlUrl(queueItem.normalizedUrl) || !isHtmlLikeContentType(page.contentType)) {
        continue;
      }

      progressed = true;
      summary.pages_scanned += 1;
      const html = page.html ?? "";

      visitedPages.push({
        url: queueItem.normalizedUrl,
        depth: queueItem.depth,
        status_code: page.status ?? 200
      });

        const rawFindings = await scanner.scanPage({
          url: queueItem.normalizedUrl,
          html,
          scannerContext: job.scanner_context,
          job: {
            ...job,
            compliance_profile: complianceProfile
          }
        });

      for (const rawFinding of rawFindings) {
        const finding = mapRawFinding({
          rawFinding,
          pageUrl: queueItem.normalizedUrl,
          normalizationOptions,
          scanRunId: job.scan_run_id
        });
        findings.push(finding);
      }

      summary.findings_total = findings.length;

      if (queueItem.depth >= job.scan_options.max_depth) {
        continue;
      }

      for (const child of extractChildCandidates(html, queueItem.normalizedUrl, normalizationOptions)) {
        if (job.mode === "path" && !child.normalizedPath.startsWith(job.path_prefix)) {
          continue;
        }
        const enqueued = enqueueUrl(queue, child, queueItem.depth + 1, state, job.scan_options.max_pages);
        if (enqueued) {
          discoveredLinks.add(child.normalizedUrl);
        }
      }
    }

    if (progressed && onProgress) {
      await onProgress({
        ...summary
      });
    }
  }

  const runState = summary.pages_scanned === 0 && failures.length > 0 ? "failed" : "completed";

  return {
    run: {
      id: job.scan_run_id,
      mode: job.mode,
      state: runState,
      scanner_context: job.scanner_context,
      compliance_profile: complianceProfile,
      summary
    },
    pages: visitedPages,
    findings,
    failures,
    discovered_links: [...discoveredLinks]
  };
}
