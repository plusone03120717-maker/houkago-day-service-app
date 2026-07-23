-- Add is_new flag for tracking unreviewed LIFF submissions
ALTER TABLE paid_leave_usages ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;
ALTER TABLE time_records ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;
