function getAdapterDefaults(adapterKind) {
  switch (adapterKind) {
    case "playwright-axe":
      return {
        engine: "axe-core",
        engine_version: process.env.AXE_CORE_VERSION ?? "4.11.0",
        browser: "chromium",
        browser_version: process.env.PLAYWRIGHT_VERSION ?? "1.54.2"
      };
    case "demo":
      return {
        engine: "local-demo-a11y",
        engine_version: "0.1.0",
        browser: "static-http",
        browser_version: "1.0.0"
      };
    default:
      return {
        engine: "adapter",
        engine_version: process.env.AXE_CORE_VERSION ?? "4.11.0",
        browser: "unknown",
        browser_version: process.env.PLAYWRIGHT_VERSION ?? "1.54.2"
      };
  }
}

export function resolveScannerContext({ scannerContext = {}, adapterKind, env = process.env } = {}) {
  const adapterDefaults = getAdapterDefaults(adapterKind ?? env.SCANNER_ADAPTER ?? "playwright-axe");

  return {
    engine: env.SCANNER_ENGINE ?? adapterDefaults.engine ?? scannerContext.engine ?? "adapter",
    engine_version:
      env.SCANNER_ENGINE_VERSION ??
      adapterDefaults.engine_version ??
      scannerContext.engine_version ??
      "0.1.0",
    browser: env.SCANNER_BROWSER ?? adapterDefaults.browser ?? scannerContext.browser ?? "unknown",
    browser_version:
      env.SCANNER_BROWSER_VERSION ??
      adapterDefaults.browser_version ??
      scannerContext.browser_version ??
      "1.0.0",
    viewport: env.SCANNER_VIEWPORT ?? scannerContext.viewport ?? "1440x900",
    user_agent: env.SCANNER_USER_AGENT ?? scannerContext.user_agent ?? "wcag-guide/0.1.0",
    fingerprint_version: scannerContext.fingerprint_version ?? "fp-v1",
    normalization_version: scannerContext.normalization_version ?? "norm-v1"
  };
}
