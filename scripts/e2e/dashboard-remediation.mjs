import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
const selectedProfileId = process.env.E2E_COMPLIANCE_PROFILE_ID ?? "enhanced_22_aa";

async function assertOk(response, context) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context} failed: ${response.status} ${body}`);
  }
  return response;
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  await assertOk(response, `API ${path}`);
  return response.json();
}

async function waitForRunCompletion(runId, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const payload = await api(`/scan-runs/${runId}`);
    const state = payload.run.state;
    if (state === "completed") {
      return payload.run;
    }
    if (state === "failed") {
      throw new Error(`scan run ${runId} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for run ${runId}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const siteKey = `dashboard-m6-${Date.now()}`;

  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Run List");

    await page.click('button[data-action="open-new-scan-modal"]');
    await page.waitForSelector("text=Add a site and start a scan");

    await page.waitForFunction(() => {
      const select = document.querySelector('#new-scan-form select[name="compliance_profile_id"]');
      return select && select.options.length > 1;
    });

    const profileSelect = page.locator('#new-scan-form select[name="compliance_profile_id"]');
    await profileSelect.selectOption(selectedProfileId);

    const profileInfo = page.locator("#new-scan-form .info-panel");
    await profileInfo.waitFor();
    const profileHeading = (await profileInfo.locator("h3").textContent())?.trim();
    if (!profileHeading) {
      throw new Error("compliance profile context did not render in the modal");
    }

    await page.locator('#new-scan-form input[name="site_key"]').fill(siteKey);
    await page.locator('#new-scan-form input[name="environment"]').fill("local");
    await page.locator('#new-scan-form input[name="branch"]').fill("m6-browser");
    await page.locator('#new-scan-form input[name="base_url"]').fill("http://demo-site:8081");
    await page.locator('#new-scan-form input[name="reason"]').fill("dashboard m6 e2e");
    await page.locator('#new-scan-form input[name="max_pages"]').fill("10");
    await page.locator('#new-scan-form input[name="max_depth"]').fill("2");
    await page.locator('#new-scan-form input[name="concurrency"]').fill("2");
    await page.locator('#new-scan-form input[name="retries"]').fill("1");

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/scan-runs") && response.request().method() === "POST"
    );
    await page.locator('#new-scan-form button[type="submit"]').click();
    const createResponse = await createResponsePromise;
    if (!createResponse.ok()) {
      throw new Error(`scan creation failed with status ${createResponse.status()}`);
    }

    const createPayload = await createResponse.json();
    const runId = createPayload.run.id;
    if (createPayload.run.compliance_profile?.id !== selectedProfileId) {
      throw new Error("created run did not echo the selected compliance profile");
    }

    const run = await waitForRunCompletion(runId);
    await page.goto(`${baseUrl}/dashboard#/runs/${run.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Run Detail");
    await page.waitForSelector("text=High-Value Remediation Groups");
    await page.waitForSelector(`text=${run.compliance_profile.label}`);
    await page.waitForSelector(`text=${run.compliance_profile.standard_target}`);
    await page.waitForSelector(".hvt-list-item", { timeout: 30000 });

    const hvtListItems = page.locator(".hvt-list-item");
    if (await hvtListItems.count() < 1) {
      throw new Error("HVT workspace rendered without any selectable groups");
    }

    const firstHvtGroup = hvtListItems.first();
    await firstHvtGroup.click();

    const groupRule = (await firstHvtGroup.locator("strong").first().textContent())?.trim();
    const groupPathPrefix = (await firstHvtGroup.locator(".subtle").nth(1).textContent())?.trim();
    if (!groupRule) {
      throw new Error("selected HVT group is missing its representative rule");
    }

    const firstHvtButton = page.locator('button[data-action="filter-to-hvt"]').first();
    await firstHvtButton.click();

    await page.waitForFunction(
      ({ ruleId, pathPrefix }) => {
        const form = document.querySelector("#run-findings-filter-form");
        const ruleInput = form?.querySelector('[name="rule_id"]');
        const pathInput = form?.querySelector('[name="path_prefix"]');
        return ruleInput?.value === ruleId && pathInput?.value === pathPrefix;
      },
      {
        ruleId: groupRule,
        pathPrefix:
          !groupPathPrefix || groupPathPrefix === "Site-wide component cluster"
            ? ""
            : groupPathPrefix
      }
    );
    await page.waitForFunction(
      (ruleId) => {
        const detailHeading = document.querySelector("#finding-detail-pane h2")?.textContent?.trim();
        const selectedRow = document.querySelector("tr.selected[data-finding-row]");
        return detailHeading === ruleId && Boolean(selectedRow);
      },
      groupRule
    );

    const selectedRow = page.locator('tr.selected[data-finding-row]').first();
    await selectedRow.waitFor();
    const selectedFindingId = await selectedRow.getAttribute("data-finding-row");
    if (!selectedFindingId) {
      throw new Error("no selected finding row after HVT drill-down");
    }

    const detailHeading = (await page.locator("#finding-detail-pane h2").textContent())?.trim();
    if (detailHeading !== groupRule) {
      throw new Error(`finding detail rule mismatch after HVT drill-down: expected ${groupRule}, got ${detailHeading}`);
    }

    const locationHash = await page.evaluate(() => window.location.hash);
    if (!locationHash.includes(`finding=${selectedFindingId}`)) {
      throw new Error("finding selection did not stay in sync with the route after HVT drill-down");
    }

    console.log(
      JSON.stringify(
        {
          run_id: run.id,
          compliance_profile: run.compliance_profile.id,
          hvt_group_rule: groupRule,
          hvt_group_path_prefix: groupPathPrefix,
          selected_finding_id: selectedFindingId
        },
        null,
        2
      )
    );
    console.log("Dashboard M6 E2E passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
