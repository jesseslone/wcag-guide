import test from "node:test";
import assert from "node:assert/strict";

import {
  createDemoScannerAdapter,
  createPlaywrightAxeScannerAdapter,
  getDefaultComplianceProfile,
  mapAxeResultsToRawFindings
} from "../src/worker/index.js";

test("demo scanner adapter returns heuristic findings from html", async () => {
  const adapter = createDemoScannerAdapter();
  const findings = await adapter.scanPage({
    url: "https://docs.example.com/docs/page",
    html: `
      <html>
        <head></head>
        <body>
          <img src="/logo.png">
          <a href="/next"></a>
          <button></button>
        </body>
      </html>
    `
  });

  assert.deepEqual(
    findings.map((finding) => finding.rule_id).sort(),
    ["button-name", "document-title", "image-alt", "link-name", "page-has-heading-one"]
  );
  assert.equal(findings[0].rule_help_url.startsWith("https://dequeuniversity.com/rules/axe/"), true);
});

test("axe results are mapped to raw findings", () => {
  const findings = mapAxeResultsToRawFindings({
    violations: [
      {
        id: "color-contrast",
        impact: "serious",
        help: "Elements must meet minimum color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        tags: ["wcag2aa", "wcag143"],
        description: "Colors fail contrast",
        nodes: [
          {
            target: ["main .btn"],
            html: "<button>Apply</button>",
            failureSummary: "Fix contrast"
          }
        ]
      }
    ]
  });

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    rule_id: "color-contrast",
    severity: "serious",
    selector: "main .btn",
    snippet: "<button>Apply</button>",
    summary: "Fix contrast",
    failure_summary: "Fix contrast",
    rule_help: "Elements must meet minimum color contrast ratio thresholds",
    rule_description: "Colors fail contrast",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
    rule_tags: ["wcag2aa", "wcag143"]
  });
});

test("playwright axe adapter scans through injected modules", async () => {
  const calls = [];
  const page = {
    async goto(url, options) {
      calls.push(["goto", url, options.waitUntil]);
    },
    async close() {
      calls.push(["page.close"]);
    }
  };
  const context = {
    async newPage() {
      calls.push(["context.newPage"]);
      return page;
    },
    async close() {
      calls.push(["context.close"]);
    }
  };
  const browser = {
    async newContext(options) {
      calls.push(["browser.newContext", options.userAgent, `${options.viewport.width}x${options.viewport.height}`]);
      return context;
    },
    async close() {
      calls.push(["browser.close"]);
    }
  };

  class FakeAxeBuilder {
    constructor({ page: receivedPage }) {
      calls.push(["builder", receivedPage === page]);
    }

    withTags(tags) {
      calls.push(["withTags", [...tags]]);
      return this;
    }

    async analyze() {
      return {
        violations: [
          {
            id: "image-alt",
            impact: "serious",
            nodes: [
              {
                target: ["img.hero"],
                html: "<img class='hero'>",
                failureSummary: "Needs alt text"
              }
            ]
          }
        ]
      };
    }
  }

  const adapter = createPlaywrightAxeScannerAdapter({
    loadModules: async () => ({
      chromium: {
        async launch() {
          calls.push(["chromium.launch"]);
          return browser;
        }
      },
      AxeBuilder: FakeAxeBuilder
    })
  });

  const findings = await adapter.scanPage({
    url: "https://docs.example.com/docs/page",
    scannerContext: {
      user_agent: "wcag-guide/worker-test",
      viewport: "1280x720"
    },
    job: {
      compliance_profile: getDefaultComplianceProfile()
    }
  });

  await adapter.close();

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule_id, "image-alt");
  assert.deepEqual(findings[0].rule_tags, []);
  assert.deepEqual(calls, [
    ["chromium.launch"],
    ["browser.newContext", "wcag-guide/worker-test", "1280x720"],
    ["context.newPage"],
    ["goto", "https://docs.example.com/docs/page", "networkidle"],
    ["builder", true],
    ["withTags", ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]],
    ["page.close"],
    ["context.close"],
    ["browser.close"]
  ]);
});
