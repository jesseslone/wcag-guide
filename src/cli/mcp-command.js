import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_BOOTSTRAP_MODE = "auto";
export const DEFAULT_APP_BASE_URL = "http://127.0.0.1:8080";
export const DEFAULT_HEALTH_URL = `${DEFAULT_APP_BASE_URL}/healthz`;
export const DEFAULT_WAIT_SECONDS = 90;

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultUpScript = path.join(packageRoot, "scripts/dev/up.sh");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(output, message) {
  output.write(`[wguide] ${message}\n`);
}

function requireValue(argv, index, flagName) {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function normalizeBootstrapMode(value) {
  const normalized = value.toLowerCase();
  if (!["auto", "always", "never"].includes(normalized)) {
    throw new Error(`--bootstrap must be one of: auto, always, never`);
  }
  return normalized;
}

export function normalizeAppBaseUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("--app-base-url must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("--app-base-url must use http or https");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export function deriveHealthUrl(appBaseUrl) {
  return new URL("/healthz", `${normalizeAppBaseUrl(appBaseUrl)}/`).toString();
}

export function printMcpUsage(output = process.stdout) {
  output.write(`Usage: wguide mcp [options]

Options:
  --bootstrap[=MODE]   Bootstrap mode: auto, always, or never (default: auto)
  --no-bootstrap       Disable local stack bootstrap
  --app-base-url URL   API base URL used by bootstrap checks and MCP requests
  --wait-seconds N     Maximum time to wait for health after bootstrap
  --help               Show this help

Defaults:
  APP_BASE_URL / WGUIDE_APP_BASE_URL: ${DEFAULT_APP_BASE_URL}
  derived health check: ${deriveHealthUrl(DEFAULT_APP_BASE_URL)}
  WGUIDE_WAIT_SECONDS: ${DEFAULT_WAIT_SECONDS}
`);
}

export function parseMcpCommandArgs(argv, env = process.env) {
  const options = {
    bootstrapMode: normalizeBootstrapMode(env.WGUIDE_BOOTSTRAP ?? DEFAULT_BOOTSTRAP_MODE),
    appBaseUrl: normalizeAppBaseUrl(
      env.WGUIDE_APP_BASE_URL ?? env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL
    ),
    waitSeconds: parsePositiveInteger(
      env.WGUIDE_WAIT_SECONDS ?? `${DEFAULT_WAIT_SECONDS}`,
      "WGUIDE_WAIT_SECONDS"
    ),
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--no-bootstrap") {
      options.bootstrapMode = "never";
      continue;
    }

    if (token === "--bootstrap") {
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        options.bootstrapMode = normalizeBootstrapMode(next);
        index += 1;
      } else {
        options.bootstrapMode = "auto";
      }
      continue;
    }

    if (token.startsWith("--bootstrap=")) {
      options.bootstrapMode = normalizeBootstrapMode(token.slice("--bootstrap=".length));
      continue;
    }

    if (token === "--app-base-url") {
      options.appBaseUrl = normalizeAppBaseUrl(
        requireValue(argv, index + 1, "--app-base-url")
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--app-base-url=")) {
      options.appBaseUrl = normalizeAppBaseUrl(token.slice("--app-base-url=".length));
      continue;
    }

    if (token === "--wait-seconds") {
      options.waitSeconds = parsePositiveInteger(
        requireValue(argv, index + 1, "--wait-seconds"),
        "--wait-seconds"
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--wait-seconds=")) {
      options.waitSeconds = parsePositiveInteger(
        token.slice("--wait-seconds=".length),
        "--wait-seconds"
      );
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  options.healthUrl = deriveHealthUrl(options.appBaseUrl);
  return options;
}

export async function checkHealth(healthUrl, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(
  { healthUrl, timeoutMs, intervalMs = 1000 },
  { fetchImpl = globalThis.fetch, sleepImpl = sleep } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (await checkHealth(healthUrl, fetchImpl)) {
      return true;
    }
    await sleepImpl(intervalMs);
  }

  return false;
}

function relayStreamToOutput(stream, output) {
  if (!stream) {
    return;
  }
  stream.on("data", (chunk) => {
    output.write(chunk);
  });
}

export async function runBootstrapCommand(
  { cwd = packageRoot, env = process.env, scriptPath = defaultUpScript },
  { spawnImpl = spawn, output = process.stderr } = {}
) {
  if (!existsSync(scriptPath)) {
    throw new Error(`Bootstrap script is missing: ${scriptPath}`);
  }

  await new Promise((resolve, reject) => {
    const child = spawnImpl(scriptPath, [], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    relayStreamToOutput(child.stdout, output);
    relayStreamToOutput(child.stderr, output);

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`Bootstrap script exited via signal ${signal}`));
        return;
      }

      reject(new Error(`Bootstrap script exited with code ${code ?? "unknown"}`));
    });
  });
}

