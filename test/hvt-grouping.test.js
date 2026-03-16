import test from "node:test";
import assert from "node:assert/strict";

import { BackendService } from "../src/app/service.js";
import { InMemoryRepository } from "../src/app/repositories/in-memory.js";

const enhancedComplianceProfile = {
  id: "enhanced_22_aa",
  label: "Enhanced 2.2 AA",
  version: "cp-v1",
  standardTarget: "WCAG 2.2 AA",
  axeTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  isDefault: false
};

function createService() {
  const repository = new InMemoryRepository({
    scanTargets: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        siteKey: "example-gov",
        environment: "prod",
        branch: "main",
        baseUrl: "https://example.gov"
      }
    ],
    scanRuns: [
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
          engine_version: "4.11.0",
          browser: "chromium",
          browser_version: "134.0.0",
          viewport: "1440x900",
          user_agent: "fixture-agent",
          fingerprint_version: "fp-v1",
          normalization_version: "norm-v1"
        },
        pagesScanned: 3,
        findingsTotal: 3,
        newCount: 3,
        resolvedCount: 0,
        persistentCount: 0,
        complianceProfile: enhancedComplianceProfile,
        startedAt: "2026-03-11T10:00:00.000Z",
        completedAt: "2026-03-11T10:09:00.000Z"
      }
    ],
    findings: [
      {
        id: "44444444-4444-4444-8444-444444444441",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-contrast-one",
        ruleId: "color-contrast",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444442",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-contrast-two",
        ruleId: "color-contrast",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      },
      {
        id: "44444444-4444-4444-8444-444444444443",
        scanTargetId: "11111111-1111-4111-8111-111111111111",
        fingerprint: "fp-contrast-three",
        ruleId: "color-contrast",
        severity: "serious",
        status: "open",
        ignoreExpiresAt: null
      }
    ],
    findingInstances: [
      {
        id: "55555555-5555-4555-8555-555555555551",
        findingId: "44444444-4444-4444-8444-444444444441",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-1",
        rawUrl: "https://example.gov/resources/overview",
        normalizedUrl: "https://example.gov/resources/overview",
        normalizedSelector: "main .resource-list a[title='Overview']",
        snippet: "Low contrast overview link",
        failureSummary: "Element has insufficient color contrast of 3.2 (foreground color: #767676, background color: #ffffff, font size: 12pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
        detectedAt: "2026-03-11T10:03:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555552",
        findingId: "44444444-4444-4444-8444-444444444442",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-2",
        rawUrl: "https://example.gov/resources/policies",
        normalizedUrl: "https://example.gov/resources/policies",
        normalizedSelector: "aside .resource-list a.title",
        snippet: "Low contrast policies link",
        failureSummary: "Element has insufficient color contrast of 3.7 (foreground color: #767676, background color: #ffffff, font size: 12pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
        detectedAt: "2026-03-11T10:04:00.000Z"
      },
      {
        id: "55555555-5555-4555-8555-555555555553",
        findingId: "44444444-4444-4444-8444-444444444443",
        scanRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        pageId: "page-3",
        rawUrl: "https://example.gov/resources/guides",
        normalizedUrl: "https://example.gov/resources/guides",
        normalizedSelector: "section .resource-list a.secondary",
        snippet: "Low contrast guides link",
        failureSummary: "Element has insufficient color contrast of 2.9 (foreground color: #999999, background color: #ffffff, font size: 12pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
        detectedAt: "2026-03-11T10:05:00.000Z"
      }
    ],
    ruleMetadata: [
      {
        ruleId: "color-contrast",
        ruleHelp: "Elements must meet minimum color contrast ratio thresholds.",
        ruleDescription: "Ensures the contrast between foreground and background colors meets WCAG thresholds.",
        ruleHelpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        ruleTags: ["wcag2aa", "wcag143"]
      }
    ]
  });

  return new BackendService({
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
      engine_version: "4.11.0",
      browser: "chromium",
      browser_version: "134.0.0",
      viewport: "1440x900",
      user_agent: "fixture-agent",
      fingerprint_version: "fp-v1",
      normalization_version: "norm-v1"
    },
    now: () => new Date("2026-03-12T18:00:00.000Z")
  });
}

test("fix-surface clustering collapses repeated color contrast findings by likely remediation surface", async () => {
  const service = createService();

  const sectionCluster = await service.listRunHvtGroups("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", {
    group_level: "section_cluster",
    page: 1,
    page_size: 50
  });
  assert.equal(sectionCluster.total, 3);

  const fixSurfaceCluster = await service.listRunHvtGroups("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", {
    group_level: "fix_surface_cluster",
    page: 1,
    page_size: 50
  });

  assert.equal(fixSurfaceCluster.group_level, "fix_surface_cluster");
  assert.equal(fixSurfaceCluster.total, 2);

  const primaryGroup = fixSurfaceCluster.items.find((item) => item.finding_count === 2);
  assert.ok(primaryGroup);
  assert.equal(primaryGroup.rule_id, "color-contrast");
  assert.equal(primaryGroup.path_prefix, "/resources");
  assert.equal(primaryGroup.affected_pages, 2);
  assert.equal(primaryGroup.likely_fix_surface, "shared_css_token");
  assert.match(primaryGroup.normalized_selector, /link \| #767676 on #ffffff/);
  assert.match(primaryGroup.suggested_first_look, /shared text\/link color tokens/i);
});
