-- 支援の標準的な提供時間等（曜日・頻度・時間）カラムを追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS standard_service_time TEXT;
