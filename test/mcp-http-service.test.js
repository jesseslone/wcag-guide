import test from "node:test";
import assert from "node:assert/strict";

import { HttpServiceClient } from "../src/mcp/http-service.js";
import { createService } from "../test-support/mcp-fixtures.js";

function jsonResponse(status, payload) {
  return new Response(payload === undefined ? null : JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function createMockFetch(service) {
  return async (input, init = {}) => {
    const url = input instanceof URL
      ? input
      : new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? "GET";
    const query = Object.fromEntries(url.searchParams.entries());
    const body = init.body ? JSON.parse(init.body) : {};

    try {
      if (method === "GET" && url.pathname === "/compliance-profiles") {
        return jsonResponse(200, await service.listComplianceProfiles());
      }

      if (method === "GET" && url.pathname === "/scan-targets") {
        return jsonResponse(200, await service.listScanTargets(query));
      }

      if (method === "PUT" && url.pathname === "/scan-targets") {
        return jsonResponse(200, await service.upsertScanTarget(body));
      }

      const findingStatusMatch = url.pathname.match(/^\/findings\/([0-9a-f-]+)\/status$/i);
      if (method === "PATCH" && findingStatusMatch) {
        const { changed_by: changedBy, ...statusUpdate } = body;
        return jsonResponse(
          200,
          await service.updateFindingStatus(
            findingStatusMatch[1],
            statusUpdate,
            changedBy ? { changedBy } : undefined
          )
        );
      }

      const findingMatch = url.pathname.match(/^\/findings\/([0-9a-f-]+)$/i);
      if (method === "GET" && findingMatch) {
        return jsonResponse(200, await service.getFinding(findingMatch[1]));
      }

      throw new Error(`unhandled route ${method} ${url.pathname}`);
    } catch (error) {
      return jsonResponse(error.statusCode ?? 500, {
        error: {
          code: error.code ?? "internal_error",
          message: error.message
        }
      });
    }
  };
}

test("HTTP service client reuses API validation and audit paths", async () => {
  const { service } = createService();
  const client = new HttpServiceClient({
    baseUrl: "http://mcp-http.test",
    fetchImpl: createMockFetch(service)
  });

  const profiles = await client.listComplianceProfiles();
  assert.equal(profiles.default_profile_id, "title_ii_2026");

  const target = await client.upsertScanTarget({
    scan_target: {
      site_key: "opencode-http",
      environment: "local",
      branch: "main",
      base_url: "https://example.gov"
    }
  });
  assert.equal(target.scan_target.site_key, "opencode-http");

  const lookedUp = await client.getScanTarget({
    site_key: "opencode-http",
    environment: "local",
    branch: "main"
  });
  assert.equal(lookedUp.scan_target.base_url, "https://example.gov");

  const updated = await client.updateFindingStatus(
    "44444444-4444-4444-8444-444444444443",
    {
      status: "in_progress",
      note: "HTTP MCP bridge validation"
    },
    { changedBy: "mcp" }
  );
  assert.equal(updated.status_history[0].changed_by, "mcp");

  const finding = await client.getFinding("44444444-4444-4444-8444-444444444443");
  assert.equal(finding.status_history[0].changed_by, "mcp");
});

test("HTTP service client retries local host aliases when loopback is unreachable", async () => {
  const { service } = createService();
  const calls = [];
  const client = new HttpServiceClient({
    baseUrl: "http://127.0.0.1:8080",
    fetchImpl: async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input));
      calls.push(url.origin);

      if (url.hostname === "127.0.0.1") {
        const error = new TypeError("fetch failed");
        error.cause = {
          code: "ECONNREFUSED"
        };
        throw error;
      }

      return createMockFetch(service)(input, init);
    }
  });

  const profiles = await client.listComplianceProfiles();
  assert.equal(profiles.default_profile_id, "title_ii_2026");
  assert.deepEqual(calls, ["http://127.0.0.1:8080", "http://localhost:8080"]);

  calls.length = 0;
  await client.listComplianceProfiles();
  assert.deepEqual(calls, ["http://localhost:8080"]);
});
