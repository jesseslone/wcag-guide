CREATE TABLE worker_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
  scan_target_id UUID NOT NULL REFERENCES scan_targets(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_jobs_state_available_at ON worker_jobs(state, available_at, created_at);

CREATE TRIGGER trg_worker_jobs_updated_at
BEFORE UPDATE ON worker_jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
