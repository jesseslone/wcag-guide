#!/usr/bin/env node

import process from "node:process";

import { runCli } from "../src/cli/wguide.js";

try {
  const exitCode = await runCli(process.argv.slice(2));
  if (Number.isInteger(exitCode)) {
    process.exitCode = exitCode;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
