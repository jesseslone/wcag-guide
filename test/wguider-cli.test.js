import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_APP_BASE_URL,
  DEFAULT_HEALTH_URL,
  DEFAULT_WAIT_SECONDS,
  deriveHealthUrl,
  ensureLocalStack,
  normalizeAppBaseUrl,
  parseMcpCommandArgs,
} from "../src/cli/mcp-command.js";
import { runCli } from "../src/cli/wguide.js";

test("parseMcpCommandArgs applies packaged defaults", () => {
  const options = parseMcpCommandArgs([], {});

  assert.equal(options.bootstrapMode, "auto");
  assert.equal(options.appBaseUrl, DEFAULT_APP_BASE_URL);
  assert.equal(options.healthUrl, DEFAULT_HEALTH_URL);
  assert.equal(options.waitSeconds, DEFAULT_WAIT_SECONDS);
});

test("parseMcpCommandArgs derives health checks from the app base URL", () => {
  const options = parseMcpCommandArgs([
    "--bootstrap=always",
    "--app-base-url",
    "http://127.0.0.1:18080/api/",
    "--wait-seconds",
    "45"
  ]);

  assert.equal(options.bootstrapMode, "always");
  assert.equal(options.appBaseUrl, "http://127.0.0.1:18080");
  assert.equal(options.healthUrl, "http://127.0.0.1:18080/healthz");
  assert.equal(options.waitSeconds, 45);
});

test("normalizeAppBaseUrl rejects invalid URLs and deriveHealthUrl is deterministic", () => {
  assert.equal(normalizeAppBaseUrl("http://127.0.0.1:8080/path/"), "http://127.0.0.1:8080");
  assert.equal(deriveHealthUrl("http://127.0.0.1:8080/path/"), DEFAULT_HEALTH_URL);
  assert.throws(() => normalizeAppBaseUrl("postgres://user@127.0.0.1/db"), /http or https/);
});

test("ensureLocalStack skips bootstrap when health is already good", async () => {
  let spawnCount = 0;

  const result = await ensureLocalStack(
    {
      bootstrapMode: "auto",
      healthUrl: DEFAULT_HEALTH_URL,
      waitSeconds: 1
    },
    {
      fetchImpl: async () => ({ ok: true }),
      spawnImpl() {
        spawnCount += 1;
        return {
          stdout: null,
          stderr: null,
          once() {
            return this;
          }
        };
      },
      log() {}
    }
  );

  assert.equal(spawnCount, 0);
  assert.equal(result.bootstrapped, false);
});

test("ensureLocalStack bootstraps when health is bad and auto mode is enabled", async () => {
  let fetchCount = 0;
  let spawnCount = 0;

  const result = await ensureLocalStack(
    {
      bootstrapMode: "auto",
      healthUrl: DEFAULT_HEALTH_URL,
      waitSeconds: 1
    },
    {
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: fetchCount > 1 };
      },
      spawnImpl() {
        spawnCount += 1;
        return {
          stdout: null,
          stderr: null,
          once(event, handler) {
            if (event === "close") {
              queueMicrotask(() => handler(0, null));
            }
            return this;
          }
        };
      },
      sleepImpl: async () => {},
      log() {}
    }
  );

  assert.equal(spawnCount, 1);
  assert.equal(result.bootstrapped, true);
});

test("ensureLocalStack fails clearly when bootstrap is disabled", async () => {
  await assert.rejects(
    () =>
      ensureLocalStack(
        {
          bootstrapMode: "never",
          healthUrl: DEFAULT_HEALTH_URL,
          waitSeconds: 1
        },
        {
          fetchImpl: async () => ({ ok: false }),
          log() {}
        }
      ),
    /bootstrap is disabled/
  );
});

test("runCli prints help for the mcp subcommand", async () => {
  let output = "";
  const exitCode = await runCli(["mcp", "--help"], {
    stdout: {
      write(chunk) {
        output += chunk;
      }
    }
  });

  assert.equal(exitCode, 0);
  assert.match(output, /Usage: wguide mcp/);
});
