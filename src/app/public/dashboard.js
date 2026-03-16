const findingStatuses = ["open", "in_progress", "resolved", "ignored"];
const findingSeverities = ["critical", "serious", "moderate", "minor"];
const findingDiffStatuses = ["new", "persistent", "resolved"];

const state = {
  route: parseRoute(),
  runs: {
    loading: false,
    error: "",
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    filters: {
      site_key: "",
      environment: "",
      branch: ""
    }
  },
  runDetail: {
    loading: false,
    error: "",
    run: null,
    findingsLoading: false,
    findingsError: "",
    findings: [],
    hvtGroupsLoading: false,
    hvtGroupsError: "",
    hvtGroups: [],
    selectedHvtGroupId: null,
    hvtGroupLevel: "fix_surface_cluster",
    findingsTotal: 0,
    findingsPage: 1,
    findingsPageSize: 50,
    filters: {
      status: "",
      severity: "",
      rule_id: "",
      path_prefix: "",
      diff_status: ""
    },
    rescanError: "",
    rescanSubmitting: "",
    rescanForms: {
      full: { reason: "" },
      path: { path_prefix: "", reason: "" },
      page: { page_url: "", reason: "" }
    }
  },
  findings: {
    loading: false,
    error: "",
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    filters: {
      site_key: "",
      environment: "",
      branch: "",
      status: "",
      severity: "",
      rule_id: "",
      path_prefix: ""
    }
  },
  complianceProfiles: {
    loading: false,
    error: "",
    items: [],
    defaultProfileId: ""
  },
  findingDetail: {
    loading: false,
    error: "",
    item: null,
    statusHistory: [],
    submitting: false,
    submitError: "",
    form: {
      status: "open",
      note: "",
      ignore_expires_at: ""
    }
  },
  activeRuns: [],
  modal: {
    kind: "",
    submitting: false,
    error: "",
    deleteRun: null,
    newScan: {
      site_key: "",
      environment: "local",
      branch: "main",
      base_url: "",
      compliance_profile_id: "",
      reason: "",
      max_pages: 250,
      max_depth: 4,
      concurrency: 4,
      retries: 1,
      path_allowlist: "",
      path_denylist: "",
      seed_urls: ""
    }
  }
};

let pollHandle = null;
let lastAlignedSelectionKey = "";

