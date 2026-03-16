const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^gclid$/i,
  /^fbclid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i
];

function isTrackingParam(name) {
  return TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizePathname(pathname) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed === "/") {
    return "/";
  }
  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function normalizeHost(hostname) {
  return hostname.toLowerCase();
}

function normalizePort(protocol, port) {
  if (!port) {
    return "";
  }
  if ((protocol === "http:" && port === "80") || (protocol === "https:" && port === "443")) {
    return "";
  }
  return port;
}

function normalizeSearch(params, queryParamAllowlist = []) {
  const allowed = new Set(queryParamAllowlist);
  const normalizedEntries = [];

  for (const [key, value] of params.entries()) {
    if (isTrackingParam(key)) {
      continue;
    }
    if (allowed.size > 0 && !allowed.has(key)) {
      continue;
    }
    if (allowed.size === 0) {
      continue;
    }
    normalizedEntries.push([key, value]);
  }

  normalizedEntries.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1].localeCompare(b[1]);
    }
    return a[0].localeCompare(b[0]);
  });

  const result = new URLSearchParams();
  for (const [key, value] of normalizedEntries) {
    result.append(key, value);
  }
  const serialized = result.toString();
  return serialized ? `?${serialized}` : "";
}

function isPathAllowed(pathname, pathAllowlist = [], pathDenylist = []) {
  if (pathDenylist.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  if (pathAllowlist.length === 0) {
    return true;
  }
  return pathAllowlist.some((prefix) => pathname.startsWith(prefix));
}

export function normalizeUrl(rawUrl, options = {}) {
  const {
    baseUrl,
    allowedDomains = [],
    pathAllowlist = [],
    pathDenylist = [],
    queryParamAllowlist = []
  } = options;

  let parsed;
  try {
    parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "unsupported_scheme" };
  }

  const hostname = normalizeHost(parsed.hostname);
  if (allowedDomains.length > 0 && !allowedDomains.includes(hostname)) {
    return { ok: false, reason: "domain_not_allowed" };
  }

  const pathname = normalizePathname(parsed.pathname || "/");
  if (!isPathAllowed(pathname, pathAllowlist, pathDenylist)) {
    return { ok: false, reason: "path_not_allowed" };
  }

  const protocol = parsed.protocol.toLowerCase();
  const port = normalizePort(protocol, parsed.port);
  const search = normalizeSearch(parsed.searchParams, queryParamAllowlist);

  const normalized = `${protocol}//${hostname}${port ? `:${port}` : ""}${pathname}${search}`;

  return {
    ok: true,
    normalizedUrl: normalized,
    normalizedPath: pathname,
    normalizationVersion: "norm-v1"
  };
}
