import test from "node:test";
import assert from "node:assert/strict";

import { createHttpFetchPage, createScannerAdapter, resolveScannerContext } from "../src/worker/index.js";

test("runtime selects demo scanner by default", () => {
  const adapter = createScannerAdapter("demo");
  assert.equal(typeof adapter.scanPage, "function");
});

test("runtime rejects unsupported scanner adapters", () => {
  assert.throws(() => createScannerAdapter("unknown"), /Unsupported scanner adapter/);
});

test("http fetch wrapper returns status and html", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name === "content-type" ? "text/html; charset=utf-8" : null;
      }
    },
    async text() {
      return "<html></html>";
    }
  });

  try {
    const fetchPage = createHttpFetchPage("wcag-guide-test/0.1");
    const page = await fetchPage("https://docs.example.com/page");
    assert.deepEqual(page, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      html: "<html></html>"
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("runtime scanner context overrides stale queued metadata for playwright scans", () => {
  const scannerContext = resolveScannerContext({
    adapterKind: "playwright-axe",
    scannerContext: {
      engine: "local-demo-a11y",
      engine_version: "0.1.0",
      browser: "static-http",
      browser_version: "1.0.0",
      viewport: "1440x900",
      user_agent: "wcag-guide/0.1.0",
      fingerprint_version: "fp-v1",
      normalization_version: "norm-v1"
    },
    env: {
      SCANNER_ENGINE: "axe-core",
      SCANNER_ENGINE_VERSION: "4.11.0",
      SCANNER_BROWSER: "chromium",
      SCANNER_BROWSER_VERSION: "1.54.2",
      SCANNER_USER_AGENT: "wcag-guide/0.1.0"
    }
  });

  assert.deepEqual(scannerContext, {
    engine: "axe-core",
    engine_version: "4.11.0",
    browser: "chromium",
    browser_version: "1.54.2",
    viewport: "1440x900",
    user_agent: "wcag-guide/0.1.0",
    fingerprint_version: "fp-v1",
    normalization_version: "norm-v1"
  });
});
