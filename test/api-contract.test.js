import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRequestHandler } from "../src/app/create-server.js";
import { InMemoryRepository } from "../src/app/repositories/in-memory.js";
import { BackendService } from "../src/app/service.js";

const fixedNow = new Date("2026-03-12T18:00:00.000Z");
const defaultComplianceProfile = {
  id: "title_ii_2026",
  label: "Title II 2026",
  version: "cp-v1",
  standardTarget: "WCAG 2.1 AA",
  axeTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  isDefault: true
};
const enhancedComplianceProfile = {
  id: "enhanced_22_aa",
  label: "Enhanced 2.2 AA",
  version: "cp-v1",
  standardTarget: "WCAG 2.2 AA",
  axeTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  isDefault: false
};

function buildRepository(options = {}) {
  return new InMemoryRepository({
    scanTargets: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        siteKey: "example-gov",
        environment: "prod",
        branch: "main",
        baseUrl: "https://example.gov"
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        siteKey: "example-gov",
        environment: "staging",
        branch: "preview",
        baseUrl: "https://staging.example.gov"
      }
    ],
    scanRuns: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        mode: "path",
        state: "completed",
        reason: "Overlapping rerun",
        scanOptions: { max_pages: 20, max_depth: 2, concurrency: 2, retries: 1, path_allowlist: ["/forms"], path_denylist: [], query_param_allowlist: [] },
        scannerContext: {
          engine: "axe-core",
          engine_version: "4.10.0",
          browser: "chromium",
          browser_version: "134.0.0",
          viewport: "1440x900",
          user_agent: "fixture-agent",
          fingerprint_version: "fp-v1",
          normalization_version: "norm-v1"
        },
        pagesScanned: 1,
        findingsTotal: 1,
        newCount: 1,
        resolvedCount: 0,
        persistentCount: 0,
        complianceProfile: defaultComplianceProfile,
        startedAt: "2026-03-11T09:59:00.000Z",
        completedAt: "2026-03-11T10:02:00.000Z"
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        mode: "full",
        state: "completed",
        reason: "Baseline",
        scanOptions: { max_pages: 100, max_depth: 3, concurrency: 4, retries: 1, path_allowlist: [], path_denylist: [], query_param_allowlist: [] },
        scannerContext: {
          engine: "axe-core",
          engine_version: "4.10.0",
          browser: "chromium",
          browser_version: "134.0.0",
          viewport: "1440x900",
          user_agent: "fixture-agent",
          fingerprint_version: "fp-v1",
          normalization_version: "norm-v1"
        },
        pagesScanned: 2,
        findingsTotal: 2,
        newCount: 2,
        resolvedCount: 0,
        persistentCount: 0,
        complianceProfile: defaultComplianceProfile,
        startedAt: "2026-03-10T10:00:00.000Z",
        completedAt: "2026-03-10T10:05:00.000Z"
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        mode: "full",
        state: "completed",
        reason: "Comparison",
        scanOptions: { max_pages: 100, max_depth: 3, concurrency: 4, retries: 1, path_allowlist: [], path_denylist: [], query_param_allowlist: [] },
        scannerContext: {
          engine: "axe-core",
          engine_version: "4.10.0",
          browser: "chromium",
          browser_version: "134.0.0",
          viewport: "1440x900",
          user_agent: "fixture-agent",
          fingerprint_version: "fp-v1",
          normalization_version: "norm-v1"
        },
        pagesScanned: 4,
        findingsTotal: 4,
        newCount: 3,
        resolvedCount: 1,
        persistentCount: 1,
        complianceProfile: enhancedComplianceProfile,
        startedAt: "2026-03-11T10:00:00.000Z",
        completedAt: "2026-03-11T10:09:00.000Z"
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        scanTargetId: "22222222-2222-4222-8222-222222222222",
        mode: "path",
        state: "running",
        reason: "Preview spot check",
        scanOptions: { max_pages: 10, max_depth: 1, concurrency: 2, retries: 0, path_allowlist: ["/preview"], path_denylist: [], query_param_allowlist: [] },
        scannerContext: {
          engine: "axe-core",
          engine_version: "4.10.0",
          browser: "chromium",
          browser_version: "134.0.0",
          viewport: "1440x900",
          user_agent: "fixture-agent",
          fingerprint_version: "fp-v1",
          normalization_version: "norm-v1"
        },
        pagesScanned: 1,
        findingsTotal: 0,
        newCount: 0,
        resolvedCount: 0,
        persistentCount: 0,
        complianceProfile: defaultComplianceProfile,
        startedAt: "2026-03-12T08:00:00.000Z",
        completedAt: null
      }
    ],
    findings: [
      {
        id: "44444444-4444-4444-8444-444444444441",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-persistent",
        ruleId: "color-contrast",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444442",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-resolved",
        ruleId: "image-alt",
        severity: "moderate",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444443",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-new",
        ruleId: "label",
        severity: "critical",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444446",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-overlap-only",
        ruleId: "aria-required-children",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-expired-ignore",
        ruleId: "heading-order",
        severity: "minor",
        status: "ignored",
        ignoreExpiresAt: "2026-03-11T12:00:00.000Z"
      },
      {
        id: "44444444-4444-4444-8444-444444444445",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-active-ignore",
        ruleId: "duplicate-id",
        severity: "moderate",
        status: "ignored",
        ignoreExpiresAt: "2026-03-20T12:00:00.000Z"
      }
    ],
    findingInstances: [
      {
        id: "55555555-5555-4555-8555-555555555550",
        findingId: "44444444-4444-4444-8444-444444444446",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0",
        pageId: "page-2",
        rawUrl: "https://example.gov/forms/contact",
        normalizedUrl: "https://example.gov/forms/contact",
        normalizedSelector: "form fieldset",
        snippet: "Missing required child role",
        detectedAt: "2026-03-11T10:01:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555551",
        findingId: "44444444-4444-4444-8444-444444444441",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        pageId: "page-1",
        rawUrl: "https://example.gov/home",
        normalizedUrl: "https://example.gov/home",
        normalizedSelector: "main .hero a",
        snippet: "Need more contrast",
        failureSummary: "Element text is below the required contrast ratio.",
        detectedAt: "2026-03-10T10:03:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555552",
        findingId: "44444444-4444-4444-8444-444444444442",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        pageId: "page-2",
        rawUrl: "https://example.gov/forms/contact",
        normalizedUrl: "https://example.gov/forms/contact",
        normalizedSelector: "img.hero",
        snippet: "Missing alt text",
        detectedAt: "2026-03-10T10:04:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555553",
        findingId: "44444444-4444-4444-8444-444444444441",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-1",
        rawUrl: "https://example.gov/home",
        normalizedUrl: "https://example.gov/home",
        normalizedSelector: "main .hero a",
        snippet: "Still low contrast",
        failureSummary: "Contrast remains below 4.5:1 for normal text.",
        detectedAt: "2026-03-11T10:03:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555554",
        findingId: "44444444-4444-4444-8444-444444444443",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-2",
        rawUrl: "https://example.gov/forms/contact",
        normalizedUrl: "https://example.gov/forms/contact",
        normalizedSelector: "form label",
        snippet: "Input missing label",
        failureSummary: "Form control does not have an associated accessible label.",
        detectedAt: "2026-03-11T10:05:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555557",
        findingId: "44444444-4444-4444-8444-444444444446",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-2",
        rawUrl: "https://example.gov/forms/contact",
        normalizedUrl: "https://example.gov/forms/contact",
        normalizedSelector: "form fieldset",
        snippet: "Still missing required child role",
        detectedAt: "2026-03-11T10:05:30.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        findingId: "44444444-4444-4444-8444-444444444444",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-1",
        rawUrl: "https://example.gov/home",
        normalizedUrl: "https://example.gov/home",
        normalizedSelector: "main h3",
        snippet: "Skipped heading level",
        detectedAt: "2026-03-11T10:06:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555556",
        findingId: "44444444-4444-4444-8444-444444444445",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-2",
        rawUrl: "https://example.gov/forms/contact",
        normalizedUrl: "https://example.gov/forms/contact",
        normalizedSelector: "#contact-form",
        snippet: "Duplicate id contact-form",
        detectedAt: "2026-03-11T10:07:00.000Z"
      }
    ],
    ruleMetadata: [
      {
        ruleId: "color-contrast",
        ruleHelp: "Elements must meet minimum color contrast ratio thresholds",
        ruleDescription: "Low-contrast text can be unreadable for users with low vision.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        ruleTags: ["wcag2aa", "wcag143"]
      },
      {
        ruleId: "label",
        ruleHelp: "Form elements must have labels",
        ruleDescription: "Inputs need accessible labels so assistive technology can announce purpose.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.11/label",
        ruleTags: ["wcag2a", "wcag412"]
      },
      {
        ruleId: "aria-required-children",
        ruleHelp: "Certain ARIA roles must contain particular children",
        ruleDescription: "Composite widgets need required owned elements to expose structure.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.11/aria-required-children",
        ruleTags: ["wcag2a", "wcag412"]
      }
    ]
  }, options);
}

