-- 利用スケジュールに日中一時支援設定カラムを追加
ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS daytime_support            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS daytime_support_start_time TIME,
  ADD COLUMN IF NOT EXISTS daytime_support_end_time   TIME;
