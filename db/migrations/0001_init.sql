-- Stage-2 MVP initial schema (contract v1)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE scan_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL,
  environment TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_url TEXT NOT NULL,
  crawl_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_key, environment, branch)
);

CREATE TABLE scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_target_id UUID NOT NULL REFERENCES scan_targets(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('full', 'path', 'page')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  reason TEXT,
  scan_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  scanner_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  findings_total INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  persistent_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_target_id UUID NOT NULL REFERENCES scan_targets(id) ON DELETE CASCADE,
  raw_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  first_seen_run_id UUID REFERENCES scan_runs(id) ON DELETE SET NULL,
  last_seen_run_id UUID REFERENCES scan_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_target_id, normalized_url)
);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_target_id UUID NOT NULL REFERENCES scan_targets(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'serious', 'moderate', 'minor')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  ignore_expires_at TIMESTAMPTZ,
  first_seen_run_id UUID REFERENCES scan_runs(id) ON DELETE SET NULL,
  last_seen_run_id UUID REFERENCES scan_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'ignored' OR ignore_expires_at IS NOT NULL),
  UNIQUE (scan_target_id, fingerprint)
);

CREATE TABLE finding_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'serious', 'moderate', 'minor')),
  raw_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  normalized_selector TEXT NOT NULL,
  raw_selector TEXT,
  snippet TEXT,
  snippet_hash TEXT,
  fingerprint TEXT NOT NULL,
  fingerprint_version TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_run_id, finding_id, page_id, normalized_selector)
);

CREATE TABLE status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IN ('open', 'in_progress', 'resolved', 'ignored')),
  new_status TEXT NOT NULL CHECK (new_status IN ('open', 'in_progress', 'resolved', 'ignored')),
  note TEXT,
  ignore_expires_at TIMESTAMPTZ,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (new_status <> 'ignored' OR ignore_expires_at IS NOT NULL)
);

CREATE INDEX idx_scan_runs_target_started ON scan_runs(scan_target_id, started_at DESC);
CREATE INDEX idx_pages_target_path ON pages(scan_target_id, normalized_path);
CREATE INDEX idx_findings_target_status ON findings(scan_target_id, status);
CREATE INDEX idx_findings_target_rule ON findings(scan_target_id, rule_id);
CREATE INDEX idx_finding_instances_run ON finding_instances(scan_run_id);
CREATE INDEX idx_finding_instances_finding ON finding_instances(finding_id);
CREATE INDEX idx_status_events_finding_changed ON status_events(finding_id, changed_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scan_targets_updated_at
BEFORE UPDATE ON scan_targets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pages_updated_at
BEFORE UPDATE ON pages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_findings_updated_at
BEFORE UPDATE ON findings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