function createMockRequest({ method, path, body }) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(payload);
  request.method = method;
  request.url = path;
  request.headers = {
    host: "local.test"
  };
  return request;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

async function withApi(fn, repositoryOptions = {}) {
  const repository = buildRepository(repositoryOptions);
  const service = new BackendService({
    repository,
    scanOptionsDefaults: {
      max_pages: 25,
      max_depth: 3,
      concurrency: 2,
      retries: 1,
      path_allowlist: [],
      path_denylist: [],
      query_param_allowlist: []
    },
    scannerContext: {
      engine: "axe-core",
      engine_version: "4.10.0",
      browser: "chromium",
      browser_version: "134.0.0",
      viewport: "1440x900",
      user_agent: "fixture-agent",
      fingerprint_version: "fp-v1",
      normalization_version: "norm-v1"
    },
    now: () => new Date(fixedNow)
  });
  const handler = createRequestHandler({ service });

  async function request(method, path, body) {
    const mockRequest = createMockRequest({ method, path, body });
    const mockResponse = createMockResponse();
    await handler(mockRequest, mockResponse);

    return {
      status: mockResponse.statusCode,
      headers: mockResponse.headers,
      json: async () => JSON.parse(mockResponse.body),
      text: async () => mockResponse.body
    };
  }

  try {
    await fn({ repository, request });
  } finally {
    await Promise.resolve();
  }
}

