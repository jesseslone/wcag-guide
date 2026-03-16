import { ApiError } from "../app/errors.js";

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function dedupe(values) {
  return Array.from(new Set(values));
}

function normalizeBaseUrl(value) {
  if (!value) {
    throw new Error("baseUrl is required");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid base URL: ${value}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`unsupported base URL protocol: ${url.protocol}`);
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";

  return trimTrailingSlash(url.toString());
}

function buildFallbackBaseUrls(baseUrl) {
  const primary = new URL(baseUrl);
  const candidates = [primary.toString()];
  const loopbackHosts = new Set(["127.0.0.1", "localhost"]);

  if (!loopbackHosts.has(primary.hostname)) {
    return dedupe(candidates.map(trimTrailingSlash));
  }

  for (const hostname of [
    "127.0.0.1",
    "localhost",
    "host.docker.internal",
    "host.containers.internal",
    "gateway.docker.internal",
    "wcag_guide_app",
    "app"
  ]) {
    const candidate = new URL(primary.toString());
    candidate.hostname = hostname;
    candidates.push(candidate.toString());
  }

  return dedupe(candidates.map(trimTrailingSlash));
}

function isNetworkError(error) {
  const code = error?.cause?.code ?? error?.code;
  return (
    error instanceof TypeError ||
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ENOTFOUND",
      "EPERM",
      "ETIMEDOUT"
    ].includes(code)
  );
}

function appendQuery(url, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON response from ${response.url}`);
  }
}

export class HttpServiceClient {
  constructor({ baseUrl, baseUrls, fetchImpl = globalThis.fetch }) {
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch implementation is required");
    }

    const candidates = dedupe(
      (baseUrls?.length ? baseUrls : buildFallbackBaseUrls(normalizeBaseUrl(baseUrl))).map(
        normalizeBaseUrl
      )
    );

    if (candidates.length === 0) {
      throw new Error("at least one base URL is required");
    }

    this.baseUrls = candidates;
    this.activeBaseUrl = candidates[0];
    this.fetchImpl = fetchImpl;
  }

  async request(method, path, { query, body, expectedStatus } = {}) {
    const orderedBaseUrls = [
      this.activeBaseUrl,
      ...this.baseUrls.filter((candidate) => candidate !== this.activeBaseUrl)
    ];
    const errors = [];

    for (const baseUrl of orderedBaseUrls) {
      const url = new URL(`${baseUrl}${path}`);
      appendQuery(url, query);

      let response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (error) {
        if (isNetworkError(error)) {
          errors.push({
            baseUrl,
            message: error.message
          });
          continue;
        }
        throw error;
      }

      this.activeBaseUrl = baseUrl;

      if (expectedStatus && response.status !== expectedStatus) {
        const payload = await readJson(response).catch(() => ({}));
        throw new ApiError(
          response.status,
          payload.error?.code ?? "internal_error",
          payload.error?.message ?? `unexpected status ${response.status}`
        );
      }

      if (!response.ok) {
        const payload = await readJson(response).catch(() => ({}));
        throw new ApiError(
          response.status,
          payload.error?.code ?? "internal_error",
          payload.error?.message ?? response.statusText
        );
      }

      if (response.status === 204) {
        return undefined;
      }

      return readJson(response);
    }

    throw new ApiError(
      503,
      "upstream_unreachable",
      `unable to reach application API at ${orderedBaseUrls.join(", ")}`
    );
  }

  async listAllPages(path, query = {}) {
    const items = [];
    let page = 1;
    let total = null;

    while (true) {
      const payload = await this.request("GET", path, {
        query: {
          ...query,
          page,
          page_size: 200
        }
      });

      items.push(...(payload.items ?? []));
      total = payload.total ?? items.length;

      if (items.length >= total || (payload.items ?? []).length === 0) {
        return items;
      }

      page += 1;
    }
  }

  async listComplianceProfiles() {
    return this.request("GET", "/compliance-profiles");
  }

  async listAllScanTargets(query = {}) {
    return this.listAllPages("/scan-targets", query);
  }

  async upsertScanTarget(body) {
    return this.request("PUT", "/scan-targets", {
      body
    });
  }

  async createScanRun(body, mode) {
    const path = mode === "full"
      ? "/scan-runs"
      : mode === "page"
        ? "/scan-runs/rescan-page"
        : "/scan-runs/rescan-path";

    return this.request("POST", path, {
      body,
      expectedStatus: 202
    });
  }

  async listAllScanRuns(query = {}) {
    return this.listAllPages("/scan-runs", query);
  }

  async getScanRun(scanRunId) {
    return this.request("GET", `/scan-runs/${scanRunId}`);
  }

  async getScanTarget(scanTarget) {
    const targets = await this.listAllScanTargets(scanTarget);
    const match = targets.find(
      (candidate) =>
        candidate.site_key === scanTarget.site_key &&
        candidate.environment === scanTarget.environment &&
        candidate.branch === scanTarget.branch
    );

    if (!match) {
      throw new ApiError(404, "not_found", "scan target not found");
    }

    return {
      scan_target: match
    };
  }

  async listAllRunFindings(scanRunId, query = {}) {
    return this.listAllPages(`/scan-runs/${scanRunId}/findings`, query);
  }

  async listRunHvtGroups(scanRunId, query = {}) {
    return this.request("GET", `/scan-runs/${scanRunId}/hvt-groups`, {
      query
    });
  }

  async listAllFindings(query = {}) {
    return this.listAllPages("/findings", query);
  }

  async getFinding(findingId) {
    return this.request("GET", `/findings/${findingId}`);
  }

  async updateFindingStatus(findingId, body, options = {}) {
    return this.request("PATCH", `/findings/${findingId}/status`, {
      body: {
        ...body,
        ...(options.changedBy ? { changed_by: options.changedBy } : {})
      }
    });
  }
}
