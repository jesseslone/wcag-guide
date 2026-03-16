import fs from "node:fs/promises";

import { executeScanJob } from "./scan-worker.js";
import { createScannerAdapter, createHttpFetchPage } from "./runtime.js";
import { resolveScannerContext } from "./scanner-context.js";

async function loadJobPayload() {
  if (process.env.WORKER_JOB_JSON) {
    return JSON.parse(process.env.WORKER_JOB_JSON);
  }

  if (process.env.WORKER_JOB_FILE) {
    const file = await fs.readFile(process.env.WORKER_JOB_FILE, "utf8");
    return JSON.parse(file);
  }

  throw new Error("WORKER_JOB_JSON or WORKER_JOB_FILE is required");
}

async function main() {
  const job = await loadJobPayload();
  const scanner = createScannerAdapter(process.env.SCANNER_ADAPTER);
  const effectiveJob = {
    ...job,
    scanner_context: resolveScannerContext({
      scannerContext: job.scanner_context,
      adapterKind: process.env.SCANNER_ADAPTER
    })
  };

  try {
    const result = await executeScanJob(effectiveJob, {
      fetchPage: createHttpFetchPage(effectiveJob.scanner_context?.user_agent),
      scanner,
      timeoutMs: Number.parseInt(process.env.WORKER_FETCH_TIMEOUT_MS ?? "30000", 10),
      retryDelayMs: Number.parseInt(process.env.WORKER_RETRY_DELAY_MS ?? "250", 10)
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    if (typeof scanner.close === "function") {
      await scanner.close();
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
