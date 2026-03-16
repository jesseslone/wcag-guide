import { InMemoryRepository } from "../src/app/repositories/in-memory.js";
import { BackendService } from "../src/app/service.js";

export const fixedNow = new Date("2026-03-12T18:00:00.000Z");

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

export function buildRepository(options = {}) {
  const state = options.state ?? {};

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
    ].concat(state.scanTargets ?? []),
    scanRuns: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        mode: "path",
        state: "completed",
        reason: "Overlapping rerun",
        scanOptions: {
          max_pages: 20,
          max_depth: 2,
          concurrency: 2,
          retries: 1,
          path_allowlist: ["/forms"],
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
        scanOptions: {
          max_pages: 100,
          max_depth: 3,
          concurrency: 4,
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
        scanOptions: {
          max_pages: 100,
          max_depth: 3,
          concurrency: 4,
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
        pagesScanned: 4,
        findingsTotal: 4,
        newCount: 3,
        resolvedCount: 1,
        persistentCount: 1,
        complianceProfile: enhancedComplianceProfile,
        startedAt: "2026-03-11T10:00:00.000Z",
        completedAt: "2026-03-11T10:09:00.000Z"
      }
    ].concat(state.scanRuns ?? []),
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
      },
      {
        id: "44444444-4444-4444-8444-444444444446",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-overlap-only",
        ruleId: "aria-required-children",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      }
    ].concat(state.findings ?? []),
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
        failureSummary: "Child roles are missing from the grouped control.",
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
        failureSummary: "Image elements must have alternate text.",
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
        id: "55555555-5555-4555-8555-555555555555",
        findingId: "44444444-4444-4444-8444-444444444444",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-1",
        rawUrl: "https://example.gov/home",
        normalizedUrl: "https://example.gov/home",
        normalizedSelector: "main h3",
        snippet: "Skipped heading level",
        failureSummary: "Heading levels should only increase by one level at a time.",
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
        failureSummary: "IDs must be unique within the document.",
        detectedAt: "2026-03-11T10:07:00.000Z"
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
        failureSummary: "Child roles are still missing from the grouped control.",
        detectedAt: "2026-03-11T10:05:30.000Z"
      }
    ].concat(state.findingInstances ?? []),
    ruleMetadata: [
      {
        ruleId: "color-contrast",
        ruleHelp: "Elements must meet minimum color contrast ratio thresholds.",
        ruleDescription: "Ensures the contrast between foreground and background colors meets WCAG thresholds.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        ruleTags: ["wcag2aa", "wcag143"]
      },
      {
        ruleId: "label",
        ruleHelp: "Form controls must have labels.",
        ruleDescription: "Ensures labels are present and programmatically associated with form controls.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.10/label",
        ruleTags: ["wcag2a", "wcag131", "wcag332"]
      }
    ].concat(state.ruleMetadata ?? []),
    statusEvents: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        findingId: "44444444-4444-4444-8444-444444444441",
        previousStatus: "open",
        newStatus: "in_progress",
        note: "Assigned to frontend team.",
        ignoreExpiresAt: null,
        changedBy: "seed",
        changedAt: "2026-03-10T12:00:00.000Z"
      }
    ].concat(state.statusEvents ?? [])
  }, options);
}

export function createService(options = {}) {
  const repository = buildRepository(options.repositoryOptions);
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

  return {
    repository,
    service
  };
}
