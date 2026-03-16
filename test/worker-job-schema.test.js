import test from "node:test";
import assert from "node:assert/strict";

import {
  createFullScanJob,
  createPageRescanJob,
  createPathRescanJob,
  validateWorkerJobPayload
} from "../src/worker/index.js";

const base = {
  scanTargetId: "550e8400-e29b-41d4-a716-446655440000",
  scanRunId: "8ed13c1e-798c-4322-8d89-d1e7a44a4b65",
  scanOptions: {
    max_pages: 5,
    max_depth: 2,
    concurrency: 2,
    retries: 1
  }
};

test("creates a valid full scan job", () => {
  const job = createFullScanJob(base);
  const validation = validateWorkerJobPayload(job);

  assert.equal(validation.valid, true);
  assert.equal(job.mode, "full");
});

test("creates a valid path rescan job", () => {
  const job = createPathRescanJob({
    ...base,
    pathPrefix: "/policies"
  });

  assert.equal(job.mode, "path");
  assert.equal(job.path_prefix, "/policies");
});

test("page rescan requires exactly one seed URL", () => {
  const job = createPageRescanJob({
    ...base,
    pageUrl: "https://docs.example.com/policies/123"
  });

  const validation = validateWorkerJobPayload(job);
  assert.equal(validation.valid, true);
  assert.equal(job.seed_urls.length, 1);
});
