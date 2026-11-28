-- File uploads from the Import page are recorded as import jobs too, so the page can
-- show every recent import. The browser still reads the file and sends it in chunks;
-- each chunk adds to the job's counters. File jobs have no PostHog host, project or
-- date range, so those columns become optional. Safe to re-run.
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_source_check CHECK (source IN ('posthog', 'file'));

ALTER TABLE import_jobs ALTER COLUMN source_host DROP NOT NULL;
ALTER TABLE import_jobs ALTER COLUMN source_project DROP NOT NULL;
ALTER TABLE import_jobs ALTER COLUMN range_start DROP NOT NULL;
ALTER TABLE import_jobs ALTER COLUMN range_end DROP NOT NULL;

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS file_format TEXT;

-- The one-active-import rule protects PostHog pulls from running twice. A file upload
-- lives in one browser tab, so it does not block (or get blocked by) a PostHog pull.
DROP INDEX IF EXISTS import_jobs_one_active_per_project;
CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_one_active_posthog_per_project
  ON import_jobs (project_id) WHERE status IN ('running', 'cancelling') AND source = 'posthog';