function parseRoute() {
  const rawHash = window.location.hash.replace(/^#/, "") || "/runs";
  const url = new URL(rawHash.startsWith("/") ? `http://local${rawHash}` : `http://local/${rawHash}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "runs" && parts[1]) {
    return {
      view: "run-detail",
      runId: parts[1],
      findingId: url.searchParams.get("finding")
    };
  }

  return {
    view: "runs",
    findingId: null
  };
}

function setRoute(route) {
  window.location.hash = route;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "Not finished";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  return parsed.toISOString();
}

function renderBadge(value, kind = value) {
  return `<span class="pill ${escapeHtml(kind)}">${escapeHtml(String(value).replaceAll("_", " "))}</span>`;
}

function pathFromUrl(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function getFindingGuidance(ruleId) {
  const catalog = {
    "page-has-heading-one": {
      title: "Add a clear page-level H1",
      summary: "Each page should have one primary heading that identifies the page content.",
      whereToLook: "Check the page template or page-header component. The H1 is often missing because the visual title is rendered as a div or lower-level heading.",
      options: [
        "Promote the visible page title to an h1 element.",
        "Ensure there is only one primary page title, not multiple competing H1s.",
        "If the page title is injected by a layout component, fix it once in the template."
      ]
    },
    "heading-order": {
      title: "Fix heading hierarchy",
      summary: "Headings should step through the page structure in order so assistive technology can understand the outline.",
      whereToLook: "Review the content block or component around the reported selector. Look for skipped heading levels such as h1 to h3 or h2 to h4.",
      options: [
        "Use the next logical heading level instead of skipping.",
        "If styling is driving the wrong heading tag, keep the semantic heading and change the CSS instead.",
        "Check reusable card and section-heading components for repeated misuse."
      ]
    },
    "empty-heading": {
      title: "Remove or populate empty headings",
      summary: "A heading element exists, but it has no accessible text.",
      whereToLook: "Inspect the exact element matched by the selector. Empty headings often come from placeholder markup or hidden dynamic content that never renders.",
      options: [
        "Add meaningful heading text.",
        "Remove the empty heading if it is not needed.",
        "If content is injected dynamically, confirm it always renders before the heading is exposed."
      ]
    },
    "color-contrast": {
      title: "Increase text contrast",
      summary: "The foreground and background colors do not provide enough contrast for readable text.",
      whereToLook: "Inspect the CSS applied to the selector. This often comes from theme tokens, button styles, muted text, or links placed on colored cards.",
      options: [
        "Darken the text color, lighten the background, or both.",
        "Fix the shared CSS token if the problem appears on many pages.",
        "Recheck hover, focus, and disabled states, not just the default state."
      ]
    },
    "image-alt": {
      title: "Add alternative text to informative images",
      summary: "Images that convey meaning need an alt attribute that describes their purpose.",
      whereToLook: "Check the image component or CMS field used to render the image.",
      options: [
        "Add concise alt text that communicates the image’s function or content.",
        "Use empty alt text only for decorative images.",
        "If many images are affected, fix the template or content entry workflow."
      ]
    },
    label: {
      title: "Associate labels with form controls",
      summary: "Inputs need programmatic labels so screen readers can identify them.",
      whereToLook: "Inspect the form control and the surrounding label markup. Custom form components commonly lose the label association.",
      options: [
        "Use a label element tied to the input via for and id.",
        "Wrap the input inside the label if appropriate.",
        "For custom widgets, use the correct accessible name pattern and verify it in the rendered DOM."
      ]
    },
    "link-name": {
      title: "Give links an accessible name",
      summary: "Links need visible or programmatic text that explains where they go.",
      whereToLook: "Look for icon-only links, empty anchors, or links whose text is visually hidden incorrectly.",
      options: [
        "Add descriptive visible link text.",
        "Use aria-label only when there is no appropriate visible text option.",
        "If the issue comes from a shared icon-link component, fix it once there."
      ]
    },
    "button-name": {
      title: "Give buttons an accessible name",
      summary: "Buttons need text or another accessible naming mechanism so their purpose is announced.",
      whereToLook: "Inspect icon buttons, menu toggles, and custom controls rendered as buttons.",
      options: [
        "Add visible button text where possible.",
        "Use aria-label for icon-only buttons when visible text is not appropriate.",
        "Confirm the accessible name stays accurate across open/closed states."
      ]
    },
    "document-title": {
      title: "Set a meaningful document title",
      summary: "Each page should have a descriptive title element so users can identify it in browser tabs and assistive technology.",
      whereToLook: "Check the page template, router-level metadata, or CMS title mapping.",
      options: [
        "Set a unique, descriptive title for each page.",
        "Include the page topic before the site name where possible.",
        "Fix the layout or head-management utility if the issue spans many pages."
      ]
    },
    "duplicate-id": {
      title: "Remove duplicate IDs",
      summary: "IDs must be unique within the page so labels, scripts, and ARIA references point to the correct element.",
      whereToLook: "Inspect repeated widgets, form fields, or accordion components rendered from shared templates.",
      options: [
        "Generate unique IDs for repeated components.",
        "Avoid hard-coded IDs in reusable partials.",
        "If labels or aria-describedby rely on the ID, update those references too."
      ]
    },
    "aria-required-children": {
      title: "Add the required child roles",
      summary: "Some ARIA roles only work when specific child roles are present beneath them.",
      whereToLook: "Inspect custom widgets such as menus, tablists, lists, trees, or radiogroups.",
      options: [
        "Use native HTML controls when possible instead of custom ARIA widgets.",
        "If you must use ARIA, add the required child roles and verify the full pattern.",
        "Check keyboard behavior too; role fixes alone are not enough."
      ]
    },
    "aria-prohibited-attr": {
      title: "Remove unsupported ARIA attributes",
      summary: "The element has an ARIA attribute that is not allowed for that role or element.",
      whereToLook: "Review custom components that add ARIA generically across many element types.",
      options: [
        "Remove the prohibited ARIA attribute.",
        "Use the correct native element or role instead of patching semantics with extra ARIA.",
        "Audit shared component wrappers that may be applying the same invalid attribute repeatedly."
      ]
    },
    "html-has-lang": {
      title: "Set the page language",
      summary: "The root html element should declare the page language so screen readers use the correct pronunciation rules.",
      whereToLook: "Check the top-level document template or server-rendered layout.",
      options: [
        "Set lang on the html element, typically to en for English content.",
        "If the site supports multiple languages, ensure each page sets the correct value dynamically."
      ]
    },
    "landmark-unique": {
      title: "Make landmark labels unique",
      summary: "Landmarks with the same role should have distinct labels when there is more than one of them.",
      whereToLook: "Review repeated navigation, complementary, or region landmarks on the page.",
      options: [
        "Add unique accessible labels to repeated landmarks.",
        "Remove redundant landmarks that do not add navigation value."
      ]
    },
    "landmark-complementary-is-top-level": {
      title: "Keep complementary landmarks top-level",
      summary: "Complementary landmarks should not be deeply nested in a way that obscures the page structure.",
      whereToLook: "Inspect sidebar or aside regions placed inside nested containers or repeated cards.",
      options: [
        "Move the aside/complementary region to a more appropriate top-level section.",
        "If the content is not truly complementary landmark content, use a regular div or section instead."
      ]
    }
  };

  return catalog[ruleId] ?? {
    title: "Review the rule and the affected element",
    summary: "This finding needs manual review in the context of the reported selector and page.",
    whereToLook: "Start with the selector and snippet shown below. Check the shared template or component that renders this pattern.",
    options: [
      "Inspect the affected element in the browser and compare it with the rule name.",
      "Check whether the issue comes from a shared component, layout, or CSS token.",
      "Verify the fix with a rescan of the page after making the change."
    ]
  };
}

function renderField({
  label,
  name,
  value = "",
  type = "text",
  placeholder = "",
  options = null,
  includeEmpty = true
}) {
  if (type === "select") {
    const normalizedOptions = options.map((option) => typeof option === "string"
      ? { value: option, label: option.replaceAll("_", " ") }
      : option
    );
    return `
      <div class="field">
        <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
        <select id="${escapeHtml(name)}" name="${escapeHtml(name)}">
          ${includeEmpty ? '<option value="">All</option>' : ""}
          ${normalizedOptions.map((option) => `
            <option value="${escapeHtml(option.value)}" ${value === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>
          `).join("")}
        </select>
      </div>
    `;
  }

  if (type === "textarea") {
    return `
      <div class="field">
        <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
        <textarea id="${escapeHtml(name)}" name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
      </div>
    `;
  }

  return `
    <div class="field">
      <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
      >
    </div>
  `;
}

function getComplianceProfile(profileId) {
  return state.complianceProfiles.items.find((profile) => profile.id === profileId) ?? null;
}

function getSelectedModalComplianceProfile() {
  const selectedId = state.modal.newScan.compliance_profile_id || state.complianceProfiles.defaultProfileId;
  return getComplianceProfile(selectedId);
}

function renderTagPills(tags = []) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return '<p class="hint">No tags published for this item.</p>';
  }

  return `
    <div class="tag-list">
      ${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function hasEnrichedGuidance(finding) {
  const metadata = finding.rule_metadata ?? {};
  return Boolean(
    metadata.rule_help ||
    metadata.rule_description ||
    metadata.rule_help_url ||
    (Array.isArray(metadata.rule_tags) && metadata.rule_tags.length > 0)
  );
}

function renderLoading(message) {
  return `<div class="loading">${escapeHtml(message)}</div>`;
}

function renderEmpty(title, body) {
  return `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function renderError(title, body) {
  return `
    <div class="error-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function splitLines(value) {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderNav() {
  return "";
}

function countOpenFindingsInView() {
  const seen = new Set();

  return state.runDetail.findings.reduce((count, finding) => {
    if (finding.status !== "open" || seen.has(finding.id)) {
      return count;
    }

    seen.add(finding.id);
    return count + 1;
  }, 0);
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("wcag-guide-theme", theme);
}

function renderThemeSwitcher() {
  const active = currentTheme();
  const themes = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "code", label: "Code" }
  ];
  return `<div class="theme-switcher">${themes.map((t) =>
    `<button class="theme-btn${t.id === active ? " theme-btn--active" : ""}" data-action="set-theme" data-theme="${t.id}">${t.label}</button>`
  ).join("")}</div>`;
}

function renderHero() {
  const activeCount = state.activeRuns.filter((run) => run.state === "queued" || run.state === "running").length;
  const openFindings = countOpenFindingsInView();

  return `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-copy-row">
          <h1>Improve Site Accessibility</h1>
          <p>Triage findings, update status, and trigger rescans from one compact surface.</p>
        </div>
      </div>
      <div class="hero-panel">
        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Active Runs</div>
            <div class="stat-value">${activeCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Open Findings In View</div>
            <div class="stat-value">${openFindings}</div>
          </div>
        </div>
        ${renderThemeSwitcher()}
      </div>
    </section>
  `;
}

function renderRunsView() {
  const { runs } = state;
  const rows = runs.items.map((run) => `
    <tr class="interactive-row" tabindex="0" role="button" data-action="open-run" data-run-id="${escapeHtml(run.id)}">
      <td>
        <strong>${escapeHtml(run.scan_target.site_key)}</strong><br>
        <span class="subtle">${escapeHtml(run.scan_target.environment)} / ${escapeHtml(run.scan_target.branch)}</span>
      </td>
      <td>${renderBadge(run.mode)}</td>
      <td>${renderBadge(run.state)}</td>
      <td>${escapeHtml(run.reason ?? "No reason supplied")}</td>
      <td>${formatDateTime(run.started_at)}</td>
      <td>${formatDateTime(run.completed_at)}</td>
      <td>${escapeHtml(String(run.summary.pages_scanned))}</td>
      <td>${escapeHtml(String(run.summary.findings_total))}</td>
      <td class="table-actions">
        <button
          class="button-danger button-inline"
          type="button"
          data-action="confirm-delete-run"
          data-run-id="${escapeHtml(run.id)}"
          ${run.state === "queued" || run.state === "running" ? "disabled" : ""}
        >Delete</button>
      </td>
    </tr>
  `).join("");

  return `
    <section class="panel">
      <div class="section-head">
        <h2>Run List</h2>
        <button class="button-primary" type="button" data-action="open-new-scan-modal">Add site + start scan</button>
      </div>
      <form id="runs-filter-form" class="toolbar compact-toolbar">
        <div class="filter-grid">
          ${renderField({ label: "Site key", name: "site_key", value: runs.filters.site_key, placeholder: "demo-site" })}
          ${renderField({ label: "Environment", name: "environment", value: runs.filters.environment, placeholder: "local" })}
          ${renderField({ label: "Branch", name: "branch", value: runs.filters.branch, placeholder: "main" })}
        </div>
        <div class="actions">
          <button class="button-primary" type="submit">Apply filters</button>
          <button class="button-secondary" type="button" data-action="refresh-runs">Refresh</button>
        </div>
      </form>
      ${runs.loading ? renderLoading("Loading runs") : ""}
      ${runs.error ? renderError("Run list failed", runs.error) : ""}
      ${!runs.loading && !runs.error && runs.items.length === 0 ? renderEmpty("No runs found", "Try relaxing the target filters or launch a fresh scan run from the API.") : ""}
      ${runs.items.length > 0 ? `
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Mode</th>
                <th>State</th>
                <th>Reason</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Pages</th>
                <th>Findings</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : ""}
    </section>
  `;
}

function renderHvtGroupsPanel(run) {
  const { runDetail } = state;
  const profile = run.compliance_profile;
  const selectedGroup = runDetail.hvtGroups.find((group) => group.group_id === runDetail.selectedHvtGroupId)
    ?? runDetail.hvtGroups[0]
    ?? null;

  return `
    <div class="panel panel-stack-gap">
      <div class="section-head">
        <div>
          <h3>High-Value Remediation Groups</h3>
          <p class="hint">Shared root-cause clusters for this run, summarized by rule and repeated target.</p>
        </div>
        <form id="hvt-groups-form" class="actions hvt-toolbar">
          ${renderField({
            label: "Group level",
            name: "group_level",
            value: runDetail.hvtGroupLevel,
            type: "select",
            options: [
              { value: "fix_surface_cluster", label: "Fix surface cluster" },
              { value: "section_cluster", label: "Section cluster" },
              { value: "component_cluster", label: "Component cluster" }
            ],
            includeEmpty: false
          })}
          <button class="button-secondary" type="submit">Refresh groups</button>
        </form>
      </div>
      <p class="hint">Profile ${escapeHtml(profile.label)} ${escapeHtml(profile.version)} targeting ${escapeHtml(profile.standard_target)}</p>
      ${runDetail.hvtGroupsLoading ? renderLoading("Loading remediation groups") : ""}
      ${runDetail.hvtGroupsError ? renderError("Remediation groups failed", runDetail.hvtGroupsError) : ""}
      ${!runDetail.hvtGroupsLoading && !runDetail.hvtGroupsError && runDetail.hvtGroups.length === 0 ? renderEmpty("No remediation groups yet", "This run does not have repeated clusters to summarize at the selected grouping level.") : ""}
      ${runDetail.hvtGroups.length > 0 ? `
        <div class="table-layout hvt-workspace">
          <div class="table-shell table-shell--hvt">
            <div class="table-scroll">
              <div class="hvt-list" role="list">
                ${runDetail.hvtGroups.map((group) => `
                  <button
                    type="button"
                    class="hvt-list-item ${selectedGroup?.group_id === group.group_id ? "selected" : ""}"
                    data-action="open-hvt-group"
                    data-group-id="${escapeHtml(group.group_id)}"
                  >
                    <div class="status-row">
                      ${renderBadge(group.highest_severity, group.highest_severity)}
                      <span class="subtle">${escapeHtml(group.group_level.replaceAll("_", " "))}</span>
                    </div>
                    <strong>${escapeHtml(group.rule_id)}</strong>
                    ${group.likely_fix_surface ? `<span class="subtle">${escapeHtml(group.likely_fix_surface.replaceAll("_", " "))}</span>` : ""}
                    <span class="subtle">${escapeHtml(group.path_prefix || "Site-wide component cluster")}</span>
                    <div class="metric-row">
                      <span><strong>${escapeHtml(String(group.affected_pages))}</strong> pages</span>
                      <span><strong>${escapeHtml(String(group.finding_count))}</strong> findings</span>
                      <span><strong>${escapeHtml(String(group.affected_runs))}</strong> runs</span>
                    </div>
                  </button>
                `).join("")}
              </div>
            </div>
          </div>
          ${renderHvtGroupDetail(selectedGroup)}
        </div>
      ` : ""}
    </div>
  `;
}

function renderHvtGroupDetail(group) {
  if (!group) {
    return `
      <aside class="detail-shell detail-shell--empty">
        <p class="eyebrow">Group Detail</p>
        <h2>Choose a remediation group.</h2>
        <p>The selected group’s evidence and drill-in action stay pinned here while the group list scrolls independently.</p>
      </aside>
    `;
  }

  return `
    <aside class="detail-shell">
      <div class="status-row">
        ${renderBadge(group.highest_severity, group.highest_severity)}
        <span class="subtle">${escapeHtml(group.group_level.replaceAll("_", " "))}</span>
      </div>
      <h2>${escapeHtml(group.rule_id)}</h2>
      <div class="detail-meta">
        <div class="meta-grid">
          <dl class="meta-item">
            <dt>Path cluster</dt>
            <dd>${escapeHtml(group.path_prefix || "Site-wide component cluster")}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Affected pages</dt>
            <dd>${escapeHtml(String(group.affected_pages))}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Findings</dt>
            <dd>${escapeHtml(String(group.finding_count))}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Affected runs</dt>
            <dd>${escapeHtml(String(group.affected_runs))}</dd>
          </dl>
          <dl class="meta-item">
            <dt>${group.group_level === "fix_surface_cluster" ? "Fix surface signature" : "Representative selector"}</dt>
            <dd class="mono">${escapeHtml(group.normalized_selector)}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Last seen</dt>
            <dd>${formatDateTime(group.last_seen_at)}</dd>
          </dl>
        </div>
        ${group.likely_fix_surface || group.suggested_first_look ? `
          <div class="panel info-panel">
            <h3>Likely Fix Surface</h3>
            ${group.likely_fix_surface ? `<p><strong>${escapeHtml(group.likely_fix_surface.replaceAll("_", " "))}</strong></p>` : ""}
            ${group.suggested_first_look ? `<p>${escapeHtml(group.suggested_first_look)}</p>` : ""}
          </div>
        ` : ""}
        ${group.representative_snippet ? `
          <div class="panel info-panel">
            <h3>Representative Snippet</h3>
            <p class="mono hvt-group-snippet">${escapeHtml(group.representative_snippet)}</p>
          </div>
        ` : ""}
        <div class="panel info-panel">
          <h3>Sample URLs</h3>
          ${group.sample_urls?.length ? `
            <ul class="guidance-list">
              ${group.sample_urls.map((url) => `<li class="mono hvt-group-url">${escapeHtml(url)}</li>`).join("")}
            </ul>
          ` : '<p class="hint">No sample URLs published for this group.</p>'}
        </div>
      </div>
      <div class="actions">
        <button
          class="button-secondary"
          type="button"
          data-action="filter-to-hvt"
          data-rule-id="${escapeHtml(group.rule_id)}"
          data-path-prefix="${escapeHtml(group.path_prefix || "")}"
        >View related findings</button>
      </div>
    </aside>
  `;
}

function renderRunDetailView() {
  const { runDetail } = state;
  const run = runDetail.run;
  const isActiveRun = run?.state === "queued" || run?.state === "running";
  const profile = run?.compliance_profile;

  if (runDetail.loading && !run) {
    return renderLoading("Loading run detail");
  }

  if (runDetail.error) {
    return renderError("Run detail failed", runDetail.error);
  }

  if (!run) {
    return renderEmpty("Run not loaded", "Select a scan run from the list to inspect findings and launch rescans.");
  }

  const selectedId = state.route.findingId;
  const findingRows = runDetail.findings.map((finding) => `
    <tr
      class="${selectedId === finding.id ? "selected" : ""} interactive-row"
      data-finding-row="${escapeHtml(finding.id)}"
      data-action="open-finding"
      data-finding-id="${escapeHtml(finding.id)}"
      tabindex="0"
      role="button"
    >
      <td>
        <strong>${escapeHtml(finding.rule_id)}</strong><br>
        <span class="subtle mono">${escapeHtml(finding.latest_instance.normalized_url)}</span>
      </td>
      <td>${renderBadge(finding.severity)}</td>
      <td>${renderBadge(finding.status)}</td>
      <td>${finding.diff_status ? renderBadge(finding.diff_status) : '<span class="subtle">n/a</span>'}</td>
      <td><span class="selector-clamp mono" title="${escapeHtml(finding.latest_instance.selector)}">${escapeHtml(finding.latest_instance.selector)}</span></td>
      <td>${formatDateTime(finding.latest_instance.detected_at)}</td>
    </tr>
  `).join("");

  return `
    <section>
      <div class="breadcrumbs breadcrumbs--actions">
        <div class="breadcrumbs-main">
          <button class="button-secondary button-inline" type="button" data-action="goto" data-target="#/runs">Back to runs</button>
          <span>/</span>
          <span class="mono">${escapeHtml(run.id)}</span>
        </div>
        <div class="breadcrumbs-actions">
          <button class="button-primary" type="button" data-action="open-new-scan-modal">Add site + start scan</button>
        </div>
      </div>

      <div class="panel">
        <div class="run-head">
          <div>
            <p class="eyebrow">Run Detail</p>
            <h2>${escapeHtml(run.scan_target.site_key)} / ${escapeHtml(run.scan_target.environment)} / ${escapeHtml(run.scan_target.branch)}</h2>
          </div>
          <div class="status-row">
            ${renderBadge(run.state)}
            ${renderBadge(run.mode)}
            <button
              class="button-danger"
              type="button"
              data-action="confirm-delete-run"
              data-run-id="${escapeHtml(run.id)}"
              ${run.state === "queued" || run.state === "running" ? "disabled" : ""}
            >Delete run</button>
          </div>
        </div>
        <div class="summary-strip">
          <div class="summary-card"><strong>${escapeHtml(String(run.summary.pages_scanned))}</strong><span>Pages scanned</span></div>
          <div class="summary-card"><strong>${escapeHtml(String(run.summary.findings_total))}</strong><span>Total findings</span></div>
          <div class="summary-card"><strong>${escapeHtml(String(run.summary.new_count))}</strong><span>New</span></div>
          <div class="summary-card"><strong>${escapeHtml(String(run.summary.persistent_count))}</strong><span>Persistent</span></div>
          <div class="summary-card"><strong>${escapeHtml(String(run.summary.resolved_count))}</strong><span>Resolved</span></div>
        </div>
        <div class="run-facts">
          <p class="hint">Base URL <span class="mono">${escapeHtml(run.scan_target.base_url)}</span></p>
          <p class="hint">Started ${escapeHtml(formatDateTime(run.started_at))} | Completed ${escapeHtml(formatDateTime(run.completed_at))} | Reason ${escapeHtml(run.reason ?? "not supplied")}</p>
          ${profile ? `<p class="hint">Profile ${escapeHtml(profile.label)} ${escapeHtml(profile.version)} targeting ${escapeHtml(profile.standard_target)}</p>` : ""}
          <p class="hint mono">Config pages=${escapeHtml(String(run.scan_options?.max_pages ?? "-"))}, depth=${escapeHtml(String(run.scan_options?.max_depth ?? "-"))}, concurrency=${escapeHtml(String(run.scan_options?.concurrency ?? "-"))}, retries=${escapeHtml(String(run.scan_options?.retries ?? "-"))} | Runtime ${escapeHtml(run.scanner_context.engine)} ${escapeHtml(run.scanner_context.engine_version)} on ${escapeHtml(run.scanner_context.browser)} ${escapeHtml(run.scanner_context.browser_version)}</p>
        </div>
        ${isActiveRun ? `
          <div class="progress-banner">
            <strong>Scan in progress.</strong>
            <span>Pages scanned and findings found update during the crawl. Diff counts finalize when the run completes.</span>
          </div>
        ` : ""}
      </div>

      ${renderHvtGroupsPanel(run)}

      <div class="panel panel-stack-gap">
        <h3>Findings</h3>
        <form id="run-findings-filter-form" class="toolbar compact-toolbar">
          <div class="filter-grid">
            ${renderField({ label: "Severity", name: "severity", value: runDetail.filters.severity, type: "select", options: findingSeverities })}
            ${renderField({ label: "Status", name: "status", value: runDetail.filters.status, type: "select", options: findingStatuses })}
            ${renderField({ label: "Diff", name: "diff_status", value: runDetail.filters.diff_status, type: "select", options: findingDiffStatuses })}
            ${renderField({ label: "Rule", name: "rule_id", value: runDetail.filters.rule_id, placeholder: "color-contrast" })}
            ${renderField({ label: "Path prefix", name: "path_prefix", value: runDetail.filters.path_prefix, placeholder: "/forms" })}
          </div>
          <div class="actions">
            <button class="button-primary" type="submit">Apply finding filters</button>
            <button class="button-secondary" type="button" data-action="refresh-run-detail">Refresh</button>
          </div>
        </form>

        ${runDetail.findingsLoading ? renderLoading("Loading findings") : ""}
        ${runDetail.findingsError ? renderError("Findings failed", runDetail.findingsError) : ""}
        ${!runDetail.findingsLoading && !runDetail.findingsError && runDetail.findings.length === 0 ? renderEmpty(isActiveRun ? "No findings published yet" : "No findings matched", isActiveRun ? "This scan is still running. The counters above update during the crawl, and the findings list appears after the run completes." : "This run has no findings for the current filter set.") : ""}
        <div class="table-layout findings-workspace findings-workspace--run">
          <div class="table-shell table-shell--findings">
            ${runDetail.findings.length > 0 ? `
              <div class="table-scroll">
                <table class="findings-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Diff</th>
                      <th>Selector</th>
                      <th>Detected</th>
                    </tr>
                  </thead>
                  <tbody>${findingRows}</tbody>
                </table>
              </div>
            ` : ""}
          </div>
          ${renderFindingDetail()}
        </div>
      </div>

      <div class="panel panel-stack-gap">
        <h3>Rescan Actions</h3>
        <div class="rescan-grid">
          <form id="full-rescan-form" class="panel">
            <h3>Full target</h3>
            ${renderField({ label: "Reason", name: "full_reason", value: runDetail.rescanForms.full.reason, placeholder: "Nightly baseline, release check, regression sweep" })}
            <div class="actions">
              <button class="button-primary" type="submit" ${runDetail.rescanSubmitting === "full" ? "disabled" : ""}>${runDetail.rescanSubmitting === "full" ? "Launching..." : "Launch full rescan"}</button>
            </div>
          </form>
          <form id="path-rescan-form" class="panel">
            <h3>Path prefix</h3>
            ${renderField({ label: "Path prefix", name: "path_prefix", value: runDetail.rescanForms.path.path_prefix, placeholder: "/forms" })}
            ${renderField({ label: "Reason", name: "path_reason", value: runDetail.rescanForms.path.reason, placeholder: "Focus follow-up for a section" })}
            <div class="actions">
              <button class="button-primary" type="submit" ${runDetail.rescanSubmitting === "path" ? "disabled" : ""}>${runDetail.rescanSubmitting === "path" ? "Launching..." : "Launch path rescan"}</button>
            </div>
          </form>
          <form id="page-rescan-form" class="panel">
            <h3>Single page</h3>
            ${renderField({ label: "Page URL", name: "page_url", value: runDetail.rescanForms.page.page_url, placeholder: "https://example.gov/forms/contact" })}
            ${renderField({ label: "Reason", name: "page_reason", value: runDetail.rescanForms.page.reason, placeholder: "Verify remediation on one page" })}
            <div class="actions">
              <button class="button-primary" type="submit" ${runDetail.rescanSubmitting === "page" ? "disabled" : ""}>${runDetail.rescanSubmitting === "page" ? "Launching..." : "Launch page rescan"}</button>
            </div>
          </form>
        </div>
        ${runDetail.rescanError ? renderError("Rescan launch failed", runDetail.rescanError) : ""}
        ${renderRescanProgress()}
      </div>
    </section>
  `;
}

function renderRescanProgress() {
  if (state.activeRuns.length === 0) {
    return '<p class="hint">No rescans are currently running. Launch a page, path, or full rescan to watch progress here.</p>';
  }

  return `
    <div class="progress-list" style="margin-top: 16px;">
      ${state.activeRuns.map((run) => `
        <div class="progress-item">
          <div class="status-row">
            ${renderBadge(run.state)}
            ${renderBadge(run.mode)}
            <button class="button-secondary" data-action="open-run" data-run-id="${escapeHtml(run.id)}">Open run</button>
          </div>
          <p><span class="mono">${escapeHtml(run.id)}</span></p>
          <p>${escapeHtml(run.scan_target.site_key)} / ${escapeHtml(run.scan_target.environment)} / ${escapeHtml(run.scan_target.branch)}</p>
          <p>Pages: ${escapeHtml(String(run.summary.pages_scanned))} | Findings: ${escapeHtml(String(run.summary.findings_total))}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFindingsView() {
  const { findings } = state;
  const selectedId = state.route.findingId;
  const rows = findings.items.map((finding) => `
    <tr
      class="${selectedId === finding.id ? "selected" : ""} interactive-row"
      data-finding-row="${escapeHtml(finding.id)}"
      data-action="open-finding"
      data-finding-id="${escapeHtml(finding.id)}"
      tabindex="0"
      role="button"
    >
      <td>
        <strong>${escapeHtml(finding.rule_id)}</strong><br>
        <span class="subtle">${escapeHtml(finding.scan_target?.site_key ?? "unknown target")} / ${escapeHtml(finding.scan_target?.branch ?? "unknown branch")}</span>
      </td>
      <td>${renderBadge(finding.severity)}</td>
      <td>${renderBadge(finding.status)}</td>
      <td>${escapeHtml(finding.scan_target?.branch ?? "-")}</td>
      <td><span class="mono">${escapeHtml(pathFromUrl(finding.latest_instance.normalized_url))}</span></td>
      <td>${formatDateTime(finding.latest_instance.detected_at)}</td>
    </tr>
  `).join("");

  return `
    <section class="panel">
      <h2>Findings</h2>
      <form id="findings-filter-form" class="toolbar compact-toolbar">
        <div class="filter-grid">
          ${renderField({ label: "Site key", name: "site_key", value: findings.filters.site_key, placeholder: "demo-site" })}
          ${renderField({ label: "Environment", name: "environment", value: findings.filters.environment, placeholder: "local" })}
          ${renderField({ label: "Branch", name: "branch", value: findings.filters.branch, placeholder: "main" })}
          ${renderField({ label: "Severity", name: "severity", value: findings.filters.severity, type: "select", options: findingSeverities })}
          ${renderField({ label: "Status", name: "status", value: findings.filters.status, type: "select", options: findingStatuses })}
          ${renderField({ label: "Rule", name: "rule_id", value: findings.filters.rule_id, placeholder: "color-contrast" })}
          ${renderField({ label: "Path prefix", name: "path_prefix", value: findings.filters.path_prefix, placeholder: "/forms" })}
        </div>
        <div class="actions">
          <button class="button-primary" type="submit">Apply filters</button>
          <button class="button-secondary" type="button" data-action="refresh-findings">Refresh</button>
        </div>
      </form>

      ${findings.loading ? renderLoading("Loading findings") : ""}
      ${findings.error ? renderError("Findings failed", findings.error) : ""}
      ${!findings.loading && !findings.error && findings.items.length === 0 ? renderEmpty("No findings matched", "Expand the branch or path filters to pull in more results.") : ""}
      <div class="table-layout findings-workspace findings-workspace--global">
        <div class="table-shell table-shell--findings">
          ${findings.items.length > 0 ? `
            <div class="table-scroll">
              <table class="findings-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Branch</th>
                    <th>Path</th>
                    <th>Detected</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          ` : ""}
        </div>
        ${renderFindingDetail()}
      </div>
    </section>
  `;
}

function renderFindingDetail() {
  const { findingDetail } = state;

  if (findingDetail.loading) {
    return `<aside class="detail-shell">${renderLoading("Loading finding detail")}</aside>`;
  }

  if (findingDetail.error) {
    return `<aside class="detail-shell">${renderError("Finding detail failed", findingDetail.error)}</aside>`;
  }

  if (!findingDetail.item) {
    return `
      <aside class="detail-shell detail-shell--empty" id="finding-detail-pane">
        <p class="eyebrow">Finding Detail</p>
        <h2>Choose a finding to inspect it.</h2>
        <p>Selection keeps the evidence, status controls, and history pinned here while the list scrolls independently.</p>
      </aside>
    `;
  }

  const finding = findingDetail.item.finding;
  const history = findingDetail.statusHistory;
  const requireIgnoreFields = findingDetail.form.status === "ignored";
  const guidance = getFindingGuidance(finding.rule_id);
  const metadata = finding.rule_metadata ?? {};
  const hasMetadata = hasEnrichedGuidance(finding);

  return `
    <aside class="detail-shell" id="finding-detail-pane">
      <div class="status-row">
        ${renderBadge(finding.severity)}
        ${renderBadge(finding.status)}
        ${finding.diff_status ? renderBadge(finding.diff_status) : ""}
      </div>
      <h2>${escapeHtml(finding.rule_id)}</h2>
      <div class="detail-meta">
        <div class="meta-grid">
          <dl class="meta-item">
            <dt>Site</dt>
            <dd>${escapeHtml(finding.scan_target?.site_key ?? "Unknown")}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Branch</dt>
            <dd>${escapeHtml(finding.scan_target?.branch ?? "Unknown")}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Page</dt>
            <dd class="mono">${escapeHtml(finding.latest_instance.normalized_url)}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Selector</dt>
            <dd class="mono">${escapeHtml(finding.latest_instance.selector)}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Detected</dt>
            <dd>${formatDateTime(finding.latest_instance.detected_at)}</dd>
          </dl>
          <dl class="meta-item">
            <dt>Ignore expires</dt>
            <dd>${finding.ignore_expires_at ? formatDateTime(finding.ignore_expires_at) : "Not ignored"}</dd>
          </dl>
        </div>
        <div class="panel">
          <h3>Snippet</h3>
          <p class="mono">${escapeHtml(finding.latest_instance.snippet || "No snippet captured.")}</p>
        </div>
      </div>

      ${finding.latest_instance.failure_summary ? `
        <div class="panel info-panel">
          <h3>Failure Summary</h3>
          <p>${escapeHtml(finding.latest_instance.failure_summary)}</p>
        </div>
      ` : ""}

      ${hasMetadata ? `
        <div class="panel info-panel">
          <h3>${escapeHtml(metadata.rule_help || "Rule Guidance")}</h3>
          <p>${escapeHtml(metadata.rule_description || "Scanner metadata is partial for this rule, but this run includes enriched rule context.")}</p>
          ${metadata.rule_help_url ? `<p><a href="${escapeHtml(metadata.rule_help_url)}" target="_blank" rel="noreferrer">Open scanner help</a></p>` : ""}
          ${renderTagPills(metadata.rule_tags)}
        </div>
      ` : `
        <details class="guidance-shell" open>
          <summary>Remediation Guide</summary>
          <div class="guidance-body">
            <h3>${escapeHtml(guidance.title)}</h3>
            <p>${escapeHtml(guidance.summary)}</p>
            <p><strong>Where to look:</strong> ${escapeHtml(guidance.whereToLook)}</p>
            <ul class="guidance-list">
              ${guidance.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}
            </ul>
          </div>
        </details>
      `}

      <form id="status-update-form" class="status-log">
        <h3>Status Update</h3>
        <div class="filter-grid">
          ${renderField({ label: "Status", name: "status", value: findingDetail.form.status, type: "select", options: findingStatuses, includeEmpty: false })}
          ${renderField({ label: "Ignore expires at", name: "ignore_expires_at", value: findingDetail.form.ignore_expires_at, type: "datetime-local" })}
        </div>
        ${renderField({ label: "Note", name: "note", value: findingDetail.form.note, type: "textarea", placeholder: "What changed, who owns it, or why it is being ignored." })}
        <p class="hint ${requireIgnoreFields ? "" : "hidden"}">Ignored findings require both a note and a future expiration timestamp.</p>
        ${findingDetail.submitError ? renderError("Status update failed", findingDetail.submitError) : ""}
        <div class="actions">
          <button class="button-primary" type="submit" ${findingDetail.submitting ? "disabled" : ""}>${findingDetail.submitting ? "Saving..." : "Update status"}</button>
          <button class="button-secondary" type="button" data-action="stage-page-url" data-page-url="${escapeHtml(finding.latest_instance.page_url)}">Use page in rescan</button>
        </div>
      </form>

      <div class="status-log">
        <h3>Status History</h3>
        ${history.length === 0 ? '<p class="hint">No status changes recorded yet for this finding.</p>' : `
          <div class="status-timeline">
            ${history.map((event) => `
              <div class="timeline-item">
                <div class="status-row">
                  ${renderBadge(event.new_status)}
                  <span class="subtle">${escapeHtml(event.changed_by)}</span>
                </div>
                <p>${escapeHtml(event.previous_status)} -> ${escapeHtml(event.new_status)} on ${escapeHtml(formatDateTime(event.changed_at))}</p>
                <p>${escapeHtml(event.note || "No note supplied.")}</p>
                <p>${event.ignore_expires_at ? `Ignore expires ${escapeHtml(formatDateTime(event.ignore_expires_at))}` : "No ignore expiration on this event."}</p>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    </aside>
  `;
}

function renderModal() {
  const { modal } = state;
  if (!modal.kind) {
    return "";
  }

  if (modal.kind === "delete-run" && modal.deleteRun) {
    const run = modal.deleteRun;
    return `
      <div class="modal-backdrop" data-modal-backdrop="true">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delete-run-title" data-modal-panel>
          <div class="modal-head">
            <div>
              <p class="eyebrow">Delete Run</p>
              <h2 id="delete-run-title">Remove this scan run?</h2>
            </div>
            <button class="button-secondary button-inline" type="button" data-action="close-modal">Close</button>
          </div>
          <p class="hint">This permanently removes the run record, its queued job if one exists, and its finding instances. Active runs cannot be deleted.</p>
          <div class="meta-grid">
            <dl class="meta-item">
              <dt>Target</dt>
              <dd>${escapeHtml(run.scan_target.site_key)} / ${escapeHtml(run.scan_target.environment)} / ${escapeHtml(run.scan_target.branch)}</dd>
            </dl>
            <dl class="meta-item">
              <dt>Run</dt>
              <dd class="mono">${escapeHtml(run.id)}</dd>
            </dl>
            <dl class="meta-item">
              <dt>State</dt>
              <dd>${escapeHtml(run.state)}</dd>
            </dl>
            <dl class="meta-item">
              <dt>Started</dt>
              <dd>${escapeHtml(formatDateTime(run.started_at))}</dd>
            </dl>
          </div>
          ${modal.error ? renderError("Delete failed", modal.error) : ""}
          <div class="actions modal-actions">
            <button class="button-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="button-danger" type="button" data-action="delete-run" data-run-id="${escapeHtml(run.id)}" ${modal.submitting ? "disabled" : ""}>${modal.submitting ? "Deleting..." : "Delete run"}</button>
          </div>
        </div>
      </div>
    `;
  }

  const form = modal.newScan;
  const profileOptions = state.complianceProfiles.items.map((profile) => ({
    value: profile.id,
    label: profile.label
  }));
  const selectedProfile = getSelectedModalComplianceProfile();
  return `
    <div class="modal-backdrop" data-modal-backdrop="true">
      <div class="modal-panel modal-panel--wide" role="dialog" aria-modal="true" aria-labelledby="new-scan-title" data-modal-panel>
        <div class="modal-head">
          <div>
            <p class="eyebrow">Add Site</p>
            <h2 id="new-scan-title">Add a site and start a scan</h2>
          </div>
          <button class="button-secondary button-inline" type="button" data-action="close-modal">Close</button>
        </div>
        <p class="hint">A scan target is created or updated from this form, then the first full scan is queued immediately.</p>
        <form id="new-scan-form" class="toolbar">
          <div class="filter-grid">
            ${renderField({ label: "Site key", name: "site_key", value: form.site_key, placeholder: "my-site" })}
            ${renderField({ label: "Environment", name: "environment", value: form.environment, placeholder: "prod" })}
            ${renderField({ label: "Branch", name: "branch", value: form.branch, placeholder: "main" })}
            ${renderField({ label: "Base URL", name: "base_url", value: form.base_url, placeholder: "https://docs.example.gov" })}
            ${renderField({ label: "Compliance profile", name: "compliance_profile_id", value: form.compliance_profile_id || state.complianceProfiles.defaultProfileId, type: "select", options: profileOptions, includeEmpty: false })}
            ${renderField({ label: "Reason", name: "reason", value: form.reason, placeholder: "Initial baseline scan" })}
            ${renderField({ label: "Max pages", name: "max_pages", value: form.max_pages, type: "number" })}
            ${renderField({ label: "Max depth", name: "max_depth", value: form.max_depth, type: "number" })}
            ${renderField({ label: "Concurrency", name: "concurrency", value: form.concurrency, type: "number" })}
            ${renderField({ label: "Retries", name: "retries", value: form.retries, type: "number" })}
          </div>
          ${selectedProfile ? `
            <div class="panel info-panel">
              <h3>${escapeHtml(selectedProfile.label)}</h3>
              <p>Targets ${escapeHtml(selectedProfile.standard_target)} using profile version ${escapeHtml(selectedProfile.version)}.</p>
              ${renderTagPills(selectedProfile.axe_tags)}
            </div>
          ` : ""}
          ${state.complianceProfiles.loading ? '<p class="hint">Loading compliance profiles.</p>' : ""}
          ${state.complianceProfiles.error ? `<p class="hint">Profile catalog unavailable: ${escapeHtml(state.complianceProfiles.error)}. The API default will be used.</p>` : ""}
          <div class="filter-grid modal-text-grid">
            ${renderField({ label: "Path allowlist", name: "path_allowlist", value: form.path_allowlist, type: "textarea", placeholder: "/docs\\n/policies" })}
            ${renderField({ label: "Path denylist", name: "path_denylist", value: form.path_denylist, type: "textarea", placeholder: "/search\\n/admin" })}
            ${renderField({ label: "Seed URLs", name: "seed_urls", value: form.seed_urls, type: "textarea", placeholder: "https://docs.example.gov/\\nhttps://docs.example.gov/accessibility" })}
          </div>
          ${modal.error ? renderError("Scan launch failed", modal.error) : ""}
          <div class="actions modal-actions">
            <button class="button-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="button-primary" type="submit" ${modal.submitting ? "disabled" : ""}>${modal.submitting ? "Launching..." : "Add site + start scan"}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function render() {
  const app = document.querySelector("#app");
  const content = state.route.view === "run-detail" ? renderRunDetailView() : renderRunsView();

  app.innerHTML = `
    <div class="shell">
      ${renderHero()}
      ${renderNav()}
      ${content}
    </div>
    ${renderModal()}
  `;

  syncSelectedFindingIntoView();
}

function syncSelectedFindingIntoView() {
  const selectionKey = `${state.route.view}:${state.route.runId ?? ""}:${state.route.findingId ?? ""}:${state.runDetail.findings.length}:${state.findings.items.length}`;
  if (!state.route.findingId || selectionKey === lastAlignedSelectionKey) {
    return;
  }

  lastAlignedSelectionKey = selectionKey;

  const row = document.querySelector(`[data-finding-row="${state.route.findingId}"]`);
  const scrollParent = row?.closest(".table-scroll");
  if (row && scrollParent) {
    const rowCenter = row.offsetTop + row.offsetHeight / 2;
    const targetScrollTop = rowCenter - scrollParent.clientHeight / 2;
    const maxScrollTop = scrollParent.scrollHeight - scrollParent.clientHeight;
    scrollParent.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
  }

  const detailPane = document.querySelector("#finding-detail-pane");
  if (detailPane) {
    detailPane.scrollTop = 0;
  }
}

function readFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function syncFindingFormFromDetail(payload) {
  state.findingDetail.form = {
    status: payload.finding.status,
    note: "",
    ignore_expires_at: toDateTimeLocalValue(payload.finding.ignore_expires_at)
  };
}

function openDeleteRunModal(runId) {
  const run = state.runDetail.run?.id === runId
    ? state.runDetail.run
    : state.runs.items.find((item) => item.id === runId) ?? state.activeRuns.find((item) => item.id === runId);

  if (!run) {
    return;
  }

  state.modal.kind = "delete-run";
  state.modal.error = "";
  state.modal.submitting = false;
  state.modal.deleteRun = run;
  render();
}

function openNewScanModal() {
  const currentRun = state.runDetail.run;
  if (currentRun) {
    state.modal.newScan = {
      ...state.modal.newScan,
      site_key: currentRun.scan_target.site_key,
      environment: currentRun.scan_target.environment,
      branch: currentRun.scan_target.branch,
      base_url: currentRun.scan_target.base_url,
      compliance_profile_id: currentRun.compliance_profile?.id ?? state.modal.newScan.compliance_profile_id
    };
  }

  if (!state.modal.newScan.compliance_profile_id) {
    state.modal.newScan.compliance_profile_id = state.complianceProfiles.defaultProfileId;
  }
  if (state.complianceProfiles.items.length === 0 && !state.complianceProfiles.loading) {
    loadComplianceProfiles();
  }

  state.modal.kind = "new-scan";
  state.modal.error = "";
  state.modal.submitting = false;
  render();
}

function closeModal() {
  state.modal.kind = "";
  state.modal.error = "";
  state.modal.submitting = false;
  state.modal.deleteRun = null;
  render();
}

function syncSelectedHvtGroup() {
  const visibleGroupIds = new Set(state.runDetail.hvtGroups.map((group) => group.group_id));
  if (state.runDetail.selectedHvtGroupId && visibleGroupIds.has(state.runDetail.selectedHvtGroupId)) {
    return;
  }

  state.runDetail.selectedHvtGroupId = state.runDetail.hvtGroups[0]?.group_id ?? null;
}

function trackRunProgress(run) {
  const isActive = run.state === "queued" || run.state === "running";
  const index = state.activeRuns.findIndex((item) => item.id === run.id);

  if (!isActive) {
    if (index >= 0) {
      state.activeRuns.splice(index, 1);
    }
    return;
  }

  if (index >= 0) {
    state.activeRuns[index] = run;
  } else {
    state.activeRuns.unshift(run);
  }

  state.activeRuns = state.activeRuns
    .filter((item, itemIndex, items) => itemIndex === items.findIndex((candidate) => candidate.id === item.id))
    .slice(0, 6);
}

async function deleteRun(runId) {
  state.modal.submitting = true;
  state.modal.error = "";
  render();

  try {
    await apiFetch(`/scan-runs/${runId}`, { method: "DELETE" });

    state.activeRuns = state.activeRuns.filter((run) => run.id !== runId);

    if (state.runDetail.run?.id === runId) {
      state.runDetail.run = null;
      state.runDetail.findings = [];
      state.findingDetail.item = null;
      state.findingDetail.statusHistory = [];
      closeModal();
      setRoute("#/runs");
      return;
    }

    closeModal();
    if (state.route.view === "runs") {
      await loadRuns();
    } else if (state.route.view === "findings") {
      await loadFindings({ background: true });
    }
  } catch (error) {
    state.modal.error = error.message;
    state.modal.submitting = false;
    render();
  }
}

async function submitNewScan() {
  state.modal.submitting = true;
  state.modal.error = "";
  render();

  const form = state.modal.newScan;

  try {
    const payload = await apiFetch("/scan-runs", {
      method: "POST",
      body: JSON.stringify({
        scan_target: {
          site_key: form.site_key,
          environment: form.environment,
          branch: form.branch,
          base_url: form.base_url
        },
        reason: form.reason || undefined,
        compliance_profile_id: form.compliance_profile_id || undefined,
        seed_urls: splitLines(form.seed_urls),
        scan_options: {
          max_pages: Number.parseInt(form.max_pages, 10),
          max_depth: Number.parseInt(form.max_depth, 10),
          concurrency: Number.parseInt(form.concurrency, 10),
          retries: Number.parseInt(form.retries, 10),
          path_allowlist: splitLines(form.path_allowlist),
          path_denylist: splitLines(form.path_denylist),
          query_param_allowlist: []
        }
      })
    });

    trackRunProgress(payload.run);
    closeModal();
    setRoute(`#/runs/${payload.run.id}`);
  } catch (error) {
    state.modal.error = error.message;
    state.modal.submitting = false;
    render();
  }
}

async function loadRuns({ background = false } = {}) {
  if (!background) {
    state.runs.loading = true;
    state.runs.error = "";
    render();
  }

  try {
    const payload = await apiFetch(`/scan-runs${qs({
      ...state.runs.filters,
      page: state.runs.page,
      page_size: state.runs.pageSize
    })}`);

    state.runs.items = payload.items;
    state.runs.total = payload.total;
    payload.items.forEach(trackRunProgress);
    state.runs.error = "";
  } catch (error) {
    state.runs.error = error.message;
  } finally {
    state.runs.loading = false;
    render();
  }
}

async function loadComplianceProfiles({ background = false } = {}) {
  if (!background) {
    state.complianceProfiles.loading = true;
    state.complianceProfiles.error = "";
    render();
  }

  try {
    const payload = await apiFetch("/compliance-profiles");
    state.complianceProfiles.items = payload.items;
    state.complianceProfiles.defaultProfileId = payload.default_profile_id;
    if (!state.modal.newScan.compliance_profile_id) {
      state.modal.newScan.compliance_profile_id = payload.default_profile_id;
    }
    state.complianceProfiles.error = "";
  } catch (error) {
    state.complianceProfiles.error = error.message;
  } finally {
    state.complianceProfiles.loading = false;
    render();
  }
}

async function loadRunDetail({ background = false } = {}) {
  const runId = state.route.runId;
  if (!runId) {
    return;
  }
  let reroutedSelection = false;

  if (!background) {
    state.runDetail.loading = true;
    state.runDetail.error = "";
  }
  state.runDetail.findingsLoading = true;
  state.runDetail.findingsError = "";
  state.runDetail.hvtGroupsLoading = true;
  state.runDetail.hvtGroupsError = "";
  render();

  try {
    const [runPayload, findingsPayload, hvtPayload] = await Promise.all([
      apiFetch(`/scan-runs/${runId}`),
      apiFetch(`/scan-runs/${runId}/findings${qs({
        ...state.runDetail.filters,
        page: state.runDetail.findingsPage,
        page_size: state.runDetail.findingsPageSize
      })}`),
      apiFetch(`/scan-runs/${runId}/hvt-groups${qs({
        group_level: state.runDetail.hvtGroupLevel,
        page: 1,
        page_size: 6
      })}`).catch((error) => ({ __error: error }))
    ]);

    state.runDetail.run = runPayload.run;
    state.runDetail.findings = findingsPayload.items;
    state.runDetail.findingsTotal = findingsPayload.total;
    state.runDetail.findingsError = "";
    if (hvtPayload?.__error) {
      state.runDetail.hvtGroups = [];
      state.runDetail.hvtGroupsError = hvtPayload.__error.message;
    } else {
      state.runDetail.hvtGroups = hvtPayload.items;
      state.runDetail.hvtGroupsError = "";
      syncSelectedHvtGroup();
    }
    trackRunProgress(runPayload.run);

    if (!state.runDetail.rescanForms.page.page_url && findingsPayload.items[0]?.latest_instance?.page_url) {
      state.runDetail.rescanForms.page.page_url = findingsPayload.items[0].latest_instance.page_url;
    }
    if (!state.runDetail.rescanForms.path.path_prefix) {
      try {
        state.runDetail.rescanForms.path.path_prefix = new URL(runPayload.run.scan_target.base_url).pathname || "/";
      } catch {
        state.runDetail.rescanForms.path.path_prefix = "/";
      }
    }

    const visibleFindingIds = new Set(findingsPayload.items.map((finding) => finding.id));
    const nextSelectedFindingId = findingsPayload.items[0]?.id ?? null;

    if (state.route.findingId && !visibleFindingIds.has(state.route.findingId)) {
      reroutedSelection = true;
      if (nextSelectedFindingId) {
        setRoute(`#/runs/${runId}?finding=${encodeURIComponent(nextSelectedFindingId)}`);
      } else {
        setRoute(`#/runs/${runId}`);
      }
      return;
    }

    if (!state.route.findingId && nextSelectedFindingId) {
      reroutedSelection = true;
      setRoute(`#/runs/${runId}?finding=${encodeURIComponent(nextSelectedFindingId)}`);
      return;
    }
  } catch (error) {
    state.runDetail.error = error.message;
    state.runDetail.findingsError = error.message;
    state.runDetail.hvtGroupsError = error.message;
  } finally {
    state.runDetail.loading = false;
    state.runDetail.findingsLoading = false;
    state.runDetail.hvtGroupsLoading = false;
    if (!reroutedSelection) {
      render();
    }
  }
}

async function loadFindingDetail(findingId) {
  if (!findingId) {
    state.findingDetail.item = null;
    state.findingDetail.statusHistory = [];
    state.findingDetail.error = "";
    render();
    return;
  }

  state.findingDetail.loading = true;
  state.findingDetail.error = "";
  render();

  try {
    const payload = await apiFetch(`/findings/${findingId}`);
    state.findingDetail.item = payload;
    state.findingDetail.statusHistory = payload.status_history;
    syncFindingFormFromDetail(payload);
    state.findingDetail.submitError = "";
    // Update the page rescan URL to match the selected finding's page.
    if (payload.finding?.latest_instance?.page_url) {
      state.runDetail.rescanForms.page.page_url = payload.finding.latest_instance.page_url;
    }
  } catch (error) {
    state.findingDetail.error = error.message;
  } finally {
    state.findingDetail.loading = false;
    render();
  }
}

async function refreshActiveRuns() {
  const ids = new Set(state.activeRuns.map((run) => run.id));
  if (state.route.view === "run-detail" && state.runDetail.run?.id) {
    ids.add(state.runDetail.run.id);
  }

  await Promise.all(Array.from(ids).map(async (runId) => {
    try {
      const payload = await apiFetch(`/scan-runs/${runId}`);
      trackRunProgress(payload.run);
    } catch {
      return null;
    }
    return null;
  }));

  render();
}

async function launchRescan(mode) {
  const run = state.runDetail.run;
  if (!run) {
    return;
  }

  state.runDetail.rescanSubmitting = mode;
  state.runDetail.rescanError = "";
  render();

  const body = {
    scan_target: run.scan_target,
    compliance_profile_id: run.compliance_profile?.id
  };

  if (mode === "full") {
    body.reason = state.runDetail.rescanForms.full.reason || undefined;
  }

  if (mode === "path") {
    body.path_prefix = state.runDetail.rescanForms.path.path_prefix;
    body.reason = state.runDetail.rescanForms.path.reason || undefined;
  }

  if (mode === "page") {
    body.page_url = state.runDetail.rescanForms.page.page_url;
    body.reason = state.runDetail.rescanForms.page.reason || undefined;
  }

  const path = mode === "full" ? "/scan-runs" : mode === "path" ? "/scan-runs/rescan-path" : "/scan-runs/rescan-page";

  try {
    const payload = await apiFetch(path, {
      method: "POST",
      body: JSON.stringify(body)
    });

    trackRunProgress(payload.run);
    state.runDetail.rescanSubmitting = "";
    render();
    await refreshActiveRuns();
  } catch (error) {
    state.runDetail.rescanError = error.message;
    state.runDetail.rescanSubmitting = "";
    render();
  }
}

async function submitStatusUpdate() {
  if (!state.findingDetail.item?.finding?.id) {
    return;
  }

  state.findingDetail.submitting = true;
  state.findingDetail.submitError = "";
  render();

  try {
    const payload = await apiFetch(`/findings/${state.findingDetail.item.finding.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: state.findingDetail.form.status,
        note: state.findingDetail.form.note || undefined,
        ignore_expires_at: fromDateTimeLocalValue(state.findingDetail.form.ignore_expires_at) || undefined
      })
    });

    state.findingDetail.item = payload;
    state.findingDetail.statusHistory = payload.status_history;
    syncFindingFormFromDetail(payload);

    if (state.route.view === "run-detail") {
      await loadRunDetail({ background: true });
    }
  } catch (error) {
    state.findingDetail.submitError = error.message;
  } finally {
    state.findingDetail.submitting = false;
    render();
  }
}

function updateFormState(formId, values) {
  if (formId === "runs-filter-form") {
    state.runs.filters = { ...state.runs.filters, ...values };
  }
  if (formId === "run-findings-filter-form") {
    state.runDetail.filters = { ...state.runDetail.filters, ...values };
  }
  if (formId === "hvt-groups-form") {
    state.runDetail.hvtGroupLevel = values.group_level ?? state.runDetail.hvtGroupLevel;
  }
  if (formId === "status-update-form") {
    state.findingDetail.form = { ...state.findingDetail.form, ...values };
  }
  if (formId === "full-rescan-form") {
    state.runDetail.rescanForms.full.reason = values.full_reason ?? state.runDetail.rescanForms.full.reason;
  }
  if (formId === "path-rescan-form") {
    state.runDetail.rescanForms.path = {
      ...state.runDetail.rescanForms.path,
      path_prefix: values.path_prefix ?? state.runDetail.rescanForms.path.path_prefix,
      reason: values.path_reason ?? state.runDetail.rescanForms.path.reason
    };
  }
  if (formId === "page-rescan-form") {
    state.runDetail.rescanForms.page = {
      ...state.runDetail.rescanForms.page,
      page_url: values.page_url ?? state.runDetail.rescanForms.page.page_url,
      reason: values.page_reason ?? state.runDetail.rescanForms.page.reason
    };
  }
  if (formId === "new-scan-form") {
    state.modal.newScan = {
      ...state.modal.newScan,
      ...values
    };
  }
}

async function onRouteChange() {
  state.route = parseRoute();
  render();

  if (state.route.view === "runs") {
    state.findingDetail.item = null;
    state.findingDetail.statusHistory = [];
    await loadRuns();
    return;
  }

  if (state.route.view === "run-detail") {
    await loadRunDetail();
    await loadFindingDetail(state.route.findingId);
  }
}

function attachEvents() {
  window.addEventListener("hashchange", onRouteChange);

  document.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.matches("[data-modal-backdrop='true']")) {
      closeModal();
      return;
    }

    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const action = target.dataset.action;

    if (action === "set-theme") {
      setTheme(target.dataset.theme);
      render();
      return;
    }

    if (action === "goto") {
      setRoute(target.dataset.target);
      return;
    }

    if (action === "open-run") {
      setRoute(`#/runs/${target.dataset.runId}`);
      return;
    }

    if (action === "open-new-scan-modal") {
      openNewScanModal();
      return;
    }

    if (action === "confirm-delete-run") {
      event.stopPropagation();
      openDeleteRunModal(target.dataset.runId);
      return;
    }

    if (action === "delete-run") {
      event.stopPropagation();
      deleteRun(target.dataset.runId);
      return;
    }

    if (action === "close-modal") {
      closeModal();
      return;
    }

    if (action === "open-finding") {
      const findingId = target.dataset.findingId;
      setRoute(`#/runs/${state.route.runId}?finding=${encodeURIComponent(findingId)}`);
      return;
    }

    if (action === "refresh-runs") {
      loadRuns();
      return;
    }

    if (action === "refresh-run-detail") {
      loadRunDetail();
      return;
    }

    if (action === "filter-to-hvt") {
      state.runDetail.filters = {
        ...state.runDetail.filters,
        rule_id: target.dataset.ruleId ?? "",
        path_prefix: target.dataset.pathPrefix ?? ""
      };
      loadRunDetail();
      return;
    }

    if (action === "open-hvt-group") {
      state.runDetail.selectedHvtGroupId = target.dataset.groupId ?? null;
      render();
      return;
    }

    if (action === "stage-page-url") {
      state.runDetail.rescanForms.page.page_url = target.dataset.pageUrl;
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal.kind) {
      closeModal();
      return;
    }

    const target = event.target.closest?.("[data-action='open-run'], [data-action='open-finding'], [data-action='open-hvt-group']");
    if (!target || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    target.click();
  });

  document.addEventListener("input", (event) => {
    const form = event.target.form;
    if (!form?.id) {
      return;
    }
    updateFormState(form.id, readFormData(form));
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    event.preventDefault();
    updateFormState(form.id, readFormData(form));

    if (form.id === "runs-filter-form") {
      await loadRuns();
      return;
    }

    if (form.id === "run-findings-filter-form") {
      await loadRunDetail();
      return;
    }

    if (form.id === "hvt-groups-form") {
      await loadRunDetail();
      return;
    }

    if (form.id === "status-update-form") {
      await submitStatusUpdate();
      return;
    }

    if (form.id === "full-rescan-form") {
      await launchRescan("full");
      return;
    }

    if (form.id === "path-rescan-form") {
      await launchRescan("path");
      return;
    }

    if (form.id === "page-rescan-form") {
      await launchRescan("page");
      return;
    }

    if (form.id === "new-scan-form") {
      await submitNewScan();
    }
  });
}

function startPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
  }

  pollHandle = window.setInterval(async () => {
    if (state.route.view === "runs") {
      const hasActiveRuns = state.runs.items.some((run) => run.state === "queued" || run.state === "running");
      if (hasActiveRuns) {
        await loadRuns({ background: true });
      }
    }

    if (state.route.view === "run-detail" && state.runDetail.run && (state.runDetail.run.state === "queued" || state.runDetail.run.state === "running")) {
      await loadRunDetail({ background: true });
    }

    if (state.activeRuns.length > 0) {
      await refreshActiveRuns();
    }
  }, 5000);
}

attachEvents();
render();
loadComplianceProfiles({ background: true });
onRouteChange();
startPolling();
