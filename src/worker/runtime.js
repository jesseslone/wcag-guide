import { createDemoScannerAdapter, createNoopScannerAdapter } from "./scanner-adapters.js";
import { createPlaywrightAxeScannerAdapter } from "./playwright-axe-adapter.js";

export function createScannerAdapter(kind = process.env.SCANNER_ADAPTER ?? "playwright-axe") {
  switch (kind) {
    case "demo":
      return createDemoScannerAdapter();
    case "playwright-axe":
      return createPlaywrightAxeScannerAdapter();
    case "noop":
      return createNoopScannerAdapter();
    default:
      throw new Error(`Unsupported scanner adapter: ${kind}`);
  }
}

export function createHttpFetchPage(defaultUserAgent = "wcag-guide-worker/0.1.0") {
  return async function fetchPage(url, { signal } = {}) {
    const response = await fetch(url, {
      signal,
      headers: {
        "user-agent": defaultUserAgent
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      html: await response.text()
    };
  };
}
