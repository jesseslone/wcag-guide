import process from "node:process";

import { HttpServiceClient } from "./http-service.js";

const defaultAppBaseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:8080";

function defaultLogger(event) {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

export async function listenMcpServer({
  appBaseUrl = defaultAppBaseUrl,
  logger
} = {}) {
  const normalizedAppBaseUrl = new URL(appBaseUrl);
  normalizedAppBaseUrl.pathname = "";
  normalizedAppBaseUrl.search = "";
  normalizedAppBaseUrl.hash = "";

  const [{ createMcpServer }] = await Promise.all([
    import("./create-server.js")
  ]);

  const service = new HttpServiceClient({
    baseUrl: normalizedAppBaseUrl.toString().replace(/\/$/, "")
  });

  const userFacingBase = new URL(normalizedAppBaseUrl);
  if (userFacingBase.hostname === "127.0.0.1") {
    userFacingBase.hostname = "localhost";
  }
  const dashboardUrl = `${userFacingBase.toString().replace(/\/$/, "")}/dashboard`;

  const server = createMcpServer({
    service,
    dashboardUrl,
    logger: logger ?? defaultLogger
  });

  await server.listen();
  return server;
}
