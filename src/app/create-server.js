import http from "node:http";
import { readFileSync } from "node:fs";

import { ApiError } from "./errors.js";

const dashboardHtml = readFileSync(new URL("./public/dashboard.html", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("./public/dashboard.css", import.meta.url), "utf8");
const dashboardJs = readFileSync(new URL("./public/dashboard.js", import.meta.url), "utf8");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload, contentType) {
  response.writeHead(statusCode, {
    "content-type": contentType
  });
  response.end(payload);
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: {
      code,
      message
    }
  });
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "bad_request", "request body must be valid JSON");
  }
}

export function createRequestHandler({ service, healthcheck = null }) {
  return async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    try {
      if (request.method === "GET" && url.pathname === "/healthz") {
        if (healthcheck) {
          await healthcheck();
        }
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
        sendText(response, 200, dashboardHtml, "text/html; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/dashboard.css") {
        sendText(response, 200, dashboardCss, "text/css; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/dashboard.js") {
        sendText(response, 200, dashboardJs, "text/javascript; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/scan-targets") {
        sendJson(response, 200, await service.listScanTargets(Object.fromEntries(url.searchParams.entries())));
        return;
      }

      if (request.method === "PUT" && url.pathname === "/scan-targets") {
        sendJson(response, 200, await service.upsertScanTarget(await readJson(request)));
        return;
      }

      if (request.method === "POST" && url.pathname === "/scan-runs") {
        sendJson(response, 202, await service.createScanRun(await readJson(request), "full"));
        return;
      }

      if (request.method === "POST" && url.pathname === "/scan-runs/rescan-page") {
        sendJson(response, 202, await service.createScanRun(await readJson(request), "page"));
        return;
      }

      if (request.method === "POST" && url.pathname === "/scan-runs/rescan-path") {
        sendJson(response, 202, await service.createScanRun(await readJson(request), "path"));
        return;
      }

      if (request.method === "GET" && url.pathname === "/scan-runs") {
        sendJson(response, 200, await service.listScanRuns(Object.fromEntries(url.searchParams.entries())));
        return;
      }

      if (request.method === "GET" && url.pathname === "/compliance-profiles") {
        sendJson(response, 200, await service.listComplianceProfiles());
        return;
      }

      const scanRunFindingsMatch = url.pathname.match(/^\/scan-runs\/([0-9a-f-]+)\/findings$/i);
      if (request.method === "GET" && scanRunFindingsMatch) {
        sendJson(
          response,
          200,
          await service.listRunFindings(
            scanRunFindingsMatch[1],
            Object.fromEntries(url.searchParams.entries())
          )
        );
        return;
      }

      const scanRunHvtGroupsMatch = url.pathname.match(/^\/scan-runs\/([0-9a-f-]+)\/hvt-groups$/i);
      if (request.method === "GET" && scanRunHvtGroupsMatch) {
        sendJson(
          response,
          200,
          await service.listRunHvtGroups(
            scanRunHvtGroupsMatch[1],
            Object.fromEntries(url.searchParams.entries())
          )
        );
        return;
      }

      const scanRunMatch = url.pathname.match(/^\/scan-runs\/([0-9a-f-]+)$/i);
      if (request.method === "DELETE" && scanRunMatch) {
        await service.deleteScanRun(scanRunMatch[1]);
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "GET" && scanRunMatch) {
        sendJson(response, 200, await service.getScanRun(scanRunMatch[1]));
        return;
      }

      if (request.method === "GET" && url.pathname === "/findings") {
        sendJson(response, 200, await service.listFindings(Object.fromEntries(url.searchParams.entries())));
        return;
      }

      const findingMatch = url.pathname.match(/^\/findings\/([0-9a-f-]+)$/i);
      if (request.method === "GET" && findingMatch) {
        sendJson(response, 200, await service.getFinding(findingMatch[1]));
        return;
      }

      const findingStatusMatch = url.pathname.match(/^\/findings\/([0-9a-f-]+)\/status$/i);
      if (request.method === "PATCH" && findingStatusMatch) {
        const body = await readJson(request);
        const { changed_by: changedBy, ...statusUpdate } = body;
        sendJson(
          response,
          200,
          await service.updateFindingStatus(
            findingStatusMatch[1],
            statusUpdate,
            changedBy ? { changedBy } : undefined
          )
        );
        return;
      }

      sendError(response, 404, "not_found", "route not found");
    } catch (error) {
      if (error instanceof ApiError) {
        sendError(response, error.statusCode, error.code, error.message);
        return;
      }

      sendError(response, 500, "internal_error", error.message);
    }
  };
}

export function createServer(options) {
  return http.createServer(createRequestHandler(options));
}
