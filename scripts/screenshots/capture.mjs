#!/usr/bin/env node
/**
 * Deterministic screenshot capture for WCAG-Guide dashboard.
 *
 * Starts the app server with in-memory fixtures and captures each
 * view × theme combination at 1440×900.
 *
 * Usage:  node scripts/screenshots/capture.mjs
 * Output: screenshots/<view>-<theme>.png
 */

import http from "node:http";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createRequestHandler } from "../../src/app/create-server.js";
import { createService } from "../../test-support/mcp-fixtures.js";

const VIEWPORT = { width: 1440, height: 900 };
const OUTPUT_DIR = new URL("../../screenshots/", import.meta.url).pathname;
const THEMES = ["light", "dark", "code"];

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const FINDING_ID = "44444444-4444-4444-8444-444444444441";

async function startServer() {
  const { service } = createService();
  const handler = createRequestHandler({ service });
  const server = http.createServer(handler);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function waitForData(page, selector, timeout = 8000) {
  // Poll until the selector appears — handles async data loading
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const el = await page.$(selector);
    if (el) return;
    await page.waitForTimeout(100);
  }
}

async function navigateWithTheme(page, baseUrl, theme, hash) {
  // Set theme via URL param, then navigate
  const url = `${baseUrl}/dashboard?theme=${theme}${hash ? "#" + hash : ""}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(".shell", { timeout: 5000 });
  // Give the async data fetches time to complete and re-render
  await page.waitForTimeout(800);
}

async function captureRunsList(page, theme, baseUrl) {
  await navigateWithTheme(page, baseUrl, theme, "/runs");
  await waitForData(page, ".interactive-row");
  await page.screenshot({
    path: `${OUTPUT_DIR}runs-list-${theme}.png`,
    fullPage: false
  });
  console.log(`  runs-list-${theme}.png`);
}

async function captureRunDetail(page, theme, baseUrl) {
  await navigateWithTheme(page, baseUrl, theme, `/runs/${RUN_ID}`);
  await waitForData(page, ".run-meta");
  await page.screenshot({
    path: `${OUTPUT_DIR}run-detail-${theme}.png`,
    fullPage: false
  });
  console.log(`  run-detail-${theme}.png`);
}

async function captureHvtPane(page, theme, baseUrl) {
  await navigateWithTheme(page, baseUrl, theme, `/runs/${RUN_ID}`);
  await waitForData(page, ".run-meta");

  // Click the HVT tab
  const hvtTab = await page.$('[data-action="load-hvt-groups"]');
  if (hvtTab) {
    await hvtTab.click();
    await page.waitForTimeout(800);
  }

  // Click the first HVT group row
  const hvtRow = await page.$('[data-action="select-hvt-group"]');
  if (hvtRow) {
    await hvtRow.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({
    path: `${OUTPUT_DIR}hvt-pane-${theme}.png`,
    fullPage: false
  });
  console.log(`  hvt-pane-${theme}.png`);
}

async function captureFindingDetail(page, theme, baseUrl) {
  await navigateWithTheme(
    page, baseUrl, theme,
    `/runs/${RUN_ID}?finding=${FINDING_ID}`
  );
  await waitForData(page, "#finding-detail-pane");
  await page.screenshot({
    path: `${OUTPUT_DIR}finding-detail-${theme}.png`,
    fullPage: false
  });
  console.log(`  finding-detail-${theme}.png`);
}

async function captureAddSiteModal(page, theme, baseUrl) {
  await navigateWithTheme(page, baseUrl, theme, "/runs");
  await waitForData(page, ".interactive-row");

  const addBtn = await page.$('[data-action="open-new-scan-modal"]');
  if (addBtn) {
    await addBtn.click();
    await page.waitForSelector(".modal-panel", { timeout: 5000 });
    await page.waitForTimeout(300);
  }

  await page.screenshot({
    path: `${OUTPUT_DIR}add-site-modal-${theme}.png`,
    fullPage: false
  });
  console.log(`  add-site-modal-${theme}.png`);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const { server, baseUrl } = await startServer();
  console.log(`Server listening at ${baseUrl}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });

  try {
    for (const theme of THEMES) {
      console.log(`\nCapturing ${theme} theme:`);
      const page = await context.newPage();

      await captureRunsList(page, theme, baseUrl);
      await captureRunDetail(page, theme, baseUrl);
      await captureHvtPane(page, theme, baseUrl);
      await captureFindingDetail(page, theme, baseUrl);
      await captureAddSiteModal(page, theme, baseUrl);

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\nDone — ${THEMES.length * 5} screenshots in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