test("scan run creation endpoints return contract-shaped envelopes", async () => {
  await withApi(async ({ request }) => {
    const fullResponse = await request("POST", "/scan-runs", {
        scan_target: {
          site_key: "example-gov",
          environment: "prod",
          branch: "main",
          base_url: "https://example.gov"
        },
        reason: "Nightly full scan"
    });

    assert.equal(fullResponse.status, 202);
    const fullPayload = await fullResponse.json();
    assert.equal(fullPayload.run.mode, "full");
    assert.equal(fullPayload.run.state, "queued");
    assert.deepEqual(fullPayload.run.summary, {
      pages_scanned: 0,
      findings_total: 0,
      new_count: 0,
      resolved_count: 0,
      persistent_count: 0
    });

    const pageResponse = await request("POST", "/scan-runs/rescan-page", {
        scan_target: {
          site_key: "example-gov",
          environment: "prod",
          branch: "main",
          base_url: "https://example.gov"
        },
        page_url: "https://example.gov/forms/contact"
    });
    assert.equal(pageResponse.status, 202);
    assert.equal((await pageResponse.json()).run.mode, "page");

    const pathResponse = await request("POST", "/scan-runs/rescan-path", {
        scan_target: {
          site_key: "example-gov",
          environment: "prod",
          branch: "main",
          base_url: "https://example.gov"
        },
        path_prefix: "/forms"
    });
    assert.equal(pathResponse.status, 202);
    assert.equal((await pathResponse.json()).run.mode, "path");
  });
});

