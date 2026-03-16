import { listenMcpServer } from "./start-server.js";

try {
  await listenMcpServer();
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
