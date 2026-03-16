import test from "node:test";
import assert from "node:assert/strict";

import { scanPageForFindings } from "../src/shared/demo-scanner.js";

test("demo scanner finds deterministic local issues", () => {
  const findings = scanPageForFindings(
    {
      rawUrl: "http://demo-site:8081/intake",
      normalizedUrl: "http://demo-site:8081/intake",
      normalizedPath: "/intake",
      html: `
        <html>
          <head><title>Intake</title></head>
          <body>
            <main>
              <img src="/banner.png">
              <button type="button"></button>
            </main>
          </body>
        </html>
      `
    },
    {
      allowedDomains: ["demo-site"],
      queryParamAllowlist: []
    }
  );

  assert.deepEqual(
    findings.map((finding) => finding.rule_id).sort(),
    ["button-name", "image-alt", "page-has-heading-one"]
  );
  assert.ok(findings.every((finding) => finding.fingerprintVersion === "fp-v1"));
});