test("scan run list and detail endpoints expose lifecycle summaries", async () => {
  await withApi(async ({ request }) => {
    const listResponse = await request(
      "GET",
      "/scan-runs?site_key=example-gov&environment=prod&branch=main&page=1&page_size=5"
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.total, 3);
    assert.equal(listPayload.items[0].id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");

    const detailResponse = await request("GET", "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.run.summary.new_count, 3);
    assert.equal(detailPayload.run.summary.resolved_count, 1);
    assert.equal(detailPayload.run.summary.persistent_count, 1);
    assert.equal(detailPayload.run.scan_options.max_pages, 100);
    assert.equal(detailPayload.run.reason, "Comparison");
    assert.equal(detailPayload.run.compliance_profile.id, "enhanced_22_aa");
  });
});

test("compliance profiles endpoint and scan creation expose persisted profile identity", async () => {
  await withApi(async ({ request }) => {
    const profilesResponse = await request("GET", "/compliance-profiles");
    assert.equal(profilesResponse.status, 200);
    const profilesPayload = await profilesResponse.json();
    assert.equal(profilesPayload.default_profile_id, "title_ii_2026");
    assert.equal(profilesPayload.items.length, 4);
    assert.equal(
      profilesPayload.items.find((item) => item.id === "title_ii_2026").is_default,
      true
    );

    const createResponse = await request("POST", "/scan-runs", {
      scan_target: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        base_url: "https://example.gov"
      },
      reason: "Profiled run",
      compliance_profile_id: "advisory_best_practice"
    });
    assert.equal(createResponse.status, 202);

    const createPayload = await createResponse.json();
    assert.equal(createPayload.run.compliance_profile.id, "advisory_best_practice");
    assert.deepEqual(createPayload.run.compliance_profile.axe_tags, [
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "best-practice"
    ]);
  });
});

test("scan target endpoints list and upsert targets with existing validation rules", async () => {
  await withApi(async ({ repository, request }) => {
    const listResponse = await request("GET", "/scan-targets?page=1&page_size=10");
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.total, 2);
    assert.equal(listPayload.items[0].site_key, "example-gov");

    const upsertResponse = await request("PUT", "/scan-targets", {
      scan_target: {
        site_key: "example-gov",
        environment: "prod",
        branch: "main",
        base_url: "https://www.example.gov"
      }
    });
    assert.equal(upsertResponse.status, 200);
    const upsertPayload = await upsertResponse.json();
    assert.equal(upsertPayload.scan_target.base_url, "https://www.example.gov");

    const storedTarget = await repository.getScanTarget({
      siteKey: "example-gov",
      environment: "prod",
      branch: "main"
    });
    assert.equal(storedTarget.baseUrl, "https://www.example.gov");

    const createResponse = await request("PUT", "/scan-targets", {
      scan_target: {
        site_key: "new-docs",
        environment: "prod",
        branch: "main",
        base_url: "https://docs.example.gov"
      }
    });
    assert.equal(createResponse.status, 200);
    assert.equal((await createResponse.json()).scan_target.site_key, "new-docs");

    const filteredList = await request("GET", "/scan-targets?site_key=new-docs");
    assert.equal(filteredList.status, 200);
    assert.equal((await filteredList.json()).total, 1);

    const invalidResponse = await request("PUT", "/scan-targets", {
      scan_target: {
        site_key: "bad-docs",
        environment: "prod",
        branch: "main",
        base_url: "not-a-url"
      }
    });
    assert.equal(invalidResponse.status, 400);
  });
});

