import process from "node:process";

import { printMcpUsage, runMcpCommand } from "./mcp-command.js";

export function printCliUsage(output = process.stdout) {
  output.write(`Usage: wguide <command> [options]

Commands:
  mcp    Start the WCAG-Guide MCP server over stdio

Run "wguide mcp --help" for MCP-specific options.
`);
}

export async function runCli(argv, dependencies = {}) {
  const output = dependencies.stdout ?? process.stdout;
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printCliUsage(output);
    return 0;
  }

  if (command === "mcp") {
    return runMcpCommand(rest, dependencies);
  }

  if (command === "help" && rest[0] === "mcp") {
    printMcpUsage(output);
    return 0;
  }

  throw new Error(`Unknown command: ${command}`);
}
