import test from "node:test";
import assert from "node:assert/strict";

import { normalizeUrl } from "../src/shared/url-normalization.js";

test("normalizes URL and keeps allowlisted functional query params", () => {
  const result = normalizeUrl("HTTPS://DOCS.Example.com:443/Policy//123/?utm_source=x&lang=en&b=2&a=1#top", {
    queryParamAllowlist: ["a", "b", "lang"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalizedUrl, "https://docs.example.com/Policy/123?a=1&b=2&lang=en");
  assert.equal(result.normalizedPath, "/Policy/123");
  assert.equal(result.normalizationVersion, "norm-v1");
});

test("rejects unsupported schemes", () => {
  const result = normalizeUrl("mailto:help@example.com");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_scheme");
});

test("enforces domain and path restrictions", () => {
  const result = normalizeUrl("https://docs.example.com/private/report", {
    allowedDomains: ["docs.example.com"],
    pathAllowlist: ["/public", "/help"],
    pathDenylist: ["/private"]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "path_not_allowed");
});
