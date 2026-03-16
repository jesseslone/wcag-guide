import test from "node:test";
import assert from "node:assert/strict";

import {
  createFullScanJob,
  createPageRescanJob,
  createStaticScannerAdapter,
  executeScanJob,
  getDefaultComplianceProfile
} from "../src/worker/index.js";

const scanOptions = {
  max_pages: 4,
  max_depth: 2,
  concurrency: 2,
  retries: 1,
  path_allowlist: ["/docs"],
  path_denylist: ["/docs/private"],
  query_param_allowlist: ["lang"]
};

test("crawler dedupes normalized URLs and respects caps", async () => {
  const job = createFullScanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions,
    seedUrls: ["https://docs.example.com/docs"]
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  const pages = {
    "https://docs.example.com/docs": {
      status: 200,
      html: `
        <a href="/docs/guide?utm_source=x&lang=en">Guide</a>
        <a href="/docs/guide/?lang=en">Guide Duplicate</a>
        <a href="/docs/private/secret">Blocked</a>
      `
    },
    "https://docs.example.com/docs/guide?lang=en": {
      status: 200,
      html: `<a href="/docs/checklist">Checklist</a>`
    },
    "https://docs.example.com/docs/checklist": {
      status: 200,
      html: ""
    }
  };

  const result = await executeScanJob(job, {
    fetchPage: async (url) => pages[url],
    scanner: createStaticScannerAdapter()
  });

  assert.equal(result.pages.length, 3);
  assert.deepEqual(result.run.compliance_profile, getDefaultComplianceProfile());
  assert.deepEqual(
    result.pages.map((page) => page.url),
    [
      "https://docs.example.com/docs",
      "https://docs.example.com/docs/guide?lang=en",
      "https://docs.example.com/docs/checklist"
    ]
  );
});

test("worker retries transient fetch failures", async () => {
  const job = createPageRescanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions: {
      max_pages: 1,
      max_depth: 0,
      concurrency: 1,
      retries: 1
    },
    pageUrl: "https://docs.example.com/docs/page"
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  let attempts = 0;
  const result = await executeScanJob(job, {
    retryDelayMs: 0,
    fetchPage: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary");
      }
      return { status: 200, html: "" };
    }
  });

  assert.equal(attempts, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(result.pages.length, 1);
});

test("worker emits incremental progress snapshots while pages are processed", async () => {
  const job = createFullScanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions,
    seedUrls: ["https://docs.example.com/docs"]
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  const pages = {
    "https://docs.example.com/docs": {
      status: 200,
      html: `<a href="/docs/guide">Guide</a>`
    },
    "https://docs.example.com/docs/guide": {
      status: 200,
      html: ""
    }
  };

  const progressSnapshots = [];
  await executeScanJob(job, {
    fetchPage: async (url) => pages[url],
    scanner: createStaticScannerAdapter({
      "https://docs.example.com/docs": [
        {
          ruleId: "color-contrast",
          severity: "serious",
          selector: "main a",
          snippet: "<a>Read more</a>"
        }
      ]
    }),
    onProgress: async (summary) => {
      progressSnapshots.push(summary);
    }
  });

  assert.deepEqual(progressSnapshots, [
    {
      pages_scanned: 1,
      findings_total: 1,
      new_count: 0,
      resolved_count: 0,
      persistent_count: 0
    },
    {
      pages_scanned: 2,
      findings_total: 1,
      new_count: 0,
      resolved_count: 0,
      persistent_count: 0
    }
  ]);
});

