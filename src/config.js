function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const databaseUrl = requiredEnv("DATABASE_URL");
export const appPort = Number.parseInt(process.env.PORT ?? "8080", 10);
export const demoSitePort = Number.parseInt(process.env.DEMO_SITE_PORT ?? "8081", 10);
export const workerPollIntervalMs = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "1000", 10);

export const scannerContext = {
  engine: process.env.SCANNER_ENGINE ?? "local-demo-a11y",
  engine_version: process.env.SCANNER_ENGINE_VERSION ?? "0.1.0",
  browser: process.env.SCANNER_BROWSER ?? "static-http",
  browser_version: process.env.SCANNER_BROWSER_VERSION ?? "1.0.0",
  viewport: process.env.SCANNER_VIEWPORT ?? "1440x900",
  user_agent: process.env.SCANNER_USER_AGENT ?? "wcag-guide/0.1.0",
  fingerprint_version: "fp-v1",
  normalization_version: "norm-v1"
};

export const defaultScanOptions = {
  max_pages: 25,
  max_depth: 3,
  concurrency: 2,
  retries: 1,
  path_allowlist: [],
  path_denylist: [],
  query_param_allowlist: []
};
