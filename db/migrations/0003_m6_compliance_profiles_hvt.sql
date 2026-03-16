ALTER TABLE scan_runs
  ADD COLUMN compliance_profile_id TEXT,
  ADD COLUMN compliance_profile_label TEXT,
  ADD COLUMN compliance_profile_version TEXT;

UPDATE scan_runs
SET compliance_profile_id = COALESCE(compliance_profile_id, 'title_ii_2026'),
    compliance_profile_label = COALESCE(compliance_profile_label, 'Title II 2026'),
    compliance_profile_version = COALESCE(compliance_profile_version, 'cp-v1');

ALTER TABLE finding_instances
  ADD COLUMN failure_summary TEXT;

CREATE TABLE rule_metadata (
  rule_id TEXT PRIMARY KEY,
  rule_help TEXT,
  rule_description TEXT,
  rule_help_url TEXT,
  rule_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rule_metadata_updated_at
BEFORE UPDATE ON rule_metadata
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
