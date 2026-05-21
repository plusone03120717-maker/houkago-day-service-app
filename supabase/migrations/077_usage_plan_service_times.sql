-- 利用計画・曜日別設定・特定日上書きに利用時間（開始・終了）を追加
ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS service_start_time TIME,
  ADD COLUMN IF NOT EXISTS service_end_time TIME;

ALTER TABLE usage_plan_day_settings
  ADD COLUMN IF NOT EXISTS service_start_time TIME,
  ADD COLUMN IF NOT EXISTS service_end_time TIME;

ALTER TABLE usage_plan_date_overrides
  ADD COLUMN IF NOT EXISTS service_start_time TIME,
  ADD COLUMN IF NOT EXISTS service_end_time TIME;
