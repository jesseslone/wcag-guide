export const findingStatuses = Object.freeze(["open", "in_progress", "resolved", "ignored"]);
export const findingSeverities = Object.freeze(["critical", "serious", "moderate", "minor"]);
export const findingDiffStatuses = Object.freeze(["new", "resolved", "persistent"]);

export const findingStatusRank = Object.freeze({
  open: 0,
  in_progress: 1,
  resolved: 2,
  ignored: 3
});

export const findingSeverityRank = Object.freeze({
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3
});

export const defaultScannerContext = Object.freeze({
  engine: "local-demo-a11y",
  engine_version: "0.1.0",
  browser: "static-http",
  browser_version: "1.0.0",
  viewport: "1440x900",
  user_agent: "wcag-guide/0.1.0",
  fingerprint_version: "fp-v1",
  normalization_version: "norm-v1"
});
