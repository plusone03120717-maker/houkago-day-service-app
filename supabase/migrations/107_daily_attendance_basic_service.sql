-- 放課後等デイサービスの提供有無フラグを追加（デフォルトtrue）
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS basic_service BOOLEAN NOT NULL DEFAULT true;