test("scanner findings are mapped to stable fingerprint fields", async () => {
  const job = createPageRescanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions: {
      max_pages: 1,
      max_depth: 0,
      concurrency: 1,
      retries: 0,
      query_param_allowlist: ["lang"]
    },
    pageUrl: "https://docs.example.com/docs/page?lang=en&utm_source=x"
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  const result = await executeScanJob(job, {
    fetchPage: async () => ({ status: 200, html: "" }),
    scanner: createStaticScannerAdapter({
      "https://docs.example.com/docs/page?lang=en": [
        {
          ruleId: "color-contrast",
          severity: "serious",
          selector: "main .css-abc12345 #component_1234567890 .btn",
          snippet: "<button>Apply</button>"
        }
      ]
    })
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule_id, "color-contrast");
  assert.equal(result.findings[0].severity, "serious");
  assert.equal(result.findings[0].fingerprint_version, "fp-v1");
  assert.equal(result.findings[0].normalization_version, "norm-v1");
  assert.equal(result.findings[0].normalized_url, "https://docs.example.com/docs/page?lang=en");
  assert.equal(result.findings[0].rule_help, "");
  assert.equal(result.findings[0].failure_summary, "");
  assert.deepEqual(result.findings[0].rule_tags, []);
});

test("run is marked failed when every fetch attempt fails", async () => {
  const job = createPageRescanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions: {
      max_pages: 1,
      max_depth: 0,
      concurrency: 1,
      retries: 1
    },
    pageUrl: "https://docs.example.com/docs/page"
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  const result = await executeScanJob(job, {
    retryDelayMs: 0,
    fetchPage: async () => {
      throw new Error("still failing");
    }
  });

  assert.equal(result.run.state, "failed");
  assert.equal(result.pages.length, 0);
  assert.equal(result.failures.length, 1);
});

test("crawler skips obvious download links by extension", async () => {
  const job = createFullScanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions,
    seedUrls: ["https://docs.example.com/docs"]
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  let scanCalls = 0;
  const result = await executeScanJob(job, {
    fetchPage: async (url) => {
      if (url === "https://docs.example.com/docs") {
        return {
          status: 200,
          contentType: "text/html; charset=utf-8",
          html: '<a href="/docs/guide.zip">Download</a><a href="/docs/page">Page</a>'
        };
      }

      if (url === "https://docs.example.com/docs/page") {
        return {
          status: 200,
          contentType: "text/html; charset=utf-8",
          html: ""
        };
      }

      throw new Error(`unexpected fetch ${url}`);
    },
    scanner: {
      async scanPage() {
        scanCalls += 1;
        return [];
      }
    }
  });

  assert.equal(scanCalls, 2);
  assert.deepEqual(
    result.pages.map((page) => page.url),
    [
      "https://docs.example.com/docs",
      "https://docs.example.com/docs/page"
    ]
  );
  assert.deepEqual(result.discovered_links, ["https://docs.example.com/docs/page"]);
});

test("worker skips non-html responses before scanning", async () => {
  const job = createFullScanJob({
    scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
    scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
    scanOptions: {
      max_pages: 2,
      max_depth: 1,
      concurrency: 1,
      retries: 0,
      path_allowlist: ["/docs"],
      path_denylist: [],
      query_param_allowlist: []
    },
    seedUrls: ["https://docs.example.com/docs"]
  });

  job.base_url = "https://docs.example.com/docs";
  job.allowed_domains = ["docs.example.com"];

  let scanCalls = 0;
  const result = await executeScanJob(job, {
    fetchPage: async (url) => {
      if (url === "https://docs.example.com/docs") {
        return {
          status: 200,
          contentType: "text/html; charset=utf-8",
          html: '<a href="/docs/download?id=1">Generated export</a>'
        };
      }

      if (url === "https://docs.example.com/docs/download") {
        return {
          status: 200,
          contentType: "application/zip",
          html: "not-html-binary-body"
        };
      }

      throw new Error(`unexpected fetch ${url}`);
    },
    scanner: {
      async scanPage() {
        scanCalls += 1;
        return [];
      }
    }
  });

  assert.equal(scanCalls, 1);
  assert.deepEqual(
    result.pages.map((page) => page.url),
    ["https://docs.example.com/docs"]
  );
  assert.equal(result.run.state, "completed");
  assert.equal(result.failures.length, 0);
});
