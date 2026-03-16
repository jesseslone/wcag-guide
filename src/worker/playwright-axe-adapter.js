function parseViewport(viewport = "1440x900") {
  const match = /^(\d+)x(\d+)$/.exec(viewport);
  if (!match) {
    return { width: 1440, height: 900 };
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10)
  };
}

export function mapAxeResultsToRawFindings(results = {}) {
  const findings = [];

  for (const violation of results.violations ?? []) {
    for (const node of violation.nodes ?? []) {
      findings.push({
        rule_id: violation.id,
        severity: violation.impact ?? "moderate",
        selector: Array.isArray(node.target) ? node.target.join(" ") : "",
        snippet: node.html ?? "",
        summary: node.failureSummary ?? violation.description ?? violation.help ?? "",
        failure_summary: node.failureSummary ?? "",
        rule_help: violation.help ?? "",
        rule_description: violation.description ?? "",
        rule_help_url: violation.helpUrl ?? "",
        rule_tags: Array.isArray(violation.tags) ? [...violation.tags] : []
      });
    }
  }

  return findings;
}

async function defaultLoadModules() {
  try {
    const [{ chromium }, axeModule] = await Promise.all([
      import("playwright"),
      import("@axe-core/playwright")
    ]);

    return {
      chromium,
      AxeBuilder: axeModule.default ?? axeModule.AxeBuilder ?? axeModule
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Playwright + axe adapter requires installed dependencies (`playwright`, `@axe-core/playwright`). "
        + `Original error: ${details}`
    );
  }
}

export function createPlaywrightAxeScannerAdapter(options = {}) {
  const loadModules = options.loadModules ?? defaultLoadModules;
  let browserPromise = null;
  let launchedBrowser = null;

  async function getBrowser() {
    if (options.browser != null) {
      return options.browser;
    }

    if (browserPromise == null) {
      browserPromise = (async () => {
        const { chromium } = await loadModules();
        launchedBrowser = await chromium.launch({
          headless: options.headless ?? true
        });
        return launchedBrowser;
      })();
    }

    return browserPromise;
  }

  return {
    async scanPage({ url, scannerContext, job }) {
      const { AxeBuilder } = await loadModules();
      const browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: scannerContext?.user_agent,
        viewport: parseViewport(scannerContext?.viewport)
      });
      const page = await context.newPage();

      try {
        await page.goto(url, {
          waitUntil: options.waitUntil ?? "networkidle",
          timeout: options.timeoutMs ?? 30000
        });

        let builder = new AxeBuilder({ page });
        const requestedTags = Array.isArray(job?.compliance_profile?.axe_tags) && job.compliance_profile.axe_tags.length > 0
          ? job.compliance_profile.axe_tags
          : options.tags;
        if (typeof builder.withTags === "function" && Array.isArray(requestedTags) && requestedTags.length > 0) {
          builder = builder.withTags(requestedTags);
        }
        if (
          typeof builder.disableRules === "function"
          && Array.isArray(options.disabledRules)
          && options.disabledRules.length > 0
        ) {
          builder = builder.disableRules(options.disabledRules);
        }

        const results = await builder.analyze();
        return mapAxeResultsToRawFindings(results);
      } finally {
        await page.close();
        await context.close();
      }
    },

    async close() {
      if (launchedBrowser != null) {
        await launchedBrowser.close();
        launchedBrowser = null;
        browserPromise = null;
      }
    }
  };
}
