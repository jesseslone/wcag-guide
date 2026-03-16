import { buildFindingFingerprint } from "./fingerprint.js";
import { normalizeUrl } from "./url-normalization.js";

const demoRuleMetadata = Object.freeze({
  "image-alt": {
    rule_help: "Images must have alternate text",
    rule_description: "Informative images require text alternatives so screen readers can announce their meaning.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
    rule_tags: ["wcag2a", "wcag111", "section508", "section508.22.a"]
  },
  "link-name": {
    rule_help: "Links must have discernible text",
    rule_description: "Links need an accessible name so users can understand where they go.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/link-name",
    rule_tags: ["wcag2a", "wcag244", "wcag412", "section508", "section508.22.a"]
  },
  "button-name": {
    rule_help: "Buttons must have discernible text",
    rule_description: "Buttons need an accessible name so assistive technology can announce their purpose.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/button-name",
    rule_tags: ["wcag2a", "wcag412", "section508", "section508.22.a"]
  },
  "page-has-heading-one": {
    rule_help: "Page should contain a level-one heading",
    rule_description: "Each page should expose a primary heading that identifies the page content.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/page-has-heading-one",
    rule_tags: ["best-practice"]
  },
  "document-title": {
    rule_help: "Documents must have a title element",
    rule_description: "Pages need a descriptive title so users can identify them in browser tabs and assistive technology.",
    rule_help_url: "https://dequeuniversity.com/rules/axe/4.11/document-title",
    rule_tags: ["wcag2a", "wcag242"]
  }
});

function withRuleMetadata(finding) {
  return {
    ...finding,
    ...(demoRuleMetadata[finding.rule_id] ?? {}),
    failure_summary: finding.failure_summary ?? ""
  };
}

function stripTags(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function hasAttribute(attributes = "", name) {
  const pattern = new RegExp(`\\b${name}\\s*=`, "i");
  return pattern.test(attributes);
}

function hasNonEmptyAriaLabel(attributes = "") {
  const match = attributes.match(/\baria-label\s*=\s*["']([^"']+)["']/i);
  return Boolean(match && match[1].trim().length > 0);
}

function extractLinks(html) {
  const links = [];
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(regex)) {
    links.push(match[1]);
  }

  return links;
}

async function fetchHtml(url, userAgent) {
  const response = await fetch(url, {
    headers: {
      "user-agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

export async function collectPages({
  baseUrl,
  mode,
  seedUrls = [],
  pathPrefix,
  scanOptions,
  userAgent
}) {
  const base = new URL(baseUrl);
  const allowedDomains = [base.hostname.toLowerCase()];
  const visited = new Set();
  const queued = [];
  const pages = [];

  const startUrls = mode === "page"
    ? seedUrls
    : (seedUrls.length > 0 ? seedUrls : [baseUrl]);

  for (const rawUrl of startUrls) {
    const normalized = normalizeUrl(rawUrl, {
      baseUrl,
      allowedDomains,
      queryParamAllowlist: scanOptions.query_param_allowlist
    });

    if (!normalized.ok || visited.has(normalized.normalizedUrl)) {
      continue;
    }

    visited.add(normalized.normalizedUrl);
    queued.push({
      rawUrl,
      normalizedUrl: normalized.normalizedUrl,
      normalizedPath: normalized.normalizedPath,
      depth: 0
    });
  }

  while (queued.length > 0 && pages.length < scanOptions.max_pages) {
    const current = queued.shift();

    let html;
    try {
      html = await fetchHtml(current.rawUrl, userAgent);
    } catch {
      continue;
    }

    const isPathScoped = mode !== "path"
      || current.normalizedPath.startsWith(pathPrefix)
      || current.depth === 0;

    if (mode !== "path" || current.normalizedPath.startsWith(pathPrefix)) {
      pages.push({
        rawUrl: current.rawUrl,
        normalizedUrl: current.normalizedUrl,
        normalizedPath: current.normalizedPath,
        html
      });
    }

    if (current.depth >= scanOptions.max_depth || !isPathScoped) {
      continue;
    }

    for (const href of extractLinks(html)) {
      const normalized = normalizeUrl(href, {
        baseUrl: current.rawUrl,
        allowedDomains,
        pathAllowlist: mode === "full" ? scanOptions.path_allowlist : [],
        pathDenylist: scanOptions.path_denylist,
        queryParamAllowlist: scanOptions.query_param_allowlist
      });

      if (!normalized.ok || visited.has(normalized.normalizedUrl)) {
        continue;
      }

      visited.add(normalized.normalizedUrl);
      queued.push({
        rawUrl: normalized.normalizedUrl,
        normalizedUrl: normalized.normalizedUrl,
        normalizedPath: normalized.normalizedPath,
        depth: current.depth + 1
      });
    }
  }

  return pages;
}

export function scanPageForFindings(page, normalizationOptions) {
  const findings = [];
  let imgIndex = 0;
  let linkIndex = 0;
  let buttonIndex = 0;

  for (const match of page.html.matchAll(/<img\b([^>]*)>/gi)) {
    imgIndex += 1;
    const attributes = match[1] ?? "";
    if (hasAttribute(attributes, "alt")) {
      continue;
    }

    findings.push({
      rule_id: "image-alt",
      severity: "serious",
      selector: `img:nth-of-type(${imgIndex})`,
      snippet: match[0]
    });
  }

  for (const match of page.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    linkIndex += 1;
    const attributes = match[1] ?? "";
    const text = stripTags(match[2] ?? "");
    if (text.length > 0 || hasNonEmptyAriaLabel(attributes)) {
      continue;
    }

    findings.push({
      rule_id: "link-name",
      severity: "serious",
      selector: `a:nth-of-type(${linkIndex})`,
      snippet: match[0]
    });
  }

  for (const match of page.html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    buttonIndex += 1;
    const attributes = match[1] ?? "";
    const text = stripTags(match[2] ?? "");
    if (text.length > 0 || hasNonEmptyAriaLabel(attributes)) {
      continue;
    }

    findings.push({
      rule_id: "button-name",
      severity: "serious",
      selector: `button:nth-of-type(${buttonIndex})`,
      snippet: match[0]
    });
  }

  if (!/<h1\b/i.test(page.html)) {
    findings.push({
      rule_id: "page-has-heading-one",
      severity: "moderate",
      selector: "h1",
      snippet: "<body>"
    });
  }

  if (!/<title\b/i.test(page.html)) {
    findings.push({
      rule_id: "document-title",
      severity: "serious",
      selector: "head > title",
      snippet: "<head>"
    });
  }

  return findings.map((finding) => {
    const fingerprint = buildFindingFingerprint({
      ruleId: finding.rule_id,
      pageUrl: page.normalizedUrl,
      domSelector: finding.selector,
      htmlSnippet: finding.snippet,
      normalizationOptions
    });

    return withRuleMetadata({
      ...finding,
      ...fingerprint
    });
  });
}
