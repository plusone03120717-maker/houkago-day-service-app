ALTER TABLE monitoring_records
  ADD COLUMN IF NOT EXISTS family_wishes TEXT,
  ADD COLUMN IF NOT EXISTS agency_notes JSONB NOT NULL DEFAULT '[]';