export function checkDockerAvailable(execImpl = execFileSync) {
  try {
    execImpl("docker", ["info"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureLocalStack(options, dependencies = {}) {
  const output = dependencies.stderr ?? process.stderr;
  const log = dependencies.log ?? ((message) => writeLog(output, message));
  const packageDir = dependencies.packageRoot ?? packageRoot;
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const execImpl = dependencies.execImpl ?? execFileSync;

  log(`checking local stack health at ${options.healthUrl}`);
  const healthy = await checkHealth(options.healthUrl, fetchImpl);

  if (healthy && options.bootstrapMode !== "always") {
    log("local stack is already healthy");
    return {
      bootstrapped: false,
      healthUrl: options.healthUrl
    };
  }

  if (!healthy && options.bootstrapMode === "never") {
    throw new Error(
      `Local stack is not healthy at ${options.healthUrl} and bootstrap is disabled. Run ./scripts/dev/up.sh or retry without --no-bootstrap.`
    );
  }

  if (!checkDockerAvailable(execImpl)) {
    throw new Error(
      "Docker is not running. WCAG-Guide requires Docker to run the local stack.\n" +
      "  - Start Docker Desktop (or your Docker daemon) and try again.\n" +
      "  - Then run: ./scripts/dev/up.sh"
    );
  }

  if (healthy) {
    log("local stack is healthy; running bootstrap anyway because bootstrap mode is always");
  } else {
    log("local stack is not healthy; bootstrapping with ./scripts/dev/up.sh");
  }

  await runBootstrapCommand(
    {
      cwd: packageDir,
      env
    },
    {
      spawnImpl: dependencies.spawnImpl,
      output
    }
  );

  log(`waiting for local stack health at ${options.healthUrl} for up to ${options.waitSeconds}s`);

  const ready = await waitForHealth(
    {
      healthUrl: options.healthUrl,
      timeoutMs: options.waitSeconds * 1000
    },
    {
      fetchImpl,
      sleepImpl: dependencies.sleepImpl
    }
  );

  if (!ready) {
    throw new Error(
      `Local stack did not become healthy at ${options.healthUrl} within ${options.waitSeconds}s after bootstrap. Inspect docker compose ps and docker compose logs app worker db demo-site.`
    );
  }

  log("local stack is healthy");
  return {
    bootstrapped: true,
    healthUrl: options.healthUrl
  };
}

export async function runMcpCommand(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const env = dependencies.env ?? process.env;
  const options = parseMcpCommandArgs(argv, env);

  if (options.help) {
    printMcpUsage(stdout);
    return 0;
  }

  const log = dependencies.log ?? ((message) => writeLog(stderr, message));

  await ensureLocalStack(options, {
    ...dependencies,
    env,
    stderr,
    log
  });

  log(`starting MCP server against ${options.appBaseUrl}`);

  const listenMcpServer =
    dependencies.listenMcpServer ??
    (await import("../mcp/start-server.js")).listenMcpServer;

  await listenMcpServer({
    appBaseUrl: options.appBaseUrl,
    logger(event) {
      stderr.write(`${JSON.stringify(event)}\n`);
    }
  });

  return 0;
}
