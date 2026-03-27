-- usage_plans にスケジュール名を追加
ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS name TEXT;
