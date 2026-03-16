import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { demoSitePort } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(__dirname, "../../fixtures/demo-site");

const routeMap = new Map([
  ["/", "index.html"],
  ["/intake", "intake.html"],
  ["/policies/123", "policy-123.html"],
  ["/policies/124", "policy-124.html"]
]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const filename = routeMap.get(url.pathname);

  if (!filename) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }

  const body = await fs.readFile(path.join(fixtureRoot, filename), "utf8");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
});

server.listen(demoSitePort, () => {
  console.log(`Demo site listening on http://0.0.0.0:${demoSitePort}`);
});
