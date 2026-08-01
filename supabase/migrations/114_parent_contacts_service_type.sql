-- 保護者利用連絡にサービス区分（放デイ通常 / 日中一時）を追加
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'regular'
  CHECK (service_type IN ('regular', 'daytime_support'));
