import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRequestHandler } from "../src/app/create-server.js";
import { PgRepository } from "../src/app/repositories/pg.js";
import { BackendService } from "../src/app/service.js";

function createMockRequest({ method, path, body }) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(payload);
  request.method = method;
  request.url = path;
  request.headers = { host: "local.test" };
  return request;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

function buildPgHarness() {
  const findingId = "44444444-4444-4444-8444-444444444441";
  const findingRow = {
    finding_id: findingId,
    scan_target_id: "11111111-1111-4111-8111-111111111111",
    fingerprint: "fp-persistent",
    rule_id: "color-contrast",
    severity: "serious",
    status: "open",
    ignore_expires_at: null,
    rule_help: "Elements must meet minimum color contrast ratio thresholds",
    rule_description: "Low-contrast text can be unreadable for users with low vision.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
    rule_tags: ["wcag2aa", "wcag143"],
    site_key: "example-gov",
    environment: "prod",
    branch: "main",
    base_url: "https://example.gov",
    instance_id: "55555555-5555-4555-8555-555555555551",
    instance_scan_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    page_url: "https://example.gov/home",
    normalized_url: "https://example.gov/home",
    selector: "main .hero a",
    snippet: "Need more contrast",
    failure_summary: "Element text is below the required contrast ratio.",
    detected_at: "2026-03-11T10:03:00.000Z"
  };

  const state = {
    finding: { ...findingRow },
    statusEvents: [
      {
        id: "66666666-6666-4666-8666-666666666661",
        previous_status: "open",
        new_status: "in_progress",
        note: "Assigned to forms team.",
        ignore_expires_at: null,
        changed_by: "seed",
        changed_at: "2026-03-11T11:00:00.000Z"
      }
    ]
  };

  const executor = {
    calls: [],
    async query(sql, params) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      this.calls.push(normalizedSql);

      if (normalizedSql.includes("FROM findings f") && normalizedSql.includes("WHERE f.id = $1")) {
        return { rows: [{ ...state.finding }] };
      }

      if (normalizedSql.includes("FROM status_events")) {
        assert.doesNotMatch(normalizedSql, /created_at/i);
        return { rows: state.statusEvents.map((row) => ({ ...row })) };
      }

      if (normalizedSql.includes("FROM findings WHERE status = 'ignored'")) {
        return { rows: [] };
      }

      if (normalizedSql.includes("UPDATE findings SET status = $2")) {
        state.finding.status = params[1];
        state.finding.ignore_expires_at = params[2];
        return { rows: [{ id: params[0] }] };
      }

      if (normalizedSql.includes("INSERT INTO status_events")) {
        state.statusEvents.unshift({
          id: params[0],
          previous_status: params[2],
          new_status: params[3],
          note: params[4],
          ignore_expires_at: params[5],
          changed_by: params[6],
          changed_at: params[7]
        });
        return { rows: [] };
      }

      throw new Error(`Unexpected query: ${normalizedSql}`);
    }
  };

  const repository = new PgRepository({
    pool: executor,
    withTransaction: async (callback) => callback(executor)
  });
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
    now: () => new Date("2026-03-12T18:00:00.000Z")
  });

  return {
    state,
    requestHandler: createRequestHandler({ service })
  };
}

async function request(handler, method, path, body) {
  const mockRequest = createMockRequest({ method, path, body });
  const mockResponse = createMockResponse();
  await handler(mockRequest, mockResponse);

  return {
    status: mockResponse.statusCode,
    json: async () => JSON.parse(mockResponse.body)
  };
}

test("Postgres-backed finding detail and status update paths use valid status history queries", async () => {
  const { requestHandler } = buildPgHarness();

  const detailResponse = await request(requestHandler, "GET", "/findings/44444444-4444-4444-8444-444444444441");
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json();
  assert.equal(detailPayload.finding.scan_target.site_key, "example-gov");
  assert.equal(detailPayload.finding.rule_metadata.rule_id, "color-contrast");
  assert.equal(
    detailPayload.finding.latest_instance.failure_summary,
    "Element text is below the required contrast ratio."
  );
  assert.equal(detailPayload.status_history.length, 1);
  assert.equal(detailPayload.status_history[0].new_status, "in_progress");

  const patchResponse = await request(
    requestHandler,
    "PATCH",
    "/findings/44444444-4444-4444-8444-444444444441/status",
    {
      status: "resolved",
      note: "Patched in application code."
    }
  );
  assert.equal(patchResponse.status, 200);
  const patchPayload = await patchResponse.json();
  assert.equal(patchPayload.finding.status, "resolved");
  assert.equal(patchPayload.status_history[0].new_status, "resolved");
  assert.equal(patchPayload.status_history[1].new_status, "in_progress");
});