test("completed runs can be deleted and active runs are rejected", async () => {
  await withApi(async ({ repository, request }) => {
    const runningResponse = await request("DELETE", "/scan-runs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1");
    assert.equal(runningResponse.status, 409);

    const deleteResponse = await request("DELETE", "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    assert.equal(deleteResponse.status, 204);

    const deletedRun = await repository.getScanRun("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    assert.equal(deletedRun, null);

    const findingsResponse = await request(
      "GET",
      "/findings?site_key=example-gov&environment=prod&branch=main&rule_id=image-alt"
    );
    assert.equal(findingsResponse.status, 200);
    const findingsPayload = await findingsResponse.json();
    assert.equal(findingsPayload.total, 0);
  });
});

test("run findings endpoint returns diff states and supports diff-aware filters", async () => {
  await withApi(async ({ request }) => {
    const resolvedResponse = await request(
      "GET",
      "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/findings?diff_status=resolved"
    );
    assert.equal(resolvedResponse.status, 200);
    const resolvedPayload = await resolvedResponse.json();
    assert.equal(resolvedPayload.total, 1);
    assert.equal(resolvedPayload.items[0].diff_status, "resolved");
    assert.equal(resolvedPayload.items[0].rule_id, "image-alt");

    const ignoredResponse = await request(
      "GET",
      "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/findings?status=ignored&path_prefix=/forms"
    );
    assert.equal(ignoredResponse.status, 200);
    const ignoredPayload = await ignoredResponse.json();
    assert.equal(ignoredPayload.total, 1);
    assert.equal(ignoredPayload.items[0].rule_id, "duplicate-id");
    assert.equal(ignoredPayload.items[0].diff_status, "new");
  });
});

test("run findings diff ignores runs that completed after the current run started", async () => {
  await withApi(async ({ request }) => {
    const response = await request(
      "GET",
      "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/findings?rule_id=aria-required-children"
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.total, 1);
    assert.equal(payload.items[0].rule_id, "aria-required-children");
    assert.equal(payload.items[0].diff_status, "new");
  });
});

test("findings endpoint filters across runs and expires ignored findings automatically", async () => {
  await withApi(async ({ repository, request }) => {
    const response = await request(
      "GET",
      "/findings?site_key=example-gov&environment=prod&branch=main&status=open&path_prefix=/home"
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.total, 2);
    assert.deepEqual(
      payload.items.map((item) => item.rule_id).sort(),
      ["color-contrast", "heading-order"]
    );

    const expiredFinding = await repository.getFinding("44444444-4444-4444-8444-444444444444");
    assert.equal(expiredFinding.finding.status, "open");
    assert.equal(expiredFinding.finding.ignoreExpiresAt, null);

    const statusEvents = await repository.listStatusEvents("44444444-4444-4444-8444-444444444444");
    assert.equal(statusEvents.length, 1);
    assert.equal(statusEvents[0].newStatus, "open");
  });
});

test("status transition endpoint enforces ignore expiration workflow", async () => {
  await withApi(async ({ repository, request }) => {
    const invalidResponse = await request(
      "PATCH",
      "/findings/44444444-4444-4444-8444-444444444443/status",
      { status: "ignored" }
    );
    assert.equal(invalidResponse.status, 400);

    const ignoreResponse = await request(
      "PATCH",
      "/findings/44444444-4444-4444-8444-444444444443/status",
      {
        status: "ignored",
        note: "Third-party widget blocks remediation until vendor fix.",
        ignore_expires_at: "2026-03-18T12:00:00.000Z"
      }
    );
    assert.equal(ignoreResponse.status, 200);
    const ignorePayload = await ignoreResponse.json();
    assert.equal(ignorePayload.finding.status, "ignored");
    assert.equal(ignorePayload.finding.ignore_expires_at, "2026-03-18T12:00:00.000Z");

    const resolveResponse = await request(
      "PATCH",
      "/findings/44444444-4444-4444-8444-444444444443/status",
      {
        status: "resolved",
        note: "Patched in application code."
      }
    );
    assert.equal(resolveResponse.status, 200);
    const resolvePayload = await resolveResponse.json();
    assert.equal(resolvePayload.finding.status, "resolved");
    assert.equal(resolvePayload.finding.ignore_expires_at, null);

    const updatedFinding = await repository.getFinding("44444444-4444-4444-8444-444444444443");
    assert.equal(updatedFinding.finding.status, "resolved");
    assert.equal(updatedFinding.finding.ignoreExpiresAt, null);

    const events = await repository.listStatusEvents("44444444-4444-4444-8444-444444444443");
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((event) => event.newStatus).sort(),
      ["ignored", "resolved"]
    );
  });
});

test("finding detail endpoint returns scan target metadata and status history", async () => {
  await withApi(async ({ request }) => {
    const updateResponse = await request(
      "PATCH",
      "/findings/44444444-4444-4444-8444-444444444441/status",
      {
        status: "in_progress",
        note: "Assigned to the forms team."
      }
    );
    assert.equal(updateResponse.status, 200);

    const detailResponse = await request("GET", "/findings/44444444-4444-4444-8444-444444444441");
    assert.equal(detailResponse.status, 200);
    const payload = await detailResponse.json();

    assert.equal(payload.finding.scan_target.site_key, "example-gov");
    assert.equal(payload.finding.scan_target.branch, "main");
    assert.equal(payload.finding.status, "in_progress");
    assert.equal(payload.finding.rule_metadata.rule_id, "color-contrast");
    assert.equal(
      payload.finding.latest_instance.failure_summary,
      "Contrast remains below 4.5:1 for normal text."
    );
    assert.equal(payload.status_history.length, 1);
    assert.equal(payload.status_history[0].new_status, "in_progress");
  });
});

test("run HVT groups summarize repeated findings with run profile context", async () => {
  await withApi(async ({ request }) => {
    const response = await request(
      "GET",
      "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/hvt-groups?group_level=section_cluster"
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.scan_run_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(payload.compliance_profile.id, "enhanced_22_aa");
    assert.equal(payload.group_level, "section_cluster");
    assert.equal(payload.total, 5);
    assert.equal(payload.items[0].group_level, "section_cluster");
    assert.equal(payload.items[0].highest_severity, "critical");
    assert.equal(payload.items[0].path_prefix, "/forms");
    assert.equal(payload.items[0].finding_count, 1);
    assert.equal(payload.items[0].affected_pages, 1);
    assert.equal(payload.items[0].affected_runs, 1);
    assert.equal(payload.items[0].sample_urls[0], "https://example.gov/forms/contact");

    const persistentGroup = payload.items.find((item) => item.rule_id === "color-contrast");
    assert.equal(persistentGroup.affected_runs, 1);
    assert.equal(persistentGroup.last_seen_at, "2026-03-11T10:03:00.000Z");
  });
});

test("run HVT groups support fix-surface clustering with remediation hints", async () => {
  await withApi(async ({ request }) => {
    const response = await request(
      "GET",
      "/scan-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/hvt-groups?group_level=fix_surface_cluster"
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.group_level, "fix_surface_cluster");
    assert.ok(payload.items.length > 0);
    assert.equal(typeof payload.items[0].likely_fix_surface, "string");
    assert.equal(typeof payload.items[0].suggested_first_look, "string");
  });
});

test("dashboard assets are served by the app", async () => {
  await withApi(async ({ request }) => {
    const htmlResponse = await request("GET", "/dashboard");
    assert.equal(htmlResponse.status, 200);
    assert.match(htmlResponse.headers["content-type"], /text\/html/);
    assert.match(await htmlResponse.text(), /WCAG-Guide Dashboard/);

    const jsResponse = await request("GET", "/dashboard.js");
    assert.equal(jsResponse.status, 200);
    assert.match(jsResponse.headers["content-type"], /text\/javascript/);
    assert.match(await jsResponse.text(), /loadRunDetail/);
  });
});

test("status transition rollback prevents partial finding updates when event persistence fails", async () => {
  await withApi(async ({ repository, request }) => {
    const response = await request(
      "PATCH",
      "/findings/44444444-4444-4444-8444-444444444443/status",
      {
        status: "resolved",
        note: "This should fail atomically."
      }
    );

    assert.equal(response.status, 500);

    const finding = await repository.getFinding("44444444-4444-4444-8444-444444444443");
    assert.equal(finding.finding.status, "open");
    assert.equal(finding.finding.ignoreExpiresAt, null);

    const events = await repository.listStatusEvents("44444444-4444-4444-8444-444444444443");
    assert.equal(events.length, 0);
  }, { failStatusUpdateTransaction: true });
});

test("page_size above contract limit is rejected", async () => {
  await withApi(async ({ request }) => {
    const response = await request("GET", "/findings?page_size=201");
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, "bad_request");
    assert.match(payload.error.message, /page_size/);
  });
});
