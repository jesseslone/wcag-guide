import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFindingFingerprint,
  normalizePageTemplate,
  normalizeSelector
} from "../src/shared/fingerprint.js";

test("normalizes dynamic path segments to page template", () => {
  const template = normalizePageTemplate("https://docs.example.com/policies/123/550e8400-e29b-41d4-a716-446655440000");
  assert.equal(template, "/policies/{int}/{uuid}");
});

test("normalizes volatile selectors", () => {
  const selector = normalizeSelector("main .css-abc12345 #component_1234567890 .btn");
  assert.equal(selector, "main .cls #id .btn");
});

test("fingerprint is deterministic across equivalent volatile selectors", () => {
  const a = buildFindingFingerprint({
    ruleId: "color-contrast",
    pageUrl: "https://docs.example.com/policies/123?utm_source=x",
    domSelector: "main .css-abc12345 #component_1234567890 .btn",
    htmlSnippet: "<button class='x'>Apply Now</button>",
    normalizationOptions: {
      queryParamAllowlist: []
    }
  });

  const b = buildFindingFingerprint({
    ruleId: "color-contrast",
    pageUrl: "https://docs.example.com/policies/456?utm_source=y",
    domSelector: "main .css-def67890 #component_9876543210 .btn",
    htmlSnippet: "<button class='x'>Apply   Now</button>",
    normalizationOptions: {
      queryParamAllowlist: []
    }
  });

  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(a.fingerprintVersion, "fp-v1");
  assert.equal(a.normalizationVersion, "norm-v1");
});
