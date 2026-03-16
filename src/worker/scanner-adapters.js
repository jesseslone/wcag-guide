import { scanPageForFindings } from "../shared/demo-scanner.js";

export function createNoopScannerAdapter() {
  return {
    async scanPage() {
      return [];
    }
  };
}

export function createStaticScannerAdapter(findingsByUrl = {}) {
  return {
    async scanPage({ url }) {
      return findingsByUrl[url] ?? [];
    }
  };
}

export function createDemoScannerAdapter(normalizationOptions = {}) {
  return {
    async scanPage({ url, html }) {
      return scanPageForFindings(
        {
          normalizedUrl: url,
          html
        },
        normalizationOptions
      );
    }
  };
}
