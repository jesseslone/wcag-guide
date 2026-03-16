import crypto from "node:crypto";
import { normalizeUrl } from "./url-normalization.js";

const UUID_SEGMENT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT_REGEX = /^\d+$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizePageTemplate(normalizedUrl) {
  const parsed = new URL(normalizedUrl);
  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      if (INTEGER_SEGMENT_REGEX.test(segment)) {
        return "{int}";
      }
      if (UUID_SEGMENT_REGEX.test(segment)) {
        return "{uuid}";
      }
      return segment;
    });

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function normalizeSelector(selector = "") {
  const withoutVolatileIds = selector.replace(/#[A-Za-z0-9_-]{10,}/g, "#id");
  const withoutVolatileClasses = withoutVolatileIds
    .replace(/\.(css|jsx|sc)-[A-Za-z0-9_-]{6,}/g, ".cls")
    .replace(/\.[A-Za-z0-9_-]{14,}/g, ".cls");

  return withoutVolatileClasses.replace(/\s+/g, " ").trim();
}

export function normalizeSnippet(snippet = "") {
  return snippet.replace(/\s+/g, " ").trim().slice(0, 256);
}

export function buildFindingFingerprint({
  ruleId,
  pageUrl,
  domSelector,
  htmlSnippet,
  normalizationOptions
}) {
  if (!ruleId) {
    throw new Error("ruleId is required");
  }

  const normalized = normalizeUrl(pageUrl, normalizationOptions);
  if (!normalized.ok) {
    throw new Error(`Cannot normalize pageUrl: ${normalized.reason}`);
  }

  const normalizedPageTemplate = normalizePageTemplate(normalized.normalizedUrl);
  const normalizedSelector = normalizeSelector(domSelector);
  const normalizedSnippet = normalizeSnippet(htmlSnippet);
  const snippetHash = sha256(normalizedSnippet);

  const composed = [ruleId, normalizedPageTemplate, normalizedSelector, snippetHash].join("|");
  const fingerprint = sha256(composed);

  return {
    fingerprint,
    fingerprintVersion: "fp-v1",
    normalizationVersion: normalized.normalizationVersion,
    components: {
      ruleId,
      normalizedPageTemplate,
      normalizedSelector,
      snippetHash,
      normalizedUrl: normalized.normalizedUrl
    }
  };
}
