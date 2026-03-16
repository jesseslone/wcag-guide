import { createMcpServer } from "../src/mcp/create-server.js";
import { createService, fixedNow } from "./mcp-fixtures.js";

const options = process.env.MCP_FIXTURE_OPTIONS
  ? JSON.parse(process.env.MCP_FIXTURE_OPTIONS)
  : {};

const { service } = createService(options);
const server = createMcpServer({
  service,
  now: () => fixedNow,
  logger(entry) {
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }
});

try {
  await server.listen();
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
